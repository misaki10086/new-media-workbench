export const platforms = ['wechat', 'douyin', 'xiaohongshu'] as const;
export type Platform = (typeof platforms)[number];
export type AccountStatus = 'active' | 'expired';
export type PublishStatus = 'pending' | 'success' | 'failed';
export type ContentStatus = 'draft' | 'published';

export interface PlatformAccount {
  id: number;
  platform: Platform;
  accountName: string;
  credentialMasked: string;
  externalId: string | null;
  connectionMode: 'server' | 'oauth' | 'manual';
  status: AccountStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformAuthStatus {
  platform: Platform;
  label: string;
  configured: boolean;
  usesOAuth: boolean;
}

export interface PublishRecord {
  id: number;
  contentId: number;
  platformAccountId: number;
  status: PublishStatus;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt?: string;
  platformAccount?: PlatformAccount;
}

export interface ContentStat {
  id: number;
  contentId: number;
  platformAccountId: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  recordedAt: string;
  platformAccount?: PlatformAccount;
}

export interface ContentTotals {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface ContentItem {
  id: number;
  title: string;
  body: string;
  coverUrl: string | null;
  tags: string[];
  status: ContentStatus;
  scheduledAt: string | null;
  contentType: 'article' | 'video';
  videoUrl: string | null;
  targetAccountIds: number[];
  targets: PlatformAccount[];
  publishRecords: PublishRecord[];
  stats: ContentStat[];
  totals: ContentTotals;
  createdAt: string;
  updatedAt: string;
}

export interface ContentInput {
  title: string;
  body: string;
  coverUrl: string | null;
  tags: string[];
  accountIds: number[];
  scheduledAt: string | null;
  contentType: 'article';
  videoUrl: null;
}

export interface AccountInput {
  platform: Platform;
  accountName: string;
  credential: string;
  status: AccountStatus;
}

export const platformMeta: Record<Platform, { label: string; color: string }> = {
  wechat: { label: '微信公众号', color: '#168c5b' },
  douyin: { label: '抖音', color: '#262629' },
  xiaohongshu: { label: '小红书', color: '#d83958' },
};
