import { env } from '../config/env.js';
import type { PlatformAccount } from '../models/PlatformAccount.js';

export interface PublishInput {
  title: string;
  body: string;
  coverUrl: string | null;
  videoUrl: string | null;
  contentType: 'article' | 'video';
}

export interface PublishResult {
  externalId: string | null;
  detail: string;
}

export interface PlatformTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  externalId: string | null;
  accountName: string | null;
}

export class PlatformApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PlatformApiError(502, 'PLATFORM_UNREACHABLE', `平台接口请求失败：${reason}`);
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new PlatformApiError(502, 'PLATFORM_BAD_RESPONSE', `平台接口返回了无法解析的内容：${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new PlatformApiError(502, 'PLATFORM_HTTP_ERROR', `平台接口 HTTP ${response.status}：${text.slice(0, 300)}`);
  }
  return payload as T;
}

export async function fetchBinary(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PlatformApiError(502, 'MEDIA_DOWNLOAD_FAILED', `媒体文件下载失败：${reason}`);
  }
  if (!response.ok) {
    throw new PlatformApiError(502, 'MEDIA_DOWNLOAD_FAILED', `媒体文件下载失败：HTTP ${response.status}`);
  }
  return response.blob();
}

export interface Authorizer {
  /** 平台凭据是否已在服务端配置。 */
  isConfigured(): boolean;
  /** 是否需要引导用户跳转平台页面做 OAuth 授权。 */
  usesOAuth(): boolean;
  /** 构建 OAuth 授权页地址（state 用于回调防伪）。 */
  buildAuthorizeUrl(state: string): string;
  /** 用授权码换取令牌与账号资料。 */
  exchangeCode(code: string): Promise<PlatformTokens>;
  /** 刷新账号令牌，返回 null 表示该平台不需要（服务端凭据模式）。 */
  refresh?(account: PlatformAccount): Promise<PlatformTokens>;
}

export interface Publisher {
  /** 该账号当前是否具备真实发布条件（凭据/令牌）。 */
  isReady(account: PlatformAccount): Promise<boolean>;
  publish(account: PlatformAccount, input: PublishInput): Promise<PublishResult>;
}

export function wechatCredentials(): { appId: string; appSecret: string } | null {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) return null;
  return { appId: env.WECHAT_APP_ID, appSecret: env.WECHAT_APP_SECRET };
}

export function douyinCredentials(): { clientKey: string; clientSecret: string } | null {
  if (!env.DOUYIN_CLIENT_KEY || !env.DOUYIN_CLIENT_SECRET) return null;
  return { clientKey: env.DOUYIN_CLIENT_KEY, clientSecret: env.DOUYIN_CLIENT_SECRET };
}

export function xhsCredentials(): { appKey: string; appSecret: string } | null {
  if (!env.XHS_APP_KEY || !env.XHS_APP_SECRET) return null;
  return { appKey: env.XHS_APP_KEY, appSecret: env.XHS_APP_SECRET };
}
