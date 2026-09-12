import { asc, eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { accounts, browserProfiles } from '../database/schema';
import { browserProfileManager } from '../browser/BrowserProfileManager';
import { getAdapter } from '../platforms/registry';
import { mapLoginStatus } from '../platforms/loginStatus';
import { resolvePlatformName } from './customPlatformService';
import { devLog } from './logger';
import type { AccountView, AccountLoginStatus, LoginCheckResult, Platform } from '@shared/types/domain';

type AccountRow = typeof accounts.$inferSelect;

function toView(row: AccountRow, profile: typeof browserProfiles.$inferSelect): AccountView {
  return {
    id: row.id,
    platform: row.platform as Platform,
    name: row.name,
    platformName: resolvePlatformName(row.platform),
    profileId: row.profileId,
    profileName: profile.name,
    profilePath: profile.profilePath,
    browserStatus: browserProfileManager.isRunning(profile.id) ? 'running' : (profile.status as 'stopped' | 'crashed'),
    loginStatus: row.loginStatus as AccountLoginStatus,
    loginUsername: row.loginUsername,
    loginDisplayName: row.loginDisplayName,
    lastLoginCheckAt: row.lastLoginCheckAt,
    lastLoginErrorCode: row.lastLoginErrorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function joinProfile(row: AccountRow): AccountView {
  const profile = getDatabase()
    .select()
    .from(browserProfiles)
    .where(eq(browserProfiles.id, row.profileId))
    .get();
  if (!profile) throw new Error(`账号 #${row.id} 关联的 Profile #${row.profileId} 不存在`);
  return toView(row, profile);
}

export function listAccounts(): AccountView[] {
  return getDatabase().select().from(accounts).orderBy(asc(accounts.id)).all().map(joinProfile);
}

export function getAccountView(id: number): AccountView {
  const row = getDatabase().select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new Error(`账号 #${id} 不存在`);
  return joinProfile(row);
}

export function createAccount(platform: Platform, name: string, profileId: number): AccountView {
  const db = getDatabase();
  const profile = db.select().from(browserProfiles).where(eq(browserProfiles.id, profileId)).get();
  if (!profile) throw new Error('关联的浏览器 Profile 不存在');
  if (profile.platform !== platform) {
    throw new Error(`Profile「${profile.name}」属于${profile.platform}，不能绑定${platform}账号`);
  }
  const used = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.profileId, profileId)).get();
  if (used) throw new Error('该浏览器 Profile 已被其他账号绑定，一个 Profile 只能绑定一个账号');
  const now = new Date().toISOString();
  const row = db
    .insert(accounts)
    .values({ platform, name, profileId, loginStatus: 'unknown', createdAt: now, updatedAt: now })
    .returning()
    .get();
  devLog.info(`account created: ${name} (${platform}) → profile ${profile.profilePath}`);
  return toView(row, profile);
}

export function deleteAccount(id: number): void {
  const row = getDatabase().select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new Error(`账号 #${id} 不存在`);
  // 只删账号元数据；Profile 及其本地登录状态保留，可再次绑定新账号。
  getDatabase().delete(accounts).where(eq(accounts.id, id)).run();
  devLog.info(`account deleted: ${row.name} (#${id})`);
}

export async function openAccountLogin(id: number): Promise<AccountView> {
  const account = getAccountView(id);
  const adapter = getAdapter(account.platform);
  if (!adapter) {
    throw new Error(`PLATFORM_NOT_SUPPORTED：${account.platform} 的登录检测将在后续阶段提供`);
  }
  // 浏览器未运行则自动启动（登录流程本来就需要打开浏览器）。
  if (!browserProfileManager.isRunning(account.profileId)) {
    await browserProfileManager.launch(account.profileId);
  }
  const page = await browserProfileManager.getPage(account.profileId);
  await adapter.openCreatorCenter(page);
  devLog.info(`login flow opened: ${account.name} (${account.platform})`);
  return getAccountView(id);
}

export async function checkAccountLogin(id: number): Promise<{ account: AccountView; debug: LoginCheckResult }> {
  const account = getAccountView(id);
  const adapter = getAdapter(account.platform);
  if (!adapter) {
    throw new Error(`PLATFORM_NOT_SUPPORTED：${account.platform} 的登录检测将在后续阶段提供`);
  }
  if (!browserProfileManager.isRunning(account.profileId)) {
    await browserProfileManager.launch(account.profileId);
  }
  const page = await browserProfileManager.getPage(account.profileId);
  const outcome = await adapter.checkLogin(page);
  const mapped = mapLoginStatus(outcome.login);
  const now = new Date().toISOString();
  getDatabase()
    .update(accounts)
    .set({
      loginStatus: mapped.status,
      loginUsername: outcome.login.username ?? null,
      loginDisplayName: outcome.login.displayName ?? null,
      lastLoginCheckAt: now,
      lastLoginErrorCode: mapped.errorCode,
      updatedAt: now,
    })
    .where(eq(accounts.id, id))
    .run();
  devLog.info(
    `login checked: ${account.name} (${account.platform}) → ${mapped.status}${mapped.errorCode ? ` [${mapped.errorCode}]` : ''} in ${outcome.durationMs}ms`,
  );
  return {
    account: getAccountView(id),
    debug: {
      login: outcome.login,
      steps: outcome.steps,
      finalUrl: outcome.finalUrl,
      durationMs: outcome.durationMs,
    },
  };
}
