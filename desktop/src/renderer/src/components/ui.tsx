import type { ReactNode } from 'react';
import type { PublishTaskStatus } from '@shared/types/domain';
import { PUBLISH_TASK_STATUS_META } from '@shared/constants/platforms';

type Tone = 'success' | 'warning' | 'danger' | 'accent' | 'idle';

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
  idle: 'bg-idle',
};

const TONE_CHIP: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent',
  idle: 'bg-idle-soft text-fg-muted',
};

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }): ReactNode {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse ? <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${TONE_DOT[tone]} opacity-60`} /> : null}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
    </span>
  );
}

export function StatusChip({ tone, label }: { tone: Tone; label: string }): ReactNode {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[tone]}`}>
      {label}
    </span>
  );
}

export function TaskStatusChip({ status }: { status: PublishTaskStatus }): ReactNode {
  const meta = PUBLISH_TASK_STATUS_META[status];
  return <StatusChip tone={meta.tone} label={meta.label} />;
}

export function Card({ title, extra, children, className = '' }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }): ReactNode {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {extra}
        </header>
      ) : null}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
