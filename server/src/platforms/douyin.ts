import { env } from '../config/env.js';
import { fetchBinary, PlatformApiError, requestJson, douyinCredentials, type Authorizer, type PlatformTokens, type PublishInput, type PublishResult, type Publisher } from './types.js';
import type { PlatformAccount } from '../models/PlatformAccount.js';

// 抖音开放平台 API 域名可用 DOUYIN_API_BASE 覆盖（当前默认 https://open.douyin.com，接口以开放平台最新文档为准）。
const API_BASE = process.env.DOUYIN_API_BASE || 'https://open.douyin.com';
const SCOPE = 'video.create';

interface DouyinEnvelope {
  code?: number;
  message?: string;
  data?: Record<string, unknown>;
}

function assertDouyinOk<T extends DouyinEnvelope>(payload: T): T {
  if (payload.code !== undefined && payload.code !== 0) {
    throw new PlatformApiError(502, 'DOUYIN_API_ERROR', `抖音接口错误 ${payload.code}：${payload.message ?? '未知错误'}`);
  }
  return payload;
}

async function refreshTokens(account: PlatformAccount): Promise<PlatformTokens> {
  const credentials = douyinCredentials();
  const refreshToken = account.refreshToken;
  if (!credentials || !refreshToken) {
    throw new PlatformApiError(401, 'DOUYIN_REAUTH_REQUIRED', '抖音授权已失效，请重新授权绑定');
  }
    const params = new URLSearchParams({
      client_key: credentials.clientKey,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  const payload = assertDouyinOk(
    await requestJson<DouyinEnvelope & { data?: { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string } }>(
      `${API_BASE}/oauth/refresh_token/?${params}`,
      { method: 'POST' },
    ),
  );
  const data = payload.data ?? {};
  if (!data.access_token) {
    throw new PlatformApiError(401, 'DOUYIN_REAUTH_REQUIRED', '抖音授权已失效，请重新授权绑定');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in ? new Date(Date.now() + (data.expires_in - 300) * 1000) : null,
    externalId: data.open_id ?? account.externalId,
    accountName: null,
  };
}

export const douyinAuthorizer: Authorizer = {
  isConfigured(): boolean {
    return douyinCredentials() !== null;
  },

  usesOAuth(): boolean {
    return true;
  },

  buildAuthorizeUrl(state: string): string {
    const credentials = douyinCredentials();
    if (!credentials) throw new PlatformApiError(400, 'DOUYIN_NOT_CONFIGURED', '请先在服务端配置 DOUYIN_CLIENT_KEY 与 DOUYIN_CLIENT_SECRET');
    const params = new URLSearchParams({
      client_key: credentials.clientKey,
      response_type: 'code',
      scope: SCOPE,
      redirect_uri: env.DOUYIN_REDIRECT_URI,
      state,
    });
    return `${API_BASE}/platform/oauth/connect/?${params}`;
  },

  async exchangeCode(code: string): Promise<PlatformTokens> {
    const credentials = douyinCredentials();
    if (!credentials) throw new PlatformApiError(400, 'DOUYIN_NOT_CONFIGURED', '请先在服务端配置 DOUYIN_CLIENT_KEY 与 DOUYIN_CLIENT_SECRET');
    const params = new URLSearchParams({
      client_key: credentials.clientKey,
      client_secret: credentials.clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    const payload = assertDouyinOk(
      await requestJson<DouyinEnvelope & { data?: { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string } }>(
        `${API_BASE}/oauth/access_token/?${params}`,
        { method: 'POST' },
      ),
    );
    const data = payload.data ?? {};
    if (!data.access_token || !data.open_id) {
      throw new PlatformApiError(502, 'DOUYIN_TOKEN_FAILED', '抖音授权失败：未返回 access_token / open_id');
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in ? new Date(Date.now() + (data.expires_in - 300) * 1000) : null,
      externalId: data.open_id,
      accountName: null,
    };
  },

  async refresh(account: PlatformAccount): Promise<PlatformTokens> {
    return refreshTokens(account);
  },
};

async function fetchProfileName(accessToken: string, openId: string): Promise<string | null> {
  try {
    const payload = assertDouyinOk(
      await requestJson<DouyinEnvelope & { data?: { user?: { nickname?: string } } }>(
        `${API_BASE}/api/douyin/v1/user/user_info/?open_id=${encodeURIComponent(openId)}`,
        { headers: { 'access-token': accessToken } },
      ),
    );
    return payload.data?.user?.nickname ?? null;
  } catch {
    return null;
  }
}

export { fetchProfileName as fetchDouyinProfileName };

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

export const douyinPublisher: Publisher = {
  async isReady(account: PlatformAccount): Promise<boolean> {
    return douyinCredentials() !== null && Boolean(account.accessToken);
  },

  async publish(account: PlatformAccount, input: PublishInput): Promise<PublishResult> {
    if (input.contentType !== 'video' || !input.videoUrl) {
      throw new PlatformApiError(400, 'DOUYIN_VIDEO_REQUIRED', '发布到抖音必须上传视频内容（videoUrl）');
    }
    const accessToken = await ensureFreshToken(account);
    const openId = account.externalId ? `?open_id=${encodeURIComponent(account.externalId)}` : '';

    const videoBlob = await fetchBinary(input.videoUrl);
    const uploadForm = new FormData();
    uploadForm.append('video', videoBlob, 'video.mp4');
    const uploaded = assertDouyinOk(
      await requestJson<DouyinEnvelope & { data?: { video?: { video_id?: string } } }>(
        `${API_BASE}/api/douyin/v1/video/upload_video/${openId}`,
        { method: 'POST', headers: { 'access-token': accessToken }, body: uploadForm },
      ),
    );
    const videoId = uploaded.data?.video?.video_id;
    if (!videoId) throw new PlatformApiError(502, 'DOUYIN_UPLOAD_FAILED', '抖音视频上传未返回 video_id');

    const created = assertDouyinOk(
      await requestJson<DouyinEnvelope & { data?: { item_id?: string; publish_id?: string } }>(
        `${API_BASE}/api/douyin/v1/video/create_video/${openId}`,
        {
          method: 'POST',
          headers: { 'access-token': accessToken, 'content-type': 'application/json' },
          body: JSON.stringify({ video_id: videoId, text: input.title, cover_url: input.coverUrl ?? undefined }),
        },
      ),
    );
    const externalId = created.data?.item_id ?? created.data?.publish_id ?? videoId;
    return { externalId, detail: `视频已提交发布，作品 ${externalId}` };
  },
};
