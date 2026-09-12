import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { appDirectories } from '../appPaths';

/** 平台页面异常 / selector 全部失效时保存截图，便于人工排查页面变化。 */
export async function captureScreenshot(page: Page, name: string): Promise<string | null> {
  try {
    const dir = appDirectories().screenshots;
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  } catch (error) {
    console.error(`Failed to capture screenshot ${name}:`, error);
    return null;
  }
}
