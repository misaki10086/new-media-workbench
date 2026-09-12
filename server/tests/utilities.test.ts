import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { createContentSchema } from '../src/schemas.js';
import { parseGeneratedTitles } from '../src/services/aiService.js';
import { maskCredential } from '../src/utils/accountView.js';

describe('server utilities', () => {
  it('masks platform credentials without returning the original value', () => {
    expect(maskCredential('secret-token-1234')).toBe('********1234');
  });

  it('normalizes legacy targetAccountIds into accountIds', () => {
    const input = createContentSchema.parse({
      title: '测试内容',
      body: '正文',
      targetAccountIds: [3, 3, 5],
    });
    expect(input.accountIds).toEqual([3, 5]);
  });

  it('parses exactly three JSON title suggestions', () => {
    expect(parseGeneratedTitles('["标题一", "标题二", "标题三", "标题四"]')).toEqual([
      '标题一',
      '标题二',
      '标题三',
    ]);
  });

  it('exposes an unauthenticated health endpoint', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/unknown');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('platform integration utilities', () => {
  it('converts plain-text bodies into escaped HTML paragraphs for wechat drafts', async () => {
    const { bodyToHtml } = await import('../src/platforms/wechat.js');
    expect(bodyToHtml('第一段\n第二行')).toBe('<p>第一段<br/>第二行</p>');
    expect(bodyToHtml('a<b>\n\nc&d')).toBe('<p>a&lt;b&gt;</p><p>c&amp;d</p>');
  });

  it('consumes oauth states once and burns them on platform mismatch', async () => {
    const { createOAuthState, consumeOAuthState } = await import('../src/platforms/oauthState.js');
    const state = createOAuthState('douyin');
    expect(consumeOAuthState(state, 'xiaohongshu')).toBe(false);
    expect(consumeOAuthState(state, 'douyin')).toBe(false);
    const another = createOAuthState('xiaohongshu');
    expect(consumeOAuthState(another, 'xiaohongshu')).toBe(true);
    expect(consumeOAuthState(another, 'xiaohongshu')).toBe(false);
  });

  it('reports platform credentials as unconfigured by default', async () => {
    const { wechatCredentials, douyinCredentials, xhsCredentials } = await import('../src/platforms/types.js');
    expect(wechatCredentials()).toBeNull();
    expect(douyinCredentials()).toBeNull();
    expect(xhsCredentials()).toBeNull();
  });
});
