import { asc, eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { browserProfiles, customPlatforms } from '../database/schema';
import { devLog } from './logger';
import type { CustomPlatform, Platform } from '@shared/types/domain';
import { PLATFORM_LABEL } from '@shared/constants/platforms';

type Row = typeof customPlatforms.$inferSelect;

function toCustomPlatform(row: Row): CustomPlatform {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    creatorUrl: row.creatorUrl,
    loginUrlPattern: row.loginUrlPattern,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listCustomPlatforms(): CustomPlatform[] {
  return getDatabase().select().from(customPlatforms).orderBy(asc(customPlatforms.id)).all().map(toCustomPlatform);
}

export function getCustomPlatformByKey(key: string): CustomPlatform | null {
  const row = getDatabase().select().from(customPlatforms).where(eq(customPlatforms.key, key)).get();
  return row ? toCustomPlatform(row) : null;
}

function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return ascii || 'platform';
}

function generateUniqueKey(name: string): string {
  const base = `custom-${slugify(name)}`;
  let candidate = base;
  let counter = 2;
  while (getCustomPlatformByKey(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export function createCustomPlatform(name: string, creatorUrl: string, loginUrlPattern: string | null): CustomPlatform {
  const key = generateUniqueKey(name);
  const now = new Date().toISOString();
  const row = getDatabase()
    .insert(customPlatforms)
    .values({ key, name, creatorUrl, loginUrlPattern, createdAt: now, updatedAt: now })
    .returning()
    .get();
  devLog.info(`custom platform created: ${name} (${key}) → ${creatorUrl}`);
  return toCustomPlatform(row);
}

export function updateCustomPlatform(id: number, patch: { name?: string; creatorUrl?: string; loginUrlPattern?: string | null }): CustomPlatform {
  const row = getDatabase()
    .update(customPlatforms)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(customPlatforms.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`自定义平台 #${id} 不存在`);
  devLog.info(`custom platform updated: ${row.name}`);
  return toCustomPlatform(row);
}

/** 删除自定义平台：有 Profile 或账号绑定时拒绝（避免孤儿引用）。 */
export function deleteCustomPlatform(id: number): void {
  const row = getDatabase().select().from(customPlatforms).where(eq(customPlatforms.id, id)).get();
  if (!row) throw new Error(`自定义平台 #${id} 不存在`);
  const usedByProfile = getDatabase()
    .select({ id: browserProfiles.id })
    .from(browserProfiles)
    .where(eq(browserProfiles.platform, row.key))
    .get();
  if (usedByProfile) throw new Error(`平台「${row.name}」下还有浏览器 Profile，请先删除对应 Profile`);
  getDatabase().delete(customPlatforms).where(eq(customPlatforms.id, id)).run();
  devLog.info(`custom platform deleted: ${row.name} (${row.key})`);
}

export interface PlatformCatalogEntry {
  id: Platform;
  name: string;
  builtin: boolean;
  creatorUrl: string | null;
  /** 登录检测是否可用（内置四平台 + 自定义平台均可）。 */
  loginDetection: boolean;
}

/** 平台目录：内置四平台 + 自定义平台，统一供 UI 下拉与标签解析。 */
export function listAllPlatformEntries(): PlatformCatalogEntry[] {
  const builtin: PlatformCatalogEntry[] = (Object.keys(PLATFORM_LABEL) as (keyof typeof PLATFORM_LABEL)[]).map((key) => ({
    id: key,
    name: PLATFORM_LABEL[key],
    builtin: true,
    creatorUrl: null,
    loginDetection: true,
  }));
  const custom = listCustomPlatforms().map((platform) => ({
    id: platform.key,
    name: platform.name,
    builtin: false,
    creatorUrl: platform.creatorUrl,
    loginDetection: true,
  }));
  return [...builtin, ...custom];
}

/** 平台显示名解析：内置走常量表，自定义走 custom_platforms.name，未知原样返回。 */
export function resolvePlatformName(platform: string): string {
  const builtin = (PLATFORM_LABEL as Record<string, string>)[platform];
  if (builtin) return builtin;
  const custom = getCustomPlatformByKey(platform);
  return custom?.name ?? platform;
}