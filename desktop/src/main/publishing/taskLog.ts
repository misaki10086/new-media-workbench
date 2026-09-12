import { getDatabase } from '../database/db';
import { publishLogs } from '../database/schema';
import { devLog } from '../services/logger';

/** 调度层动作（Phase 6）：全部写入 publish_logs，UI 时间线直接复用。 */
export type TaskAction =
  | 'TASK_CREATED'
  | 'TASK_SCHEDULED'
  | 'TASK_STARTED'
  | 'TASK_WAITING'
  | 'TASK_RETRY'
  | 'TASK_PAUSED'
  | 'TASK_RESUMED'
  | 'TASK_CANCELLED'
  | 'TASK_SUCCESS'
  | 'TASK_FAILED';

export function logTaskAction(taskId: number, action: TaskAction, message: string, metadata?: string): void {
  const line = `[${action}] ${message}${metadata ? ` · ${metadata}` : ''}`;
  devLog.info(`[task ${taskId}] ${line}`);
  getDatabase()
    .insert(publishLogs)
    .values({ taskId, level: 'info', message: line, createdAt: new Date().toISOString() })
    .run();
}