import { mkdirSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolveProfileDirectory, getProfile, markProfileStatus, touchProfileLastOpened } from '../services/browserProfileService';
import { devLog } from '../services/logger';
import type { BrowserProfile } from '@shared/types/domain';

interface RunningProfile {
  context: BrowserContext;
  /** closeProfile / 应用退出主动关闭时置 true，用于区分用户手关窗口或崩溃。 */
  expectedClose: boolean;
}

/**
 * 浏览器 Profile 生命周期管理（仅主进程使用）。
 * - 每个 Profile 一个 Playwright persistent context（chromium.launchPersistentContext）。
 * - 登录状态保存在 Profile 用户数据目录，绝不读取或存储 Cookie / 密码。
 * - 启动参数保持保守：不加任何反检测 / 隐藏自动化特征参数。
 */
class BrowserProfileManagerImpl {
  private running = new Map<number, RunningProfile>();
  /** 应用退出流程标记：此时触发的 context close 不再写状态。 */
  private shuttingDown = false;

  listRunningIds(): number[] {
    return [...this.running.keys()];
  }

  isRunning(profileId: number): boolean {
    return this.running.has(profileId);
  }

  async launch(profileId: number): Promise<BrowserProfile> {
    const profile = getProfile(profileId);
    if (this.running.has(profileId)) {
      throw new Error(`「${profile.name}」的浏览器已在运行，不能重复打开`);
    }

    const directory = resolveProfileDirectory(profile.profilePath);
    mkdirSync(directory, { recursive: true });

    let context: BrowserContext;
    const friendlyLaunchError = (message: string): Error =>
      /singleton|ProcessSingleton|Lock/i.test(message)
        ? new Error('该 Profile 正被另一个浏览器进程占用，请先关闭对应窗口')
        : new Error(`浏览器启动失败：${message}`);
    try {
      context = await chromium.launchPersistentContext(directory, {
        headless: false,
        viewport: null,
      });
    } catch (cause) {
      // 内置 Chromium 缺失（打包发行后未安装 Playwright 浏览器）时回退系统 Edge（Win11 自带，同为 Chromium）。
      const firstError = cause instanceof Error ? cause.message : String(cause);
      try {
        context = await chromium.launchPersistentContext(directory, {
          headless: false,
          viewport: null,
          channel: 'msedge',
        });
        devLog.warn('Playwright Chromium 不可用，已回退到系统 Microsoft Edge');
      } catch (fallbackCause) {
        const fallbackMessage = fallbackCause instanceof Error ? fallbackCause.message : String(fallbackCause);
        if (/singleton|ProcessSingleton|Lock/i.test(fallbackMessage)) {
          throw friendlyLaunchError(fallbackMessage);
        }
        throw friendlyLaunchError(firstError);
      }
    }

    const entry: RunningProfile = { context, expectedClose: false };
    this.running.set(profileId, entry);
    markProfileStatus(profileId, 'running');
    touchProfileLastOpened(profileId);
    devLog.info(`browser launched: ${profile.name} (${profile.profilePath})`);

    void context.on('close', () => {
      this.running.delete(profileId);
      if (this.shuttingDown || entry.expectedClose) {
        markProfileStatus(profileId, 'stopped');
        return;
      }
      // 非主动关闭：用户手动关闭窗口，或 Chromium 崩溃。二者无法可靠区分，
      // 统一记为 stopped；真正随应用崩溃的情况由下次启动的 stale 检查标记为 crashed。
      markProfileStatus(profileId, 'stopped');
      devLog.warn(`browser closed: ${profile.name}（窗口被关闭或进程退出）`);
    });

    return getProfile(profileId);
  }

  async close(profileId: number): Promise<void> {
    const entry = this.running.get(profileId);
    if (!entry) {
      throw new Error('该 Profile 的浏览器未在运行');
    }
    const profile = getProfile(profileId);
    entry.expectedClose = true;
    try {
      await entry.context.close();
    } finally {
      this.running.delete(profileId);
      markProfileStatus(profileId, 'stopped');
      devLog.info(`browser closed: ${profile.name}`);
    }
  }

  /** 取该 Profile 当前运行浏览器的一个页面（无则新建）。供后续自动化流程使用。 */
  async getPage(profileId: number): Promise<Page> {
    const entry = this.running.get(profileId);
    if (!entry) throw new Error('该 Profile 的浏览器未在运行');
    const pages = entry.context.pages();
    return pages[0] ?? (await entry.context.newPage());
  }

  /** 应用退出前关闭全部浏览器，避免残留 Chromium 进程。 */
  async closeAll(): Promise<void> {
    this.shuttingDown = true;
    const entries = [...this.running.entries()];
    await Promise.allSettled(
      entries.map(async ([profileId, entry]) => {
        entry.expectedClose = true;
        try {
          await entry.context.close();
        } catch (error) {
          devLog.error(`Failed to close browser for profile #${profileId}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          markProfileStatus(profileId, 'stopped');
        }
      }),
    );
    this.running.clear();
    this.shuttingDown = false;
  }
}

export const browserProfileManager = new BrowserProfileManagerImpl();
