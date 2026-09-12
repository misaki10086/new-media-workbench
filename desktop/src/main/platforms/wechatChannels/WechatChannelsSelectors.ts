/** 视频号助手（channels.weixin.qq.com）selector 集中管理（Phase 9）。 */

export const WechatChannelsUrls = {
  creatorCenter: 'https://channels.weixin.qq.com/platform',
  /** 未登录会重定向到 login.html（真实页面验证）。 */
  loginUrlPattern: /channels\.weixin\.qq\.com\/login/i,
} as const;

/**
 * 登录后特征。
 * 注意：登录页（login.html）页脚也有「内容管理 / 数据中心」文字（真实页面验证），
 * 不能作为已登录信号；「发表视频 / 创作中心」仅登录后的平台页出现。
 */
export const CHANNELS_LOGGED_IN_MARKERS = [
  'text=发表视频',
  'text=创作中心',
] as const;

export const CHANNELS_LOGIN_WALL_MARKERS = [
  'text=扫码登录',
  'text=请使用微信扫码',
  'text=微信扫码登录',
] as const;

export const CHANNELS_SECURITY_MARKERS = [
  'text=安全验证',
  'text=请完成验证',
] as const;
