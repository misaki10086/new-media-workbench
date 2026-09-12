import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Phase 1 的页面占位：说明该页职责与计划落地的 Phase。 */
export function PagePlaceholder({ icon: Icon, title, phase, description, bullets }: { icon: LucideIcon; title: string; phase: string; description: string; bullets: string[] }): ReactNode {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[17px] font-semibold">{title}</h1>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={22} strokeWidth={1.6} />
        </span>
        <h2 className="mt-4 text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-fg-muted">{description}</p>
        <ul className="mt-4 flex flex-col gap-1.5 text-left text-[12px] text-fg-muted">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-idle" />
              {bullet}
            </li>
          ))}
        </ul>
        <span className="mt-5 rounded-full bg-idle-soft px-2.5 py-1 text-[11px] text-fg-muted">
          {phase} 实现
        </span>
      </div>
    </div>
  );
}
