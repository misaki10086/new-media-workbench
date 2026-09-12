/**
 * 全局共享的领域类型。
 * Phase 2 接入 SQLite 后，这些类型同时作为 Drizzle 表结构与 IPC 传输结构的基础。
 */

export type Platform = BuiltinPlatform | (string & {});

export type BuiltinPlatform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'wechat_channels';

/** 用户自定义平台（自定义平台接口：名称 + 创作者中心地址即可接入）。 */
export interface CustomPlatform {
  id: number;
  key: string;
  name: string;
  creatorUrl: string;
  /** 未登录跳转地址的匹配特征（正则来源），用于登录状态检测。 */
  loginUrlPattern: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ContentStatus =
  | 'draft'
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export type PublishTaskStatus =
  | 'pending'
  | 'scheduled'
  | 'paused'
  | 'running'
  | 'waiting_user'
  | 'success'
  | 'failed'
  | 'cancelled';

/** 任务优先级：HIGH > NORMAL > LOW。 */
export type TaskPriority = 'HIGH' | 'NORMAL' | 'LOW';

/** 发布任务执行步骤（状态机枚举，禁止自由发挥）。 */
export type PublishStep =
  | 'CREATED'
  | 'CHECKING_BROWSER'
  | 'CHECKING_LOGIN'
  | 'OPENING_CREATOR'
  | 'SELECTING_VIDEO'
  | 'UPLOADING_VIDEO'
  | 'WAITING_UPLOAD'
  | 'FILLING_CONTENT'
  | 'SETTING_COVER'
  | 'READY_FOR_REVIEW'
  | 'WAITING_USER_CONFIRM'
  | 'PUBLISHING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

/** waiting_user 时的人工处理原因。 */
export type WaitingReason = 'LOGIN_REQUIRED' | 'SECURITY_CHECK' | 'USER_CONFIRM' | 'PAUSED_BY_USER';


export type BrowserProfileStatus = 'stopped' | 'running' | 'crashed';

/** 登录检测失败 / 需要人工介入的原因码。 */
export type LoginCheckReason =
  | 'LOGIN_REQUIRED'
  | 'SECURITY_CHECK_REQUIRED'
  | 'BROWSER_NOT_RUNNING'
  | 'PROFILE_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'PAGE_LOAD_TIMEOUT'
  | 'PLATFORM_NOT_SUPPORTED'
  | 'UNKNOWN';

/** 平台适配器返回的登录检测结果。 */
export interface LoginStatus {
  loggedIn: boolean;
  username?: string;
  displayName?: string;
  checkedAt: string;
  /** loggedIn=false 时的原因码。 */
  reason?: LoginCheckReason;
}

/** 登录检测结果在账号表里的缓存形态。 */
export type AccountLoginStatus = 'unknown' | 'logged_in' | 'logged_out' | 'security_check';

/** 一次登录检测的完整回执（含调试信息）。 */
export interface LoginCheckResult {
  login: LoginStatus;
  /** 检测过程步骤（开发调试面板展示）。 */
  steps: string[];
  finalUrl: string;
  /** 检测耗时毫秒。 */
  durationMs: number;
}

/** 浏览器 Profile：持久化 Chromium 用户目录的元数据（登录态本身在磁盘，不入库）。 */
export interface BrowserProfile {
  id: number;
  platform: Platform;
  name: string;
  platformName: string;
  /** browser-profiles 下的目录名，例如 douyin-main。 */
  profilePath: string;
  browserType: 'chromium';
  status: BrowserProfileStatus;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 平台账号（含关联 Profile 与登录状态缓存）。 */
export interface Account {
  id: number;
  platform: Platform;
  name: string;
  profileId: number;
  loginStatus: AccountLoginStatus;
  loginUsername: string | null;
  loginDisplayName: string | null;
  lastLoginCheckAt: string | null;
  lastLoginErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 账号 + 关联 Profile 的聚合视图（列表页使用）。 */
export interface AccountView extends Account {
  platformName: string;
  profileName: string;
  profilePath: string;
  /** 关联 Profile 浏览器的实时运行状态。 */
  browserStatus: BrowserProfileStatus;
}

export interface ContentItem {
  id: number;
  title: string;
  description: string;
  videoPath: string | null;
  coverPath: string | null;
  tags: string[];
  durationSeconds: number;
  fileSizeBytes: number;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PublishTask {
  id: number;
  contentId: number;
  contentTitle: string;
  platform: Platform;
  platformName: string;
  accountId: number | null;
  accountName: string | null;
  browserProfileId: number | null;
  status: PublishTaskStatus;
  priority: TaskPriority;
  currentStep: PublishStep;
  waitingReason: WaitingReason | null;
  /** 0-100，仅 running 阶段有意义。 */
  progress: number;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastCompletedStep: PublishStep | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLogEntry {
  taskId: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  time: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

/** 素材类型。 */
export type AssetType = 'video' | 'image' | 'audio' | 'font';

/** 素材库条目（引用本地文件路径）。 */
export interface AssetItem {
  id: number;
  type: AssetType;
  name: string;
  path: string;
  sizeBytes: number;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 发布确认模式（设置页可切换，默认手动确认）。 */
export type PublishConfirmMode = 'manual_confirm' | 'auto_publish' | 'save_draft';

/** AI 内容助手配置（API Key 只存本地 settings 表，接口永远不下发明文）。 */
export interface AiConfigView {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyFromEnv: boolean;
}

/** AI 生成的内容创意。 */
export interface AiIdeas {
  /** 3 个完整标题建议。 */
  titles: string[];
  shortTitle: string;
  description: string;
  tags: string[];
  coverText: string;
  topic: string;
}
