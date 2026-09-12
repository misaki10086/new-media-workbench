import { env } from '../config/env.js';
import { PlatformApiError, requestJson, xhsCredentials, type Authorizer, type PlatformTokens, type PublishInput, type PublishResult, type Publisher } from './types.js';
import type { PlatformAccount } from '../models/PlatformAccount.js';

// 小红书开放平台：OAuth 结构按 open.xiaohongshu.com 文档实现；笔记发布接口仅对通过审核的应用开放，
// 路径与字段名以最新文档为准，若平台侧有调整只需修改这里的常量与字段映射。
const API_BASE = process.env.XHS_API_BASE || 'https://open.xiaohongshu.com';
const NOTE_CREATE_PATH = '/api/sns/v1/note/create';

interface XhsEnvelope {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
}

function assertXhsOk<T extends XhsEnvelope>(payload: T): T {
  if (payload.code !== undefined && payload.code !== 0) {
    throw new PlatformApiError(502, 'XHS_API_ERROR', `小红书接口错误 ${payload.code}：${payload.msg ?? '未知错误'}`);
  }
  return payload;
}

function tokenForm(extra: Record<string, string>): URLSearchParams {
  const credentials = xhsCredentials();
  if (!credentials) throw new PlatformApiError(400, 'XHS_NOT_CONFIGURED', '请先在服务端配置 XHS_APP_KEY 与 XHS_APP_SECRET');
  return new URLSearchParams({
    client_id: credentials.appKey,
    client_secret: credentials.appSecret,
    ...extra,
  });
}

async function refreshTokens(account: PlatformAccount): Promise<PlatformTokens> {
  const refreshToken = account.refreshToken;
  if (!refreshToken) {
    throw new PlatformApiError(401, 'XHS_REAUTH_REQUIRED', '小红书授权已失效，请重新授权绑定');
  }
  const payload = assertXhsOk(
    await requestJson<XhsEnvelope & { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string }>(
      `${API_BASE}/api/oauth/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: tokenForm({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      },
    ),
  );
  if (!payload.access_token) {
    throw new PlatformApiError(401, 'XHS_REAUTH_REQUIRED', '小红书授权已失效，请重新授权绑定');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: payload.expires_in ? new Date(Date.now() + (payload.expires_in - 300) * 1000) : null,
    externalId: payload.open_id ?? account.externalId,
    accountName: null,
  };
}

export const xiaohongshuAuthorizer: Authorizer = {
  isConfigured(): boolean {
    return xhsCredentials() !== null;
  },

  usesOAuth(): boolean {
    return true;
  },

  buildAuthorizeUrl(state: string): string {
    const credentials = xhsCredentials();
    if (!credentials) throw new PlatformApiError(400, 'XHS_NOT_CONFIGURED', '请先在服务端配置 XHS_APP_KEY 与 XHS_APP_SECRET');
    const params = new URLSearchParams({
      client_id: credentials.appKey,
      response_type: 'code',
      redirect_uri: env.XHS_REDIRECT_URI,
      state,
    });
    return `${API_BASE}/api/oauth/authorize?${params}`;
  },

  async exchangeCode(code: string): Promise<PlatformTokens> {
    const payload = assertXhsOk(
      await requestJson<XhsEnvelope & { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; nickname?: string }>(
        `${API_BASE}/api/oauth/token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: tokenForm({ grant_type: 'authorization_code', code, redirect_uri: env.XHS_REDIRECT_URI }),
        },
      ),
    );
    if (!payload.access_token) {
      throw new PlatformApiError(502, 'XHS_TOKEN_FAILED', '小红书授权失败：未返回 access_token');
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt: payload.expires_in ? new Date(Date.now() + (payload.expires_in - 300) * 1000) : null,
      externalId: payload.open_id ?? null,
      accountName: payload.nickname ?? null,
    };
  },

  async refresh(account: PlatformAccount): Promise<PlatformTokens> {
    return refreshTokens(account);
  },
};

async function ensureFreshToken(account: PlatformAccount): Promise<string> {
  const cachedToken = account.accessToken;
  if (cachedToken && (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() > Date.now())) {
    return cachedToken;
  }

  const refreshed = await refreshTokens(account);
  await account.update({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt: refreshed.expiresAt,
    externalId: refreshed.externalId ?? account.externalId,
  });
  return refreshed.accessToken;
}

export const xiaohongshuPublisher: Publisher = {
  async isReady(account: PlatformAccount): Promise<boolean> {
    return xhsCredentials() !== null && Boolean(account.accessToken);
  },

  async publish(account: PlatformAccount, input: PublishInput): Promise<PublishResult> {
    if (input.contentType === 'video' && !input.videoUrl) {
      throw new PlatformApiError(400, 'XHS_VIDEO_REQUIRED', '发布视频笔记需要提供视频地址');
    }
    if (input.contentType === 'article' && !input.coverUrl) {
      throw new PlatformApiError(400, 'XHS_IMAGE_REQUIRED', '发布图文笔记必须先设置封面图');
    }
    const accessToken = await ensureFreshToken(account);

    const created = assertXhsOk(
      await requestJson<XhsEnvelope & { data?: { note_id?: string } }>(`${API_BASE}${NOTE_CREATE_PATH}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          desc: input.body,
          note_type: input.contentType === 'video' ? 'video' : 'normal',
          image_urls: input.coverUrl ? [input.coverUrl] : undefined,
          video_url: input.videoUrl ?? undefined,
        }),
      }),
    );
    const noteId = created.data?.note_id ?? null;
    return { externalId: noteId, detail: noteId ? `笔记已提交发布，笔记 ${noteId}` : '笔记已提交发布' };
  },
};
