import { Content, ContentStats, PlatformAccount, PublishRecord } from '../models/index.js';
import { accountView } from '../utils/accountView.js';

export function serializeContent(content: Content) {
  const targets = (content.targetAccounts ?? []).map(accountView);
  const publishRecords = (content.publishRecords ?? []).map((record) => ({
    id: record.id,
    contentId: record.contentId,
    platformAccountId: record.platformAccountId,
    status: record.status,
    errorMessage: record.errorMessage,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    platformAccount: record.platformAccount ? accountView(record.platformAccount) : undefined,
  }));
  const stats = (content.stats ?? []).map((item) => ({
    id: item.id,
    contentId: item.contentId,
    platformAccountId: item.platformAccountId,
    views: item.views,
    likes: item.likes,
    comments: item.comments,
    shares: item.shares,
    recordedAt: item.recordedAt.toISOString(),
    platformAccount: item.platformAccount ? accountView(item.platformAccount) : undefined,
  }));
  const totals = stats.reduce(
    (sum, item) => ({
      views: sum.views + item.views,
      likes: sum.likes + item.likes,
      comments: sum.comments + item.comments,
      shares: sum.shares + item.shares,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 },
  );

  return {
    id: content.id,
    title: content.title,
    body: content.body,
    coverUrl: content.coverUrl,
    tags: content.tags,
    status: content.status,
    scheduledAt: content.scheduledAt?.toISOString() ?? null,
    contentType: content.contentType,
    videoUrl: content.videoUrl,
    userId: content.userId,
    targetAccountIds: targets.map((account) => account.id),
    targets,
    publishRecords,
    stats,
    totals,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  };
}

export async function findContentWithDetails(contentId: number, userId: number): Promise<Content | null> {
  return Content.findOne({
    where: { id: contentId, userId },
    include: [
      { model: PlatformAccount, as: 'targetAccounts', through: { attributes: [] } },
      {
        model: PublishRecord,
        as: 'publishRecords',
        separate: true,
        order: [['createdAt', 'DESC']],
        include: [{ model: PlatformAccount, as: 'platformAccount' }],
      },
      {
        model: ContentStats,
        as: 'stats',
        separate: true,
        order: [['recordedAt', 'DESC']],
        include: [{ model: PlatformAccount, as: 'platformAccount' }],
      },
    ],
  });
}

export async function listContentsWithDetails(userId: number): Promise<Content[]> {
  return Content.findAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
    include: [
      { model: PlatformAccount, as: 'targetAccounts', through: { attributes: [] } },
      {
        model: PublishRecord,
        as: 'publishRecords',
        separate: true,
        order: [['createdAt', 'DESC']],
        include: [{ model: PlatformAccount, as: 'platformAccount' }],
      },
      {
        model: ContentStats,
        as: 'stats',
        separate: true,
        order: [['recordedAt', 'DESC']],
        include: [{ model: PlatformAccount, as: 'platformAccount' }],
      },
    ],
  });
}
