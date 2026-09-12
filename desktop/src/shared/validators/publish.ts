import { z } from 'zod';
import { accountIdSchema } from './account';
import { idSchema } from './content';

export const createPublishTaskSchema = z.object({
  contentId: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive(),
});

/** 批量创建：最多 100 条内容 × 20 个账号（每平台一条任务的矩阵由服务端展开）。 */
export const createBatchPublishTasksSchema = z.object({
  contentIds: z.array(z.coerce.number().int().positive()).min(1).max(100).transform((ids) => [...new Set(ids)]),
  accountIds: z.array(z.coerce.number().int().positive()).min(1).max(20).transform((ids) => [...new Set(ids)]),
  scheduledAt: z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).optional(),
});

export const updatePublishTaskSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    scheduledAt: z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).optional(),
    priority: z.enum(['HIGH', 'NORMAL', 'LOW']).optional(),
  })
  .refine((value) => value.scheduledAt !== undefined || value.priority !== undefined, '至少提供一个要修改的字段');

export const publishTaskIdSchema = idSchema;

export const aiConfigSchema = z.object({
  baseUrl: z.string().trim().url('Base URL 必须是合法地址').max(300),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().max(300).optional(),
});

export const aiGenerateSchema = z.object({
  topic: z.string().trim().min(2, '主题至少 2 个字').max(200),
});

export { accountIdSchema };