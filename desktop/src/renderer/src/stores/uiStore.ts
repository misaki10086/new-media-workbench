import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePreference } from '@shared/types/domain';

interface UiState {
  theme: ThemePreference;
  searchQuery: string;
  setTheme: (theme: ThemePreference) => void;
  setSearchQuery: (query: string) => void;
}

/** 界面偏好（主题 / 搜索词），持久化到 localStorage。
 * 发布确认模式等主进程需要的配置存 SQLite settings 表（见 settingsStore）。
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      searchQuery: '',
      setTheme: (theme) => set({ theme }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: 'nmw-ui-preferences',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);

/** 解析主题偏好为实际生效的明暗模式。 */
export function resolveTheme(theme: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}
