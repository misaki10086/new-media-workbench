import { statSync } from 'node:fs';
import type { PublishStep, PublishTaskStatus, WaitingReason } from '@shared/types/domain';

/** 各步骤对应的进度百分比。 */
export const STEP_PROGRESS: Record<PublishStep, number> = {
  CREATED: 0,
  CHECKING_BROWSER: 5,
  CHECKING_LOGIN: 12,
  OPENING_CREATOR: 20,
  SELECTING_VIDEO: 30,
  UPLOADING_VIDEO: 45,
  WAITING_UPLOAD: 62,
  FILLING_CONTENT: 75,
  SETTING_COVER: 85,
  READY_FOR_REVIEW: 95,
  WAITING_USER_CONFIRM: 95,
  PUBLISHING: 99,
  SUCCESS: 100,
  FAILED: 100,
  CANCELLED: 100,
};

/** 自动执行的步骤序列（READY_FOR_REVIEW 之后进入人工确认）。 */
export const EXECUTABLE_STEPS: PublishStep[] = [
  'CHECKING_BROWSER',
  'CHECKING_LOGIN',
  'OPENING_CREATOR',
  'SELECTING_VIDEO',
  'UPLOADING_VIDEO',
  'WAITING_UPLOAD',
  'FILLING_CONTENT',
  'SETTING_COVER',
];

export function stepIndex(step: PublishStep | null): number {
  if (!step) return 0;
  const index = EXECUTABLE_STEPS.indexOf(step);
  return index === -1 ? 0 : index;
}

/** 失败后允许原地恢复的等待状态（重新进入当前步骤，不从头开始）。 */
export function canResume(status: PublishTaskStatus, step: PublishStep | null): boolean {
  if (status === 'waiting_user') {
    return ['CHECKING_LOGIN', 'WAITING_UPLOAD', 'FILLING_CONTENT', 'SETTING_COVER', 'WAITING_USER_CONFIRM'].includes(step ?? '');
  }
  if (status === 'failed') {
    // 有明确断点的失败：从失败步骤重试；其余交给「重新从头执行」。
    return stepIndex(step) > stepIndex('CREATED') && stepIndex(step) < EXECUTABLE_STEPS.length;
  }
  return false;
}

/** 等待原因 → 提示文案（UI 横幅复用）。 */
export const WAITING_REASON_LABEL: Record<WaitingReason, string> = {
  LOGIN_REQUIRED: '请登录抖音：浏览器已打开创作者中心，完成登录后点击「检查登录状态」',
  SECURITY_CHECK: '需要人工完成安全验证：程序不会自动处理验证码或滑块',
  USER_CONFIRM: '内容已在浏览器中准备完成，请检查页面后确认发布',
  PAUSED_BY_USER: '任务已暂停，点击「继续」从当前步骤恢复',
};

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'] as const;

export interface ContentFileCheck {
  ok: boolean;
  errorCode?: 'FILE_NOT_FOUND' | 'EMPTY_FILE' | 'UNSUPPORTED_VIDEO_FORMAT' | 'FILE_TOO_LARGE';
  message?: string;
}

/** 发布前的内容文件校验（存在 / 可读 / 扩展名 / 大小）。 */
export function checkVideoFile(videoPath: string | null, sizeLimitBytes = 4 * 1024 ** 3): ContentFileCheck {
  if (!videoPath) return { ok: false, errorCode: 'FILE_NOT_FOUND', message: '内容没有可用的视频文件' };
  let stat: { size: number };
  try {
    stat = statSync(videoPath);
  } catch {
    return { ok: false, errorCode: 'FILE_NOT_FOUND', message: `视频文件不存在：${videoPath}` };
  }
  if (stat.size === 0) return { ok: false, errorCode: 'EMPTY_FILE', message: '视频文件为空' };
  if (stat.size > sizeLimitBytes) {
    return { ok: false, errorCode: 'FILE_TOO_LARGE', message: `视频文件超过 ${Math.round(sizeLimitBytes / 1024 ** 3)}GB 限制` };
  }
  const extension = videoPath.split('.').pop()?.toLowerCase();
  if (!extension || !(VIDEO_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, errorCode: 'UNSUPPORTED_VIDEO_FORMAT', message: `不支持的视频格式 .${extension ?? ''}（仅 mp4 / mov / webm）` };
  }
  return { ok: true };
}

/** 步骤执行失败：带结构化错误码（对应任务 errorCode）。 */
export class PublishExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export function classifyPlaywrightError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/Timeout|timeout/i.test(message)) return { code: 'PAGE_LOAD_TIMEOUT', message: '页面操作超时' };
  if (/closed|disconnected|Target closed|crash/i.test(message)) return { code: 'BROWSER_CRASHED', message: '浏览器已关闭或崩溃' };
  if (/ECONNREFUSED|ENOTFOUND|net::|tunneling/i.test(message)) return { code: 'NETWORK_ERROR', message: '网络错误' };
  return { code: 'UNKNOWN', message: message.slice(0, 300) };
}