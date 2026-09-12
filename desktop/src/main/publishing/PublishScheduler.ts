import { eq } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { publishTasks } from '../database/schema';
import { devLog } from '../services/logger';
import { logTaskAction } from './taskLog';
import { sortDueTasks } from './schedulerCore';

interface SchedulerOptions {
  intervalMs?: number;
  /** 执行器：测试注入假实现；默认动态加载真实发布引擎。 */
  executor?: (taskId: number) => Promise<void>;
}

/**
 * 本地发布调度器（Phase 6）。
 * - 1 秒 tick，绝不阻塞主线程（异步 tick + 重入锁）。
 * - 全局同一时间最多 1 个执行中任务（含 Profile 级锁，见 claim）。
 * - 应用启动时恢复：遗留 running 标记为失败 INTERRUPTED；SCHEDULED/PAUSED/WAITING 等自然保留。
 * - 同一个任务不可能被两个 tick 重复拉起（单线程 + running 守卫 + 状态原子更新）。
 */
export class PublishScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly intervalMs: number;
  private readonly executor: (taskId: number) => Promise<void>;

  constructor(options: SchedulerOptions = {}) {
    this.intervalMs = options.intervalMs ?? 1000;
    this.executor =
      options.executor ??
      (async (taskId: number) => {
        // 延迟加载：避免调度模块与浏览器栈硬耦合（也便于测试注入）。
        const { executeTask } = await import('../services/publishService');
        await executeTask(taskId);
      });
  }

  /** 启动调度器（幂等）：恢复遗留 running，开始定时 tick。 */
  start(): void {
    this.recoverInterruptedTasks();
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
    devLog.info('发布调度器已启动（1s tick，本地调度）');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    devLog.info('发布调度器已停止');
  }

  /** 应用异常退出时遗留的 running 任务 → failed(INTERRUPTED)。 */
  recoverInterruptedTasks(): void {
    const db = getDatabase();
    const stale = db.select().from(publishTasks).where(eq(publishTasks.status, 'running')).all();
    const now = new Date().toISOString();
    for (const row of stale) {
      db.update(publishTasks)
        .set({
          status: 'failed',
          errorCode: 'INTERRUPTED',
          errorMessage: '应用在上次执行中被关闭，任务中断',
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(publishTasks.id, row.id))
        .run();
      devLog.warn(`[task ${row.id}] 上次会话中断，标记为 INTERRUPTED`);
    }
  }

  /** 执行一轮调度（测试可直接调用，传入 now 便于控制时间）。 */
  async tick(now: number = Date.now()): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const db = getDatabase();
      // 全局单任务：有执行中的任务时本轮不做任何调度。
      const running = db.select({ id: publishTasks.id }).from(publishTasks).where(eq(publishTasks.status, 'running')).all();
      if (running.length > 0) return 0;

      const { listTasks } = await import('../services/publishService');
      const candidates = sortDueTasks(listTasks(), now);

      for (const candidate of candidates) {
        const claimed = this.claim(candidate.task.id, now);
        if (!claimed) continue;
        devLog.info(`[scheduler] 拉起任务 #${candidate.task.id}（priority=${candidate.task.priority}）`);
        void this.executor(candidate.task.id).catch((error) => {
          devLog.error(`[scheduler] task ${candidate.task.id} executor rejected: ${error instanceof Error ? error.message : String(error)}`);
        });
        return 1; // 每轮至多拉起一个
      }
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  private claim(taskId: number, now: number): boolean {
    const db = getDatabase();
    const row = db.select().from(publishTasks).where(eq(publishTasks.id, taskId)).get();
    if (!row) return false;
    if (row.status !== 'pending' && row.status !== 'scheduled' && row.status !== 'failed') return false;

    // 重试任务：记录重试次数；其余为首次/定时执行。
    const isRetry = row.status === 'failed';
    const nextRetryCount = isRetry ? row.retryCount + 1 : row.retryCount;
    const nowIso = new Date(now).toISOString();
    db.update(publishTasks)
      .set({
        status: 'running',
        waitingReason: null,
        startedAt: row.startedAt ?? nowIso,
        finishedAt: null,
        updatedAt: nowIso,
        retryCount: nextRetryCount,
      })
      .where(eq(publishTasks.id, taskId))
      .run();
    logTaskAction(
      taskId,
      isRetry ? 'TASK_RETRY' : 'TASK_STARTED',
      isRetry ? `开始第 ${nextRetryCount}/${row.maxRetries} 次自动重试` : '任务开始执行',
    );
    return true;
  }
}

let singleton: PublishScheduler | null = null;

export function getPublishScheduler(): PublishScheduler {
  if (!singleton) singleton = new PublishScheduler();
  return singleton;
}

export function createPublishScheduler(options?: SchedulerOptions): PublishScheduler {
  return new PublishScheduler(options);
}