import type { z } from 'zod';
import type {
  AccountView,
  CustomPlatform,
  AssetItem,
  BrowserProfile,
  ContentItem,
  Platform,
  PublishTaskStatus,
  PublishTask,
  PublishConfirmMode,
  LoginCheckResult,
  TaskLogEntry,
  TaskPriority,
  ThemePreference,
} from './domain';
import type { contentCreateSchema, contentUpdateSchema } from '../validators/content';

/** 内容创建 / 更新的入参（与主进程 zod 校验 schema 保持一致）。 */
export type ContentCreateInput = z.infer<typeof contentCreateSchema>;
export type ContentUpdateInput = z.infer<typeof contentUpdateSchema>;

export interface ProfileCreateInput {
  platform: Platform;
  name: string;
}

export interface ProfileRenameInput {
  id: number;
  name: string;
}

export interface AccountCreateInput {
  platform: Platform;
  name: string;
  profileId: number;
}

export interface CreatePublishTaskInput {
  contentId: number;
  accountId: number;
}

export interface CreateBatchPublishTasksInput {
  contentIds: number[];
  accountIds: number[];
  scheduledAt?: string | null;
}

export interface BatchCreateResult {
  created: PublishTask[];
  skipped: number;
  skippedReasons: string[];
}

export interface UpdatePublishTaskInput {
  id: number;
  scheduledAt?: string | null;
  priority?: TaskPriority;
}

export interface AiConfigInput {
  baseUrl: string;
  model: string;
  /** undefined = 保留现有 Key；空字符串 = 清除。 */
  apiKey?: string;
}

export interface AiConfigView {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyFromEnv: boolean;
}

export interface PlatformCatalogEntry {
  id: Platform;
  name: string;
  builtin: boolean;
  creatorUrl: string | null;
  loginDetection: boolean;
}

export interface CustomPlatformCreateInput {
  name: string;
  creatorUrl: string;
  loginUrlPattern?: string | null;
}

export interface CustomPlatformUpdateInput {
  id: number;
  name?: string;
  creatorUrl?: string;
  loginUrlPattern?: string | null;
}

export interface AiConnectionTestResult {
  ok: boolean;
  model: string;
  message: string;
}

export interface AiIdeasResult {
  titles: string[];
  shortTitle: string;
  description: string;
  tags: string[];
  coverText: string;
  topic: string;
}

export interface AnalyticsSummary {
  totals: {
    tasks: number;
    success: number;
    failed: number;
    active: number;
    successRate: number;
  };
  byPlatform: { platform: Platform; total: number; success: number; failed: number }[];
  topErrors: { errorCode: string; count: number; lastAt: string | null }[];
  last14Days: { date: string; finished: number }[];
  recentFinished: {
    taskId: number;
    contentTitle: string;
    platform: Platform;
    status: PublishTaskStatus;
    finishedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }[];
}

/** Dashboard 汇总数据（主进程实时查询 SQLite）。 */
export interface DashboardSummary {
  stats: {
    todayPending: number;
    todayCompleted: number;
    todayFailed: number;
    drafts: number;
  };
  accounts: AccountView[];
  recentTasks: PublishTask[];
  recentContents: ContentItem[];
}

/** 登录检测的调试信息直接复用 domain 里的 LoginCheckResult（steps + finalUrl + durationMs）。 */
export type { LoginCheckResult, ThemePreference, TaskLogEntry };

/** 视频导入结果。 */
export interface ImportResult {
  imported: ContentItem[];
  skipped: number;
}

/** Preload 通过 contextBridge 暴露到 window.newMedia 的 API 契约。
 * 渲染层只允许通过这个命名空间访问系统能力（IPC → Main → Service → DB/Browser）。
 */
export interface NewMediaApi {
  app: {
    getVersion(): Promise<string>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    /** 订阅最大化状态变化（用于切换 最大化/还原 图标）。返回取消订阅函数。 */
    onMaximizedChange(callback: (maximized: boolean) => void): () => void;
  };
  /** 拖拽导入时把渲染层的 File 对象解析为磁盘绝对路径（Electron webUtils）。 */
  utility: {
    getPathForFile(file: File): string;
  };
  content: {
    list(): Promise<ContentItem[]>;
    create(input: {
      title: string;
      description?: string;
      videoPath: string;
      coverPath?: string | null;
      tags?: string[];
    }): Promise<ContentItem>;
    update(
      id: number,
      patch: { title?: string; description?: string; coverPath?: string | null; tags?: string[] },
    ): Promise<ContentItem>;
    remove(id: number): Promise<void>;
    importFiles(paths: string[]): Promise<ImportResult>;
    /** 打开系统文件选择框并导入所选视频。 */
    pickAndImport(): Promise<ImportResult>;
  };
  dashboard: {
    summary(): Promise<DashboardSummary>;
  };
  account: {
    list(): Promise<AccountView[]>;
    create(input: AccountCreateInput): Promise<AccountView>;
    delete(id: number): Promise<void>;
    /** 启动浏览器并打开创作者中心，让用户手动登录。 */
    openLogin(id: number): Promise<AccountView>;
    /** 检测登录状态并缓存到账号表（浏览器未运行时自动启动）。 */
    checkLogin(id: number): Promise<{ account: AccountView; debug: LoginCheckResult }>;
  };
  publish: {
    list(): Promise<PublishTask[]>;
    get(id: number): Promise<PublishTask>;
    create(input: CreatePublishTaskInput): Promise<PublishTask>;
    /** 批量创建：内容 × 账号矩阵展开任务，自动跳过重复组合。 */
    createBatch(input: CreateBatchPublishTasksInput): Promise<BatchCreateResult>;
    start(id: number): Promise<PublishTask>;
    pause(id: number): Promise<PublishTask>;
    resume(id: number): Promise<PublishTask>;
    cancel(id: number): Promise<PublishTask>;
    /** 用户在 WAITING_USER_CONFIRM 点击「确认发布」后执行最终发布。 */
    confirm(id: number): Promise<PublishTask>;
    /** 任务步骤时间线（publish_logs）。 */
    logs(id: number): Promise<TaskLogEntry[]>;
    /** 修改计划时间 / 优先级（scheduledAt 传 null 表示立即准备）。 */
    update(input: UpdatePublishTaskInput): Promise<PublishTask>;
  };
  ai: {
    /** 读取配置（永不下发 API Key 明文）。 */
    getConfig(): Promise<AiConfigView>;
    saveConfig(input: AiConfigInput): Promise<AiConfigView>;
    /** 生成标题 / 文案 / 话题等创意。 */
    generate(input: { topic: string }): Promise<AiIdeasResult>;
    testConfig(): Promise<AiConnectionTestResult>;
  };
  analytics: {
    summary(): Promise<AnalyticsSummary>;
  };
  platform: {
    /** 平台目录（内置 + 自定义），供下拉选择与标签解析。 */
    list(): Promise<PlatformCatalogEntry[]>;
  };
  platformCustom: {
    list(): Promise<CustomPlatform[]>;
    create(input: CustomPlatformCreateInput): Promise<CustomPlatform>;
    update(input: CustomPlatformUpdateInput): Promise<CustomPlatform>;
    delete(id: number): Promise<void>;
  };
  asset: {
    list(filter?: { type?: 'video' | 'image' | 'audio' | 'font' | 'all'; search?: string; favorite?: boolean }): Promise<AssetItem[]>;
    importPaths(paths: string[], defaultType?: 'video' | 'image' | 'audio' | 'font'): Promise<{ imported: AssetItem[]; skipped: number }>;
    pickAndImport(): Promise<{ imported: AssetItem[]; skipped: number }>;
    setFavorite(id: number, favorite: boolean): Promise<AssetItem>;
    setTags(id: number, tags: string[]): Promise<AssetItem>;
    remove(id: number): Promise<void>;
    openInSystem(path: string): Promise<void>;
  };
  browserProfile: {
    list(): Promise<BrowserProfile[]>;
    create(input: ProfileCreateInput): Promise<BrowserProfile>;
    delete(id: number): Promise<void>;
    launch(id: number): Promise<BrowserProfile>;
    close(id: number): Promise<void>;
    status(id: number): Promise<BrowserProfile>;
    rename(input: ProfileRenameInput): Promise<BrowserProfile>;
  };
  settings: {
    get(key: 'publish_confirm_mode'): Promise<PublishConfirmMode>;
    set(key: 'publish_confirm_mode', value: PublishConfirmMode): Promise<PublishConfirmMode>;
  };
}
