import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appDirectories, ensureAppDirectories } from './appPaths';
import { browserProfileManager } from './browser/BrowserProfileManager';
import { closeDatabase, databaseFilePath, getDatabase, initDatabase } from './database/db';
import { contents } from './database/schema';
import { setDouyinFixtureUrl } from './platforms/testing/fixtureControls';
import { createProfile, deleteProfile, listProfiles } from './services/browserProfileService';
import { createAccount, deleteAccount, listAccounts } from './services/accountService';
import { createContent, listContents, deleteContent } from './services/contentService';
import {
  cancelTask,
  confirmPublish,
  createTask,
  getTask,
  resumeTask,
  startTask,
} from './services/publishService';
import type { PublishTask } from '@shared/types/domain';

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`[publish-smoke] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
}

function fixtureUrl(state: string, extra = ''): string {
  const base = pathToFileURL(resolve(__dirname, '../../tests/fixtures/douyin-publish-fixture.html')).toString();
  return `${base}?state=${state}${extra}`;
}

async function waitFor(taskId: number, predicate: (task: PublishTask) => boolean, timeoutMs = 60_000): Promise<PublishTask> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = getTask(taskId);
    if (predicate(task)) return task;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  return getTask(taskId);
}

/**
 * `electron . --publish-smoke`：用本地 fixture 页（模拟抖音发布页）端到端验证发布状态机，
 * 不登录真实抖音、不触碰真实平台。断言全部基于任务状态机与数据库。
 */
export async function runPublishSmoke(): Promise<boolean> {
  const cacheDir = appDirectories().cache;
  const videoPath = join(cacheDir, 'smoke-video.mp4');
  const coverPath = join(cacheDir, 'smoke-cover.png');
  writeFileSync(videoPath, 'smoke-video-bytes-for-fixture-upload');
  writeFileSync(coverPath, 'smoke-cover-bytes');

  let profileId = -1;
  let accountId = -1;
  const createdContentIds: number[] = [];
  const createdTaskIds: number[] = [];

  try {
    ensureAppDirectories();
    initDatabase(databaseFilePath(appDirectories().database));
    setDouyinFixtureUrl(fixtureUrl('normal'));

    // 基础设施：Profile + 账号 + 内容
    const profile = createProfile('douyin', '验收-发布链');
    profileId = profile.id;
    const account = createAccount('douyin', '验收-发布账号', profile.id);
    accountId = account.id;
    const content = createContent({
      title: '第01集 · 冒烟测试视频',
      description: '这是一段用于验收发布链路的文案。',
      videoPath,
      coverPath,
      tags: ['AI短剧', '短剧'],
    });
    createdContentIds.push(content.id);

    // 场景 1：完整链路 → WAITING_USER_CONFIRM（绝不自动发布）
    const task1 = createTask(content.id, accountId);
    createdTaskIds.push(task1.id);
    startTask(task1.id);
    const waitingTask = await waitFor(task1.id, (task) => task.status === 'waiting_user' || task.status === 'failed', 90_000);
    check(
      '完整链路停在人工确认（不自动发布）',
      waitingTask.status === 'waiting_user' &&
        waitingTask.waitingReason === 'USER_CONFIRM' &&
        waitingTask.currentStep === 'WAITING_USER_CONFIRM' &&
        waitingTask.progress === 95,
      `status=${waitingTask.status} step=${waitingTask.currentStep} reason=${waitingTask.waitingReason}`,
    );

    // 场景 2：确认发布 → 页面成功信号 → SUCCESS
    confirmPublish(task1.id);
    const succeeded = await waitFor(task1.id, (task) => task.status === 'success' || task.status === 'failed', 30_000);
    check('确认发布后任务成功', succeeded.status === 'success' && succeeded.progress === 100, `status=${succeeded.status}`);

    // 场景 3：无效视频路径 → FILE_NOT_FOUND（绕过 createContent 的 stat 校验，直接造一条坏数据）
    const missingVideo = join(cacheDir, '不存在.mp4');
    const brokenRow = getDatabase()
      .insert(contents)
      .values({
        title: '坏路径视频',
        description: '',
        videoPath: missingVideo,
        coverPath: null,
        tags: '[]',
        fileSizeBytes: 0,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    createdContentIds.push(brokenRow.id);
    const task2 = createTask(brokenRow.id, accountId);
    createdTaskIds.push(task2.id);
    startTask(task2.id);
    const failedTask = await waitFor(task2.id, (task) => task.status === 'failed', 30_000);
    check('无效视频路径 → FILE_NOT_FOUND', failedTask.errorCode === 'FILE_NOT_FOUND', `code=${failedTask.errorCode}`);

    // 场景 4：登录墙 → WAITING_USER(LOGIN_REQUIRED) → 恢复后（fixture 改正常）继续到人工确认
    setDouyinFixtureUrl(fixtureUrl('loginwall'));
    const task3 = createTask(content.id, accountId);
    createdTaskIds.push(task3.id);
    startTask(task3.id);
    const loginWait = await waitFor(task3.id, (task) => task.status === 'waiting_user' || task.status === 'failed', 60_000);
    check('登录墙 → LOGIN_REQUIRED 等待人工登录', loginWait.waitingReason === 'LOGIN_REQUIRED', `reason=${loginWait.waitingReason}`);
    setDouyinFixtureUrl(fixtureUrl('normal'));
    resumeTask(task3.id);
    const resumed = await waitFor(task3.id, (task) => task.status === 'waiting_user' || task.status === 'failed', 90_000);
    check('登录后恢复执行直到人工确认', resumed.waitingReason === 'USER_CONFIRM', `reason=${resumed.waitingReason}`);
    cancelTask(task3.id);

    // 场景 5：安全验证 → SECURITY_CHECK 等待人工验证，程序不继续
    setDouyinFixtureUrl(fixtureUrl('security'));
    const task4 = createTask(content.id, accountId);
    createdTaskIds.push(task4.id);
    startTask(task4.id);
    const securityWait = await waitFor(task4.id, (task) => task.status === 'waiting_user' || task.status === 'failed', 60_000);
    check('安全验证 → SECURITY_CHECK 等待人工', securityWait.waitingReason === 'SECURITY_CHECK', `reason=${securityWait.waitingReason}`);
    cancelTask(task4.id);

    // 场景 6：上传永不完成 + 短超时 → UPLOAD_TIMEOUT
    setDouyinFixtureUrl(fixtureUrl('normal', '&never=1'));
    process.env.PUBLISH_UPLOAD_TIMEOUT_MS = '8000';
    const task5 = createTask(content.id, accountId);
    createdTaskIds.push(task5.id);
    startTask(task5.id);
    const timeoutTask = await waitFor(task5.id, (task) => task.status === 'failed', 60_000);
    check('上传超时 → UPLOAD_TIMEOUT', timeoutTask.errorCode === 'UPLOAD_TIMEOUT', `code=${timeoutTask.errorCode}`);
    delete process.env.PUBLISH_UPLOAD_TIMEOUT_MS;

    // 场景 7：发布结果无法确认 → PUBLISH_RESULT_UNKNOWN（绝不谎报成功）
    setDouyinFixtureUrl(fixtureUrl('normal', '&noResult=1'));
    const task6 = createTask(content.id, accountId);
    createdTaskIds.push(task6.id);
    startTask(task6.id);
    await waitFor(task6.id, (task) => task.status === 'waiting_user' || task.status === 'failed', 90_000);
    confirmPublish(task6.id);
    const unknownTask = await waitFor(task6.id, (task) => task.status === 'failed', 60_000);
    check('发布结果不可确认 → PUBLISH_RESULT_UNKNOWN', unknownTask.errorCode === 'PUBLISH_RESULT_UNKNOWN', `code=${unknownTask.errorCode}`);
    setDouyinFixtureUrl(null);

    // 清理（先关浏览器，否则运行中的 Profile 拒绝删除；任务行随内容级联删除）
    await browserProfileManager.closeAll();
    for (const taskId of createdTaskIds.slice().reverse()) {
      const task = getTask(taskId);
      if (['pending', 'running', 'waiting_user'].includes(task.status)) cancelTask(taskId);
    }
    for (const contentId of createdContentIds) deleteContent(contentId);
    deleteAccount(accountId);
    deleteProfile(profileId);
    check('验收数据清理', listProfiles().length === 0 && listAccounts().length === 0 && listContents().length === 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check('发布冒烟（异常中断）', false, message);
  } finally {
    setDouyinFixtureUrl(null);
    delete process.env.PUBLISH_UPLOAD_TIMEOUT_MS;
    await browserProfileManager.closeAll();
    closeDatabase();
  }

  return results.every((result) => result.ok);
}