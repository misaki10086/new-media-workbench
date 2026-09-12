import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BarChart3, CalendarClock, Clapperboard, Film, LayoutDashboard, Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { to: '/content', label: '内容库', icon: Film },
  { to: '/tasks', label: '发布任务', icon: CalendarClock },
  { to: '/accounts', label: '账号管理', icon: Users },
  { to: '/assets', label: '素材库', icon: Clapperboard },
  { to: '/analytics', label: '数据记录', icon: BarChart3 },
] as const;

export function Sidebar(): ReactNode {
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.newMedia.app.getVersion().then(setVersion);
  }, []);

  return (
    <nav className="flex w-[212px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-fg-muted hover:bg-panel-hover hover:text-fg'
              }`
            }
          >
            <item.icon size={16} strokeWidth={1.8} />
            {item.label}
          </NavLink>
        ))}
      </div>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `mx-3 mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
            isActive
              ? 'bg-accent-soft font-medium text-accent'
              : 'text-fg-muted hover:bg-panel-hover hover:text-fg'
          }`
        }
      >
        <Settings size={16} strokeWidth={1.8} />
        设置
      </NavLink>
      <div className="border-t border-line px-4 py-2.5 text-[10px] text-fg-muted">
        新媒体工作台 v{version || '0.1.0'} · Phase 1
      </div>
    </nav>
  );
}
