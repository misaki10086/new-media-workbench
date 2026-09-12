import { z } from 'zod';

/** 平台标识：内置四平台 key 或自定义平台 key（custom-*）。 */
export const platformSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/, '平台标识只允许小写字母、数字和连字符');

export const customPlatformCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '平台名称不能为空')
    .max(40, '平台名称过长（最多 40 字）')
    .refine((value) => !/[\\/:*?"<>|]/.test(value), '名称不能包含 \\ / : * ? " < > |'),
  creatorUrl: z.string().trim().url('创作者中心地址必须是合法 URL').max(500),
  loginUrlPattern: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .refine((value) => {
      if (!value) return true;
      try {
        new RegExp(value, 'i');
        return true;
      } catch {
        return false;
      }
    }, '登录页地址特征必须是合法正则表达式'),
});

export const customPlatformUpdateSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(40).optional(),
    creatorUrl: z.string().trim().url().max(500).optional(),
    loginUrlPattern: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .optional()
      .refine((value) => {
        if (!value) return true;
        try {
          new RegExp(value, 'i');
          return true;
        } catch {
          return false;
        }
      }, '登录页地址特征必须是合法正则表达式'),
  })
  .refine((value) => value.name !== undefined || value.creatorUrl !== undefined || value.loginUrlPattern !== undefined, '至少提供一个要修改的字段');

export const platformKeySchema = z.string().trim().min(1).max(60);

export const profileNameSchema = z
  .string()
  .trim()
  .min(1, 'Profile 名称不能为空')
  .max(60, 'Profile 名称过长（最多 60 字）')
  .refine((value) => !/[\\/:*?"<>|]/.test(value), '名称不能包含 \\ / : * ? " < > |');

export const createProfileSchema = z.object({
  platform: platformSchema,
  name: profileNameSchema,
});

export const renameProfileSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: profileNameSchema,
});

export const profileIdSchema = z.coerce.number().int().positive();
