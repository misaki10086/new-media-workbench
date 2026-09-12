import type { Locator, Page } from 'playwright';
import type { ContentItem } from '@shared/types/domain';
import { devLog } from '../../services/logger';
import { captureScreenshot } from '../capture';
import { anyVisible, visibleCount } from '../locatorUtils';
import type { DiagnosticsRecorder } from '../../publishing/diagnostics';
import { PublishExecutionError } from '../../publishing/publishMachine';
import { douyinAdapter } from './DouyinAdapter';
import { getUploadPageUrl } from '../testing/fixtureControls';
import {
  COVER_INPUT_SELECTORS,
  DEFAULT_UPLOAD_TIMEOUT_MS,
  DESCRIPTION_INPUT_SELECTORS,
  PUBLISH_BUTTON_SELECTORS,
  PUBLISH_FAIL_MARKERS,
  PUBLISH_RESULT_TIMEOUT_MS,
  PUBLISH_SUCCESS_MARKERS,
  TITLE_INPUT_SELECTORS,
  UPLOAD_DONE_MARKERS,
  UPLOAD_FAIL_MARKERS,
  UPLOAD_INPUT_SELECTORS,
  UPLOAD_POLL_INTERVAL_MS,
  UPLOADING_MARKERS,
} from './DouyinSelectors';

/** 发布执行上下文：由 publishService 组装，各步骤只依赖它。 */
export interface StepContext {
  taskId: number;
  page: Page;
  content: ContentItem;
  /** Phase 5.1 诊断记录器（未启用时为 undefined，行为与生产一致）。 */
  diag?: DiagnosticsRecorder;
}

/** 顺序尝试 selector 列表；单个 selector 失败立即记录并试下一个，绝不随机重试。 */
async function findFirst(ctx: StepContext, selectors: readonly string[], timeoutMs = 10_000): Promise<Locator> {
  for (const selector of selectors) {
    const locator = ctx.page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      if (ctx.diag) {
        const box = await locator.boundingBox().catch(() => null);
        const text = await locator.textContent().catch(() => '').then((value) => (value ?? '').trim().slice(0, 120));
        ctx.diag.record({ step: 'findFirst', kind: 'selector', selector, visible: true, box, text });
      }
      return locator;
    } catch {
      devLog.warn(`[task ${ctx.taskId}] selector failed: ${selector}`);
      ctx.diag?.record({ step: 'findFirst', kind: 'selector', selector, visible: false });
    }
  }
  throw new PublishExecutionError('SELECTOR_FAILED', `找不到页面元素（${selectors.join(' / ')}），抖音页面可能已改版`);
}


/** 读取输入字段当前文本（input/textarea 用 value，contenteditable 用文本）。 */
async function readFieldValue(locator: Locator): Promise<string> {
  const tagName = (await locator.evaluate((element) => element.tagName)) as string;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    return (await locator.inputValue().catch(() => '')) ?? '';
  }
  return ((await locator.textContent().catch(() => '')) ?? '').trim();
}

async function fillField(locator: Locator, value: string): Promise<void> {
  const tagName = (await locator.evaluate((element) => element.tagName)) as string;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    await locator.fill(value);
    return;
  }
  await locator.click();
  await locator.press('Control+A');
  await locator.press('Backspace');
  await locator.pressSequentially(value, { delay: 20 });
}

export const douyinPublisher = {
  /** CHECKING_LOGIN：复用 Phase 4 的登录检测；未登录 / 安全验证进入 WAITING_USER。 */
  async checkLogin(ctx: StepContext): Promise<void> {
    const outcome = await douyinAdapter.checkLogin(ctx.page);
    if (outcome.login.loggedIn) return;
    if (outcome.login.reason === 'LOGIN_REQUIRED') {
      throw new PublishExecutionError('LOGIN_REQUIRED', '需要登录抖音，请在浏览器中完成登录');
    }
    if (outcome.login.reason === 'SECURITY_CHECK_REQUIRED') {
      throw new PublishExecutionError('SECURITY_CHECK_REQUIRED', '需要人工完成安全验证，程序不会自动处理');
    }
    throw new PublishExecutionError('LOGIN_CHECK_FAILED', `登录状态未知：${outcome.login.reason ?? '无原因码'}`);
  },

  /** OPENING_CREATOR：打开发布页（URL 集中在 DouyinSelectors / fixture 控制）。 */
  async openCreator(ctx: StepContext): Promise<void> {
    await ctx.page.goto(getUploadPageUrl(), { timeout: 30_000, waitUntil: 'domcontentloaded' });
  },

  /** SELECTING_VIDEO：通过页面 file input 上传（setInputFiles，不碰系统文件窗口）。 */
  async selectVideo(ctx: StepContext): Promise<void> {
    const input = await findFirst(ctx, UPLOAD_INPUT_SELECTORS);
    await input.setInputFiles(ctx.content.videoPath as string);
    devLog.info(`[task ${ctx.taskId}] SELECTING_VIDEO 已选择视频文件`);
  },

  /** UPLOADING_VIDEO：确认上传已经开始（出现上传状态或等待页）。 */
  async confirmUploadStarted(ctx: StepContext): Promise<void> {
    const uploading = await anyVisible(ctx.page, UPLOADING_MARKERS);
    if (!uploading) {
      devLog.warn(`[task ${ctx.taskId}] UPLOADING_VIDEO 未检测到上传状态标记，直接进入等待阶段`);
    }
  },

  /** WAITING_UPLOAD：每 2 秒轮询页面状态，最长 10 分钟；超时 → UPLOAD_TIMEOUT。 */
  async waitUpload(ctx: StepContext): Promise<void> {
    const timeoutMs = Number(process.env.PUBLISH_UPLOAD_TIMEOUT_MS) || DEFAULT_UPLOAD_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await anyVisible(ctx.page, UPLOAD_FAIL_MARKERS)) {
        throw new PublishExecutionError('UPLOAD_FAILED', '抖音页面提示上传失败');
      }
      if (await anyVisible(ctx.page, UPLOAD_DONE_MARKERS)) return;
      await ctx.page.waitForTimeout(UPLOAD_POLL_INTERVAL_MS);
    }
    throw new PublishExecutionError('UPLOAD_TIMEOUT', `等待上传完成超时（${Math.round(timeoutMs / 1000)} 秒）`);
  },

  /** FILLING_CONTENT · 标题：填写后校验页面实际文本与目标一致，不一致不进入下一步。 */
  async fillTitle(ctx: StepContext, title: string): Promise<void> {
    const field = await findFirst(ctx, TITLE_INPUT_SELECTORS);
    await fillField(field, title);
    const actual = (await readFieldValue(field)).trim();
    ctx.diag?.record({ step: 'FILLING_CONTENT', kind: 'text', selector: 'title-field', text: actual.slice(0, 200) });
    if (actual !== title.trim()) {
      throw new PublishExecutionError('TITLE_FILL_FAILED', `标题填写校验失败（期望「${title}」实际「${actual.slice(0, 40)}」）`);
    }
  },

  /** FILLING_CONTENT · 文案：有独立字段则填写并校验；页面没有独立字段时记录跳过。 */
  async fillDescription(ctx: StepContext, description: string): Promise<void> {
    if (!description.trim()) return;
    let field: Locator | null = null;
    for (const selector of DESCRIPTION_INPUT_SELECTORS) {
      try {
        if ((await visibleCount(ctx.page, selector)) > 0) {
          field = ctx.page.locator(selector).first();
          break;
        }
      } catch {
        devLog.warn(`[task ${ctx.taskId}] selector failed: ${selector}`);
      }
    }
    if (!field) {
      devLog.info(`[task ${ctx.taskId}] 页面无独立文案字段，跳过文案填写（标题已包含核心信息）`);
      return;
    }
    await fillField(field, description);
    const actual = (await readFieldValue(field)).trim();
    if (actual !== description.trim()) {
      throw new PublishExecutionError('DESCRIPTION_FILL_FAILED', '文案填写校验失败');
    }
  },

  /** FILLING_CONTENT · 话题：按页面真实交互逐条输入 #话题，完成后校验数量。 */
  async fillTags(ctx: StepContext, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    const field = await findFirst(ctx, TITLE_INPUT_SELECTORS);
    await field.click();
    await ctx.page.keyboard.press('End');
    for (const tag of tags) {
      const normalized = tag.startsWith('#') ? tag : `#${tag}`;
      await ctx.page.keyboard.type(` ${normalized}`, { delay: 15 });
    }
    const actual = await readFieldValue(field);
    ctx.diag?.record({ step: 'FILLING_CONTENT', kind: 'text', selector: 'tags-in-title', text: actual.slice(0, 300) });
    const verified = tags.filter((tag) => actual.includes(tag.startsWith('#') ? tag : `#${tag}`)).length;
    if (verified !== tags.length) {
      throw new PublishExecutionError(
        'TAGS_FILL_FAILED',
        `话题填写校验失败（期望 ${tags.length} 个，页面确认 ${verified} 个）`,
      );
    }
    devLog.info(`[task ${ctx.taskId}] 话题填写成功（${verified}/${tags.length}）`);
  },

  /** SETTING_COVER：无封面跳过；封面入口缺失时按设计降级跳过，不破坏链路。 */
  async setCover(ctx: StepContext, coverPath: string | null): Promise<void> {
    if (!coverPath) {
      devLog.info(`[task ${ctx.taskId}] 内容没有封面图，跳过封面设置`);
      return;
    }
    let input: Locator | null = null;
    for (const selector of COVER_INPUT_SELECTORS) {
      try {
        if ((await visibleCount(ctx.page, selector)) > 0) {
          input = ctx.page.locator(selector).first();
          break;
        }
      } catch {
        devLog.warn(`[task ${ctx.taskId}] selector failed: ${selector}`);
      }
    }
    if (!input) {
      devLog.warn(`[task ${ctx.taskId}] 封面入口未找到，跳过封面（不阻塞发布链路）`);
      return;
    }
    await input.setInputFiles(coverPath);
    await ctx.page.waitForTimeout(800);
    await captureScreenshot(ctx.page, `task-${ctx.taskId}-SETTING_COVER`).catch(() => null);
  },

  /** PUBLISHING：点击真实发布按钮，必须等到明确的成功 / 失败页面信号。 */
  async publish(ctx: StepContext): Promise<void> {
    const button = await findFirst(ctx, PUBLISH_BUTTON_SELECTORS, 5_000);
    await button.click();
    const deadline = Date.now() + PUBLISH_RESULT_TIMEOUT_MS;
    let success: string | null = null;
    let failure: string | null = null;
    while (Date.now() < deadline) {
      success = await anyVisible(ctx.page, PUBLISH_SUCCESS_MARKERS);
      if (success) {
        devLog.info(`[task ${ctx.taskId}] 发布成功信号：${success}`);
        return;
      }
      failure = await anyVisible(ctx.page, PUBLISH_FAIL_MARKERS);
      if (failure) throw new PublishExecutionError('PUBLISH_FAILED', '抖音页面提示发布失败');
      await ctx.page.waitForTimeout(1_000);
    }
    throw new PublishExecutionError('PUBLISH_RESULT_UNKNOWN', '已点击发布，但无法确认结果，请到平台核对');
  },
};

// 引用的登录状态元数据常量（保留供调用方展示，避免误删）。
