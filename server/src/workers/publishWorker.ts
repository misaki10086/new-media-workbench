import { Worker } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import { Content, ContentStats, PlatformAccount, PublishRecord, sequelize } from '../models/index.js';
import { getIntegration } from '../platforms/registry.js';
import { PlatformApiError, type PublishInput } from '../platforms/types.js';
import { PUBLISH_QUEUE_NAME, type PublishJob } from '../services/publishQueue.js';

function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** 尝试走真实平台接口发布；返回 null 表示该账号不具备真实发布条件（继续模拟）。 */
async function tryRealPublish(
  account: InstanceType<typeof PlatformAccount>,
  content: InstanceType<typeof Content>,
  record: InstanceType<typeof PublishRecord>,
): Promise<'success' | 'failed' | null> {
  const integration = getIntegration(account.platform);
  if (!integration) return null;
  if (!(await integration.publisher.isReady(account))) return null;

  const input: PublishInput = {
    title: content.title,
    body: content.body,
    coverUrl: content.coverUrl,
    videoUrl: content.videoUrl,
    contentType: content.contentType,
  };

  try {
    const result = await integration.publisher.publish(account, input);
    console.log(`Real publish to ${account.platform} succeeded: ${result.detail}`);
  } catch (error) {
    const message = error instanceof PlatformApiError ? error.message : '平台发布接口调用失败';
    console.error(`Real publish to ${account.platform} failed:`, error);
    if (error instanceof PlatformApiError && error.status === 401) {
      // 令牌已失效且无法自动刷新：账号置为过期，提示用户重新授权。
      await account.update({ status: 'expired' });
    }
    await record.update({ status: 'failed', errorMessage: message });
    return 'failed';
  }

  const now = new Date();
  await sequelize.transaction(async (transaction) => {
    await record.update({ status: 'success', errorMessage: null, publishedAt: now }, { transaction });
    await content.update({ status: 'published' }, { transaction });
  });
  // 真实发布后平台不会立刻返回数据指标，因此不生成模拟统计。
  return 'success';
}

async function processPublishJob(job: { data: PublishJob }): Promise<{ status: 'success' | 'failed' }> {
  const record = await PublishRecord.findByPk(job.data.publishRecordId);
  if (!record || record.status !== 'pending') return { status: 'failed' };

  const [content, account] = await Promise.all([
    Content.findByPk(job.data.contentId),
    PlatformAccount.findByPk(job.data.platformAccountId),
  ]);
  if (!content || !account || account.status !== 'active') {
    await record.update({ status: 'failed', errorMessage: '内容或账号不可用' });
    return { status: 'failed' };
  }

  const realStatus = await tryRealPublish(account, content, record);
  if (realStatus) return { status: realStatus };

  await wait(randomInteger(env.PUBLISH_DELAY_MIN_MS, env.PUBLISH_DELAY_MAX_MS));
  if (Math.random() > env.PUBLISH_SUCCESS_RATE) {
    await record.update({ status: 'failed', errorMessage: '模拟平台接口返回失败' });
    return { status: 'failed' };
  }

  const views = randomInteger(300, 80_000);
  const likes = randomInteger(0, Math.max(1, Math.floor(views * 0.18)));
  const comments = randomInteger(0, Math.max(1, Math.floor(likes * 0.35)));
  const shares = randomInteger(0, Math.max(1, Math.floor(likes * 0.25)));
  const now = new Date();

  await sequelize.transaction(async (transaction) => {
    await record.update({ status: 'success', errorMessage: null, publishedAt: now }, { transaction });
    await ContentStats.create(
      {
        contentId: content.id,
        platformAccountId: account.id,
        views,
        likes,
        comments,
        shares,
        recordedAt: now,
      },
      { transaction },
    );
    await content.update({ status: 'published' }, { transaction });
  });
  return { status: 'success' };
}

async function startWorker(): Promise<void> {
  await sequelize.authenticate();
  const worker = new Worker<PublishJob>(PUBLISH_QUEUE_NAME, processPublishJob, {
    connection: bullConnection,
    concurrency: env.PUBLISH_WORKER_CONCURRENCY,
  });

  worker.on('completed', (job, result) => console.log(`Publish job ${job.id} completed: ${result.status}`));
  worker.on('failed', (job, error) => console.error(`Publish job ${job?.id ?? 'unknown'} crashed:`, error));
  console.log(`Publish worker started with concurrency ${env.PUBLISH_WORKER_CONCURRENCY}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down worker`);
    await worker.close();
    await sequelize.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

async function bootstrap(): Promise<void> {
  try {
    await startWorker();
  } catch (error) {
    console.error('Failed to start publish worker:', error);
    process.exitCode = 1;
  }
}

void bootstrap();
