import { desc } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { resolvePlatformName } from './customPlatformService';
import { contents, publishTasks } from '../database/schema';
import type { Platform, PublishTaskStatus } from '@shared/types/domain';

type TaskRow = typeof publishTasks.$inferSelect;

export interface AnalyticsSummary {
  totals: {
    tasks: number;
    success: number;
    failed: number;
    active: number;
    /** 成功率 = success / (success + failed)，无已完成时为 0。 */
    successRate: number;
  };
  byPlatform: { platform: Platform; platformName: string; total: number; success: number; failed: number }[];
  topErrors: { errorCode: string; count: number; lastAt: string | null }[];
  /** 最近 14 天每日完成任务数（成功 + 失败，按 finishedAt 归日）。 */
  last14Days: { date: string; finished: number }[];
  recentFinished: {
    taskId: number;
    contentTitle: string;
    platform: Platform;
    status: PublishTaskStatus;
    finishedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }[];
}

const ACTIVE_STATUSES: PublishTaskStatus[] = ['pending', 'scheduled', 'paused', 'running', 'waiting_user'];

/** 纯聚合函数：输入全部任务行，输出统计摘要（可直接单测）。 */
export function buildAnalyticsSummary(rows: TaskRow[], now: number): AnalyticsSummary {
  const finishedRows = rows.filter((row) => row.finishedAt !== null);
  const success = rows.filter((row) => row.status === 'success').length;
  const failed = rows.filter((row) => row.status === 'failed').length;
  const terminal = success + failed;

  const platformMap = new Map<Platform, { platformName: string; total: number; success: number; failed: number }>();
  for (const row of rows) {
    const platformName = resolvePlatformName(row.platform);
    const entry = platformMap.get(row.platform as Platform) ?? { platformName, total: 0, success: 0, failed: 0 };
    entry.total += 1;
    if (row.status === 'success') entry.success += 1;
    if (row.status === 'failed') entry.failed += 1;
    platformMap.set(row.platform as Platform, entry);
  }

  const errorMap = new Map<string, { count: number; lastAt: string | null }>();
  for (const row of rows) {
    if (row.status !== 'failed' || !row.errorCode) continue;
    const entry = errorMap.get(row.errorCode) ?? { count: 0, lastAt: null };
    entry.count += 1;
    if (!entry.lastAt || (row.updatedAt ?? '') > entry.lastAt) entry.lastAt = row.updatedAt;
    errorMap.set(row.errorCode, entry);
  }

  // 最近 14 天：按本地日期归组，包含 0 的日期（图表连续）
  const dayLabels: string[] = [];
  const countsByDay = new Map<string, number>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 86_400_000);
    const label = date.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    dayLabels.push(label);
    countsByDay.set(label, 0);
  }
  for (const row of finishedRows) {
    if (!row.finishedAt) continue;
    const label = new Date(row.finishedAt).toLocaleDateString('sv-SE');
    if (countsByDay.has(label)) countsByDay.set(label, (countsByDay.get(label) ?? 0) + 1);
  }

  const contentTitles = new Map<number, string>();
  for (const content of getDatabase().select().from(contents).all()) {
    contentTitles.set(content.id, content.title);
  }

  return {
    totals: {
      tasks: rows.length,
      success,
      failed,
      active: rows.filter((row) => ACTIVE_STATUSES.includes(row.status as PublishTaskStatus)).length,
      successRate: terminal === 0 ? 0 : Math.round((success / terminal) * 100),
    },
    byPlatform: [...platformMap.entries()]
      .map(([platform, entry]) => ({ ...entry, platform }))
      .sort((a, b) => b.total - a.total),
    topErrors: [...errorMap.entries()]
      .map(([errorCode, entry]) => ({ errorCode, ...entry }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    last14Days: dayLabels.map((date) => ({ date, finished: countsByDay.get(date) ?? 0 })),
    recentFinished: finishedRows
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
      .slice(0, 15)
      .map((row) => ({
        taskId: row.id,
        contentTitle: contentTitles.get(row.contentId) ?? `内容 #${row.contentId}`,
        platform: row.platform as Platform,
        status: row.status as PublishTaskStatus,
        finishedAt: row.finishedAt,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
      })),
  };
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const rows = getDatabase().select().from(publishTasks).orderBy(desc(publishTasks.id)).all();
  return buildAnalyticsSummary(rows, Date.now());
}