/** B 站创作中心（member.bilibili.com）selector 集中管理（Phase 9）。 */

export const BilibiliUrls = {
  creatorCenter: 'https://member.bilibili.com/platform/home',
  /** 未登录会被重定向到 passport 登录页，URL 特征是最可靠的未登录信号之一。 */
  loginUrlPattern: /passport\.bilibili\.com\/login/i,
} as const;

export const BILIBILI_LOGGED_IN_MARKERS = [
  'button:has-text("投稿")',
  'text=内容创作',
  'text=数据中心',
  'text=收益管理',
  'text=稿件管理',
] as const;

export const BILIBILI_LOGIN_WALL_MARKERS = [
  'text=扫码登录',
  'text=密码登录',
  'text=短信登录',
  'text=登录B站',
] as const;

export const BILIBILI_SECURITY_MARKERS = [
  'text=安全验证',
  'text=拖动滑块',
  'text=请完成验证',
] as const;
