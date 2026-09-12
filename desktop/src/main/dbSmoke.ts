import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { closeDatabase, initDatabase } from './database/db';
import { accounts, browserProfiles, contents, publishLogs, publishTasks, settings } from './database/schema';
import { appDirectories } from './appPaths';
import { importVideoFiles } from './services/contentService';

interface CheckResult {
  table: string;
  ok: boolean;
  detail: string;
}

/**
 * 五张表的读写冒烟测试：`electron . --db-smoke`。
 * 在真实 Electron 主进程内运行（验证 better-sqlite3 的 ABI 与 Drizzle schema），
 * 写入 cache/db-smoke.sqlite，不影响正式数据库 app.db。
 */
export async function runDbSmoke(): Promise<boolean> {
  const results: CheckResult[] = [];
  // 每次冒烟使用全新数据库，保证结果确定性、可重复运行。
  const cacheDir = appDirectories().cache;
  const dbPath = join(cacheDir, 'db-smoke.sqlite');
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }

  try {
    const db = initDatabase(dbPath);
    const now = new Date().toISOString();

    // 1. accounts（新结构：绑定 browser_profiles）
    const smokeProfile = db
      .insert(browserProfiles)
      .values({ platform: 'douyin', name: '冒烟Profile', profilePath: 'douyin-smoke', status: 'stopped', createdAt: now, updatedAt: now })
      .returning()
      .get();
    const account = db
      .insert(accounts)
      .values({ platform: 'douyin', name: '冒烟测试账号', profileId: smokeProfile.id, loginStatus: 'unknown', createdAt: now, updatedAt: now })
      .returning()
      .get();
    const accountRead = db.select().from(accounts).where(eq(accounts.id, account.id)).get();
    results.push({ table: 'accounts', ok: accountRead?.profileId === smokeProfile.id, detail: `id=${account.id} → profile ${smokeProfile.id}` });

    // 2. content
    const content = db
      .insert(contents)
      .values({ title: '冒烟测试视频', description: 'db-smoke', tags: JSON.stringify(['smoke']), fileSizeBytes: 123, createdAt: now, updatedAt: now })
      .returning()
      .get();
    const contentRead = db.select().from(contents).where(eq(contents.id, content.id)).get();
    results.push({ table: 'content', ok: contentRead?.title === '冒烟测试视频', detail: `id=${content.id}` });

    // 3. publish_tasks（外键 → content / accounts）
    const task = db
      .insert(publishTasks)
      .values({ contentId: content.id, accountId: account.id, platform: 'douyin', status: 'running', progress: 40, createdAt: now })
      .returning()
      .get();
    const taskRead = db.select().from(publishTasks).where(eq(publishTasks.id, task.id)).get();
    const taskUpdated = db
      .update(publishTasks)
      .set({ status: 'success', progress: 100, finishedAt: now })
      .where(eq(publishTasks.id, task.id))
      .returning()
      .get();
    results.push({
      table: 'publish_tasks',
      ok: taskRead?.status === 'running' && taskUpdated.status === 'success',
      detail: `id=${task.id} 状态 ${taskRead?.status} → ${taskUpdated.status}`,
    });

    // 4. publish_logs（外键 → publish_tasks）
    db.insert(publishLogs).values({ taskId: task.id, level: 'info', message: '浏览器启动', createdAt: now }).run();
    db.insert(publishLogs).values({ taskId: task.id, level: 'warn', message: '等待人工确认', createdAt: now }).run();
    const logCount = db.select({ value: sql<number>`count(*)` }).from(publishLogs).all()[0]?.value ?? 0;
    results.push({ table: 'publish_logs', ok: Number(logCount) === 2, detail: `rows=${logCount}` });

    // 5. settings（可重复运行：key 冲突时改走更新）
    db.insert(settings).values({ key: 'publish_confirm_mode', value: 'auto_publish' })
      .onConflictDoUpdate({ target: settings.key, set: { value: 'auto_publish' } })
      .run();
    const settingRead = db.select().from(settings).where(eq(settings.key, 'publish_confirm_mode')).get();
    db.update(settings).set({ value: 'manual_confirm' }).where(eq(settings.key, 'publish_confirm_mode')).run();
    const settingUpdated = db.select().from(settings).where(eq(settings.key, 'publish_confirm_mode')).get();
    results.push({
      table: 'settings',
      ok: settingRead?.value === 'auto_publish' && settingUpdated?.value === 'manual_confirm',
      detail: `${settingRead?.value} → ${settingUpdated?.value}`,
    });

    // 清理：级联删除应带走 publish_tasks / publish_logs
    db.delete(contents).where(eq(contents.id, content.id)).run();
    const leftoverTasks = db.select().from(publishTasks).where(eq(publishTasks.id, task.id)).all().length;
    results.push({ table: '级联删除', ok: leftoverTasks === 0, detail: `残留任务 ${leftoverTasks}` });

    // 6. 内容导入服务（内容库拖拽 / 文件选择器最终都走 importVideoFiles）
    const smokeVideo = join(appDirectories().cache, 'db-smoke-sample.mp4');
    writeFileSync(smokeVideo, 'fake-video-bytes');
    const firstImport = importVideoFiles([smokeVideo]);
    const secondImport = importVideoFiles([smokeVideo]);
    const rejectedImport = importVideoFiles([smokeVideo.replace('.mp4', '.txt')]);
    const importedRow = db
      .select()
      .from(contents)
      .where(eq(contents.videoPath, smokeVideo))
      .get();
    const importOk =
      firstImport.imported.length === 1 &&
      secondImport.skipped === 1 &&
      rejectedImport.imported.length === 0 &&
      rejectedImport.skipped === 1 &&
      Boolean(importedRow) &&
      importedRow?.title === 'db-smoke-sample';
    results.push({
      table: '内容导入服务',
      ok: importOk,
      detail: `导入 ${firstImport.imported.length}，重复跳过 ${secondImport.skipped}，非法格式跳过 ${rejectedImport.skipped}`,
    });
    if (importedRow) db.delete(contents).where(eq(contents.id, importedRow.id)).run();
    if (existsSync(smokeVideo)) rmSync(smokeVideo);
  } catch (error) {
    results.push({ table: '(异常)', ok: false, detail: error instanceof Error ? error.message : String(error) });
  } finally {
    closeDatabase();
  }

  let allOk = true;
  for (const result of results) {
    if (!result.ok) allOk = false;
    console.log(`[db-smoke] ${result.ok ? 'PASS' : 'FAIL'} ${result.table} ${result.detail}`);
  }
  return allOk;
}
