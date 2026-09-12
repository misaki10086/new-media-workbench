import { PlatformAccount } from '../models/index.js';
import type { Platform } from '../models/PlatformAccount.js';

export interface ConnectedIdentity {
  externalId: string | null;
  accountName: string;
  credential: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
}

export async function upsertConnectedAccount(
  userId: number,
  platform: Platform,
  identity: ConnectedIdentity,
): Promise<PlatformAccount> {
  const where = identity.externalId
    ? { userId, platform, externalId: identity.externalId }
    : { userId, platform, accountName: identity.accountName };
  const existing = await PlatformAccount.findOne({ where });
  if (existing) {
    await existing.update({
      externalId: identity.externalId ?? existing.externalId,
      accountName: identity.accountName,
      accessToken: identity.accessToken ?? existing.accessToken,
      refreshToken: identity.refreshToken ?? existing.refreshToken,
      tokenExpiresAt: identity.tokenExpiresAt ?? existing.tokenExpiresAt,
      status: 'active',
    });
    return existing;
  }

  try {
    return await PlatformAccount.create({
      userId,
      platform,
      accountName: identity.accountName,
      credential: identity.credential,
      externalId: identity.externalId,
      accessToken: identity.accessToken ?? null,
      refreshToken: identity.refreshToken ?? null,
      tokenExpiresAt: identity.tokenExpiresAt ?? null,
      status: 'active',
    });
  } catch (error) {
    // 唯一索引 (userId, platform, accountName) 冲突：平台昵称可能与其他账号重名，追加平台 ID 后缀重试一次。
    if (identity.externalId && identity.accountName) {
      const retryName = `${identity.accountName}-${identity.externalId.slice(-6)}`;
      const nameConflict = await PlatformAccount.findOne({ where: { userId, platform, accountName: retryName } });
      if (nameConflict) return nameConflict;
      return PlatformAccount.create({
        userId,
        platform,
        accountName: retryName,
        credential: identity.credential,
        externalId: identity.externalId,
        accessToken: identity.accessToken ?? null,
        refreshToken: identity.refreshToken ?? null,
        tokenExpiresAt: identity.tokenExpiresAt ?? null,
        status: 'active',
      });
    }
    throw error;
  }
}
