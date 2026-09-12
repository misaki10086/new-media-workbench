import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, initDatabase } from '../src/main/database/db';
import {
  generateIdeas,
  getAiRuntimeConfig,
  parseIdeas,
  saveAiConfig,
  testAiConnection,
} from '../src/main/services/aiService';

let dbDir: string;

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'nmw-phase8-'));
  initDatabase(join(dbDir, 'app.db'));
});

afterAll(() => {
  closeDatabase();
  rmSync(dbDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('parseIdeas（模型回复解析）', () => {
  it('解析裸 JSON 与 ```json 围栏 JSON', () => {
    const raw = JSON.stringify({
      titles: ['标题一', '标题二', '标题三'],
      shortTitle: '短标题',
      description: '这是文案',
      tags: ['#AI短剧', '#测试'],
      coverText: '封面文案',
    });
    for (const candidate of [raw, '```json\n' + raw + '\n```', '前置说明\n' + raw + '\n后置杂文']) {
      const ideas = parseIdeas(candidate, '测试主题');
      expect(ideas.titles).toEqual(['标题一', '标题二', '标题三']);
      expect(ideas.tags).toEqual(['AI短剧', '测试']);
      expect(ideas.topic).toBe('测试主题');
    }
  });

  it('非 JSON / 缺少标题时抛出 AI_BAD_RESPONSE', () => {
    const assertCode = (fn: () => void): void => {
      try {
        fn();
        expect.unreachable('应当抛出异常');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('AI_BAD_RESPONSE');
      }
    };
    assertCode(() => parseIdeas('这不是 JSON', 't'));
    assertCode(() => parseIdeas('{"description":"只有文案"}', 't'));
  });

  it('话题去掉 # 前缀并限制长度与数量', () => {
    const ideas = parseIdeas(
      JSON.stringify({
        titles: ['A', 'B', 'C', 'D', 'E', 'F'],
        tags: ['#a', 'b', '#c', '#d', '#e', '#f', '#g', '#h', '#i', '#j'],
        description: 'x'.repeat(5000),
      }),
      't',
    );
    expect(ideas.titles.length).toBeLessThanOrEqual(5);
    expect(ideas.tags.length).toBeLessThanOrEqual(8);
    expect(ideas.tags.every((tag) => !tag.startsWith('#'))).toBe(true);
    expect(ideas.description.length).toBeLessThanOrEqual(2000);
  });
});

describe('AI 配置（settings 表 + 环境变量回退）', () => {
  it('未配置时回退默认值；环境变量作为回退层', () => {
    process.env.OPENAI_API_KEY = 'env-key';
    const config = getAiRuntimeConfig();
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.apiKey).toBe('env-key');
    expect(config.apiKeyFromEnv).toBe(true);
    delete process.env.OPENAI_API_KEY;
  });

  it('saveConfig 持久化到 settings 表并覆盖环境变量', () => {
    process.env.OPENAI_API_KEY = 'env-key';
    saveAiConfig({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'local-key' });
    const config = getAiRuntimeConfig();
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(config.model).toBe('deepseek-chat');
    expect(config.apiKey).toBe('local-key');
    expect(config.apiKeyFromEnv).toBe(false);
    delete process.env.OPENAI_API_KEY;
  });
});

describe('生成与连接测试（注入假 fetch）', () => {
  it('未配置 Key 时生成抛出可读错误', async () => {
    // 清掉此前用例持久化的本地 Key 与环境变量
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'test-model', apiKey: '' });
    delete process.env.OPENAI_API_KEY;
    await expect(generateIdeas('主题')).rejects.toThrowError('尚未配置 AI API Key');
  });

  it('generate 调用 chat/completions 并解析结果', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'test-model', apiKey: 'test-key' });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    titles: ['标题A', '标题B', '标题C'],
                    shortTitle: '短标题A',
                    description: '生成文案',
                    tags: ['短剧'],
                    coverText: '封面字',
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const ideas = await generateIdeas('霸总短剧第一集');
    expect(ideas.titles).toEqual(['标题A', '标题B', '标题C']);
    expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(String(calls[0].init.body)) as { model: string; messages: { role: string }[] };
    expect(body.model).toBe('test-model');
    expect(body.messages[body.messages.length - 1].role).toBe('user');
    const auth = (calls[0].init.headers as Record<string, string>).authorization;
    expect(auth).toBe('Bearer test-key');
  });

  it('HTTP 401 → API Key 无效提示；连接测试返回失败', async () => {
    saveAiConfig({ baseUrl: 'https://api.example.com/v1', model: 'test-model', apiKey: 'bad-key' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );
    const result = await testAiConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('API Key 无效');
    await expect(generateIdeas('主题')).rejects.toThrowError('API Key 无效');
  });
});