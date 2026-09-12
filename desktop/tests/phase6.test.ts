import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, closeDatabase, getDatabase } from '../src/main/database/db';
import { publishTasks, publishLogs } from '../src/main/database/schema';
import { createPublishScheduler } from '../src/main/publishing/PublishScheduler';
import {
  isDue,
  retryBackoffMs,
  shouldAutoRetry,
  sortDueTasks,
} from '../src/main/publishing/schedulerCore';
import { createProfile, deleteProfile, listProfiles } from '../src/main/services/browserProfileService';
import { createAccount, deleteAccount, listAccounts } from '../src/main/services/accountService';
import { createContent, deleteContent, listContents } from '../src/main/services/contentService';
import {
  cancelTask,
  createTask,
  getTask,
  pauseTask,
  resumeTask,
  updateTaskSchedule,
} from '../src/main/services/publishService';
import type { PublishTask } from '../src/shared/types/domain';

let dbDir: string;
let profileId = 0;
let accountId = 0;
let contentId = 0;
const createdTaskIds: number[] = [];

function taskTemplate(overrides: Partial<PublishTask> = {}): PublishTask {
  return {
    id: 1,
    contentId,
    contentTitle: 't',
    platform: 'douyin',
    platformName: '抖音',
    accountId,
    accountName: null,
    browserProfileId: profileId,
    status: 'pending',
    priority: 'NORMAL',
    currentStep: 'CREATED',
    waitingReason: null,
    progress: 0,
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    lastCompletedStep: null,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-09-10T12:00:00.000Z').getTime();

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'nmw-phase6-'));
  initDatabase(join(dbDir, 'app.db'));
  const profile = createProfile('douyin', '调度测试Profile');
  profileId = profile.id;
  const account = createAccount('douyin', '调度测试账号', profile.id);
  accountId = account.id;
  const video = join(dbDir, 'sample.mp4');
  writeFileSync(video, 'fake-video');
  const content = createContent({ title: '调度测试视频', description: '', videoPath: video, coverPath: null, tags: [] });
  contentId = content.id;
});

afterAll(() => {
  for (const id of createdTaskIds.splice(0)) {
    const row = getDatabase().select().from(publishTasks).where(eq(publishTasks.id, id)).get();
    if (row && !['success', 'cancelled'].includes(row.status)) cancelTask(id);
  }
  for (const content of listContents()) deleteContent(content.id);
  for (const account of listAccounts()) deleteAccount(account.id);
  for (const profile of listProfiles()) deleteProfile(profile.id);
  closeDatabase();
  rmSync(dbDir, { recursive: true, force: true });
});

beforeEach(() => {
  // 保证每个用例前没有遗留的执行中/可执行任务
  const db = getDatabase();
  const rows = db.select().from(publishTasks).all();
  for (const row of rows) {
    db.update(publishTasks)
      .set({ status: 'cancelled', waitingReason: null, updatedAt: new Date().toISOString() })
      .where(eq(publishTasks.id, row.id))
      .run();
  }
});

/** 创建任务并注册清理。 */
function newTask(): number {
  const id = createTask(contentId, accountId).id;
  createdTaskIds.push(id);
  return id;
}

function fakeExecutor(records: number[]): (taskId: number) => Promise<void> {
  return async (taskId: number) => {
    records.push(taskId);
  };
}

// ---------------------------------------------------------------------------
// 纯函数：排序 / 到期 / 退避 / 可重试
// ---------------------------------------------------------------------------

describe('调度核心（纯函数）', () => {
  it('优先级 HIGH > NORMAL > LOW', () => {
    const low = taskTemplate({ id: 1, priority: 'LOW', createdAt: '2026-09-10T00:00:00.000Z' });
    const high = taskTemplate({ id: 2, priority: 'HIGH', createdAt: '2026-09-10T00:00:05.000Z' });
    const normal = taskTemplate({ id: 3, priority: 'NORMAL', createdAt: '2026-09-10T00:00:03.000Z' });
    const sorted = sortDueTasks([low, high, normal], NOW);
    expect(sorted.map((item) => item.task.id)).toEqual([2, 3, 1]);
  });

  it('同优先级按 scheduledAt / createdAt 排序', () => {
    const later = taskTemplate({ id: 1, priority: 'NORMAL', scheduledAt: '2026-09-10T11:00:00.000Z', status: 'scheduled' });
    const earlier = taskTemplate({ id: 2, priority: 'NORMAL', scheduledAt: '2026-09-10T10:00:00.000Z', status: 'scheduled' });
    const sorted = sortDueTasks([later, earlier], NOW);
    expect(sorted.map((item) => item.task.id)).toEqual([2, 1]);
  });

  it('ScheduledAt 到期判定：未来不执行，到期执行', () => {
    expect(isDue(taskTemplate({ id: 1, status: 'scheduled', scheduledAt: '2026-09-10T13:00:00.000Z' }), NOW)).toBe(false);
    expect(isDue(taskTemplate({ id: 2, status: 'scheduled', scheduledAt: '2026-09-10T11:00:00.000Z' }), NOW)).toBe(true);
    expect(isDue(taskTemplate({ id: 3, status: 'pending', scheduledAt: '2026-09-10T11:00:00.000Z' }), NOW)).toBe(true);
  });

  it('Retry/backoff：30 秒 → 2 分钟 → 5 分钟封顶', () => {
    expect(retryBackoffMs(1)).toBe(30_000);
    expect(retryBackoffMs(2)).toBe(120_000);
    expect(retryBackoffMs(3)).toBe(300_000);
    expect(retryBackoffMs(99)).toBe(300_000);
  });

  it('可重试错误 vs 不可重试错误', () => {
    expect(shouldAutoRetry('NETWORK_ERROR', 0, 3)).toBe(true);
    expect(shouldAutoRetry('UPLOAD_TIMEOUT', 1, 3)).toBe(true);
    expect(shouldAutoRetry('BROWSER_CRASHED', 2, 3)).toBe(true);
    expect(shouldAutoRetry('NETWORK_ERROR', 3, 3)).toBe(false);
    expect(shouldAutoRetry('LOGIN_REQUIRED', 0, 3)).toBe(false);
    expect(shouldAutoRetry('SECURITY_CHECK_REQUIRED', 0, 3)).toBe(false);
    expect(shouldAutoRetry('SELECTOR_FAILED', 0, 3)).toBe(false);
    expect(shouldAutoRetry('PUBLISH_RESULT_UNKNOWN', 0, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB + 调度器：tick 行为
// ---------------------------------------------------------------------------

describe('发布调度器（DB 集成）', () => {
  it('有执行中任务时不拉起任何新任务（防止重复执行）', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    const db = getDatabase();
    db.update(publishTasks).set({ status: 'running' }).where(eq(publishTasks.id, id)).run();
    await scheduler.tick(NOW);
    expect(records).toEqual([]);
  });

  it('到期任务按优先级拉起，且每轮只拉起一个', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const lowId = newTask();
    const highId = newTask();
    const db = getDatabase();
    db.update(publishTasks).set({ priority: 'LOW' }).where(eq(publishTasks.id, lowId)).run();
    db.update(publishTasks).set({ priority: 'HIGH' }).where(eq(publishTasks.id, highId)).run();
    await scheduler.tick(NOW);
    expect(records).toEqual([highId]);
    // 第一个已被 fake executor 标记 running？fake 不改状态，由 claim 设置 running → 下一轮被全局锁挡住。
    await scheduler.tick(NOW);
    expect(records).toEqual([highId]);
  });

  it('SCHEDULED 未来任务不执行；到期后执行', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    // 基于真实时钟的相对时间：服务层校验用的是 Date.now()
    const future = new Date(Date.now() + 60_000).toISOString();
    updateTaskSchedule(id, { scheduledAt: future });
    expect(getTask(id).status).toBe('scheduled');
    await scheduler.tick(Date.now());
    expect(records).toEqual([]);
    await scheduler.tick(Date.now() + 120_000);
    expect(records).toEqual([id]);
    expect(getTask(id).status).toBe('running');
  });

  it('暂停的任务不被调度；恢复后回到队列并可执行', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    pauseTask(id);
    expect(getTask(id).status).toBe('paused');
    await scheduler.tick(NOW);
    expect(records).toEqual([]);
    resumeTask(id);
    expect(getTask(id).status).toBe('pending');
    await scheduler.tick(NOW);
    expect(records).toEqual([id]);
  });

  it('取消的任务永远不会被调度', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    cancelTask(id);
    await scheduler.tick(NOW);
    expect(records).toEqual([]);
    expect(getTask(id).status).toBe('cancelled');
  });

  it('WAITING_USER_CONFIRM 任务不会被调度（绝不自动发布）', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    const db = getDatabase();
    db.update(publishTasks)
      .set({ status: 'waiting_user', waitingReason: 'USER_CONFIRM', currentStep: 'WAITING_USER_CONFIRM' })
      .where(eq(publishTasks.id, id))
      .run();
    await scheduler.tick(NOW);
    expect(records).toEqual([]);
    expect(getTask(id).status).toBe('waiting_user');
  });

  it('可重试失败任务到 nextRetryAt 后自动重试并递增重试次数', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    const db = getDatabase();
    db.update(publishTasks)
      .set({
        status: 'failed',
        errorCode: 'NETWORK_ERROR',
        errorMessage: '网络错误',
        nextRetryAt: new Date(NOW - 1000).toISOString(),
        retryCount: 1,
        currentStep: 'FAILED',
      })
      .where(eq(publishTasks.id, id))
      .run();
    await scheduler.tick(NOW);
    expect(records).toEqual([id]);
    const task = getTask(id);
    expect(task.retryCount).toBe(2);
    const logs = getDatabase().select().from(publishLogs).where(eq(publishLogs.taskId, id)).all();
    expect(logs.some((log) => log.message.includes('[TASK_RETRY]'))).toBe(true);
  });

  it('重试次数用尽后不再调度', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const id = newTask();
    const db = getDatabase();
    db.update(publishTasks)
      .set({
        status: 'failed',
        errorCode: 'UPLOAD_TIMEOUT',
        nextRetryAt: new Date(NOW - 1000).toISOString(),
        retryCount: 3,
        maxRetries: 3,
        currentStep: 'FAILED',
      })
      .where(eq(publishTasks.id, id))
      .run();
    await scheduler.tick(NOW);
    expect(records).toEqual([]);
  });

  it('重启恢复：遗留 running 任务标记为 INTERRUPTED，其余状态保留', () => {
    const db = getDatabase();
    const id = newTask();
    db.update(publishTasks).set({ status: 'running' }).where(eq(publishTasks.id, id)).run();
    const scheduler = createPublishScheduler({ executor: async () => undefined });
    scheduler.recoverInterruptedTasks();
    const task = getTask(id);
    expect(task.status).toBe('failed');
    expect(task.errorCode).toBe('INTERRUPTED');
  });

  it('Profile 单任务锁：执行中任务占住调度名额（全局单执行约束）', async () => {
    const records: number[] = [];
    const scheduler = createPublishScheduler({ executor: fakeExecutor(records) });
    const first = newTask();
    const second = newTask();
    await scheduler.tick(NOW);
    expect(records).toEqual([first]);
    // first 已被 claim 为 running；second 不能被拉起
    await scheduler.tick(NOW);
    expect(records).toEqual([first]);
    const db = getDatabase();
    db.update(publishTasks).set({ status: 'success', finishedAt: new Date().toISOString() }).where(eq(publishTasks.id, first)).run();
    await scheduler.tick(NOW);
    expect(records).toEqual([first, second]);
  });
});
