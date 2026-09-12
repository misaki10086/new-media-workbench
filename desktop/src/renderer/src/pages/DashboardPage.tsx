import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CheckCircle2, FileEdit, Plus, RefreshCw, Upload, Users } from 'lucide-react';
import { ACCOUNT_LOGIN_STATUS_META, PLATFORM_LABEL } from '@shared/constants/platforms';
import { Card, StatusDot, TaskStatusChip, formatDuration, formatTime } from '@renderer/components/ui';
import { useDashboardData } from '@renderer/stores/dashboardStore';

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: string }): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
      <div>
        <div className="text-[20px] font-semibold leading-6">{value}</div>
        <div className="text-[11px] text-fg-muted">{label}</div>
      </div>
    </div>
  );
}

function EmptyHint({ text, action }: { text: string; action?: ReactNode }): ReactNode {
  return (
    <div className="py-6 text-center text-[12px] text-fg-muted">
      <div>{text}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function DashboardPage(): ReactNode {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useDashboardData();
  const { stats, accounts, recentTasks, recentContents } = data;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold">工作台</h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">今天的发布安排与账号状态一览</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>
      ) : null}

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="今日待发布" value={stats.todayPending} icon={<CalendarCheck size={16} />} tone="bg-accent-soft text-accent" />
        <StatCard label="已完成" value={stats.todayCompleted} icon={<CheckCircle2 size={16} />} tone="bg-success-soft text-success" />
        <StatCard label="失败" value={stats.todayFailed} icon={<AlertTriangle size={16} />} tone="bg-danger-soft text-danger" />
        <StatCard label="草稿" value={stats.drafts} icon={<FileEdit size={16} />} tone="bg-idle-soft text-fg-muted" />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_300px] items-start gap-4">
        <div className="flex flex-col gap-4">
          <Card
            title="发布任务"
            extra={
              <button type="button" onClick={() => navigate('/tasks')} className="text-[11px] text-accent hover:underline">
                查看全部
              </button>
            }
          >
            {recentTasks.length === 0 ? (
              <EmptyHint text="还没有发布任务。导入内容后即可创建任务。" />
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{task.contentTitle}</div>
                      <div className="mt-0.5 text-[11px] text-fg-muted">
                        {PLATFORM_LABEL[task.platform]} · {task.startedAt ? `开始于 ${formatTime(task.startedAt)}` : '未开始'}
                        {task.status === 'running' ? ` · ${task.progress}%` : ''}
                      </div>
                    </div>
                    {task.status === 'running' ? (
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-idle-soft">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${task.progress}%` }} />
                      </div>
                    ) : null}
                    <TaskStatusChip status={task.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="最近内容"
            extra={
              <button type="button" onClick={() => navigate('/content')} className="text-[11px] text-accent hover:underline">
                内容库
              </button>
            }
          >
            {recentContents.length === 0 ? (
              <EmptyHint
                text="内容库还是空的。把视频文件拖进内容库即可开始。"
                action={
                  <button type="button" onClick={() => navigate('/content')} className="text-[11px] text-accent hover:underline">
                    前往内容库导入
                  </button>
                }
              />
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {recentContents.map((content) => (
                  <div key={content.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="relative flex h-12 w-[74px] shrink-0 items-center justify-center rounded-lg border border-line bg-panel-hover text-fg-muted">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
                      {content.durationSeconds > 0 ? (
                        <span className="absolute bottom-0.5 right-1 rounded bg-black/50 px-1 text-[9px] text-white">
                          {formatDuration(content.durationSeconds)}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{content.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-fg-muted">
                        {content.tags.length > 0 ? content.tags.map((tag) => `#${tag}`).join(' ') : content.description || '暂无标签'}
                      </div>
                    </div>
                    <span className="text-[11px] text-fg-muted">{formatTime(content.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card
            title="账号状态"
            extra={
              <button type="button" onClick={() => navigate('/accounts')} className="text-[11px] text-accent hover:underline">
                管理
              </button>
            }
          >
            {accounts.length === 0 ? (
              <EmptyHint
                text="还没有连接平台账号。"
                action={
                  <button type="button" onClick={() => navigate('/accounts')} className="text-[11px] text-accent hover:underline">
                    前往账号管理
                  </button>
                }
              />
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {accounts.map((account) => {
                  const meta = ACCOUNT_LOGIN_STATUS_META[account.loginStatus];
                  return (
                    <div key={account.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{account.name}</div>
                        <div className="text-[11px] text-fg-muted">{PLATFORM_LABEL[account.platform]}</div>
                      </div>
                      <span className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                        <StatusDot tone={meta.tone} pulse={account.loginStatus === 'security_check'} />
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="快速开始">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate('/content')}
                className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13px] transition-colors hover:bg-panel-hover"
              >
                <Upload size={15} className="text-fg-muted" />
                导入视频内容
              </button>
              <button
                type="button"
                onClick={() => navigate('/accounts')}
                className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13px] transition-colors hover:bg-panel-hover"
              >
                <Users size={15} className="text-fg-muted" />
                连接平台账号
              </button>
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13px] transition-colors hover:bg-panel-hover"
              >
                <Plus size={15} className="text-fg-muted" />
                查看发布任务
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
              浏览器自动化发布默认停在发布页，需要你点击「确认发布」后才会真正发送。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
