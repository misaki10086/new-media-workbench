import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../src/main/database/db';
import { buildAnalyticsSummary } from '../src/main/services/analyticsService';
import type { publishTasks } from '../src/main/database/schema';

type TaskRow = typeof publishTasks.$inferSelect;
type NewTaskRow = typeof publishTasks.$inferInsert;

let dbDir: string;

function taskRow(overrides: Partial<NewTaskRow> & { id: number }): TaskRow {
  const base = {
    contentId: 1,
    accountId: 1,
    browserProfileId: 1,
    platform: 'douyin',
    status: 'pending',
    priority: 'NORMAL',
    currentStep: 'CREATED',
    waitingReason: null,
    progress: 0,
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    lastCompletedStep: null,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  };
  return { ...base, ...overrides } as TaskRow;
}

// 固定“现在”：2026-09-12T12:00:00Z
const NOW = new Date('2026-09-12T12:00:00.000Z').getTime();

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'nmw-analytics-'));
  initDatabase(join(dbDir, 'app.db'));
});

afterAll(() => {
  closeDatabase();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('数据记录聚合（buildAnalyticsSummary）', () => {
  it('空数据：全部为零、14 天连续且全为 0', () => {
    const summary = buildAnalyticsSummary([], NOW);
    expect(summary.totals).toEqual({ tasks: 0, success: 0, failed: 0, active: 0, successRate: 0 });
    expect(summary.last14Days.length).toBe(14);
    expect(summary.last14Days.every((day) => day.finished === 0)).toBe(true);
    expect(summary.recentFinished).toEqual([]);
  });

  it('统计成功 / 失败 / 进行中与成功率', () => {
    const rows = [
      taskRow({ id: 1, status: 'success', finishedAt: '2026-09-12T08:00:00.000Z' }),
      taskRow({ id: 2, status: 'success', finishedAt: '2026-09-12T09:00:00.000Z' }),
      taskRow({ id: 3, status: 'failed', errorCode: 'UPLOAD_TIMEOUT', finishedAt: '2026-09-12T10:00:00.000Z', updatedAt: '2026-09-12T10:00:00.000Z' }),
      taskRow({ id: 4, status: 'running' }),
      taskRow({ id: 5, status: 'scheduled', scheduledAt: '2026-09-13T08:00:00.000Z' }),
    ];
    const summary = buildAnalyticsSummary(rows, NOW);
    expect(summary.totals.tasks).toBe(5);
    expect(summary.totals.success).toBe(2);
    expect(summary.totals.failed).toBe(1);
    expect(summary.totals.active).toBe(2);
    expect(summary.totals.successRate).toBe(67);
  });

  it('失败原因 TOP：按次数排序并记录最后时间', () => {
    const rows = [
      taskRow({ id: 1, status: 'failed', errorCode: 'UPLOAD_TIMEOUT', finishedAt: '2026-09-11T08:00:00.000Z', updatedAt: '2026-09-11T08:00:00.000Z' }),
      taskRow({ id: 2, status: 'failed', errorCode: 'UPLOAD_TIMEOUT', finishedAt: '2026-09-12T08:00:00.000Z', updatedAt: '2026-09-12T08:00:00.000Z' }),
      taskRow({ id: 3, status: 'failed', errorCode: 'LOGIN_REQUIRED', finishedAt: '2026-09-12T09:00:00.000Z', updatedAt: '2026-09-12T09:00:00.000Z' }),
    ];
    const summary = buildAnalyticsSummary(rows, NOW);
    expect(summary.topErrors[0]).toMatchObject({ errorCode: 'UPLOAD_TIMEOUT', count: 2, lastAt: '2026-09-12T08:00:00.000Z' });
    expect(summary.topErrors.length).toBe(2);
  });

  it('14 天图表：完成任务归到对应日期，范围外不计入', () => {
    const rows = [
      taskRow({ id: 1, status: 'success', finishedAt: '2026-09-12T08:00:00.000Z' }),
      taskRow({ id: 2, status: 'success', finishedAt: '2026-09-12T09:30:00.000Z' }),
      taskRow({ id: 3, status: 'failed', finishedAt: '2026-09-12T10:00:00.000Z' }),
      taskRow({ id: 4, status: 'success', finishedAt: '2026-08-01T10:00:00.000Z' }), // 范围外
    ];
    const summary = buildAnalyticsSummary(rows, NOW);
    const today = summary.last14Days.find((day) => day.date === '2026-09-12');
    expect(today?.finished).toBe(3);
    const totalInRange = summary.last14Days.reduce((sum, day) => sum + day.finished, 0);
    expect(totalInRange).toBe(3);
  });

  it('按平台分组统计', () => {
    const rows = [
      taskRow({ id: 1, platform: 'douyin', status: 'success' }),
      taskRow({ id: 2, platform: 'douyin', status: 'failed' }),
      taskRow({ id: 3, platform: 'xiaohongshu', status: 'pending' }),
    ];
    const summary = buildAnalyticsSummary(rows, NOW);
    const douyin = summary.byPlatform.find((entry) => entry.platform === 'douyin');
    expect(douyin).toMatchObject({ total: 2, success: 1, failed: 1 });
    const xhs = summary.byPlatform.find((entry) => entry.platform === 'xiaohongshu');
    expect(xhs).toMatchObject({ total: 1, success: 0, failed: 0 });
  });
});