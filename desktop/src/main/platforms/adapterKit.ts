import type { Page } from 'playwright';
import type { LoginCheckOutcome } from './PlatformAdapter';
import { anyVisible, visibleCount } from './locatorUtils';
import { captureScreenshot } from './capture';
import type { LoginStatus } from '@shared/types/domain';

export interface LoginCheckSpec {
  /** 创作者中心入口地址。 */
  url: string;
  loggedInMarkers: readonly string[];
  loginWallMarkers: readonly string[];
  securityMarkers: readonly string[];
  /** 未登录重定向的 URL 特征（如 passport 登录页），作为兜底信号。 */
  loginUrlPattern?: RegExp;
  displayNameSelectors?: readonly string[];
  /** 失败 / 无法识别时的截图前缀。 */
  screenshotPrefix: string;
  signalTimeoutMs?: number;
  loadTimeoutMs?: number;
}

const DEFAULT_SIGNAL_TIMEOUT = 15_000;
const DEFAULT_LOAD_TIMEOUT = 30_000;
const POLL_INTERVAL = 600;

async function matchesAny(page: Page, selectors: readonly string[]): Promise<string | null> {
  return anyVisible(page, selectors);
}

async function extractDisplayName(page: Page, selectors: readonly string[] = []): Promise<string | undefined> {
  for (const selector of selectors) {
    try {
      const text = await page.locator(selector).first().textContent({ timeout: 1_000 });
      if (text && text.trim()) return text.trim().slice(0, 80);
    } catch {
      // 未命中，尝试下一个。
    }
  }
  return undefined;
}

/**
 * 通用登录检测器：与 DouyinAdapter 同一套信号轮询逻辑
 * （安全验证优先 → 已登录特征 → 登录墙 → URL 兜底），
 * 供 Phase 9 新平台适配器复用。DouyinAdapter 保持 Phase 5.1 已验证实现不动。
 */
export function createLoginChecker(spec: LoginCheckSpec): (page: Page) => Promise<LoginCheckOutcome> {
  return async (page: Page): Promise<LoginCheckOutcome> => {
    const steps: string[] = [];
    const startedAt = Date.now();
    const signalTimeout = spec.signalTimeoutMs ?? DEFAULT_SIGNAL_TIMEOUT;
    const loadTimeout = spec.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT;
    steps.push('打开创作者中心');

    try {
      await page.goto(spec.url, { timeout: loadTimeout, waitUntil: 'domcontentloaded' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = /timeout|TIMEOUT/i.test(message) ? 'PAGE_LOAD_TIMEOUT' : 'NETWORK_ERROR';
      steps.push(`页面加载失败：${reason}`);
      return {
        login: { loggedIn: false, reason, checkedAt: new Date().toISOString() },
        steps,
        finalUrl: page.url(),
        durationMs: Date.now() - startedAt,
      };
    }

    steps.push('等待登录状态信号');
    const deadline = Date.now() + signalTimeout;
    let security: string | null = null;
    let loggedIn: string | null = null;
    let loginWall: string | null = null;

    while (Date.now() < deadline) {
      security = await matchesAny(page, spec.securityMarkers);
      if (security) break;
      loggedIn = await matchesAny(page, spec.loggedInMarkers);
      if (loggedIn) break;
      loginWall = await matchesAny(page, spec.loginWallMarkers);
      if (loginWall) break;
      await page.waitForTimeout(POLL_INTERVAL);
    }

    const checkedAt = new Date().toISOString();
    const finalUrl = page.url();
    let login: LoginStatus;

    if (security) {
      steps.push(`检测到安全验证（${security}）`);
      login = { loggedIn: false, reason: 'SECURITY_CHECK_REQUIRED', checkedAt };
    } else if (loggedIn) {
      steps.push(`检测到登录后界面（${loggedIn}）`);
      const displayName = await extractDisplayName(page, spec.displayNameSelectors ?? []);
      login = { loggedIn: true, checkedAt, ...(displayName ? { displayName } : {}) };
    } else if (loginWall) {
      steps.push(`检测到登录页（${loginWall}）`);
      login = { loggedIn: false, reason: 'LOGIN_REQUIRED', checkedAt };
    } else if (spec.loginUrlPattern?.test(finalUrl)) {
      steps.push('页面停留在登录地址');
      login = { loggedIn: false, reason: 'LOGIN_REQUIRED', checkedAt };
    } else {
      steps.push('无法识别页面状态');
      const screenshot = await captureScreenshot(page, `${spec.screenshotPrefix}-login-unknown`).catch(() => null);
      if (screenshot) steps.push(`已保存截图 ${screenshot}`);
      login = { loggedIn: false, reason: 'UNKNOWN', checkedAt };
    }

    return { login, steps, finalUrl, durationMs: Date.now() - startedAt };
  };
}

/** 发布执行前的登录复核（与 checkLogin 同源，供未来发布步骤使用）。 */
export { visibleCount };
