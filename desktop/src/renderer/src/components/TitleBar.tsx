import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Search, Settings, Sun, X } from 'lucide-react';
import { useUiStore } from '@renderer/stores/uiStore';
import { StatusDot } from './ui';

function WindowButton({ onClick, children, danger = false, label }: { onClick: () => void; children: ReactNode; danger?: boolean; label: string }): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg ${
        danger ? 'hover:!bg-danger hover:!text-white' : ''
      }`}
    >
      {children}
    </button>
  );
}

/** 顶部标题栏：拖拽区域 + 搜索 + 运行状态 + 窗口控制。 */
export function TitleBar(): ReactNode {
  const navigate = useNavigate();
  const [maximized, setMaximized] = useState(false);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  useEffect(() => {
    const unsubscribe = window.newMedia.window.onMaximizedChange(setMaximized);
    return unsubscribe;
  }, []);

  // 主题切换在 App 层同步 <html> class；这里结合偏好判断当前是否深色，用于切换图标。
  const isDark = theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'));

  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel pl-3 select-none">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-fg">媒</div>
        <span className="text-[12px] font-semibold tracking-wide">新媒体工作台</span>
      </div>

      <div className="app-no-drag ml-4 flex h-7 w-72 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 text-fg-muted transition-colors focus-within:border-accent">
        <Search size={13} />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索内容、任务、素材…"
          className="h-full w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-muted"
        />
      </div>

      <div className="app-no-drag ml-auto flex items-center gap-4 pr-1 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1.5"><StatusDot tone="idle" />运行状态：空闲</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="idle" />浏览器：未运行</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="idle" />任务：0 进行中</span>
      </div>

      <div className="app-no-drag flex items-center">
        <button
          type="button"
          aria-label="切换主题"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          type="button"
          aria-label="设置"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
          onClick={() => navigate('/settings')}
        >
          <Settings size={15} />
        </button>
      </div>

      <div className="app-no-drag ml-1 flex h-11 items-center">
        <WindowButton label="最小化" onClick={() => void window.newMedia.window.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="1" fill="currentColor" /></svg>
        </WindowButton>
        <WindowButton label={maximized ? '还原' : '最大化'} onClick={() => void window.newMedia.window.toggleMaximize()}>
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="2.5" width="7.5" height="7.5" fill="none" stroke="currentColor" /><path d="M2.5 2.5 V0 H10 V7.5 H7.5" fill="none" stroke="currentColor" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
          )}
        </WindowButton>
        <WindowButton label="关闭" danger onClick={() => void window.newMedia.window.close()}>
          <X size={14} />
        </WindowButton>
      </div>
    </header>
  );
}
