import type { Page } from 'playwright';
import type { PlatformAdapter } from '../PlatformAdapter';
import { createLoginChecker } from '../adapterKit';
import {
  BILIBILI_LOGGED_IN_MARKERS,
  BILIBILI_LOGIN_WALL_MARKERS,
  BILIBILI_SECURITY_MARKERS,
  BilibiliUrls,
} from './BilibiliSelectors';

/**
 * B 站创作中心适配器（Phase 9）。
 * 未登录访问 member.bilibili.com 会 302 到 passport.bilibili.com/login，URL 特征作兜底信号。
 * 发布执行（投稿流程）留待实机验证后实现。
 */
const checkLogin = createLoginChecker({
  url: BilibiliUrls.creatorCenter,
  loggedInMarkers: BILIBILI_LOGGED_IN_MARKERS,
  loginWallMarkers: BILIBILI_LOGIN_WALL_MARKERS,
  securityMarkers: BILIBILI_SECURITY_MARKERS,
  loginUrlPattern: BilibiliUrls.loginUrlPattern,
  screenshotPrefix: 'bilibili',
});

export const bilibiliAdapter: PlatformAdapter = {
  platformId: 'bilibili',

  async openCreatorCenter(page: Page): Promise<void> {
    await page.goto(BilibiliUrls.creatorCenter, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  },

  checkLogin,
};
