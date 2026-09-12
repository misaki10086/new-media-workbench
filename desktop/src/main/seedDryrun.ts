import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright';
import { appDirectories } from './appPaths';
import { getDatabase } from './database/db';
import { contents, publishTasks } from './database/schema';
import { createProfile, deleteProfile, listProfiles } from './services/browserProfileService';
import { createAccount, listAccounts } from './services/accountService';
import { createContent } from './services/contentService';
import { createTask, startTask } from './services/publishService';
import { devLog } from './services/logger';

export const DRYRUN = {
  profileName: '抖音主账号',
  accountName: '抖音主账号',
  title: '【测试】AI短剧发布测试',
  description: '这是一次本地新媒体工作台发布测试。',
  tags: ['AI短剧', '测试'],
} as const;

/** 用无头 Chromium 画布生成一张真实的测试封面 PNG（3:4）。 */
async function generateCoverPng(target: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
    await page.setContent(
      '<body style="margin:0;display:grid;place-items:center;height:100vh;background:linear-gradient(160deg,#101820,#2b4a5f);color:#e8f0f3;font:600 44px/1.5 sans-serif">【测试】<br>AI短剧发布测试</body>',
    );
    await page.screenshot({ path: target });
  } finally {
    await browser.close();
  }
}

/**
 * `--seed-dryrun`（Phase 5.1）：准备真实抖音 dry-run 的素材并自动启动任务。
 * 幂等：素材 / Profile / 账号 / 内容已存在时跳过创建；任务仅在无进行中任务时创建。
 * 启动后应用窗口正常打开，引擎会把浏览器停在登录墙 → WAITING_USER(LOGIN_REQUIRED)，
 * 用户登录后从任务页点「继续」即推进到 WAITING_USER_CONFIRM（绝不自动发布）。
 */
export async function seedDryrun(): Promise<void> {
  const dirs = appDirectories();
  const db = getDatabase();

  // 1. 清理冒烟残留（纯验收数据）
  for (const profile of listProfiles().filter((item) => item.name.startsWith('验收-'))) {
    deleteProfile(profile.id);
    devLog.info(`[dryrun] 清理冒烟残留 Profile：${profile.name}`);
  }

  // 2. Profile + 账号（抖音）
  let profile = listProfiles().find((item) => item.platform === 'douyin' && item.name === DRYRUN.profileName);
  if (!profile) profile = createProfile('douyin', DRYRUN.profileName);
  let account = listAccounts().find((item) => item.platform === 'douyin' && item.name === DRYRUN.accountName);
  if (!account) {
    account = createAccount('douyin', DRYRUN.accountName, profile.id);
    devLog.info('[dryrun] 已创建测试账号，绑定 Profile 抖音主账号');
  }

  // 3. 测试视频（复制用户 Downloads 中的真实 MP4；test.mp4 不存在时使用既有视频）
  const mediaDir = dirs.media;
  const testVideo = join(mediaDir, 'test.mp4');
  if (!existsSync(testVideo)) {
    const candidates = [
      join(process.env.USERPROFILE ?? '', 'Downloads', 'test.mp4'),
      join(process.env.USERPROFILE ?? '', 'Downloads', '生成黑白手持摄影机视角视频.mp4'),
      join(process.env.USERPROFILE ?? '', 'Downloads', 'desktop 2026-07-31 17-43-30.mp4'),
    ];
    const source = candidates.find((candidate) => existsSync(candidate));
    if (!source) throw new Error('未找到测试视频：请把 test.mp4 放到 Downloads 目录');
    copyFileSync(source, testVideo);
    devLog.info(`[dryrun] 测试视频已复制：${source} → ${testVideo}`);
  }

  // 4. 测试封面
  const testCover = join(mediaDir, 'test-cover.png');
  if (!existsSync(testCover)) {
    await generateCoverPng(testCover);
    devLog.info(`[dryrun] 测试封面已生成：${testCover}`);
  }

  // 5. 内容（幂等：按视频路径去重）
  const existingContent = db.select().from(contents).where(eq(contents.videoPath, testVideo)).get();
  let contentId: number;
  if (existingContent) {
    contentId = existingContent.id;
  } else {
    const content = createContent({
      title: DRYRUN.title,
      description: DRYRUN.description,
      videoPath: testVideo,
      coverPath: testCover,
      tags: [...DRYRUN.tags],
    });
    contentId = content.id;
    devLog.info(`[dryrun] 测试内容已创建：#${content.id} ${DRYRUN.title}`);
  }

  // 6. 任务（避免重复堆积：同内容已存在任务时复用）
  const existingTask = db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.contentId, contentId))
    .orderBy(publishTasks.id)
    .limit(1)
    .all()[0];
  let taskId = existingTask?.id;
  if (!taskId) {
    taskId = createTask(contentId, account.id).id;
  }
  const running = db.select({ id: publishTasks.id }).from(publishTasks).where(eq(publishTasks.status, 'running')).all();
  if (running.length === 0) {
    startTask(taskId);
    devLog.info(`[dryrun] 已启动 dry-run 任务 #${taskId}（将停在登录墙，等待你在浏览器中登录抖音）`);
  } else {
    devLog.info(`[dryrun] 检测到已有执行中任务 #${running[0].id}，跳过重复启动`);
  }
}