import type { Page } from 'playwright';
import type { PlatformAdapter } from '../PlatformAdapter';
import { createLoginChecker } from '../adapterKit';
import {
  CHANNELS_LOGIN_WALL_MARKERS,
  CHANNELS_LOGGED_IN_MARKERS,
  CHANNELS_SECURITY_MARKERS,
  WechatChannelsUrls,
} from './WechatChannelsSelectors';

/**
 * 视频号助手适配器（Phase 9）。
 * 登录必须微信扫码且始终由用户本人完成；发布执行留待实机验证后实现。
 */
const checkLogin = createLoginChecker({
  url: WechatChannelsUrls.creatorCenter,
  loggedInMarkers: CHANNELS_LOGGED_IN_MARKERS,
  loginWallMarkers: CHANNELS_LOGIN_WALL_MARKERS,
  securityMarkers: CHANNELS_SECURITY_MARKERS,
  loginUrlPattern: WechatChannelsUrls.loginUrlPattern,
  screenshotPrefix: 'wechat-channels',
});

export const wechatChannelsAdapter: PlatformAdapter = {
  platformId: 'wechat_channels',

  async openCreatorCenter(page: Page): Promise<void> {
    await page.goto(WechatChannelsUrls.creatorCenter, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  },

  checkLogin,
};
