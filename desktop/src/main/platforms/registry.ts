import type { Platform } from '@shared/types/domain';
import type { PlatformAdapter } from './PlatformAdapter';
import { douyinAdapter } from './douyin/DouyinAdapter';
import { xiaohongshuAdapter } from './xiaohongshu/XiaohongshuAdapter';
import { bilibiliAdapter } from './bilibili/BilibiliAdapter';
import { wechatChannelsAdapter } from './wechatChannels/WechatChannelsAdapter';
import { getCustomPlatformByKey } from '../services/customPlatformService';
import { createCustomPlatformAdapter } from './custom/CustomAdapter';

/**
 * 平台适配器注册表。
 * - 登录检测：内置四平台（真实页面验证）+ 自定义平台（URL 重定向 + 通用登录墙标记）。
 * - 发布执行：仅抖音已实现；其余平台任务会明确报 PLATFORM_NOT_SUPPORTED。
 */
const BUILTIN_ADAPTERS: Partial<Record<Platform, PlatformAdapter>> = {
  douyin: douyinAdapter,
  xiaohongshu: xiaohongshuAdapter,
  bilibili: bilibiliAdapter,
  wechat_channels: wechatChannelsAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter | null {
  const builtin = BUILTIN_ADAPTERS[platform];
  if (builtin) return builtin;
  // 自定义平台：按 key 查表动态构建通用适配器。
  const custom = getCustomPlatformByKey(platform);
  if (!custom) return null;
  return createCustomPlatformAdapter({
    key: custom.key,
    creatorUrl: custom.creatorUrl,
    loginUrlPattern: custom.loginUrlPattern,
  });
}
