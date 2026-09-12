import { z } from 'zod';

export const ASSET_TYPE_EXTENSIONS: Record<import('@shared/types/domain').AssetType, readonly string[]> = {
  video: ['mp4', 'mov', 'webm'],
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  audio: ['mp3', 'wav', 'm4a', 'flac'],
  font: ['ttf', 'otf', 'woff', 'woff2'],
};

export const assetTypeSchema = z.enum(['video', 'image', 'audio', 'font']);
export const assetTypeFilterSchema = z.enum(['video', 'image', 'audio', 'font', 'all']).default('all');

export const assetTagsSchema = z.array(z.string().trim().min(1).max(30)).max(20);

export const importAssetPathsSchema = z.object({
  paths: z.array(z.string().trim().min(1)).min(1).max(200),
  defaultType: assetTypeSchema.optional(),
});

export const assetListFilterSchema = z.object({
  type: assetTypeFilterSchema.optional(),
  search: z.string().trim().max(80).optional(),
  favorite: z.boolean().optional(),
});

export const assetIdSchema = z.coerce.number().int().positive();

export const assetUpdateSchema = z
  .object({
    tags: assetTagsSchema.optional(),
    favorite: z.boolean().optional(),
  })
  .refine((value) => value.tags !== undefined || value.favorite !== undefined, '至少提供一个要更新的字段');

export function detectAssetType(extension: string, defaultType?: 'video' | 'image' | 'audio' | 'font'): 'video' | 'image' | 'audio' | 'font' | null {
  const normalized = extension.toLowerCase();
  for (const [type, extensions] of Object.entries(ASSET_TYPE_EXTENSIONS)) {
    if ((extensions as readonly string[]).includes(normalized)) return type as 'video' | 'image' | 'audio' | 'font';
  }
  return defaultType ?? null;
}