import { z } from 'zod';

/** 允许导入的视频扩展名（小写、不含点）。 */
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'] as const;

export const videoPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => VIDEO_EXTENSIONS.includes(value.split('.').pop()?.toLowerCase() as (typeof VIDEO_EXTENSIONS)[number]),
    { message: '仅支持 MP4 / MOV / WebM 视频文件' },
  );

export const contentCreateSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(255),
  description: z.string().max(20_000).default(''),
  videoPath: videoPathSchema,
  coverPath: z.string().trim().min(1).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
});

export const contentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(20_000).optional(),
    coverPath: z.string().trim().min(1).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个要更新的字段');

export const importPathsSchema = z.array(z.string().trim().min(1)).min(1).max(100);

export const idSchema = z.coerce.number().int().positive();

export const settingsKeySchema = z.enum(['publish_confirm_mode']);

export const settingsValueSchema = z.string().min(1).max(1000);

export const publishConfirmModeSchema = z.enum(['manual_confirm', 'auto_publish', 'save_draft']);
