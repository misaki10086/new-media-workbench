import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { accounts, browserProfiles } from '../database/schema';
import { appDirectories } from '../appPaths';
import { devLog } from './logger';
import { resolvePlatformName } from './customPlatformService';
import type { BrowserProfile, BrowserProfileStatus, Platform } from '@shared/types/domain';

type ProfileRow = typeof browserProfiles.$inferSelect;

function toProfile(row: ProfileRow): BrowserProfile {
  return {
    id: row.id,
    platform: row.platform as Platform,
    platformName: resolvePlatformName(row.platform),
    name: row.name,
    profilePath: row.profilePath,
    browserType: 'chromium',
    status: row.status as BrowserProfileStatus,
    lastOpenedAt: row.lastOpenedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function profileRoot(): string {
  return appDirectories().browserProfiles;
}

/** Profile 的磁盘绝对路径；防御性校验目录必须位于 browser-profiles 之下。 */
export function resolveProfileDirectory(profilePath: string): string {
  const root = profileRoot();
  const absolute = join(root, profilePath);
  if (!absolute.startsWith(root)) {
    throw new Error('非法的 Profile 路径');
  }
  return absolute;
}

function assertNameAvailable(name: string, excludeId?: number): void {
  const existing = getDatabase().select().from(browserProfiles).where(eq(browserProfiles.name, name)).get();
  if (existing && existing.id !== excludeId) {
    throw new Error(`已存在同名 Profile「${name}」`);
  }
}

function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return ascii || 'main';
}

function generateUniqueDirectory(platform: Platform, name: string): string {
  const base = `${platform}-${slugify(name)}`;
  let candidate = base;
  let counter = 2;
  while (existsSync(join(profileRoot(), candidate))) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export function listProfiles(): BrowserProfile[] {
  return getDatabase().select().from(browserProfiles).orderBy(asc(browserProfiles.id)).all().map(toProfile);
}

export function getProfile(id: number): BrowserProfile {
  const row = getDatabase().select().from(browserProfiles).where(eq(browserProfiles.id, id)).get();
  if (!row) throw new Error(`Profile #${id} 不存在`);
  return toProfile(row);
}

export function createProfile(platform: Platform, name: string): BrowserProfile {
  assertNameAvailable(name);
  const db = getDatabase();
  const profilePath = generateUniqueDirectory(platform, name);
  mkdirSync(resolveProfileDirectory(profilePath), { recursive: true });
  const now = new Date().toISOString();
  const row = db
    .insert(browserProfiles)
    .values({ platform, name, profilePath, status: 'stopped', createdAt: now, updatedAt: now })
    .returning()
    .get();
  devLog.info(`profile created: ${name} (${profilePath})`);
  return toProfile(row);
}

export function renameProfile(id: number, name: string): BrowserProfile {
  assertNameAvailable(name, id);
  const row = getDatabase()
    .update(browserProfiles)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(browserProfiles.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`Profile #${id} 不存在`);
  devLog.info(`profile renamed: #${id} → ${name}`);
  return toProfile(row);
}

export function deleteProfile(id: number): void {
  const profile = getProfile(id);
  if (profile.status === 'running') {
    throw new Error('Profile 正在运行，请先关闭浏览器再删除');
  }
  // 已被平台账号绑定的 Profile 不允许删除（外键 RESTRICT 兜底，这里给出可读错误）。
  const usedByAccount = getDatabase()
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.profileId, id))
    .get();
  if (usedByAccount) {
    throw new Error(`该 Profile 已被账号「${usedByAccount.name}」绑定，请先删除对应账号`);
  }
  getDatabase().delete(browserProfiles).where(eq(browserProfiles.id, id)).run();
  const directory = resolveProfileDirectory(profile.profilePath);
  if (existsSync(directory)) {
    rmSync(directory, { recursive: true, force: true });
  }
  devLog.info(`profile deleted: ${profile.name} (${profile.profilePath})`);
}

export function markProfileStatus(id: number, status: BrowserProfileStatus): void {
  getDatabase()
    .update(browserProfiles)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(browserProfiles.id, id))
    .run();
}

export function touchProfileLastOpened(id: number): void {
  const now = new Date().toISOString();
  getDatabase()
    .update(browserProfiles)
    .set({ lastOpenedAt: now, updatedAt: now })
    .where(eq(browserProfiles.id, id))
    .run();
}

/** 应用启动时调用：上次会话遗留在 running 状态的 Profile 标记为异常退出。 */
export function cleanupStaleRunningProfiles(): number {
  const stale = getDatabase()
    .select()
    .from(browserProfiles)
    .where(eq(browserProfiles.status, 'running'))
    .all();
  for (const row of stale) {
    markProfileStatus(row.id, 'crashed');
    devLog.warn(`browser crashed: profile ${row.name}（上次会话异常退出）`);
  }
  return stale.length;
}
