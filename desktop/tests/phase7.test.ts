import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initDatabase } from '../src/main/database/db';
import { contents, publishTasks } from '../src/main/database/schema';
import { createProfile, deleteProfile, listProfiles } from '../src/main/services/browserProfileService';
import { createAccount, deleteAccount, listAccounts } from '../src/main/services/accountService';
import { createContent, deleteContent } from '../src/main/services/contentService';
import { cancelTask, createBatchTasks, createTask, listTasks } from '../src/main/services/publishService';

let dbDir: string;
let accountId = 0;
let secondAccountId = 0;
const contentIds: number[] = [];

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'nmw-phase7-'));
  initDatabase(join(dbDir, 'app.db'));
  const profileA = createProfile('douyin', '批量测试ProfileA');
  accountId = createAccount('douyin', '批量账号A', profileA.id).id;
  const profileB = createProfile('douyin', '批量测试ProfileB');
  secondAccountId = createAccount('douyin', '批量账号B', profileB.id).id;
  for (let index = 1; index <= 3; index += 1) {
    const video = join(dbDir, `batch-${index}.mp4`);
    writeFileSync(video, `fake-video-${index}`);
    contentIds.push(createContent({ title: `批量第${index}集`, description: '', videoPath: video, coverPath: null, tags: [] }).id);
  }
});

afterAll(() => {
  for (const task of listTasks()) {
    const row = getDatabase().select().from(publishTasks).where(eq(publishTasks.id, task.id)).get();
    if (row && !['success', 'cancelled'].includes(row.status)) cancelTask(task.id);
  }
  for (const content of getDatabase().select().from(contents).all()) {
    deleteContent(content.id);
  }
  for (const account of listAccounts()) deleteAccount(account.id);
  for (const profile of listProfiles()) deleteProfile(profile.id);
  closeDatabase();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('批量创建（内容 × 账号矩阵）', () => {
  it('3 条内容 × 2 个账号生成 6 个任务', () => {
    const result = createBatchTasks(contentIds, [accountId, secondAccountId]);
    expect(result.created.length).toBe(6);
    expect(result.skipped).toBe(0);
    const created = listTasks().filter((task) => task.status !== 'cancelled');
    expect(created.length).toBe(6);
  });

  it('重复创建同一组合被跳过（防止重复发布）', () => {
    const result = createBatchTasks([contentIds[0]], [accountId]);
    expect(result.created.length).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedReasons[0]).toContain('已有未结束的任务');
  });

  it('批量定时：scheduledAt 让整批进入定时队列', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const db = getDatabase();
    // 先清掉前面的任务，避免去重干扰
    const rows = db.select().from(publishTasks).all();
    for (const row of rows) {
      db.update(publishTasks).set({ status: 'cancelled' }).where(eq(publishTasks.id, row.id)).run();
    }
    const result = createBatchTasks([contentIds[1], contentIds[2]], [accountId], { scheduledAt: future });
    expect(result.created.length).toBe(2);
    for (const task of result.created) {
      expect(task.status).toBe('scheduled');
      expect(task.scheduledAt).toBe(future);
    }
  });

  it('不存在的内容 / 账号自动跳过并给出原因', () => {
    const db = getDatabase();
    const rows = db.select().from(publishTasks).all();
    for (const row of rows) {
      db.update(publishTasks).set({ status: 'cancelled' }).where(eq(publishTasks.id, row.id)).run();
    }
    const missingContent = createBatchTasks([99999], [accountId]);
    expect(missingContent.created.length).toBe(0);
    expect(missingContent.skipped).toBe(1);
    expect(missingContent.skippedReasons[0]).toContain('内容 #99999 不存在');

    const missingAccount = createBatchTasks([contentIds[0]], [99999]);
    expect(missingAccount.created.length).toBe(0);
    expect(missingAccount.skipped).toBe(1);
    expect(missingAccount.skippedReasons[0]).toContain('账号 #99999 不存在');
  });

  it('非抖音账号被跳过（当前阶段仅抖音可发布）', () => {
    const xhsProfile = createProfile('xiaohongshu', '批量小红书Profile');
    const xhsAccount = createAccount('xiaohongshu', '小红书账号', xhsProfile.id);
    const db = getDatabase();
    const rows = db.select().from(publishTasks).all();
    for (const row of rows) {
      db.update(publishTasks).set({ status: 'cancelled' }).where(eq(publishTasks.id, row.id)).run();
    }
    const result = createBatchTasks([contentIds[0]], [xhsAccount.id]);
    expect(result.created.length).toBe(0);
    expect(result.skippedReasons[0]).toContain('仅抖音');
    // 清理
    deleteAccount(xhsAccount.id);
    deleteProfile(xhsProfile.id);
  });

  it('单任务创建（createTask）行为不变', () => {
    const db = getDatabase();
    const rows = db.select().from(publishTasks).all();
    for (const row of rows) {
      db.update(publishTasks).set({ status: 'cancelled' }).where(eq(publishTasks.id, row.id)).run();
    }
    const task = createTask(contentIds[2], secondAccountId);
    expect(task.status).toBe('pending');
    expect(task.priority).toBe('NORMAL');
    expect(task.maxRetries).toBe(3);
  });
});
