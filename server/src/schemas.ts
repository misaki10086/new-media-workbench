import { z } from 'zod';
import { ACCOUNT_STATUSES, PLATFORMS } from './models/PlatformAccount.js';
import { CONTENT_TYPES } from './models/Content.js';

const nullableUrl = z.union([z.url().max(2048), z.literal(''), z.null()]).transform((value) => value || null);
const accountIds = z.array(z.coerce.number().int().positive()).max(100).transform((ids) => [...new Set(ids)]);

export const wechatConnectSchema = z.object({
  appId: z.string().trim().min(1).max(80).optional(),
  appSecret: z.string().trim().min(1).max(200).optional(),
});

export const createAccountSchema = z.object({
  platform: z.enum(PLATFORMS),
  accountName: z.string().trim().min(1).max(120),
  credential: z.string().trim().min(1).max(10_000),
  status: z.enum(ACCOUNT_STATUSES).default('active'),
});

const contentFields = {
  title: z.string().trim().min(1).max(255),
  body: z.string().min(1).max(1_000_000),
  coverUrl: nullableUrl.default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]).transform((tags) => [...new Set(tags)]),
  scheduledAt: z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).default(null).transform((value) => value || null),
  contentType: z.enum(CONTENT_TYPES).default('article'),
  videoUrl: nullableUrl.default(null),
};

export const createContentSchema = z
  .object({
    ...contentFields,
    accountIds: accountIds.optional(),
    targetAccountIds: accountIds.optional(),
  })
  .transform(({ accountIds: primaryIds, targetAccountIds, ...content }) => ({
    ...content,
    accountIds: primaryIds ?? targetAccountIds ?? [],
  }));

export const updateContentSchema = z
  .object({
    title: contentFields.title.optional(),
    body: contentFields.body.optional(),
    coverUrl: nullableUrl.optional(),
    tags: contentFields.tags.optional(),
    scheduledAt: contentFields.scheduledAt.optional(),
    contentType: z.enum(CONTENT_TYPES).optional(),
    videoUrl: nullableUrl.optional(),
    accountIds: accountIds.optional(),
    targetAccountIds: accountIds.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少需要提供一个要更新的字段')
  .transform(({ accountIds: primaryIds, targetAccountIds, ...content }) => ({
    ...content,
    ...(primaryIds !== undefined || targetAccountIds !== undefined
      ? { accountIds: primaryIds ?? targetAccountIds ?? [] }
      : {}),
  }));

export const publishSchema = z.object({ accountIds: accountIds.optional() }).default({});

export const aiTitleSchema = z.object({ topic: z.string().trim().min(2).max(200) });
