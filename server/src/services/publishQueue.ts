import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis.js';

export const PUBLISH_QUEUE_NAME = 'content-publishing';

export interface PublishJob {
  publishRecordId: number;
  contentId: number;
  platformAccountId: number;
}

let queue: Queue<PublishJob> | undefined;

export function getPublishQueue(): Queue<PublishJob> {
  if (!queue) queue = new Queue<PublishJob>(PUBLISH_QUEUE_NAME, { connection: bullConnection });
  return queue;
}

export async function enqueuePublish(job: PublishJob, scheduledAt: Date | null): Promise<void> {
  const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
  await getPublishQueue().add('publish-account', job, {
    jobId: `publish-${job.publishRecordId}`,
    delay,
    attempts: 1,
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 1_000 },
  });
}

export async function closePublishQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
