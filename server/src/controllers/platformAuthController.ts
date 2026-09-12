import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { PLATFORMS, type Platform } from '../models/PlatformAccount.js';
import { getIntegration } from '../platforms/registry.js';
import { consumeOAuthState, createOAuthState } from '../platforms/oauthState.js';
import { PlatformApiError } from '../platforms/types.js';
import { fetchDouyinProfileName } from '../platforms/douyin.js';
import { fetchWechatAccountProfile } from '../platforms/wechat.js';
import { upsertConnectedAccount } from '../services/platformAccountService.js';
import { accountView } from '../utils/accountView.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { z } from 'zod';
import type { wechatConnectSchema } from '../schemas.js';

type WechatConnectInput = z.infer<typeof wechatConnectSchema>;

const PLATFORM_LABELS: Record<Platform, string> = {
  wechat: '微信公众号',
  douyin: '抖音',
  xiaohongshu: '小红书',
};

function parsePlatform(value: string): Platform | null {
  return PLATFORMS.find((item) => item === value) ?? null;
}

function accountsRedirect(platform: string, error?: string): string {
  const url = new URL(`${env.CLIENT_ORIGIN}/accounts`);
  url.searchParams.set('connected', platform);
  if (error) url.searchParams.set('connectError', error);
  return url.toString();
}

export async function getPlatformAuthStatus(_request: Request, response: Response): Promise<void> {
  const platforms = PLATFORMS.map((platform) => {
    const integration = getIntegration(platform);
    return {
      platform,
      label: PLATFORM_LABELS[platform],
      configured: integration?.authorizer ? integration.authorizer.isConfigured() : Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET),
      usesOAuth: integration?.authorizer?.usesOAuth() ?? false,
    };
  });
  response.json({ data: { platforms } });
}

export async function connectWechat(request: Request, response: Response): Promise<void> {
  const body = request.body as WechatConnectInput;
  const appId = body.appId ?? env.WECHAT_APP_ID;
  const appSecret = body.appSecret ?? env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new ApiError(400, 'WECHAT_NOT_CONFIGURED', '请填写公众号 AppID 与 AppSecret');
  }
  const profile = await fetchWechatAccountProfile({ appId, appSecret });
  const account = await upsertConnectedAccount(1, 'wechat', {
    externalId: profile.externalId,
    accountName: profile.accountName,
    credential: appSecret,
  });
  response.json({ data: { account: accountView(account) } });
}

export async function authorizePlatform(request: Request, response: Response): Promise<void> {
  const platform = String(request.params.platform);
  const failure = (message: string) => response.redirect(accountsRedirect(platform, message));

  const validPlatform = parsePlatform(platform);
  if (!validPlatform) return failure('不支持的平台');
  const integration = getIntegration(validPlatform);
  const authorizer = integration?.authorizer;
  if (!authorizer || !authorizer.usesOAuth()) return failure('该平台不支持 OAuth 授权接入，请使用服务端凭据绑定');
  if (!authorizer.isConfigured()) return failure(`${PLATFORM_LABELS[validPlatform]}的服务端凭据未配置，请先填写客户端密钥`);

  return response.redirect(authorizer.buildAuthorizeUrl(createOAuthState(platform)));
}

export async function platformAuthCallback(request: Request, response: Response): Promise<void> {
  const platform = String(request.params.platform);
  const failure = (message: string) => response.redirect(accountsRedirect(platform, message));

  const validPlatform = parsePlatform(platform);
  if (!validPlatform) return failure('不支持的平台');
  const integration = getIntegration(validPlatform);
  if (!integration?.authorizer?.usesOAuth()) return failure('该平台不支持 OAuth 授权接入');
  const authorizer = integration.authorizer;
  if (!authorizer.isConfigured()) return failure('服务端平台凭据未配置');

  const queryError = (request.query.error_description as string | undefined) ?? (request.query.error as string | undefined);
  if (queryError) return failure(`平台返回授权失败：${queryError}`);
  if (!consumeOAuthState(request.query.state as string | undefined, platform)) {
    return failure('授权状态校验失败，请重新发起授权');
  }
  const code = request.query.code as string | undefined;
  if (!code) return failure('平台未返回授权码');

  try {
    const tokens = await authorizer.exchangeCode(code);
    let accountName = tokens.accountName;
    if (!accountName && platform === 'douyin' && tokens.externalId) {
      accountName = await fetchDouyinProfileName(tokens.accessToken, tokens.externalId);
    }
    const fallbackSuffix = tokens.externalId?.slice(-6) ?? String(Date.now());
    accountName = accountName || `${PLATFORM_LABELS[validPlatform]}${fallbackSuffix}`;

    await upsertConnectedAccount(1, validPlatform, {
      externalId: tokens.externalId,
      accountName,
      credential: `oauth:${fallbackSuffix}`,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    });
    return response.redirect(accountsRedirect(platform));
  } catch (error) {
    console.error(`Platform auth callback failed for ${platform}:`, error);
    const message = error instanceof PlatformApiError ? error.message : '授权处理失败，请稍后重试';
    return failure(message);
  }
}
