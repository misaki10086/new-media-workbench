import { chromium } from 'playwright';
import { browserProfileManager } from './browser/BrowserProfileManager';
import { closeDatabase, databaseFilePath, initDatabase } from './database/db';
import { appDirectories, ensureAppDirectories } from './appPaths';
import {
  checkAccountLogin,
  createAccount,
  deleteAccount,
  listAccounts,
} from './services/accountService';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
} from './services/browserProfileService';

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`[account-smoke] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
}

import { join } from 'node:path';

/** `electron . --probe-douyin`：诊断用——打印创作者中心页面上各标记的命中情况并截图。 */
export async function runDouyinProbe(): Promise<void> {
  try {
    ensureAppDirectories();
    initDatabase(databaseFilePath(appDirectories().database));
    const profile = createProfile('douyin', '验收-探针');
    await browserProfileManager.launch(profile.id);
    const page = await browserProfileManager.getPage(profile.id);
    await page.goto('https://creator.douyin.com/', { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    console.log(`[probe] url=${page.url()}`);
    const { LOGGED_IN_MARKERS, LOGIN_WALL_MARKERS, SECURITY_CHECK_MARKERS } = await import('./platforms/douyin/DouyinSelectors');
    for (const [label, markers] of [
      ['logged_in', LOGGED_IN_MARKERS],
      ['login_wall', LOGIN_WALL_MARKERS],
      ['security', SECURITY_CHECK_MARKERS],
    ] as const) {
      for (const selector of markers) {
        try {
          const count = await page.locator(selector).count();
          console.log(`[probe] ${label} ${count > 0 ? 'HIT' : 'miss'} ${selector}${count > 0 ? ` (x${count})` : ''}`);
        } catch (error) {
          console.log(`[probe] ${label} ERROR ${selector}: ${error instanceof Error ? error.message.split('\n')[0] : ''}`);
        }
      }
    }
    await page.screenshot({ path: join(appDirectories().screenshots, 'probe-douyin-logged-out.png'), fullPage: false });
    const text = await page.evaluate(
      () => (globalThis as unknown as { document?: { body?: { innerText?: string } } }).document?.body?.innerText?.slice(0, 600) ?? '',
    );
    console.log(`[probe] bodyText=${JSON.stringify(text)}`);
  } catch (error) {
    console.error('[probe] failed:', error instanceof Error ? error.message : error);
  } finally {
    await browserProfileManager.closeAll();
    closeDatabase();
  }
}

/**
 * `electron . --account-smoke`：账号 ↔ Profile 关联与登录检测验收。
 * 会启动真实 Chromium 并访问抖音创作者中心：
 * 未登录情况下预期返回 LOGIN_REQUIRED（或网络类原因码，取决于本机网络）。
 */
export async function runAccountSmoke(): Promise<boolean> {
  try {
    ensureAppDirectories();
    initDatabase(databaseFilePath(appDirectories().database));

    // 1-3. 创建 Profile + 账号，校验关联
    const profile = createProfile('douyin', '验收-账号检测');
    const account = createAccount('douyin', '验收-抖音账号', profile.id);
    const listed = listAccounts().find((item) => item.id === account.id);
    check(
      '账号创建并正确关联 Profile',
      Boolean(listed) && listed?.profileId === profile.id && listed.profileName === profile.name,
    );

    // 一个 Profile 只能绑定一个账号
    let duplicateBindingRejected = false;
    try {
      createAccount('douyin', '验收-第二个账号', profile.id);
    } catch {
      duplicateBindingRejected = true;
    }
    check('同一 Profile 重复绑定被拒绝', duplicateBindingRejected);

    // 平台不匹配的绑定被拒绝
    const otherProfile = createProfile('xiaohongshu', '验收-小红书Profile');
    let platformMismatchRejected = false;
    try {
      createAccount('xiaohongshu', '验收-小红书账号', profile.id);
    } catch {
      platformMismatchRejected = true;
    }
    check('跨平台绑定被拒绝', platformMismatchRejected);

    // 10. Profile 删除时关联账号不能产生孤儿引用（先删账号后删 Profile；直接删 Profile 必须被拒绝）
    let orphanProtected = false;
    try {
      deleteProfile(profile.id);
    } catch {
      orphanProtected = true;
    }
    check('有账号绑定的 Profile 删除被拒绝', orphanProtected);

    // 4-9. 启动浏览器并真实检测抖音登录状态
    const checked = await checkAccountLogin(account.id);
    const { login, steps } = checked.debug;
    const acceptable = login.loggedIn || login.reason !== undefined;
    check(
      '登录检测返回结构化结果',
      acceptable,
      `loggedIn=${login.loggedIn} reason=${login.reason ?? '-'} steps=[${steps.join(' → ')}] url=${checked.debug.finalUrl}`,
    );
    const persisted = listAccounts().find((item) => item.id === account.id);
    check(
      '检测结果已缓存到账号表',
      Boolean(persisted?.lastLoginCheckAt) && (login.loggedIn ? persisted?.loginStatus === 'logged_in' : persisted?.loginStatus !== 'unknown' || persisted?.lastLoginErrorCode !== null),
      `loginStatus=${persisted?.loginStatus} errorCode=${persisted?.lastLoginErrorCode ?? '-'}`,
    );

    // 9. 关闭浏览器后状态变化
    await browserProfileManager.close(profile.id);
    const closed = getProfile(profile.id);
    check('关闭浏览器后 Profile 状态回到 stopped', closed.status === 'stopped');

    // 清理（只断言本冒烟创建的数据已清除）
    const createdProfileIds = new Set([profile.id, otherProfile.id]);
    deleteAccount(account.id);
    deleteProfile(profile.id);
    deleteProfile(otherProfile.id);
    const leftoverProfiles = listProfiles().filter((item) => createdProfileIds.has(item.id));
    const leftoverAccounts = listAccounts().filter((item) => createdProfileIds.has(item.profileId));
    check('清理验收数据', leftoverProfiles.length === 0 && leftoverAccounts.length === 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check('账号冒烟（异常中断）', false, message);
  } finally {
    await browserProfileManager.closeAll();
    closeDatabase();
  }

  return results.every((result) => result.ok);
}

// ---------------------------------------------------------------------------
// Phase 9：新平台登录墙探针（真实页面证据，未登录即可验证）

interface ProbeSpec {
  platform: string;
  url: string;
  groups: { label: string; markers: readonly string[] }[];
}

/** `electron . --probe-platforms`：访问三平台创作者中心，打印登录墙 / 已登录标记命中情况。 */
export async function runPlatformProbe(): Promise<void> {
  const { XHS_LOGGED_IN_MARKERS, XHS_LOGIN_WALL_MARKERS, XHS_SECURITY_MARKERS, XiaohongshuUrls } = await import(
    './platforms/xiaohongshu/XiaohongshuSelectors'
  );
  const { BILIBILI_LOGGED_IN_MARKERS, BILIBILI_LOGIN_WALL_MARKERS, BILIBILI_SECURITY_MARKERS, BilibiliUrls } = await import(
    './platforms/bilibili/BilibiliSelectors'
  );
  const { CHANNELS_LOGGED_IN_MARKERS, CHANNELS_LOGIN_WALL_MARKERS, CHANNELS_SECURITY_MARKERS, WechatChannelsUrls } = await import(
    './platforms/wechatChannels/WechatChannelsSelectors'
  );

  const specs: ProbeSpec[] = [
    {
      platform: 'xiaohongshu',
      url: XiaohongshuUrls.creatorCenter,
      groups: [
        { label: 'logged_in', markers: XHS_LOGGED_IN_MARKERS },
        { label: 'login_wall', markers: XHS_LOGIN_WALL_MARKERS },
        { label: 'security', markers: XHS_SECURITY_MARKERS },
      ],
    },
    {
      platform: 'bilibili',
      url: BilibiliUrls.creatorCenter,
      groups: [
        { label: 'logged_in', markers: BILIBILI_LOGGED_IN_MARKERS },
        { label: 'login_wall', markers: BILIBILI_LOGIN_WALL_MARKERS },
        { label: 'security', markers: BILIBILI_SECURITY_MARKERS },
      ],
    },
    {
      platform: 'wechat_channels',
      url: WechatChannelsUrls.creatorCenter,
      groups: [
        { label: 'logged_in', markers: CHANNELS_LOGGED_IN_MARKERS },
        { label: 'login_wall', markers: CHANNELS_LOGIN_WALL_MARKERS },
        { label: 'security', markers: CHANNELS_SECURITY_MARKERS },
      ],
    },
  ];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const spec of specs) {
      try {
        await page.goto(spec.url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4_000);
        console.log(`[probe:${spec.platform}] url=${page.url()}`);
        for (const group of spec.groups) {
          for (const selector of group.markers) {
            try {
              const count = await page.locator(selector).filter({ visible: true }).count();
              console.log(`[probe:${spec.platform}] ${group.label} ${count > 0 ? 'HIT' : 'miss'} ${selector}${count > 0 ? ` (x${count})` : ''}`);
            } catch (error) {
              console.log(`[probe:${spec.platform}] ${group.label} ERROR ${selector}: ${error instanceof Error ? error.message.split('\n')[0] : ''}`);
            }
          }
        }
        await page.screenshot({ path: join(appDirectories().screenshots, `probe-${spec.platform}.png`) });
      } catch (error) {
        console.log(`[probe:${spec.platform}] FAILED: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      }
    }
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Phase 9：三平台登录检测端到端验收（真实页面，未登录应返回 LOGIN_REQUIRED）

interface PlatformLoginResult {
  name: string;
  ok: boolean;
  detail: string;
}

const platformResults: PlatformLoginResult[] = [];

function checkPlatform(name: string, ok: boolean, detail = ''): void {
  platformResults.push({ name, ok, detail });
  console.log(`[platform-login] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
}

export async function runPlatformLoginSmoke(): Promise<boolean> {
  const targets = [
    { platform: 'xiaohongshu' as const, profileName: '验收-小红书检测', accountName: '验收-小红书账号' },
    { platform: 'bilibili' as const, profileName: '验收-B站检测', accountName: '验收-B站账号' },
    { platform: 'wechat_channels' as const, profileName: '验收-视频号检测', accountName: '验收-视频号账号' },
  ];

  try {
    ensureAppDirectories();
    initDatabase(databaseFilePath(appDirectories().database));

    for (const target of targets) {
      const profile = createProfile(target.platform, target.profileName);
      const account = createAccount(target.platform, target.accountName, profile.id);
      try {
        const checked = await checkAccountLogin(account.id);
        const { login } = checked.debug;
        checkPlatform(
          `${target.platform} 未登录识别为 LOGIN_REQUIRED`,
          !login.loggedIn && login.reason === 'LOGIN_REQUIRED',
          `loggedIn=${login.loggedIn} reason=${login.reason ?? '-'} url=${checked.debug.finalUrl.slice(0, 60)}`,
        );
        const persisted = listAccounts().find((item) => item.id === account.id);
        checkPlatform(
          `${target.platform} 检测结果已缓存（logged_out）`,
          persisted?.loginStatus === 'logged_out',
          `loginStatus=${persisted?.loginStatus}`,
        );
      } catch (error) {
        checkPlatform(`${target.platform} 检测异常`, false, error instanceof Error ? error.message.slice(0, 200) : String(error));
      } finally {
        if (browserProfileManager.isRunning(profile.id)) await browserProfileManager.close(profile.id);
        deleteAccount(account.id);
        deleteProfile(profile.id);
      }
    }
  } catch (error) {
    checkPlatform('平台登录冒烟（异常中断）', false, error instanceof Error ? error.message : String(error));
  } finally {
    await browserProfileManager.closeAll();
    closeDatabase();
  }

  return platformResults.every((result) => result.ok);
}
