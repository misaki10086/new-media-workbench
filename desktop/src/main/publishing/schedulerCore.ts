import type { PublishTask, TaskPriority } from '@shared/types/domain';

/** 优先级排序权重：HIGH 最先。 */
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
};

/** 可以自动重试的错误码（其余一律人工处理）。 */
export const RETRYABLE_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'UPLOAD_TIMEOUT',
  'UPLOAD_FAILED',
  'PAGE_LOAD_TIMEOUT',
  'BROWSER_CRASHED',
  'EXECUTOR_CRASHED',
]);

/** 不允许自动重试的错误码（明确原因，进入 WAITING_USER 或 FAILED）。 */
export const NON_RETRYABLE_ERROR_CODES = new Set([
  'LOGIN_REQUIRED',
  'SECURITY_CHECK_REQUIRED',
  'SELECTOR_FAILED',
  'PUBLISH_RESULT_UNKNOWN',
  'FILE_NOT_FOUND',
  'EMPTY_FILE',
  'UNSUPPORTED_VIDEO_FORMAT',
  'FILE_TOO_LARGE',
  'CONTENT_NOT_FOUND',
  'PROFILE_NOT_FOUND',
  'PUBLISH_FAILED',
  'INTERRUPTED',
]);

/** 指数退避：第 1 次 30 秒，第 2 次 2 分钟，第 3 次 5 分钟，之后封顶 5 分钟。 */
export function retryBackoffMs(attempt: number): number {
  if (attempt <= 1) return 30_000;
  if (attempt === 2) return 2 * 60_000;
  return 5 * 60_000;
}

export function shouldAutoRetry(errorCode: string | null, retryCount: number, maxRetries: number): boolean {
  if (!errorCode) return false;
  if (!RETRYABLE_ERROR_CODES.has(errorCode)) return false;
  return retryCount < maxRetries;
}

export interface SchedulerCandidate {
  task: PublishTask;
  /** 用于排序的参考时间：定时任务用 scheduledAt，重试任务用 nextRetryAt，其余用 createdAt。 */
  dueAt: string;
}

/** 到期任务按 优先级 > 计划时间 排序（Phase 6 调度核心，纯函数）。 */
export function sortDueTasks(tasks: PublishTask[], now: number): SchedulerCandidate[] {
  return tasks
    .filter((task) => isDue(task, now))
    .map((task) => ({ task, dueAt: task.nextRetryAt ?? task.scheduledAt ?? task.createdAt }))
    .sort((a, b) => {
      const priorityDelta = PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return a.dueAt.localeCompare(b.dueAt);
    });
}

/** 任务是否到了可以执行的时间点。 */
export function isDue(task: PublishTask, now: number): boolean {
  // 重试任务：到 nextRetryAt 且未超过次数上限
  if (task.status === 'failed' && task.nextRetryAt) {
    return new Date(task.nextRetryAt).getTime() <= now && task.retryCount < task.maxRetries;
  }
  // 定时任务：到 scheduledAt
  if (task.status === 'scheduled') {
    return Boolean(task.scheduledAt) && new Date(task.scheduledAt as string).getTime() <= now;
  }
  // 待执行任务：无计划时间，或计划时间已到（安全兜底）
  if (task.status === 'pending') {
    return !task.scheduledAt || new Date(task.scheduledAt).getTime() <= now;
  }
  return false;
}