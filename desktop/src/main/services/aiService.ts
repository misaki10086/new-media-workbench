import { eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { settings } from '../database/schema';
import { ApiError } from '../ipc/apiError';
import { devLog } from './logger';

const AI_ERROR_MESSAGES: Record<string, string> = {
  AI_NOT_CONFIGURED: '尚未配置 AI API Key，请到「设置 → AI 助手」填写',
  AI_TIMEOUT: 'AI 请求超时（30 秒），请稍后重试',
  AI_NETWORK_ERROR: '无法连接 AI 服务，请检查 Base URL 与网络',
  AI_AUTH_FAILED: 'API Key 无效或没有权限',
  AI_BAD_RESPONSE: 'AI 返回内容无法解析，请重试一次',
};

function aiError(code: string, detail?: string): ApiError {
  if (code.startsWith('AI_REQUEST_FAILED:')) {
    const [, status] = code.split(':');
    return new ApiError('AI_REQUEST_FAILED', `AI 服务返回错误（HTTP ${status}），请检查配置`);
  }
  return new ApiError(code, AI_ERROR_MESSAGES[code] ?? detail ?? 'AI 请求失败');
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 30_000;

export interface AiRuntimeConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyFromEnv: boolean;
}

function getDbSetting(key: string): string | null {
  const row = getDatabase().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

function setDbSetting(key: string, value: string): void {
  getDatabase()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** 配置优先级：settings 表 > 环境变量 > 默认值（与 Web 版 .env 约定一致）。 */
export function getAiRuntimeConfig(): AiRuntimeConfig {
  const dbBaseUrl = getDbSetting('ai_base_url');
  const dbModel = getDbSetting('ai_model');
  const dbKey = getDbSetting('ai_api_key');

  const baseUrl = dbBaseUrl || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const model = dbModel || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const envKey = process.env.OPENAI_API_KEY?.trim() || '';
  const apiKey = dbKey || envKey;

  return { baseUrl: baseUrl.replace(/\/+$/, ''), model, apiKey, apiKeyFromEnv: !dbKey && Boolean(envKey) };
}

export function saveAiConfig(patch: { baseUrl: string; model: string; apiKey?: string }): AiRuntimeConfig {
  setDbSetting('ai_base_url', patch.baseUrl);
  setDbSetting('ai_model', patch.model);
  if (patch.apiKey !== undefined) {
    setDbSetting('ai_api_key', patch.apiKey);
  }
  devLog.info('AI 配置已更新');
  return getAiRuntimeConfig();
}

export function isAiConfigured(): boolean {
  return getAiRuntimeConfig().apiKey.length > 0;
}

export interface AiIdeas {
  titles: string[];
  shortTitle: string;
  description: string;
  tags: string[];
  coverText: string;
  topic: string;
}

/** 从模型回复中提取并校验 JSON（容忍 ```json 围栏与前后杂文）。 */
export function parseIdeas(raw: string, topic: string): AiIdeas {
  const withoutFences = raw.replace(/```(?:json)?/gi, '');
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw aiError('AI_BAD_RESPONSE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    throw aiError('AI_BAD_RESPONSE');
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  const asStringArray = (value: unknown, max: number): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().slice(0, 60)).slice(0, max)
      : [];
  const asString = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

  const titles = asStringArray(record.titles, 5);
  const tags = asStringArray(record.tags, 8).map((tag) => tag.replace(/^#/, ''));
  if (titles.length === 0 || tags.length === 0) {
    throw aiError('AI_BAD_RESPONSE');
  }
  return {
    titles,
    shortTitle: asString(record.shortTitle, 30) || titles[0].slice(0, 30),
    description: asString(record.description, 2000),
    tags,
    coverText: asString(record.coverText, 40),
    topic,
  };
}

const SYSTEM_PROMPT = '你是短视频内容策划助手。只输出严格的 JSON 对象，不要任何解释或 Markdown 围栏。';

function buildUserPrompt(topic: string): string {
  return [
    `为抖音平台策划一条短视频内容，主题：「${topic}」。`,
    '输出 JSON，字段：',
    '{"titles": [3 个不同的爆款风格标题，每个不超过 30 字],',
    ' "shortTitle": [不超过 20 字的短标题],',
    ' "description": [150 字以内的视频文案/简介],',
    ' "tags": [3-6 个话题标签，不带 # 号],',
    ' "coverText": [不超过 12 字的封面文案]}',
  ].join('\n');
}

async function chatCompletion(messages: { role: 'system' | 'user'; content: string }[], maxTokens: number): Promise<string> {
  const config = getAiRuntimeConfig();
  if (!config.apiKey) throw aiError('AI_NOT_CONFIGURED');

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.8,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/abort|timeout/i.test(message)) throw aiError('AI_TIMEOUT');
    throw aiError('AI_NETWORK_ERROR');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw aiError('AI_AUTH_FAILED');
    throw aiError(`AI_REQUEST_FAILED:${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) throw aiError('AI_BAD_RESPONSE');
  return content;
}

/** 生成内容创意：标题 / 短标题 / 文案 / 话题 / 封面文案。AI 只生成内容，绝不发布。 */
export async function generateIdeas(topic: string): Promise<AiIdeas> {
  const raw = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(topic) },
    ],
    800,
  );
  const ideas = parseIdeas(raw, topic);
  devLog.info(`AI 内容生成完成：${ideas.titles.length} 个标题 / ${ideas.tags.length} 个话题`);
  return ideas;
}

/** 配置测试：发一个极小请求验证连通性与密钥。 */
export async function testAiConnection(): Promise<{ ok: boolean; model: string; message: string }> {
  const config = getAiRuntimeConfig();
  if (!config.apiKey) return { ok: false, model: config.model, message: '未配置 API Key' };
  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: '回复 OK 两个字母即可。' },
      ],
      16,
    );
    return { ok: true, model: config.model, message: `连接成功（模型返回 ${raw.trim().slice(0, 20)}）` };
  } catch (error) {
    return { ok: false, model: config.model, message: error instanceof Error ? error.message : String(error) };
  }
}
