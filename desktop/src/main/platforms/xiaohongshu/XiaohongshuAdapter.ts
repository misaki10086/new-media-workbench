import type { Page } from 'playwright';
import type { PlatformAdapter } from '../PlatformAdapter';
import { createLoginChecker } from '../adapterKit';
import {
  DISPLAY_NAME_SELECTORS,
  XHS_LOGGED_IN_MARKERS,
  XHS_LOGIN_WALL_MARKERS,
  XHS_SECURITY_MARKERS,
  XiaohongshuUrls,
} from './XiaohongshuSelectors';

/**
 * 小红书创作者中心适配器（Phase 9）。
 * 登录检测已按真实登录墙验证；发布执行（上传/填写）留待实机验证后实现。
 */
const checkLogin = createLoginChecker({
  url: XiaohongshuUrls.creatorCenter,
  loggedInMarkers: XHS_LOGGED_IN_MARKERS,
  loginWallMarkers: XHS_LOGIN_WALL_MARKERS,
  securityMarkers: XHS_SECURITY_MARKERS,
  displayNameSelectors: DISPLAY_NAME_SELECTORS,
  loginUrlPattern: XiaohongshuUrls.loginUrlPattern,
  screenshotPrefix: 'xiaohongshu',
});

export const xiaohongshuAdapter: PlatformAdapter = {
  platformId: 'xiaohongshu',

  async openCreatorCenter(page: Page): Promise<void> {
    await page.goto(XiaohongshuUrls.creatorCenter, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  },

  checkLogin,
};
