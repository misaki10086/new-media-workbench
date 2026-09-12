import type { PlatformAccount } from '../models/PlatformAccount.js';
import { wechatCredentials } from '../platforms/types.js';

export function maskCredential(value: string): string {
  const suffix = value.slice(-4);
  return suffix ? `********${suffix}` : '********';
}

export type ConnectionMode = 'server' | 'oauth' | 'manual';

export function connectionMode(account: PlatformAccount): ConnectionMode {
  // 公众号：绑定了 AppID（或服务端配置了凭据）即走真实接口。
  if (account.platform === 'wechat' && (Boolean(account.externalId) || wechatCredentials())) return 'server';
  if (account.accessToken) return 'oauth';
  return 'manual';
}

export function accountView(account: PlatformAccount) {
  return {
    id: account.id,
    platform: account.platform,
    accountName: account.accountName,
    credentialMasked: maskCredential(account.credential),
    externalId: account.externalId,
    connectionMode: connectionMode(account),
    status: account.status,
    userId: account.userId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}
