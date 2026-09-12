import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '@shared/types/ipc';

const EMPTY_SUMMARY: DashboardSummary = {
  stats: { todayPending: 0, todayCompleted: 0, todayFailed: 0, drafts: 0 },
  accounts: [],
  recentTasks: [],
  recentContents: [],
};

interface DashboardDataState {
  data: DashboardSummary;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Dashboard 数据：通过 IPC 实时查询 SQLite，无任何本地 mock。 */
export function useDashboardData(): DashboardDataState {
  const [data, setData] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setData(await window.newMedia.dashboard.summary());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工作台数据失败');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  return { data, loading, error, refresh };
}
