import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { assets } from '../database/schema';
import { detectAssetType } from '@shared/validators/asset';
import type { AssetItem, AssetType } from '@shared/types/domain';

type AssetRow = typeof assets.$inferSelect;

function toAsset(row: AssetRow): AssetItem {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    type: row.type as AssetType,
    name: row.name,
    path: row.path,
    sizeBytes: row.sizeBytes,
    tags,
    favorite: row.favorite,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface AssetFilter {
  type?: 'video' | 'image' | 'audio' | 'font' | 'all';
  search?: string;
  favorite?: boolean;
}

export function listAssets(filter: AssetFilter = {}): AssetItem[] {
  const conditions = [];
  if (filter.type && filter.type !== 'all') conditions.push(eq(assets.type, filter.type));
  if (filter.favorite) conditions.push(eq(assets.favorite, true));
  const rows = getDatabase()
    .select()
    .from(assets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(assets.updatedAt))
    .all()
    .map(toAsset);

  const keyword = filter.search?.trim().toLowerCase();
  if (!keyword) return rows;
  return rows.filter(
    (asset) =>
      asset.name.toLowerCase().includes(keyword) ||
      asset.tags.some((tag) => tag.toLowerCase().includes(keyword)),
  );
}

export interface AssetImportResult {
  imported: AssetItem[];
  skipped: number;
}

/** 按扩展名归类素材并按绝对路径去重；文件必须存在。 */
export function importAssets(rawPaths: string[], defaultType?: AssetType): AssetImportResult {
  const imported: AssetItem[] = [];
  let skipped = 0;

  for (const rawPath of rawPaths) {
    const path = resolve(rawPath);
    if (!existsSync(path)) {
      skipped += 1;
      continue;
    }
    const existing = getDatabase().select({ id: assets.id }).from(assets).where(eq(assets.path, path)).get();
    if (existing) {
      skipped += 1;
      continue;
    }
    const extension = extname(path).slice(1);
    const type = detectAssetType(extension, defaultType);
    if (!type) {
      skipped += 1;
      continue;
    }
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(path).size;
    } catch {
      sizeBytes = 0;
    }
    const name = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? path;
    const now = new Date().toISOString();
    const row = getDatabase()
      .insert(assets)
      .values({ type, name, path, sizeBytes, tags: '[]', favorite: false, createdAt: now, updatedAt: now })
      .returning()
      .get();
    imported.push(toAsset(row));
  }
  return { imported, skipped };
}

export function setAssetFavorite(id: number, favorite: boolean): AssetItem {
  const row = getDatabase()
    .update(assets)
    .set({ favorite, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`素材 #${id} 不存在`);
  return toAsset(row);
}

export function setAssetTags(id: number, tags: string[]): AssetItem {
  const row = getDatabase()
    .update(assets)
    .set({ tags: JSON.stringify(tags), updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`素材 #${id} 不存在`);
  return toAsset(row);
}

/** 只移除素材记录，不删除原始文件（用户文件安全优先）。 */
export function deleteAsset(id: number): void {
  const result = getDatabase().delete(assets).where(eq(assets.id, id)).run();
  if (result.changes === 0) throw new Error(`素材 #${id} 不存在`);
}