import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PLATFORM_LABEL } from '@shared/constants/platforms';
import type { AnalyticsSummary } from '@shared/types/ipc';
import { Card, StatusChip, StatusDot } from '@renderer/components/ui';

function formatDay(iso: string): string {
  const date = new Date(iso + 'T00:00:00');
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: string }): ReactNode {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5 text-center">
      <div className={`text-[20px] font-semibold leading-6 ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-fg-muted">{label}</div>
    </div>
  );
}

const EMPTY: AnalyticsSummary = {
  totals: { tasks: 0, success: 0, failed: 0, active: 0, successRate: 0 },
  byPlatform: [],
  topErrors: [],
  last14Days: [],
  recentFinished: [],
};

export function AnalyticsPage(): ReactNode {
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<void> => {
    try {
      setSummary(await window.newMedia.analytics.summary());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '数据加载失败');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadSummary();
      setLoading(false);
    })();
    const timer = setInterval(() => void loadSummary(), 5000);
    return () => clearInterval(timer);
  }, [loadSummary]);

  const maxDay = Math.max(1, ...summary.last14Days.map((day) => day.finished));

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold">数据记录</h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">发布任务的执行统计与失败归因（全部来自本地数据库）</p>
        </div>
        <button
          type="button"
          aria-label="刷新统计"
          onClick={() => void loadSummary()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>
      ) : null}

      <div className="grid grid-cols-5 gap-2">
        <StatCard label="总任务" value={summary.totals.tasks} tone="text-fg" />
        <StatCard label="成功" value={summary.totals.success} tone="text-success" />
        <StatCard label="失败" value={summary.totals.failed} tone="text-danger" />
        <StatCard label="成功率" value={`${summary.totals.successRate}%`} tone="text-accent" />
        <StatCard label="进行中" value={summary.totals.active} tone="text-warning" />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_300px] items-start gap-4">
        <div className="flex flex-col gap-4">
          <Card title="最近 14 天完成任务">
            {summary.last14Days.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-fg-muted">暂无数据</div>
            ) : (
              <div className="flex h-36 items-end gap-1.5">
                {summary.last14Days.map((day) => (
                  <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-fg-muted">{day.finished > 0 ? day.finished : ''}</span>
                    <div
                      className={`w-full max-w-8 rounded-t-md ${day.finished > 0 ? 'bg-accent' : 'bg-idle-soft'}`}
                      style={{ height: `${Math.max(4, (day.finished / maxDay) * 110)}px` }}
                      title={`${day.date}：${day.finished} 个`}
                    />
                    <span className="truncate text-[9px] text-fg-muted">{formatDay(day.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="最近完成">
            {summary.recentFinished.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-fg-muted">还没有已完成的任务</div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-[11px] text-fg-muted">
                    <th className="py-1.5 pr-3 font-medium">内容</th>
                    <th className="py-1.5 pr-3 font-medium">平台</th>
                    <th className="py-1.5 pr-3 font-medium">结果</th>
                    <th className="py-1.5 pr-3 font-medium">完成时间</th>
                    <th className="py-1.5 font-medium">错误</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentFinished.map((row) => (
                    <tr key={row.taskId} className="border-b border-line last:border-b-0">
                      <td className="max-w-44 truncate py-2 pr-3 text-[12px]">{row.contentTitle}</td>
                      <td className="py-2 pr-3 text-[12px] text-fg-muted">{PLATFORM_LABEL[row.platform]}</td>
                      <td className="py-2 pr-3">
                        <StatusChip
                          tone={row.status === 'success' ? 'success' : 'danger'}
                          label={row.status === 'success' ? '成功' : '失败'}
                        />
                      </td>
                      <td className="py-2 pr-3 text-[12px] text-fg-muted">{formatTime(row.finishedAt)}</td>
                      <td className="max-w-32 truncate py-2 text-[11px] text-danger" title={row.errorMessage ?? ''}>
                        {row.errorCode ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="按平台">
            {summary.byPlatform.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-fg-muted">暂无数据</div>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {summary.byPlatform.map((entry) => (
                  <div key={entry.platform} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <span className="text-[13px] font-medium">{PLATFORM_LABEL[entry.platform]}</span>
                    <span className="flex items-center gap-2 text-[12px] text-fg-muted">
                      <StatusDot tone={entry.failed > 0 ? 'danger' : entry.success > 0 ? 'success' : 'idle'} />
                      {entry.total} 个（成功 {entry.success} / 失败 {entry.failed}）
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="失败原因 TOP 5">
            {summary.topErrors.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-fg-muted">没有失败记录 🎉</div>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {summary.topErrors.map((entry) => (
                  <div key={entry.errorCode} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <span className="truncate font-mono text-[11px]">{entry.errorCode}</span>
                    <span className="shrink-0 text-[12px] text-fg-muted">
                      ×{entry.count} · {formatTime(entry.lastAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}