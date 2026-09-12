import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserProfileManager } from './BrowserProfileManager';
import { appDirectories } from '../appPaths';
import { closeDatabase, databaseFilePath, initDatabase } from '../database/db';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
} from '../services/browserProfileService';

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`[browser-smoke] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
}

/** 一个仅本地的探针页面：用 localStorage 模拟「登录状态」，验证持久化与 Profile 间隔离。 */
function writePersistenceProbe(): string {
  const filePath = join(appDirectories().cache, 'persistence-probe.html');
  writeFileSync(
    filePath,
    '<!doctype html><html><body><script>document.title = localStorage.getItem("nmw-smoke") || "empty";</script></body></html>',
    'utf8',
  );
  return pathToFileURL(filePath).toString();
}

/**
 * `electron . --browser-smoke`：Profile 生命周期验收（真实 Chromium，有头模式）。
 * 覆盖：创建/重名拒绝、启动/重复启动拒绝、持久化与隔离、运行中不可删除、删除。
 */
export async function runBrowserSmoke(): Promise<boolean> {
  let profileA;
  let profileB;
  try {
    profileA = createProfile('douyin', '验收-抖音主号');
    profileB = createProfile('xiaohongshu', '验收-小红书主号');
    check('创建两个 Profile', profileA.id > 0 && profileB.id > 0, `id=${profileA.id}/${profileB.id}`);

    let duplicateNameRejected = false;
    try {
      createProfile('douyin', '验收-抖音主号');
    } catch {
      duplicateNameRejected = true;
    }
    check('同名 Profile 创建被拒绝', duplicateNameRejected);

    await browserProfileManager.launch(profileA.id);
    check('Profile A 启动', getProfile(profileA.id).status === 'running');

    let duplicateLaunchRejected = false;
    try {
      await browserProfileManager.launch(profileA.id);
    } catch {
      duplicateLaunchRejected = true;
    }
    check('同一 Profile 重复启动被拒绝', duplicateLaunchRejected);

    const probeUrl = writePersistenceProbe();
    const pageA = await browserProfileManager.getPage(profileA.id);
    await pageA.goto(probeUrl);
    await pageA.evaluate(() => localStorage.setItem('nmw-smoke', 'profile-a'));
    await browserProfileManager.close(profileA.id);

    await browserProfileManager.launch(profileB.id);
    const pageB = await browserProfileManager.getPage(profileB.id);
    await pageB.goto(probeUrl);
    await pageB.evaluate(() => localStorage.setItem('nmw-smoke', 'profile-b'));
    await browserProfileManager.close(profileB.id);

    await browserProfileManager.launch(profileA.id);
    const pageA2 = await browserProfileManager.getPage(profileA.id);
    await pageA2.goto(probeUrl);
    const restored = await pageA2.evaluate(() => localStorage.getItem('nmw-smoke'));
    check('持久化与隔离：A 重开后仍是自己的数据', restored === 'profile-a', `value=${restored}`);
    await browserProfileManager.close(profileA.id);

    await browserProfileManager.launch(profileB.id);
    let deleteWhileRunningRejected = false;
    try {
      deleteProfile(profileB.id);
    } catch {
      deleteWhileRunningRejected = true;
    }
    check('运行中的 Profile 删除被拒绝', deleteWhileRunningRejected);
    await browserProfileManager.close(profileB.id);

    deleteProfile(profileB.id);
    deleteProfile(profileA.id);
    const leftover = listProfiles().filter((profile) => profile.name.startsWith('验收-'));
    check('停止后可删除，且列表已清理', leftover.length === 0, `leftover=${leftover.length}`);

    // 留下一个 Profile 供「应用重启后列表仍存在」验证（由 --print-profiles 在新进程中确认）。
    createProfile('bilibili', '验收-重启保留');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check('浏览器冒烟（异常中断）', false, message);
  } finally {
    await browserProfileManager.closeAll();
    closeDatabase();
  }

  return results.every((result) => result.ok);
}

/** `electron . --print-profiles`：在新进程中打印 Profile 列表（验证重启后仍在），随后清理验收 Profile。 */
export function printProfilesAndCleanup(): void {
  initDatabase(databaseFilePath(appDirectories().database));
  const profiles = listProfiles();
  console.log(`[profiles] count=${profiles.length}`);
  for (const profile of profiles) {
    console.log(`[profiles] id=${profile.id} name=${profile.name} platform=${profile.platform} status=${profile.status}`);
  }
  for (const profile of profiles.filter((item) => item.name.startsWith('验收-'))) {
    deleteProfile(profile.id);
    console.log(`[profiles] cleaned acceptance profile: ${profile.name}`);
  }
  closeDatabase();
}
