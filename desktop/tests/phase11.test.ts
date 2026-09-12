import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { closeDatabase, initDatabase } from '../src/main/database/db';
import { getAdapter } from '../src/main/platforms/registry';
import { createCustomPlatform, deleteCustomPlatform, listCustomPlatforms } from '../src/main/services/customPlatformService';
import { createProfile, deleteProfile } from '../src/main/services/browserProfileService';
import { createAccount, deleteAccount, listAccounts } from '../src/main/services/accountService';
import { resolvePlatformName } from '../src/main/services/customPlatformService';
import { createContent, deleteContent } from '../src/main/services/contentService';
import { createTask, listTasks } from '../src/main/services/publishService';

let dbDir: string;

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'nmw-phase11-'));
  initDatabase(join(dbDir, 'app.db'));
});

afterAll(() => {
  closeDatabase();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('自定义平台接口（CRUD）', () => {
  it('创建：key 自动生成且唯一，字段完整', () => {
    const first = createCustomPlatform('快手', 'https://cp.kuaishou.com', 'passport|login');
    expect(first.key).toBe('custom-platform'); // 中文名 slug 为空 → 回退 platform
    const second = createCustomPlatform('快手小号', 'https://cp.kuaishou.com', null);
    expect(second.key).not.toBe(first.key);
    expect(second.key.startsWith('custom-platform')).toBe(true);
  });

  it('解析平台显示名：内置走常量，自定义走表', () => {
    expect(resolvePlatformName('douyin')).toBe('抖音');
    const custom = listCustomPlatforms()[0];
    expect(resolvePlatformName(custom.key)).toBe('快手');
    expect(resolvePlatformName('unknown-xyz')).toBe('unknown-xyz');
  });

  it('有 Profile 绑定的自定义平台不能删除', () => {
    const custom = listCustomPlatforms()[0];
    const profile = createProfile(custom.key as never, '快手测试Profile');
    expect(() => deleteCustomPlatform(custom.id)).toThrowError(/Profile/);
    deleteProfile(profile.id);
    deleteCustomPlatform(custom.id);
    expect(listCustomPlatforms().some((platform) => platform.id === custom.id)).toBe(false);
  });
});

describe('自定义平台适配器（登录检测）', () => {
  it('注册表按 key 动态构建适配器；未注册返回 null', () => {
    const custom = createCustomPlatform('快手', 'https://cp.kuaishou.com', null);
    const adapter = getAdapter(custom.key);
    expect(adapter).not.toBeNull();
    expect(adapter?.platformId).toBe(custom.key);
    expect(getAdapter('nonexistent-key')).toBeNull();
    deleteCustomPlatform(custom.id);
  });

  it('登录墙检测：登录页跳转特征命中 → LOGIN_REQUIRED（真实 fixture 页面）', async () => {
    const fixtureUrl = pathToFileURL(join(__dirname, 'fixtures/douyin-publish-fixture.html')).toString();
    const custom = createCustomPlatform('快手', fixtureUrl + '?state=loginwall', null);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const adapter = getAdapter(custom.key);
      if (!adapter) throw new Error('adapter missing');
      const outcome = await adapter.checkLogin(page);
      expect(outcome.login.loggedIn).toBe(false);
      expect(outcome.login.reason).toBe('LOGIN_REQUIRED');
    } finally {
      await browser.close();
      deleteCustomPlatform(custom.id);
    }
  });

  it('安全验证页 → SECURITY_CHECK_REQUIRED（不自动处理）', async () => {
    const fixtureUrl = pathToFileURL(join(__dirname, 'fixtures/douyin-publish-fixture.html')).toString();
    const custom = createCustomPlatform('快手', fixtureUrl + '?state=security', null);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const adapter = getAdapter(custom.key);
      if (!adapter) throw new Error('adapter missing');
      const fixtureUrl = pathToFileURL(join(__dirname, 'fixtures/douyin-publish-fixture.html')).toString();
      await page.goto(`${fixtureUrl}?state=security`, { waitUntil: 'domcontentloaded' });
      const outcome = await adapter.checkLogin(page);
      expect(outcome.login.reason).toBe('SECURITY_CHECK_REQUIRED');
    } finally {
      await browser.close();
      deleteCustomPlatform(custom.id);
    }
  });
});

describe('自定义平台账号集成', () => {
  it('账号绑定到自定义平台 Profile；发布任务创建被明确拒绝（发布仅抖音）', () => {
    const custom = createCustomPlatform('快手', 'https://cp.kuaishou.com', null);
    const profile = createProfile(custom.key as never, '快手主账号Profile');
    const account = createAccount(custom.key as never, '快手主账号', profile.id);
    expect(listAccounts().some((item) => item.id === account.id && item.platform === custom.key)).toBe(true);

    const video = join(dbDir, 'x.mp4');
    writeFileSync(video, 'v');
    const content = createContent({ title: '测试', description: '', videoPath: video, coverPath: null, tags: [] });
    expect(() => createTask(content.id, account.id)).toThrowError(/仅支持抖音/);

    // createTask 被拒绝即不会有任务行产生
    expect(listTasks().length).toBe(0);
    deleteAccount(account.id);
    deleteProfile(profile.id);
    deleteContent(content.id);
    deleteCustomPlatform(custom.id);
  });
});