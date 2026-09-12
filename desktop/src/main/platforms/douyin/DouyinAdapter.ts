import type { Page } from 'playwright';
import type { LoginCheckReason, LoginStatus } from '@shared/types/domain';
import { captureScreenshot } from '../capture';
import { getCreatorPageUrl } from '../testing/fixtureControls';
import { visibleCount } from '../locatorUtils';
import type { LoginCheckOutcome, PlatformAdapter } from '../PlatformAdapter';
import {
  DISPLAY_NAME_SELECTORS,
  LOGGED_IN_MARKERS,
  LOGIN_WALL_MARKERS,
  LOGIN_SIGNAL_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  SECURITY_CHECK_MARKERS,
} from './DouyinSelectors';

/** 逐个尝试 selector，存在可见匹配即返回；隐藏元素不算命中。 */
async function matchesAny(page: Page, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    if ((await visibleCount(page, selector)) > 0) return selector;
  }
  return null;
}

async function extractDisplayName(page: Page): Promise<string | undefined> {
  for (const selector of DISPLAY_NAME_SELECTORS) {
    try {
      const text = await page.locator(selector).first().textContent({ timeout: 1000 });
      if (text && text.trim()) return text.trim().slice(0, 80);
    } catch {
      // 该 selector 未命中，继续尝试下一个。
    }
  }
  return undefined;
}

export const douyinAdapter: PlatformAdapter = {
  platformId: 'douyin',

  async openCreatorCenter(page: Page): Promise<void> {
    await page.goto(getCreatorPageUrl(), { timeout: PAGE_LOAD_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
  },

  async checkLogin(page: Page): Promise<LoginCheckOutcome> {
    const steps: string[] = [];
    const startedAt = Date.now();
    steps.push('打开创作者中心');

    try {
      await page.goto(getCreatorPageUrl(), { timeout: PAGE_LOAD_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason: LoginCheckReason = /timeout|TIMEOUT/i.test(message) ? 'PAGE_LOAD_TIMEOUT' : 'NETWORK_ERROR';
      steps.push(`页面加载失败：${reason}`);
      return {
        login: { loggedIn: false, reason, checkedAt: new Date().toISOString() },
        steps,
        finalUrl: page.url(),
        durationMs: Date.now() - startedAt,
      };
    }

    steps.push('等待登录状态信号');
    const deadline = Date.now() + LOGIN_SIGNAL_TIMEOUT_MS;
    let loggedInSelector: string | null = null;
    let wallSelector: string | null = null;
    let securitySelector: string | null = null;

    while (Date.now() < deadline) {
      // 安全验证优先级最高：绝不能把验证页误判为登录页。
      securitySelector = await matchesAny(page, SECURITY_CHECK_MARKERS);
      if (securitySelector) break;
      loggedInSelector = await matchesAny(page, LOGGED_IN_MARKERS);
      if (loggedInSelector) break;
      wallSelector = await matchesAny(page, LOGIN_WALL_MARKERS);
      if (wallSelector) break;
      await page.waitForTimeout(600);
    }

    const checkedAt = new Date().toISOString();
    const finalUrl = page.url();
    let login: LoginStatus;

    if (securitySelector) {
      steps.push(`检测到安全验证（${securitySelector}）`);
      login = { loggedIn: false, reason: 'SECURITY_CHECK_REQUIRED', checkedAt };
    } else if (loggedInSelector) {
      steps.push(`检测到登录后界面（${loggedInSelector}）`);
      const displayName = await extractDisplayName(page);
      login = { loggedIn: true, checkedAt, ...(displayName ? { displayName } : {}) };
    } else if (wallSelector) {
      steps.push(`检测到登录页（${wallSelector}）`);
      login = { loggedIn: false, reason: 'LOGIN_REQUIRED', checkedAt };
    } else if (/login|sign_?in/i.test(finalUrl)) {
      steps.push('页面停留在登录地址');
      login = { loggedIn: false, reason: 'LOGIN_REQUIRED', checkedAt };
    } else {
      steps.push('无法识别页面状态');
      const screenshot = await captureScreenshot(page, 'douyin-login-unknown');
      if (screenshot) steps.push(`已保存截图 ${screenshot}`);
      login = { loggedIn: false, reason: 'UNKNOWN', checkedAt };
    }

    return { login, steps, finalUrl, durationMs: Date.now() - startedAt };
  },
};
