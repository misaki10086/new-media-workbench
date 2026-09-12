import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { appDirectories } from '../appPaths';
import { devLog } from '../services/logger';

export interface DiagnosticRecord {
  time: string;
  step: string;
  kind: 'step_start' | 'step_ok' | 'step_fail' | 'selector' | 'text' | 'screenshot' | 'note';
  url?: string;
  title?: string;
  selector?: string;
  visible?: boolean;
  box?: { x: number; y: number; width: number; height: number } | null;
  text?: string;
  message?: string;
}

/**
 * 真实页面兼容性诊断记录器（Phase 5.1）。
 * 每个任务一份 JSONL：logs/diagnostics/task-{id}.jsonl。
 * 启用方式：--seed-dryrun 或 PUBLISH_DIAGNOSTICS=1。
 */
export class DiagnosticsRecorder {
  private readonly filePath: string;

  constructor(taskId: number) {
    const dir = join(appDirectories().logs, 'diagnostics');
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, `task-${taskId}.jsonl`);
  }

  record(entry: Omit<DiagnosticRecord, 'time'>): void {
    const line: DiagnosticRecord = { time: new Date().toISOString(), ...entry };
    try {
      appendFileSync(this.filePath, `${JSON.stringify(line)}\n`, 'utf8');
    } catch (error) {
      devLog.error(`diagnostics write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
