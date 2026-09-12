import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initDatabase } from '../src/main/database/db';
import { assets } from '../src/main/database/schema';
import { getAdapter } from '../src/main/platforms/registry';
import {
  importAssets,
  deleteAsset,
  listAssets,
  setAssetFavorite,
  setAssetTags,
} from '../src/main/services/assetService';

let dbDir: string;

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'nmw-phase9-'));
  initDatabase(join(dbDir, 'app.db'));
});

afterAll(() => {
  for (const asset of getDatabase().select().from(assets).all()) {
    getDatabase().delete(assets).where(eq(assets.id, asset.id)).run();
  }
  closeDatabase();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('四平台适配器注册表', () => {
  it('全部平台都有登录检测适配器', () => {
    for (const platform of ['douyin', 'xiaohongshu', 'bilibili', 'wechat_channels'] as const) {
      const adapter = getAdapter(platform);
      expect(adapter).not.toBeNull();
      expect(adapter?.platformId).toBe(platform);
      expect(typeof adapter?.checkLogin).toBe('function');
      expect(typeof adapter?.openCreatorCenter).toBe('function');
    }
  });

  it('登录墙 / 已登录标记均为非空列表（已按真实页面校准）', async () => {
    const { XHS_LOGGED_IN_MARKERS, XHS_LOGIN_WALL_MARKERS } = await import(
      '../src/main/platforms/xiaohongshu/XiaohongshuSelectors'
    );
    const { BILIBILI_LOGGED_IN_MARKERS, BILIBILI_LOGIN_WALL_MARKERS } = await import(
      '../src/main/platforms/bilibili/BilibiliSelectors'
    );
    const { CHANNELS_LOGGED_IN_MARKERS, CHANNELS_LOGIN_WALL_MARKERS } = await import(
      '../src/main/platforms/wechatChannels/WechatChannelsSelectors'
    );
    for (const markers of [
      XHS_LOGGED_IN_MARKERS,
      XHS_LOGIN_WALL_MARKERS,
      BILIBILI_LOGGED_IN_MARKERS,
      BILIBILI_LOGIN_WALL_MARKERS,
      CHANNELS_LOGGED_IN_MARKERS,
      CHANNELS_LOGIN_WALL_MARKERS,
    ]) {
      expect(markers.length).toBeGreaterThan(0);
    }
    // 真实页面证据：登录页含「创作服务」（小红书）/「内容管理」（视频号）营销文案，不能作为已登录信号
    expect(XHS_LOGGED_IN_MARKERS).not.toContain('text=创作服务');
    expect(CHANNELS_LOGGED_IN_MARKERS).not.toContain('text=内容管理');
  });
});

describe('素材库服务', () => {
  it('按扩展名归类导入并去重', () => {
    const video = join(dbDir, 'clip.mp4');
    const image = join(dbDir, 'cover.png');
    const font = join(dbDir, 'font.ttf');
    const unknown = join(dbDir, 'notes.txt');
    writeFileSync(video, 'v');
    writeFileSync(image, 'i');
    writeFileSync(font, 'f');
    writeFileSync(unknown, 'u');

    const first = importAssets([video, image, font, unknown]);
    expect(first.imported.map((asset) => asset.type)).toEqual(['video', 'image', 'font']);
    expect(first.skipped).toBe(1);

    const again = importAssets([video, image, font]);
    expect(again.imported.length).toBe(0);
    expect(again.skipped).toBe(3);
  });

  it('筛选：类型 / 收藏 / 搜索', () => {
    const db = getDatabase();
    const rows = db.select().from(assets).all();
    const videoAsset = rows.find((row) => row.type === 'video');
    const imageAsset = rows.find((row) => row.type === 'image');
    if (!videoAsset || !imageAsset) throw new Error('setup failed');
    setAssetFavorite(videoAsset.id, true);
    setAssetTags(imageAsset.id, ['封面', '测试']);

    expect(listAssets({ type: 'video' }).every((asset) => asset.type === 'video')).toBe(true);
    expect(listAssets({ favorite: true }).map((asset) => asset.id)).toContain(videoAsset.id);
    expect(listAssets({ search: '封面' }).map((asset) => asset.id)).toContain(imageAsset.id);
    expect(listAssets({ search: '不存在的关键词xyz' }).length).toBe(0);
  });

  it('删除素材只移除记录', () => {
    const asset = listAssets()[0];
    const fileExists = existsSync(asset.path);
    deleteAsset(asset.id);
    expect(listAssets().some((item) => item.id === asset.id)).toBe(false);
    expect(existsSync(asset.path)).toBe(fileExists);
  });
});