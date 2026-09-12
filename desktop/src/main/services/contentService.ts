import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { contents } from '../database/schema';
import type { ContentCreateInput, ContentUpdateInput, ImportResult } from '@shared/types/ipc';
import type { ContentItem, ContentStatus } from '@shared/types/domain';
import { VIDEO_EXTENSIONS } from '@shared/validators/content';

type ContentRow = typeof contents.$inferSelect;

function toItem(row: ContentRow): ContentItem {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    videoPath: row.videoPath,
    coverPath: row.coverPath,
    tags,
    durationSeconds: row.durationSeconds,
    fileSizeBytes: row.fileSizeBytes,
    status: row.status as ContentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listContents(): ContentItem[] {
  return getDatabase()
    .select()
    .from(contents)
    .orderBy(desc(contents.updatedAt))
    .all()
    .map(toItem);
}

export function getContent(id: number): ContentItem | null {
  const row = getDatabase().select().from(contents).where(eq(contents.id, id)).get();
  return row ? toItem(row) : null;
}

export function createContent(input: ContentCreateInput): ContentItem {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db
    .insert(contents)
    .values({
      title: input.title,
      description: input.description,
      videoPath: input.videoPath,
      coverPath: input.coverPath ?? null,
      tags: JSON.stringify(input.tags),
      fileSizeBytes: statSync(input.videoPath).size,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const created = getContent(Number(result.lastInsertRowid));
  if (!created) throw new Error('内容创建后读取失败');
  return created;
}

export function updateContent(id: number, patch: ContentUpdateInput): ContentItem {
  const db = getDatabase();
  const row = db.select().from(contents).where(eq(contents.id, id)).get();
  if (!row) throw new Error('内容不存在');
  db.update(contents)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.coverPath !== undefined ? { coverPath: patch.coverPath } : {}),
      ...(patch.tags !== undefined ? { tags: JSON.stringify(patch.tags) } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contents.id, id))
    .run();
  const updated = getContent(id);
  if (!updated) throw new Error('内容更新后读取失败');
  return updated;
}

export function deleteContent(id: number): void {
  const result = getDatabase().delete(contents).where(eq(contents.id, id)).run();
  if (result.changes === 0) throw new Error('内容不存在');
}

/** 按绝对路径去重：已导入过的视频直接跳过。 */
function isDuplicateVideoPath(videoPath: string): boolean {
  const row = getDatabase()
    .select({ id: contents.id })
    .from(contents)
    .where(eq(contents.videoPath, videoPath))
    .get();
  return Boolean(row);
}

/**
 * 导入本地视频文件：
 * 仅接受 MP4 / MOV / WebM，文件必须存在；按绝对路径去重；
 * 标题默认取文件名（不含扩展名），文件大小取自磁盘 stat。
 */
export function importVideoFiles(rawPaths: string[]): ImportResult {
  const imported: ContentItem[] = [];
  let skipped = 0;

  for (const rawPath of rawPaths) {
    const videoPath = resolve(rawPath);
    const extension = extname(videoPath).slice(1).toLowerCase();
    if (!(VIDEO_EXTENSIONS as readonly string[]).includes(extension) || !existsSync(videoPath)) {
      skipped += 1;
      continue;
    }
    if (isDuplicateVideoPath(videoPath)) {
      skipped += 1;
      continue;
    }
    const fileName = videoPath.split(/[\\/]/).pop() ?? videoPath;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    imported.push(
      createContent({
        title: baseName || '未命名视频',
        description: '',
        videoPath,
        coverPath: null,
        tags: [],
      }),
    );
  }

  return { imported, skipped };
}
