import type { Page } from 'playwright';
import type { PlatformAdapter } from '../PlatformAdapter';
import { createLoginChecker } from '../adapterKit';

export interface CustomAdapterSpec {
  key: string;
  creatorUrl: string;
  loginUrlPattern: string | null;
}

/** 未登录跳转兜底特征：绝大多数平台登录页地址含 login / passport / signin。 */
const DEFAULT_LOGIN_URL_PATTERN = /login|passport|signin/i;

/**
 * 自定义平台通用适配器（自定义平台接口）。
 * 登录检测策略：通用登录墙标记 + URL 重定向特征（用户可提供更精确的登录页地址）。
 * 发布执行不做（无平台 selector 证据），账号管理 / 打开创作者中心 / 登录状态检测完整可用。
 */
export function createCustomPlatformAdapter(spec: CustomAdapterSpec): PlatformAdapter {
  const loginUrlPattern = spec.loginUrlPattern
    ? new RegExp(spec.loginUrlPattern, 'i')
    : DEFAULT_LOGIN_URL_PATTERN;

  const checkLogin = createLoginChecker({
    url: spec.creatorUrl,
    loggedInMarkers: [],
    loginWallMarkers: ['text=扫码登录', 'text=验证码登录', 'text=密码登录', 'text=短信登录'],
    securityMarkers: ['text=安全验证', 'text=拖动滑块', 'text=请完成验证'],
    loginUrlPattern,
    screenshotPrefix: `custom-${spec.key}`,
  });

  return {
    platformId: spec.key as PlatformAdapter['platformId'],

    async openCreatorCenter(page: Page): Promise<void> {
      await page.goto(spec.creatorUrl, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    },

    checkLogin,
  };
}