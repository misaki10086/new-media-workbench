import type { Page } from 'playwright';
import { devLog } from '../services/logger';

/**
 * 统计 selector 当前可见的匹配数。
 * 页面上 display:none / visibility:hidden 的元素（如未激活的弹层、隐藏的状态节点）
 * 不算命中——避免把隐藏文案误判为页面状态。selector 语法错误时记录日志并返回 0。
 */
export async function visibleCount(page: Page, selector: string): Promise<number> {
  try {
    return await page.locator(selector).filter({ visible: true }).count();
  } catch (error) {
    devLog.warn(`selector failed: ${selector} (${error instanceof Error ? error.message.split('\n')[0] : 'unknown'})`);
    return 0;
  }
}

/** 任意一个 selector 存在可见匹配，返回命中的 selector；全部失败返回 null。 */
export async function anyVisible(page: Page, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    if ((await visibleCount(page, selector)) > 0) return selector;
  }
  return null;
}
