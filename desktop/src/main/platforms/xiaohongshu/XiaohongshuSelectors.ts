/** 小红书创作者中心 selector 集中管理（Phase 9）。 */

export const XiaohongshuUrls = {
  creatorCenter: 'https://creator.xiaohongshu.com/',
  /** 未登录访问创作者中心会重定向到 /login（真实页面验证）。 */
  loginUrlPattern: /creator\.xiaohongshu\.com\/login/i,
} as const;

/**
 * 登录后特征。
 * 注意：未登录的登录页也包含「创作服务」营销文案（真实页面验证导致过误判），
 * 不能作为已登录信号。
 */
export const XHS_LOGGED_IN_MARKERS = [
  'button:has-text("发布")',
  'text=发布笔记',
  'text=数据中心',
  'text=笔记管理',
] as const;

/** 登录墙特征。 */
export const XHS_LOGIN_WALL_MARKERS = [
  'text=扫码登录',
  'text=验证码登录',
  'text=小红书扫码',
  'text=使用二维码登录',
] as const;

/** 安全验证特征（滑块等）。 */
export const XHS_SECURITY_MARKERS = [
  'text=安全验证',
  'text=拖动滑块',
  'text=请完成验证',
] as const;

export const DISPLAY_NAME_SELECTORS = [
  '[data-testid="user-name"]',
  '[aria-label*="用户"]',
] as const;
