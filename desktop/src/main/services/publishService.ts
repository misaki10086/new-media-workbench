import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Page } from 'playwright';
import { getDatabase } from '../database/db';
import { accounts, browserProfiles, contents, publishLogs, publishTasks } from '../database/schema';
import { browserProfileManager } from '../browser/BrowserProfileManager';
import { getAccountView } from './accountService';
import { captureScreenshot } from '../platforms/capture';
import { douyinPublisher, type StepContext } from '../platforms/douyin/DouyinPublisher';
import { PublishExecutionError, classifyPlaywrightError, checkVideoFile, stepIndex, EXECUTABLE_STEPS, STEP_PROGRESS } from '../publishing/publishMachine';
import { DiagnosticsRecorder } from '../publishing/diagnostics';
import { retryBackoffMs, shouldAutoRetry, RETRYABLE_ERROR_CODES } from '../publishing/schedulerCore';
import { logTaskAction } from '../publishing/taskLog';
import { devLog } from './logger';
import { resolvePlatformName } from './customPlatformService';
import type {
  ContentItem,
  ContentStatus,
  Platform,
  PublishStep,
  PublishTask,
  PublishTaskStatus,
  TaskLogEntry,
  TaskPriority,
  WaitingReason,
} from '@shared/types/domain';

type TaskRow = typeof publishTasks.$inferSelect;

export interface PublishTaskView extends PublishTask {
  contentTitle: string;
  accountName: string | null;
}

function toContentView(row: typeof contents.$inferSelect): ContentItem {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    videoPath: row.videoPath,
    coverPath: row.coverPath,
    tags,
    durationSeconds: row.durationSeconds,
    fileSizeBytes: row.fileSizeBytes,
    status: row.status as ContentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTaskView(row: TaskRow): PublishTaskView {
  const db = getDatabase();
  const content = db.select().from(contents).where(eq(contents.id, row.contentId)).get();
  const account = row.accountId ? db.select().from(accounts).where(eq(accounts.id, row.accountId)).get() : null;
  return {
    id: row.id,
    contentId: row.contentId,
    contentTitle: content?.title ?? `内容 #${row.contentId}`,
    platform: row.platform as Platform,
    platformName: resolvePlatformName(row.platform),
    accountId: row.accountId,
    accountName: account?.name ?? null,
    browserProfileId: row.browserProfileId,
    status: row.status as PublishTaskStatus,
    priority: row.priority as TaskPriority,
    currentStep: row.currentStep as PublishStep,
    waitingReason: row.waitingReason as WaitingReason | null,
    progress: row.progress,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    lastCompletedStep: row.lastCompletedStep as PublishStep | null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    nextRetryAt: row.nextRetryAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// 内部工具

function updateTask(id: number, patch: Partial<TaskRow>): void {
  getDatabase()
    .update(publishTasks)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(publishTasks.id, id))
    .run();
}

function loadTaskRow(id: number): TaskRow {
  const row = getDatabase().select().from(publishTasks).where(eq(publishTasks.id, id)).get();
  if (!row) throw new Error(`任务 #${id} 不存在`);
  return row;
}

/** 应用级单任务锁：同一时间只允许一个正在执行的任务（Phase 5 约束）。 */
function assertNoActiveTask(): void {
  const active = getDatabase()
    .select({ id: publishTasks.id })
    .from(publishTasks)
    .where(eq(publishTasks.status, 'running'))
    .all();
  if (active.length > 0) {
    throw new Error(`已有任务 #${active[0].id} 正在执行；本阶段同一时间只支持一个任务`);
  }
}

/** 步骤日志：写入 publish_logs（UI 时间线数据源）+ 主日志。 */
function logStep(taskId: number, step: PublishStep, level: 'info' | 'warn' | 'error', message: string): void {
  const line = `[${step}] ${message}`;
  if (level === 'error') devLog.error(`[task ${taskId}] ${line}`);
  else if (level === 'warn') devLog.warn(`[task ${taskId}] ${line}`);
  else devLog.info(`[task ${taskId}] ${line}`);
  getDatabase()
    .insert(publishLogs)
    .values({ taskId, level, message: line, createdAt: new Date().toISOString() })
    .run();
}

function failTask(taskId: number, code: string, message: string): void {
  const row = loadTaskRow(taskId);
  const retryable = shouldAutoRetry(code, row.retryCount, row.maxRetries);
  if (retryable) {
    // 可自动重试：安排退避时间，调度器到点拉起（finishedAt 留空）。
    const nextAttempt = row.retryCount + 1;
    const nextRetryAt = new Date(Date.now() + retryBackoffMs(nextAttempt)).toISOString();
    updateTask(taskId, {
      status: 'failed',
      currentStep: 'FAILED',
      errorCode: code,
      errorMessage: message,
      nextRetryAt,
    });
    logStep(taskId, 'FAILED', 'error', `${code}: ${message}`);
    logTaskAction(taskId, 'TASK_RETRY', `已安排第 ${nextAttempt}/${row.maxRetries} 次自动重试`, retryBackoffMs(nextAttempt) >= 60_000 ? `${Math.round(retryBackoffMs(nextAttempt) / 60_000)} 分钟后` : '30 秒后');
    return;
  }
  updateTask(taskId, {
    status: 'failed',
    currentStep: 'FAILED',
    errorCode: code,
    errorMessage: message,
    nextRetryAt: null,
    finishedAt: new Date().toISOString(),
  });
  logStep(taskId, 'FAILED', 'error', `${code}: ${message}`);
  logTaskAction(
    taskId,
    'TASK_FAILED',
    `${code}: ${message}`,
    RETRYABLE_ERROR_CODES.has(code) ? '重试次数已用完' : '需要人工处理',
  );
}

function waitingReasonForCode(code: string): WaitingReason | null {
  if (code === 'LOGIN_REQUIRED') return 'LOGIN_REQUIRED';
  if (code === 'SECURITY_CHECK_REQUIRED') return 'SECURITY_CHECK';
  return null;
}

/** 步骤异常 → FAILED（截图 + 日志）或 WAITING_USER（登录/安全验证绝不自动继续）。 */
async function handleStepError(
  taskId: number,
  step: PublishStep,
  error: unknown,
  page: Page | null,
): Promise<'waiting' | 'failed'> {
  const code = error instanceof PublishExecutionError ? error.code : classifyPlaywrightError(error).code;
  const message = error instanceof Error ? error.message : String(error);
  const waiting = waitingReasonForCode(code);
  if (waiting) {
    updateTask(taskId, { status: 'waiting_user', waitingReason: waiting, progress: STEP_PROGRESS[step] });
    logStep(taskId, step, 'warn', `需要人工处理（${waiting}）：${message}`);
    logTaskAction(taskId, 'TASK_WAITING', `需要人工处理（${waiting}）`, message.slice(0, 200));
    return 'waiting';
  }
  failTask(taskId, code, message);
  if (page) {
    await captureScreenshot(page, `task-${taskId}-${step}`).catch(() => null);
  }
  return 'failed';
}

async function runTrap(
  taskId: number,
  step: PublishStep,
  fn: () => Promise<void>,
  page: Page,
  diag?: DiagnosticsRecorder,
): Promise<'ok' | 'waiting' | 'failed'> {
  try {
    await fn();
    return 'ok';
  } catch (error) {
    diag?.record({
      step,
      kind: 'step_fail',
      message: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return handleStepError(taskId, step, error, page);
  }
}

/** Phase 5.1 逐步诊断：--seed-dryrun 或环境变量启用。 */
function diagnosticsEnabled(): boolean {
  return process.argv.includes('--seed-dryrun') || process.env.PUBLISH_DIAGNOSTICS === '1';
}

// ---------------------------------------------------------------------------
// 执行引擎

interface RuntimeContext {
  taskId: number;
  page: Page;
  content: ContentItem;
}

/** CHECKING_BROWSER：加载内容；Profile 未运行则自动启动 persistent context 并取页。 */
async function prepareRuntime(taskId: number, browserProfileId: number | null): Promise<RuntimeContext> {
  const row = loadTaskRow(taskId);
  const content = getDatabase().select().from(contents).where(eq(contents.id, row.contentId)).get();
  if (!content) throw new PublishExecutionError('CONTENT_NOT_FOUND', '内容不存在或已被删除');

  if (!browserProfileId) throw new PublishExecutionError('PROFILE_NOT_FOUND', '任务缺少浏览器 Profile');
  const profile = getDatabase()
    .select()
    .from(browserProfiles)
    .where(eq(browserProfiles.id, browserProfileId))
    .get();
  if (!profile) throw new PublishExecutionError('PROFILE_NOT_FOUND', '浏览器 Profile 不存在');
  logStep(taskId, 'CHECKING_BROWSER', 'info', `检查浏览器 Profile：${profile.name}`);
  if (!browserProfileManager.isRunning(profile.id)) {
    await browserProfileManager.launch(profile.id);
  }
  const page = await browserProfileManager.getPage(profile.id);
  logStep(taskId, 'CHECKING_BROWSER', 'info', '浏览器就绪');
  return { taskId, page, content: toContentView(content) };
}

/** 恢复/重试时的起始步骤：从上次完成步骤的下一步继续，而不是从头执行。 */
function pendingStartIndex(row: TaskRow): number {
  if (row.lastCompletedStep) {
    return Math.min(stepIndex(row.lastCompletedStep as PublishStep | null) + 1, EXECUTABLE_STEPS.length);
  }
  return stepIndex('CHECKING_LOGIN');
}

/** 任务主循环：逐个步骤执行；任何失败 → FAILED / WAITING_USER；取消令牌随时生效。 */
export async function executeTask(taskId: number): Promise<void> {
  const initial = loadTaskRow(taskId);
  if (initial.status === 'cancelled') return;

  // Phase 9：发布步骤执行器目前仅实现抖音；其余平台登录检测已就绪、发布留待实机验证。
  if (initial.platform !== 'douyin') {
    failTask(taskId, 'PLATFORM_NOT_SUPPORTED', '该平台的发布执行将在后续版本实现，请先使用抖音');
    return;
  }

  const startIndex =
    initial.status === 'pending' || initial.currentStep === 'CREATED'
      ? stepIndex('CHECKING_LOGIN')
      : pendingStartIndex(initial);
  updateTask(taskId, {
    status: 'running',
    waitingReason: null,
    currentStep: 'CHECKING_BROWSER',
    progress: STEP_PROGRESS.CHECKING_BROWSER,
  });

  let runtime: RuntimeContext;
  try {
    runtime = await prepareRuntime(taskId, initial.browserProfileId);
  } catch (error) {
    await handleStepError(taskId, 'CHECKING_BROWSER', error, null);
    return;
  }
  updateTask(taskId, { lastCompletedStep: 'CHECKING_BROWSER', progress: STEP_PROGRESS.CHECKING_BROWSER });
  logStep(taskId, 'CHECKING_BROWSER', 'info', '执行成功');

  const ctx: StepContext = {
    taskId,
    page: runtime.page,
    content: runtime.content,
    diag: diagnosticsEnabled() ? new DiagnosticsRecorder(taskId) : undefined,
  };

  const fileCheck = checkVideoFile(runtime.content.videoPath);
  if (!fileCheck.ok && startIndex <= stepIndex('SELECTING_VIDEO')) {
    failTask(taskId, fileCheck.errorCode ?? 'INVALID_CONTENT', fileCheck.message ?? '内容文件不可用');
    return;
  }

  for (let index = 0; index < EXECUTABLE_STEPS.length; index += 1) {
    if (index < startIndex) continue;
    const step = EXECUTABLE_STEPS[index];
    const current = loadTaskRow(taskId);
    if (current.status === 'cancelled') {
      logStep(taskId, 'CANCELLED', 'warn', '检测到取消，停止执行');
      return;
    }
    if (current.status === 'waiting_user' && current.waitingReason === 'PAUSED_BY_USER') {
      logStep(taskId, step, 'warn', '检测到暂停请求，停在当前步骤等待恢复');
      return;
    }
    updateTask(taskId, { currentStep: step, progress: STEP_PROGRESS[step] });
    logStep(taskId, step, 'info', '开始执行');
    ctx.diag?.record({
      step,
      kind: 'step_start',
      url: runtime.page.url(),
      title: await runtime.page.title().catch(() => ''),
    });

    let outcome: 'ok' | 'waiting' | 'failed';
    switch (step) {
      case 'CHECKING_LOGIN':
        outcome = await runTrap(taskId, step, () => douyinPublisher.checkLogin(ctx), runtime.page, ctx.diag);
        break;
      case 'OPENING_CREATOR':
        outcome = await runTrap(taskId, step, () => douyinPublisher.openCreator(ctx), runtime.page, ctx.diag);
        break;
      case 'SELECTING_VIDEO':
        outcome = await runTrap(taskId, step, () => douyinPublisher.selectVideo(ctx), runtime.page, ctx.diag);
        break;
      case 'UPLOADING_VIDEO':
        outcome = await runTrap(taskId, step, () => douyinPublisher.confirmUploadStarted(ctx), runtime.page, ctx.diag);
        break;
      case 'WAITING_UPLOAD':
        outcome = await runTrap(taskId, step, () => douyinPublisher.waitUpload(ctx), runtime.page, ctx.diag);
        break;
      case 'FILLING_CONTENT':
        outcome = await runTrap(
          taskId,
          step,
          async () => {
            await douyinPublisher.fillTitle(ctx, ctx.content.title);
            await douyinPublisher.fillDescription(ctx, ctx.content.description);
            await douyinPublisher.fillTags(ctx, ctx.content.tags);
          },
          runtime.page,
          ctx.diag,
        );
        break;
      case 'SETTING_COVER':
        outcome = await runTrap(taskId, step, () => douyinPublisher.setCover(ctx, ctx.content.coverPath), runtime.page, ctx.diag);
        break;
      default:
        outcome = 'ok';
    }

    if (outcome !== 'ok') {
      return;
    }
    updateTask(taskId, { lastCompletedStep: step });
    logStep(taskId, step, 'info', '执行成功');
    ctx.diag?.record({
      step,
      kind: 'step_ok',
      url: runtime.page.url(),
      title: await runtime.page.title().catch(() => ''),
    });
    if (ctx.diag) {
      await captureScreenshot(runtime.page, `task-${taskId}-${step}`).catch(() => null);
    }
  }

  // 全部自动步骤完成 → READY_FOR_REVIEW → WAITING_USER_CONFIRM（默认人工确认，绝不自动发布）。
  updateTask(taskId, { currentStep: 'READY_FOR_REVIEW', progress: STEP_PROGRESS.READY_FOR_REVIEW });
  await captureScreenshot(runtime.page, `task-${taskId}-READY_FOR_REVIEW`).catch(() => null);
  ctx.diag?.record({
    step: 'READY_FOR_REVIEW',
    kind: 'step_ok',
    url: runtime.page.url(),
    title: await runtime.page.title().catch(() => ''),
    message: '所有自动步骤完成，页面内容已准备，未点击发布按钮',
  });
  updateTask(taskId, {
    currentStep: 'WAITING_USER_CONFIRM',
    status: 'waiting_user',
    waitingReason: 'USER_CONFIRM',
    progress: STEP_PROGRESS.WAITING_USER_CONFIRM,
  });
  logStep(taskId, 'READY_FOR_REVIEW', 'info', '内容准备完成');
  logStep(taskId, 'WAITING_USER_CONFIRM', 'info', '已停在人工确认，等待用户检查页面后点击「确认发布」');
}

/** PUBLISHING：唯一触发最终发布按钮的入口（用户点击「确认发布」后）。 */
async function runFinalPublish(taskId: number): Promise<void> {
  const row = loadTaskRow(taskId);
  if (!row.browserProfileId) throw new PublishExecutionError('PROFILE_NOT_FOUND', '任务缺少浏览器 Profile');
  const runtime = await prepareRuntime(taskId, row.browserProfileId);
  const ctx: StepContext = {
    taskId,
    page: runtime.page,
    content: runtime.content,
    diag: diagnosticsEnabled() ? new DiagnosticsRecorder(taskId) : undefined,
  };
  try {
    ctx.diag?.record({ step: 'PUBLISHING', kind: 'step_start', url: runtime.page.url(), title: await runtime.page.title().catch(() => '') });
    await douyinPublisher.publish(ctx);
    updateTask(taskId, {
      status: 'success',
      currentStep: 'SUCCESS',
      progress: 100,
      finishedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
    });
    logStep(taskId, 'SUCCESS', 'info', '发布成功（抖音页面已返回成功信号）');
    logTaskAction(taskId, 'TASK_SUCCESS', '发布成功（抖音页面已返回成功信号）');
  } catch (error) {
    await handleStepError(taskId, 'PUBLISHING', error, runtime.page);
  }
}

// ---------------------------------------------------------------------------
// 任务操作 API（IPC 直接调用）

export function listTasks(): PublishTaskView[] {
  return getDatabase()
    .select()
    .from(publishTasks)
    .orderBy(desc(publishTasks.id))
    .all()
    .map(toTaskView);
}

export function getTask(id: number): PublishTaskView {
  return toTaskView(loadTaskRow(id));
}

/** 任务步骤时间线（数据源为 publish_logs）。 */
export function getTaskLogs(taskId: number): TaskLogEntry[] {
  return getDatabase()
    .select()
    .from(publishLogs)
    .where(eq(publishLogs.taskId, taskId))
    .all()
    .map((row) => ({
      taskId: row.taskId,
      level: row.level as 'info' | 'warn' | 'error',
      message: row.message,
      time: row.createdAt,
    }));
}

/** 内部插入：单条任务（单任务创建与批量创建共用，保证日志与字段一致）。 */
function insertTaskRow(contentId: number, accountId: number, options: { scheduledAt?: string | null } = {}): PublishTaskView {
  const db = getDatabase();
  const content = db.select().from(contents).where(eq(contents.id, contentId)).get();
  if (!content) throw new Error(`内容 #${contentId} 不存在`);
  const account = getAccountView(accountId);
  if (account.platform !== 'douyin') {
    throw new Error(`账号「${account.name}」暂不支持发布（当前阶段仅支持抖音）`);
  }
  const scheduledAt = options.scheduledAt ?? null;
  const now = new Date().toISOString();
  const row = db
    .insert(publishTasks)
    .values({
      contentId,
      accountId,
      browserProfileId: account.profileId,
      platform: 'douyin',
      status: scheduledAt ? 'scheduled' : 'pending',
      scheduledAt,
      currentStep: 'CREATED',
      progress: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  logStep(row.id, 'CREATED', 'info', `发布任务已创建（内容「${content.title}」→ 账号「${account.name}」）`);
  logTaskAction(
    row.id,
    'TASK_CREATED',
    `发布任务已创建（内容「${content.title}」→ 账号「${account.name}」）`,
    scheduledAt ? new Date(scheduledAt).toLocaleString('zh-CN') : undefined,
  );
  if (scheduledAt) logTaskAction(row.id, 'TASK_SCHEDULED', '已按批量计划时间进入定时队列');
  return toTaskView(row);
}

export function createTask(contentId: number, accountId: number): PublishTaskView {
  return insertTaskRow(contentId, accountId);
}

export interface BatchCreateResult {
  created: PublishTaskView[];
  skipped: number;
  skippedReasons: string[];
}

/** 同一内容 × 同一账号是否已有未结束的任务（防止重复创建导致重复发布）。 */
function hasActiveTaskForPair(contentId: number, accountId: number): boolean {
  const existing = getDatabase()
    .select({ id: publishTasks.id })
    .from(publishTasks)
    .where(
      and(
        eq(publishTasks.contentId, contentId),
        eq(publishTasks.accountId, accountId),
        inArray(publishTasks.status, ['pending', 'scheduled', 'paused', 'running', 'waiting_user']),
      ),
    )
    .get();
  return Boolean(existing);
}

/**
 * 批量创建：内容 × 账号 矩阵展开为任务（每对一条）。
 * 自动跳过：不存在的内容、非抖音账号、已有未结束任务的重复组合。
 * 可选 scheduledAt 让整批进入定时队列。
 */
export function createBatchTasks(
  contentIds: number[],
  accountIds: number[],
  options: { scheduledAt?: string | null } = {},
): BatchCreateResult {
  const created: PublishTaskView[] = [];
  const skippedReasons: string[] = [];
  let skipped = 0;

  for (const contentId of contentIds) {
    const content = getDatabase().select().from(contents).where(eq(contents.id, contentId)).get();
    if (!content) {
      skipped += 1;
      skippedReasons.push(`内容 #${contentId} 不存在，已跳过`);
      continue;
    }
    for (const accountId of accountIds) {
      let accountView;
      try {
        accountView = getAccountView(accountId);
      } catch {
        skipped += 1;
        skippedReasons.push(`账号 #${accountId} 不存在，已跳过`);
        continue;
      }
      if (accountView.platform !== 'douyin') {
        skipped += 1;
        skippedReasons.push(`账号「${accountView.name}」暂不支持发布（仅抖音），已跳过`);
        continue;
      }
      if (hasActiveTaskForPair(contentId, accountId)) {
        skipped += 1;
        skippedReasons.push(`「${content.title}」→「${accountView.name}」已有未结束的任务，已跳过`);
        continue;
      }
      created.push(insertTaskRow(contentId, accountId, options));
    }
  }
  return { created, skipped, skippedReasons };
}

export function startTask(id: number): PublishTaskView {
  const row = loadTaskRow(id);
  if (row.status === 'running') throw new Error('任务正在执行中');
  if (row.status === 'success') throw new Error('任务已发布成功');
  if (row.status === 'paused') throw new Error('任务已暂停，请先恢复后再执行');
  if (row.status === 'scheduled' && row.scheduledAt && new Date(row.scheduledAt).getTime() > Date.now()) {
    throw new Error('定时任务尚未到期；如要立即执行，请先在任务详情中清除计划时间');
  }
  assertNoActiveTask();
  updateTask(id, {
    status: 'pending',
    currentStep: 'CREATED',
    progress: 0,
    errorCode: null,
    errorMessage: null,
    waitingReason: null,
    nextRetryAt: null,
    startedAt: row.startedAt ?? new Date().toISOString(),
  });
  logStep(id, 'CREATED', 'info', '任务已提交执行');
  logTaskAction(id, 'TASK_STARTED', '任务开始执行');
  void executeTask(id).catch((error) => {
    devLog.error(`[task ${id}] executor crashed: ${error instanceof Error ? error.message : String(error)}`);
    failTask(id, 'EXECUTOR_CRASHED', error instanceof Error ? error.message : String(error));
  });
  return getTask(id);
}

/** 暂停：执行中的任务在当前步骤完成后停下；排队/定时任务直接挂起。 */
export function pauseTask(id: number): PublishTaskView {
  const row = loadTaskRow(id);
  if (row.status === 'running') {
    updateTask(id, { status: 'waiting_user', waitingReason: 'PAUSED_BY_USER' });
    logStep(id, row.currentStep as PublishStep, 'warn', '收到暂停请求，将在当前步骤完成后停下');
    logTaskAction(id, 'TASK_PAUSED', '收到暂停请求，将在当前步骤完成后停下');
    return getTask(id);
  }
  if (row.status === 'pending' || row.status === 'scheduled') {
    updateTask(id, { status: 'paused' });
    logTaskAction(id, 'TASK_PAUSED', '任务已暂停（保留排队位置与计划时间）');
    return getTask(id);
  }
  throw new Error('当前状态的任务无法暂停');
}

export function cancelTask(id: number): PublishTaskView {
  const row = loadTaskRow(id);
  if (row.status === 'success' || row.status === 'cancelled') {
    throw new Error('任务已结束，无法取消');
  }
  updateTask(id, {
    status: 'cancelled',
    currentStep: 'CANCELLED',
    waitingReason: null,
    finishedAt: new Date().toISOString(),
  });
  logStep(id, 'CANCELLED', 'warn', '任务已取消（任务数据保留）');
  logTaskAction(id, 'TASK_CANCELLED', '任务已取消（任务数据保留）');
  return getTask(id);
}

/** 恢复：paused 排队任务回到队列 / 定时任务回到调度；waiting_user 从当前步骤继续。 */
export function resumeTask(id: number): PublishTaskView {
  const row = loadTaskRow(id);
  if (row.status === 'waiting_user' && row.waitingReason === 'USER_CONFIRM') {
    throw new Error('任务等待发布确认，请使用「确认发布」或「取消任务」');
  }
  if (row.status === 'paused') {
    const futureScheduled = row.scheduledAt && new Date(row.scheduledAt).getTime() > Date.now();
    updateTask(id, { status: futureScheduled ? 'scheduled' : 'pending' });
    logTaskAction(id, 'TASK_RESUMED', futureScheduled ? '任务已恢复定时等待' : '任务已恢复排队');
    return getTask(id);
  }
  if (row.status !== 'waiting_user') {
    throw new Error('当前状态无法恢复执行');
  }
  const step = row.currentStep as PublishStep;
  updateTask(id, { status: 'running', waitingReason: null });
  logStep(id, step, 'info', '已从当前步骤恢复执行');
  logTaskAction(id, 'TASK_RESUMED', `已从步骤 ${step} 恢复执行`);
  void executeTask(id).catch((error) => {
    devLog.error(`[task ${id}] resume crashed: ${error instanceof Error ? error.message : String(error)}`);
  });
  return getTask(id);
}

/** 修改计划时间与优先级（仅限未执行的任务）。scheduledAt 为 null 表示立即准备。 */
export function updateTaskSchedule(
  id: number,
  patch: { scheduledAt?: string | null; priority?: TaskPriority },
): PublishTaskView {
  const row = loadTaskRow(id);
  if (!['pending', 'scheduled', 'paused'].includes(row.status)) {
    throw new Error('只有排队、定时或已暂停的任务可以修改计划');
  }
  const updates: Partial<TaskRow> = {};
  if (patch.priority) updates.priority = patch.priority;
  if (patch.scheduledAt !== undefined) {
    if (patch.scheduledAt === null) {
      updates.scheduledAt = null;
      updates.status = row.status === 'scheduled' ? 'pending' : row.status;
      logTaskAction(id, 'TASK_SCHEDULED', '已改为立即准备');
    } else {
      const time = new Date(patch.scheduledAt).getTime();
      if (Number.isNaN(time)) throw new Error('计划时间格式不合法');
      if (time <= Date.now()) throw new Error('计划时间必须晚于当前时间');
      updates.scheduledAt = new Date(time).toISOString();
      updates.status = row.status === 'paused' ? 'paused' : 'scheduled';
      logTaskAction(id, 'TASK_SCHEDULED', `已设置计划发布时间`, new Date(time).toLocaleString('zh-CN'));
    }
  }
  updateTask(id, updates);
  return getTask(id);
}

/** 用户在 WAITING_USER_CONFIRM 点击「确认发布」——唯一触发最终发布按钮的入口。 */
export function confirmPublish(id: number): PublishTaskView {
  const row = loadTaskRow(id);
  if (row.status !== 'waiting_user' || row.waitingReason !== 'USER_CONFIRM') {
    throw new Error('任务不在「等待确认发布」状态');
  }
  updateTask(id, { status: 'running', currentStep: 'PUBLISHING', progress: STEP_PROGRESS.PUBLISHING });
  logStep(id, 'PUBLISHING', 'info', '用户已确认，执行最终发布');
  void runFinalPublish(id).catch((error) => {
    devLog.error(`[task ${id}] publish crashed: ${error instanceof Error ? error.message : String(error)}`);
    failTask(id, 'EXECUTOR_CRASHED', error instanceof Error ? error.message : String(error));
  });
  return getTask(id);
}