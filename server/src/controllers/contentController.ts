import type { Request, Response } from 'express';
import { Op, type Transaction } from 'sequelize';
import type { z } from 'zod';
import { sequelize, Content, ContentTarget, PlatformAccount, PublishRecord } from '../models/index.js';
import type { createContentSchema, publishSchema, updateContentSchema } from '../schemas.js';
import { findContentWithDetails, listContentsWithDetails, serializeContent } from '../services/contentView.js';
import { enqueuePublish } from '../services/publishQueue.js';
import { ApiError } from '../utils/ApiError.js';
import { DEFAULT_USER_ID, parseId } from '../utils/params.js';

type CreateContentInput = z.infer<typeof createContentSchema>;
type UpdateContentInput = z.infer<typeof updateContentSchema>;
type PublishInput = z.infer<typeof publishSchema>;

async function assertOwnedAccounts(userId: number, ids: number[], activeOnly = false): Promise<PlatformAccount[]> {
  if (ids.length === 0) return [];
  const accounts = await PlatformAccount.findAll({
    where: {
      id: { [Op.in]: ids },
      userId,
      ...(activeOnly ? { status: 'active' } : {}),
    },
  });
  if (accounts.length !== ids.length) {
    throw new ApiError(
      400,
      'INVALID_TARGET_ACCOUNTS',
      activeOnly ? '部分目标账号不存在、已过期或不属于当前用户' : '部分目标账号不存在或不属于当前用户',
    );
  }
  return accounts;
}

async function replaceTargets(contentId: number, accountIds: number[], transaction: Transaction): Promise<void> {
  await ContentTarget.destroy({ where: { contentId }, transaction });
  if (accountIds.length > 0) {
    await ContentTarget.bulkCreate(
      accountIds.map((platformAccountId) => ({ contentId, platformAccountId })),
      { transaction },
    );
  }
}

export async function listContents(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const contents = await listContentsWithDetails(userId);
  response.json({ data: { contents: contents.map(serializeContent) } });
}

export async function createContent(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const input = request.body as CreateContentInput;
  await assertOwnedAccounts(userId, input.accountIds);

  const content = await sequelize.transaction(async (transaction) => {
    const created = await Content.create(
      {
        title: input.title,
        body: input.body,
        coverUrl: input.coverUrl,
        tags: input.tags,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        contentType: input.contentType,
        videoUrl: input.videoUrl,
        userId,
      },
      { transaction },
    );
    await replaceTargets(created.id, input.accountIds, transaction);
    return created;
  });

  const detailed = await findContentWithDetails(content.id, userId);
  if (!detailed) throw new ApiError(500, 'CONTENT_READ_FAILED', '内容创建后读取失败');
  response.status(201).json({ data: { content: serializeContent(detailed) } });
}

export async function updateContent(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const id = parseId(request.params.id);
  const input = request.body as UpdateContentInput;
  const content = await Content.findOne({ where: { id, userId } });
  if (!content) throw new ApiError(404, 'CONTENT_NOT_FOUND', '内容不存在');
  if (input.accountIds !== undefined) await assertOwnedAccounts(userId, input.accountIds);

  await sequelize.transaction(async (transaction) => {
    if (input.title !== undefined) content.title = input.title;
    if (input.body !== undefined) content.body = input.body;
    if (input.coverUrl !== undefined) content.coverUrl = input.coverUrl;
    if (input.tags !== undefined) content.tags = input.tags;
    if (input.scheduledAt !== undefined) content.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.contentType !== undefined) content.contentType = input.contentType;
    if (input.videoUrl !== undefined) content.videoUrl = input.videoUrl;
    await content.save({ transaction });
    if (input.accountIds !== undefined) await replaceTargets(content.id, input.accountIds, transaction);
  });

  const detailed = await findContentWithDetails(content.id, userId);
  if (!detailed) throw new ApiError(500, 'CONTENT_READ_FAILED', '内容更新后读取失败');
  response.json({ data: { content: serializeContent(detailed) } });
}

export async function publishContent(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const contentId = parseId(request.params.id);
  const body = request.body as PublishInput;
  const content = await Content.findOne({ where: { id: contentId, userId } });
  if (!content) throw new ApiError(404, 'CONTENT_NOT_FOUND', '内容不存在');

  const storedTargets = body.accountIds === undefined
    ? await ContentTarget.findAll({ where: { contentId }, attributes: ['platformAccountId'] })
    : [];
  const accountIds = body.accountIds ?? storedTargets.map((target) => target.platformAccountId);
  if (accountIds.length === 0) throw new ApiError(400, 'NO_TARGET_ACCOUNTS', '请至少选择一个发布账号');
  await assertOwnedAccounts(userId, accountIds, true);

  const records = await sequelize.transaction(async (transaction) => PublishRecord.bulkCreate(
    accountIds.map((platformAccountId) => ({
      contentId,
      platformAccountId,
      status: 'pending' as const,
      errorMessage: null,
      publishedAt: null,
    })),
    { transaction },
  ));

  const queued = await Promise.all(records.map(async (record) => {
    try {
      await enqueuePublish(
        { publishRecordId: record.id, contentId, platformAccountId: record.platformAccountId },
        content.scheduledAt,
      );
      return true;
    } catch (error) {
      console.error('Failed to enqueue publish record:', error);
      await record.update({ status: 'failed', errorMessage: '发布队列暂时不可用' });
      return false;
    }
  }));

  if (!queued.some(Boolean)) throw new ApiError(503, 'QUEUE_UNAVAILABLE', '发布队列暂时不可用，请稍后重试');
  response.status(202).json({
    data: {
      message: content.scheduledAt && content.scheduledAt.getTime() > Date.now() ? '定时发布任务已创建' : '发布任务已创建',
      records: records.map((record) => ({
        id: record.id,
        contentId: record.contentId,
        platformAccountId: record.platformAccountId,
        status: record.status,
        errorMessage: record.errorMessage,
        publishedAt: record.publishedAt,
      })),
    },
  });
}
