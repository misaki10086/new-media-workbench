import { env } from '../config/env.js';
import { fetchBinary, PlatformApiError, requestJson, type PublishInput, type PublishResult, type Publisher } from './types.js';
import type { PlatformAccount } from '../models/PlatformAccount.js';

const API_BASE = 'https://api.weixin.qq.com';

export interface WechatCredentials {
  appId: string;
  appSecret: string;
}

interface WechatEnvelope {
  errcode?: number;
  errmsg?: string;
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

function assertWechatOk<T extends WechatEnvelope>(payload: T): T {
  if (payload.errcode !== undefined && payload.errcode !== 0) {
    throw new PlatformApiError(502, 'WECHAT_API_ERROR', `微信接口错误 ${payload.errcode}：${payload.errmsg ?? '未知错误'}`);
  }
  return payload;
}

function credentialError(): PlatformApiError {
  return new PlatformApiError(400, 'WECHAT_NOT_CONFIGURED', '请先填写公众号 AppID 与 AppSecret 完成绑定');
}

/**
 * 公众号凭据按账号保存：externalId=AppID、credential=AppSecret（官方流程绑定的账号）。
 * 仅绑定了 AppID 的账号才走真实接口；手动录入的模拟账号不受服务端环境变量影响。
 */
export function resolveWechatCredentials(account: Pick<PlatformAccount, 'externalId' | 'credential'>): WechatCredentials | null {
  const appId = account.externalId;
  if (!appId) return null;
  const prefixed = account.credential.startsWith('appid:') || account.credential.startsWith('oauth:');
  const appSecret = prefixed ? env.WECHAT_APP_SECRET : account.credential;
  if (!appSecret) return null;
  return { appId, appSecret };
}

async function getStableAccessToken(appId: string, appSecret: string): Promise<string> {
  const cached = tokenCache.get(appId);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const payload = await requestJson<{ access_token?: string; expires_in?: number } & WechatEnvelope>(
    `${API_BASE}/cgi-bin/stable_token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credential', appid: appId, secret: appSecret }),
    },
  );
  if (!payload.access_token) {
    const errcode = payload.errcode ?? -1;
    const errmsg = payload.errmsg ?? '未返回 access_token（请检查 AppID/Secret 与 IP 白名单）';
    throw new PlatformApiError(502, 'WECHAT_TOKEN_FAILED', `微信凭证获取失败 ${errcode}：${errmsg}`);
  }
  // 提前 5 分钟过期，避免边界时刻用到失效令牌。
  tokenCache.set(appId, { accessToken: payload.access_token, expiresAt: Date.now() + ((payload.expires_in ?? 7200) - 300) * 1000 });
  return payload.access_token;
}

/** 草稿正文要求 HTML；编辑器输入是纯文本，逐段转义后包 <p>。 */
export function bodyToHtml(body: string): string {
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export async function fetchWechatAccountProfile(credentials: WechatCredentials): Promise<{ accountName: string; externalId: string }> {
  const accessToken = await getStableAccessToken(credentials.appId, credentials.appSecret);
  const payload = await requestJson<{ nick_name?: string } & WechatEnvelope>(
    `${API_BASE}/cgi-bin/account/getaccountbasicinfo?access_token=${accessToken}`,
  );
  assertWechatOk(payload);
  return { accountName: payload.nick_name || '微信公众号', externalId: credentials.appId };
}

export const wechatPublisher: Publisher = {
  async isReady(account: PlatformAccount): Promise<boolean> {
    return resolveWechatCredentials(account) !== null;
  },

  async publish(account, input: PublishInput): Promise<PublishResult> {
    const credentials = resolveWechatCredentials(account);
    if (!credentials) throw credentialError();
    if (input.contentType !== 'article') {
      throw new PlatformApiError(400, 'WECHAT_ARTICLE_ONLY', '微信公众号仅支持图文内容发布');
    }
    if (!input.coverUrl) {
      throw new PlatformApiError(400, 'WECHAT_COVER_REQUIRED', '发布到微信公众号必须先设置封面图');
    }

    const accessToken = await getStableAccessToken(credentials.appId, credentials.appSecret);

    const coverBlob = await fetchBinary(input.coverUrl);
    const materialForm = new FormData();
    materialForm.append('media', coverBlob, 'cover');
    const material = assertWechatOk(
      await requestJson<{ media_id?: string } & WechatEnvelope>(
        `${API_BASE}/cgi-bin/material/add_material?access_token=${accessToken}&type=image`,
        { method: 'POST', body: materialForm },
      ),
    );
    if (!material.media_id) throw new PlatformApiError(502, 'WECHAT_UPLOAD_FAILED', '封面素材上传未返回 media_id');

    const draft = assertWechatOk(
      await requestJson<{ media_id?: string } & WechatEnvelope>(`${API_BASE}/cgi-bin/draft/add?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          articles: [
            {
              title: input.title,
              content: bodyToHtml(input.body),
              thumb_media_id: material.media_id,
              need_open_comment: 0,
              only_fans_can_comment: 0,
            },
          ],
        }),
      }),
    );
    if (!draft.media_id) throw new PlatformApiError(502, 'WECHAT_DRAFT_FAILED', '草稿创建未返回 media_id');

    const published = assertWechatOk(
      await requestJson<{ publish_id?: string } & WechatEnvelope>(
        `${API_BASE}/cgi-bin/freepublish/submit?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ media_id: draft.media_id }),
        },
      ),
    );

    return {
      externalId: published.publish_id ?? draft.media_id,
      detail: `草稿 ${draft.media_id} 已提交发布，发布任务 ${published.publish_id ?? '未知'}`,
    };
  },
};
