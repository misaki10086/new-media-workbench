import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  Check,
  ChevronRight,
  Circle,
  LoaderCircle,
  PauseCircle,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react';
import {
  PLATFORM_LABEL,
  PUBLISH_STEP_LABEL,
  PUBLISH_STEPS_IN_ORDER,
  PUBLISH_TASK_STATUS_META,
  TASK_PRIORITY_META,
  WAITING_REASON_META,
} from '@shared/constants/platforms';
import type { PublishTask, TaskLogEntry, TaskPriority } from '@shared/types/domain';
import { StatusChip } from '@renderer/components/ui';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** datetime-local 输入值 ↔ ISO 字符串。 */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface DetailState {
  task: PublishTask;
  logs: TaskLogEntry[];
}

export function TasksPage(): ReactNode {
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadTasks = useCallback(async (): Promise<void> => {
    try {
      setTasks(await window.newMedia.publish.list());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务列表加载失败');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadTasks();
      setLoading(false);
    })();
    const timer = setInterval(() => void loadTasks(), 2500);
    return () => clearInterval(timer);
  }, [loadTasks]);

  const runAction = useCallback(
    async (id: number, action: () => Promise<unknown>, thenRefresh = true): Promise<void> => {
      setBusyId(id);
      setError(null);
      try {
        await action();
        if (thenRefresh) await loadTasks();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '操作失败');
      } finally {
        setBusyId(null);
      }
    },
    [loadTasks],
  );

  async function openDetail(id: number): Promise<void> {
    try {
      const [task, logs] = await Promise.all([window.newMedia.publish.get(id), window.newMedia.publish.logs(id)]);
      setDetail({ task, logs });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务详情加载失败');
    }
  }

  const refreshDetail = useCallback(async (): Promise<void> => {
    if (!detail) return;
    await openDetail(detail.task.id);
  }, [detail?.task.id]);

  const count = (status: PublishTask['status']): number => tasks.filter((task) => task.status === status).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold">发布任务</h1>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            本地队列调度：同一时间只执行一个任务；内容准备好后停在发布页，由你确认后才真正发布
          </p>
        </div>
        <button
          type="button"
          aria-label="刷新任务"
          onClick={() => void loadTasks()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-panel-hover hover:text-fg"
        >
          <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 顶部统计 */}
      <div className="mb-4 grid grid-cols-5 gap-2 text-center">
        {[
          { label: '待发布', value: count('pending'), tone: 'text-fg' },
          { label: '定时任务', value: count('scheduled'), tone: 'text-accent' },
          { label: '发布中', value: count('running'), tone: 'text-accent' },
          { label: '成功', value: count('success'), tone: 'text-success' },
          { label: '失败', value: count('failed'), tone: 'text-danger' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-line bg-panel px-2 py-2.5">
            <div className={`text-[18px] font-semibold leading-6 ${item.tone}`}>{item.value}</div>
            <div className="text-[11px] text-fg-muted">{item.label}</div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
          <button type="button" aria-label="关闭提示" onClick={() => setError(null)}>
            <X size={13} />
          </button>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel px-6 py-14 text-center">
          <p className="text-[13px] text-fg">还没有发布任务</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-fg-muted">
            去「内容库」选择一条视频内容，创建抖音发布任务后回到这里。
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line bg-bg text-[11px] text-fg-muted">
                <th className="px-4 py-2.5 font-medium">内容</th>
                <th className="px-4 py-2.5 font-medium">平台 / 账号</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">计划时间</th>
                <th className="px-4 py-2.5 font-medium">优先级</th>
                <th className="px-4 py-2.5 font-medium">重试</th>
                <th className="px-4 py-2.5 font-medium">最后错误</th>
                <th className="px-4 py-2.5 font-medium">创建</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const meta = PUBLISH_TASK_STATUS_META[task.status];
                const priorityMeta = TASK_PRIORITY_META[task.priority];
                const busy = busyId === task.id;
                return (
                  <tr
                    key={task.id}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-panel-hover/50"
                    onClick={() => void openDetail(task.id)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="max-w-44 truncate text-[13px] font-medium">{task.contentTitle}</div>
                      <div className="text-[11px] text-fg-muted">任务 #{task.id}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      <div>{PLATFORM_LABEL[task.platform]}</div>
                      <div className="text-[11px] text-fg-muted">{task.accountName ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip tone={meta.tone} label={meta.label} />
                      {task.status === 'running' ? (
                        <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-idle-soft">
                          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${task.progress}%` }} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-fg-muted">
                      {task.scheduledAt ? formatTime(task.scheduledAt) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip tone={priorityMeta.tone} label={priorityMeta.label} />
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-fg-muted">
                      {task.retryCount > 0 ? `${task.retryCount}/${task.maxRetries}` : '—'}
                    </td>
                    <td className="max-w-36 truncate px-4 py-2.5 text-[11px] text-fg-muted" title={task.errorMessage ?? ''}>
                      {task.errorMessage ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-fg-muted">{formatTime(task.createdAt)}</td>
                    <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {task.status === 'pending' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.start(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-fg disabled:opacity-50"
                          >
                            <Play size={10} /> {busy ? '执行中…' : '立即执行'}
                          </button>
                        ) : null}
                        {task.status === 'failed' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.start(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted hover:text-fg disabled:opacity-50"
                          >
                            <RotateCcw size={10} /> 重新执行
                          </button>
                        ) : null}
                        {task.status === 'paused' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.resume(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-fg disabled:opacity-50"
                          >
                            <Play size={10} /> 恢复
                          </button>
                        ) : null}
                        {task.status === 'waiting_user' && task.waitingReason !== 'USER_CONFIRM' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.resume(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-fg disabled:opacity-50"
                          >
                            <Play size={10} /> {busy ? '恢复中…' : '继续'}
                          </button>
                        ) : null}
                        {task.status === 'running' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.pause(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted hover:text-fg disabled:opacity-50"
                          >
                            <PauseCircle size={10} /> 暂停
                          </button>
                        ) : null}
                        {task.status === 'pending' || task.status === 'scheduled' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.pause(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted hover:text-fg disabled:opacity-50"
                          >
                            <PauseCircle size={10} /> 暂停
                          </button>
                        ) : null}
                        {(task.status === 'pending' || task.status === 'scheduled' || task.status === 'paused' || task.status === 'running' || task.status === 'waiting_user') ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(task.id, () => window.newMedia.publish.cancel(task.id))}
                            className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[11px] text-fg-muted hover:text-danger disabled:opacity-50"
                          >
                            <Square size={10} /> 取消
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label="查看详情"
                          onClick={() => void openDetail(task.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:text-fg"
                        >
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail ? (
        <TaskDetailPanel
          detail={detail}
          busy={busyId === detail.task.id}
          onAction={runAction}
          onRefresh={() => void refreshDetail()}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function TaskDetailPanel({
  detail,
  busy,
  onAction,
  onRefresh,
  onClose,
}: {
  detail: DetailState;
  busy: boolean;
  onAction: (id: number, action: () => Promise<unknown>, thenRefresh?: boolean) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}): ReactNode {
  const { task, logs } = detail;
  const waitingMeta = task.waitingReason ? WAITING_REASON_META[task.waitingReason] : null;
  const [scheduleValue, setScheduleValue] = useState(toLocalInputValue(task.scheduledAt));
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (task.status === 'running' || task.status === 'waiting_user') {
      const timer = setInterval(onRefresh, 2500);
      return () => clearInterval(timer);
    }
  }, [task.status, onRefresh]);

  const stepOrder = PUBLISH_STEPS_IN_ORDER.map((item) => item.step);
  const taskIndex = stepOrder.indexOf(task.currentStep);

  async function saveSchedule(): Promise<void> {
    const scheduledAt = scheduleValue ? new Date(scheduleValue).toISOString() : null;
    await onAction(
      task.id,
      () => window.newMedia.publish.update({ id: task.id, scheduledAt, priority }),
      true,
    );
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[640px] flex-col rounded-xl border border-line bg-panel shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold">{task.contentTitle}</h3>
            <div className="text-[11px] text-fg-muted">
              {PLATFORM_LABEL[task.platform]} → {task.accountName ?? '未知账号'} · 任务 #{task.id} ·{' '}
              {TASK_PRIORITY_META[task.priority].label}优先级
            </div>
          </div>
          <StatusChip tone={PUBLISH_TASK_STATUS_META[task.status].tone} label={PUBLISH_TASK_STATUS_META[task.status].label} />
        </div>

        {/* 醒目的等待确认横幅 */}
        {task.status === 'waiting_user' && task.waitingReason === 'USER_CONFIRM' ? (
          <div className="mx-4 mt-3 rounded-lg border-2 border-accent bg-accent-soft px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-accent">
              <PauseCircle size={15} />
              已完成发布准备，请检查抖音页面后手动确认发布
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-fg">
              浏览器已停在发布页，视频、标题、话题、封面均已就绪。程序不会自动点击发布——请打开浏览器检查，确认无误后点「确认发布」。
            </p>
          </div>
        ) : waitingMeta && task.status === 'waiting_user' ? (
          <div className="mx-4 mt-3 rounded-lg border border-line bg-panel-hover px-3 py-2.5 text-[12px]">
            <div className="flex items-center gap-1.5 font-medium">
              <TriangleAlert size={13} className="text-warning" />
              {waitingMeta.label}
            </div>
            <p className="mt-1 text-fg-muted">
              {task.waitingReason === 'LOGIN_REQUIRED'
                ? '浏览器已打开创作者中心，请完成登录后点击「继续」重新检查。程序不会代替你输入账号信息。'
                : task.waitingReason === 'SECURITY_CHECK'
                  ? '请在浏览器中完成安全验证。程序不会自动处理验证码、滑块或任何风控。'
                  : '任务已暂停，点「继续」从当前步骤恢复。'}
            </p>
          </div>
        ) : null}

        {task.status === 'failed' && task.errorMessage ? (
          <div className="mx-4 mt-3 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] text-danger">
            <span className="font-medium">{task.errorCode ?? 'FAILED'}：</span>
            {task.errorMessage}
            {task.nextRetryAt ? (
              <span className="ml-2 text-fg-muted">将在 {formatTime(task.nextRetryAt)} 自动重试</span>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* 任务信息 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-panel-hover/60 px-3 py-2.5 text-[11px]">
            <div>浏览器 Profile：<span className="text-fg">{task.browserProfileId ? `#${task.browserProfileId}` : '—'}</span></div>
            <div>重试次数：<span className="text-fg">{task.retryCount} / {task.maxRetries}</span></div>
            <div>计划时间：<span className="text-fg">{task.scheduledAt ? formatTime(task.scheduledAt) : '立即'}</span></div>
            <div>当前步骤：<span className="text-fg">{PUBLISH_STEP_LABEL[task.currentStep] ?? task.currentStep}</span></div>
          </div>

          {/* 计划时间 + 优先级编辑 */}
          {(task.status === 'pending' || task.status === 'scheduled' || task.status === 'paused') ? (
            <div className="mt-3 rounded-lg border border-line px-3 py-2.5">
              <div className="mb-2 text-[11px] font-medium text-fg-muted">计划发布与优先级</div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={scheduleValue}
                    onChange={(event) => setScheduleValue(event.target.value)}
                    className="h-8 flex-1 rounded-lg border border-line bg-bg px-2 text-[12px] text-fg outline-none focus:border-accent"
                  />
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    className="h-8 rounded-lg border border-line bg-bg px-2 text-[12px] text-fg outline-none focus:border-accent"
                  >
                    <option value="HIGH">高优先级</option>
                    <option value="NORMAL">普通优先级</option>
                    <option value="LOW">低优先级</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveSchedule()}
                    className="h-8 rounded-lg bg-accent px-3 text-[12px] font-medium text-accent-fg disabled:opacity-50"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setScheduleValue(toLocalInputValue(task.scheduledAt));
                      setPriority(task.priority);
                    }}
                    className="h-8 rounded-lg border border-line px-3 text-[12px] text-fg-muted"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-[12px] text-fg-muted">
                  <span className="flex items-center gap-1.5">
                    <CalendarClock size={12} />
                    {task.scheduledAt ? formatTime(task.scheduledAt) : '立即准备（队列到点执行）'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-fg-muted hover:text-fg"
                    >
                      修改定时 / 优先级
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* 步骤时间线 */}
          <div className="mb-2 mt-4 flex items-center justify-between text-[11px] text-fg-muted">
            <span>执行步骤</span>
            {task.status === 'running' ? <span>{task.progress}%</span> : null}
          </div>
          <ol className="flex flex-col">
            {PUBLISH_STEPS_IN_ORDER.map((item, index) => {
              const done = task.lastCompletedStep ? stepOrder.indexOf(task.lastCompletedStep) >= index : index < taskIndex;
              const active = index === taskIndex && task.status !== 'success' && task.status !== 'failed';
              return (
                <li key={item.step} className="flex items-center gap-2 py-1.5 text-[12px]">
                  {done ? (
                    <Check size={13} className="shrink-0 text-success" />
                  ) : active ? (
                    <LoaderCircle size={13} className="shrink-0 animate-spin text-accent" />
                  ) : task.status === 'failed' && index === taskIndex ? (
                    <XCircle size={13} className="shrink-0 text-danger" />
                  ) : (
                    <Circle size={13} className="shrink-0 text-idle" strokeWidth={1.6} />
                  )}
                  <span className={done ? 'text-fg' : active ? 'font-medium text-accent' : 'text-fg-muted'}>
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* 调度与步骤日志 */}
          <div className="mb-2 mt-4 text-[11px] text-fg-muted">执行日志</div>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-bg px-3 py-2 font-mono text-[10.5px] leading-relaxed">
            {logs.length === 0 ? (
              <span className="text-fg-muted">暂无日志</span>
            ) : (
              logs.map((log, index) => (
                <div key={`${log.time}-${index}`} className="flex gap-2">
                  <span className="shrink-0 text-fg-muted">{formatTime(log.time)}</span>
                  <span className={log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : 'text-fg'}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <div className="text-[11px] text-fg-muted">
            创建 {formatTime(task.createdAt)} · 更新 {formatTime(task.updatedAt)}
          </div>
          <div className="flex gap-2">
            {task.status === 'waiting_user' && task.waitingReason === 'USER_CONFIRM' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAction(task.id, () => window.newMedia.browserProfile.launch(task.browserProfileId as number), false)}
                  className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  打开浏览器检查
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAction(task.id, () => window.newMedia.publish.confirm(task.id), false)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
                >
                  {busy ? '发布中…' : '确认发布'}
                </button>
              </>
            ) : task.status === 'waiting_user' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(task.id, () => window.newMedia.publish.resume(task.id), false)}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
              >
                {task.waitingReason === 'LOGIN_REQUIRED' ? '检查登录状态' : '继续'}
              </button>
            ) : null}
            {(task.status === 'pending' || task.status === 'scheduled' || task.status === 'paused' || task.status === 'running' || task.status === 'waiting_user') ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(task.id, () => window.newMedia.publish.cancel(task.id), false)}
                className="rounded-lg border border-danger px-3 py-1.5 text-[12px] text-danger disabled:opacity-50"
              >
                取消任务
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}