import OpenAI from 'openai';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function parseGeneratedTitles(output: string): string[] {
  const jsonMatch = output.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        const titles = parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
        const unique = [...new Set(titles.filter(Boolean))];
        if (unique.length >= 3) return unique.slice(0, 3);
      }
    } catch {
      // Fall through to line-based parsing for non-strict model responses.
    }
  }

  return [...new Set(
    output
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, '').replace(/^["“]|["”]$/g, '').trim())
      .filter(Boolean),
  )].slice(0, 3);
}

export async function generateTitles(topic: string): Promise<string[]> {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', '尚未配置 OPENAI_API_KEY');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: '你是资深中文新媒体编辑。只返回严格的 JSON 字符串数组，恰好包含 3 个互不重复、具体且不过度夸张的标题，不要返回 Markdown。',
        },
        { role: 'user', content: `主题关键词：${topic}` },
      ],
    });
    const titles = parseGeneratedTitles(response.output_text);
    if (titles.length !== 3) throw new Error('OpenAI did not return exactly three titles');
    return titles;
  } catch (error) {
    console.error('OpenAI title generation failed:', error);
    throw new ApiError(502, 'AI_REQUEST_FAILED', 'AI 标题生成失败，请稍后重试');
  }
}
