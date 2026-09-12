import type { PlatformAccount } from '../models/PlatformAccount.js';
import type { Authorizer, Publisher } from './types.js';
import { wechatPublisher } from './wechat.js';
import { douyinAuthorizer, douyinPublisher } from './douyin.js';
import { xiaohongshuAuthorizer, xiaohongshuPublisher } from './xiaohongshu.js';

export type PlatformKey = PlatformAccount['platform'];

export interface PlatformIntegration {
  authorizer: Authorizer | null;
  publisher: Publisher;
}

export function getIntegration(platform: PlatformKey): PlatformIntegration | null {
  switch (platform) {
    case 'wechat':
      return { authorizer: null, publisher: wechatPublisher };
    case 'douyin':
      return { authorizer: douyinAuthorizer, publisher: douyinPublisher };
    case 'xiaohongshu':
      return { authorizer: xiaohongshuAuthorizer, publisher: xiaohongshuPublisher };
    default:
      return null;
  }
}
