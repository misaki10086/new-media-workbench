import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { AccountsPage } from './pages/AccountsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AssetsPage } from './pages/AssetsPage';
import { ContentPage } from './pages/ContentPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { resolveTheme, useUiStore } from './stores/uiStore';

/** 根据主题偏好同步 <html> 的 dark class；跟随系统时监听系统变化。 */
function useThemeEffect(): void {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const resolved = resolveTheme(theme, media.matches);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    };
    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [theme]);
}

export function App(): ReactNode {
  useThemeEffect();
  const location = useLocation();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main key={location.pathname} className="min-w-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/content" element={<ContentPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
