import { z } from 'zod';
import { platformSchema } from './browserProfile';

export const createAccountSchema = z.object({
  platform: platformSchema,
  name: z.string().trim().min(1, '账号名称不能为空').max(60, '账号名称过长（最多 60 字）'),
  profileId: z.coerce.number().int().positive(),
});

export const accountIdSchema = z.coerce.number().int().positive();
