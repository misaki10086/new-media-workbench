import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => text(name).notNull().$defaultFn(() => new Date().toISOString());

/** 平台账号。登录态缓存在这里，真实凭证只存在于浏览器 Profile，绝不存密码 / Cookie / Token。 */
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  platform: text('platform').notNull(),
  name: text('name').notNull(),
  /** 关联的浏览器 Profile（1:1，一个 Profile 只挂一个账号）。 */
  profileId: integer('profile_id')
    .notNull()
    .references(() => browserProfiles.id, { onDelete: 'restrict' }),
  /** 最近一次登录检测结果：unknown / logged_in / logged_out / security_check。 */
  loginStatus: text('login_status', { enum: ['unknown', 'logged_in', 'logged_out', 'security_check'] })
    .notNull()
    .default('unknown'),
  loginUsername: text('login_username'),
  loginDisplayName: text('login_display_name'),
  lastLoginCheckAt: text('last_login_check_at'),
  /** 最近一次检测的失败原因码（PAGE_LOAD_TIMEOUT / NETWORK_ERROR / UNKNOWN…）。 */
  lastLoginErrorCode: text('last_login_error_code'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

/** 浏览器 Profile：持久化 Chromium 用户数据目录（登录状态保存在磁盘，不入库）。 */
export const browserProfiles = sqliteTable(
  'browser_profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform').notNull(),
    name: text('name').notNull(),
    /** browser-profiles 下的目录名，创建时生成，不随重命名变化。 */
    profilePath: text('profile_path').notNull(),
    browserType: text('browser_type', { enum: ['chromium'] }).notNull().default('chromium'),
    status: text('status', { enum: ['stopped', 'running', 'crashed'] }).notNull().default('stopped'),
    lastOpenedAt: text('last_opened_at'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [uniqueIndex('browser_profiles_name_unique').on(table.name)],
);

/** 内容库：视频 + 标题 + 文案 + 标签 + 封面。 */
export const contents = sqliteTable('content', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  videoPath: text('video_path'),
  coverPath: text('cover_path'),
  /** JSON 字符串数组，读写经 contentService 序列化。 */
  tags: text('tags').notNull().default('[]'),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  fileSizeBytes: integer('file_size_bytes').notNull().default(0),
  status: text('status', {
    enum: ['draft', 'pending', 'publishing', 'published', 'failed', 'cancelled'],
  })
    .notNull()
    .default('draft'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

/** 发布任务：一个内容可派生多条（每个平台一条）。 */
export const publishTasks = sqliteTable('publish_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentId: integer('content_id')
    .notNull()
    .references(() => contents.id, { onDelete: 'cascade' }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  /** 执行用浏览器 Profile（冗余保存，账号删除后任务仍可定位）。 */
  browserProfileId: integer('browser_profile_id').references(() => browserProfiles.id, { onDelete: 'set null' }),
  platform: text('platform').notNull(),
  status: text('status', {
    enum: ['pending', 'scheduled', 'paused', 'running', 'waiting_user', 'success', 'failed', 'cancelled'],
  })
    .notNull()
    .default('pending'),
  /** 任务优先级：调度器按 HIGH > NORMAL > LOW 选择。 */
  priority: text('priority', { enum: ['HIGH', 'NORMAL', 'LOW'] }).notNull().default('NORMAL'),
  /** 最大自动重试次数（默认 3）。 */
  maxRetries: integer('max_retries').notNull().default(3),
  /** 自动重试的到期时间（失败 + 可重试错误时由引擎写入，调度器到点拉起）。 */
  nextRetryAt: text('next_retry_at'),
  /** 当前执行步骤（状态机枚举，见 shared/types/domain.ts PublishStep）。 */
  currentStep: text('current_step', {
    enum: [
      'CREATED',
      'CHECKING_BROWSER',
      'CHECKING_LOGIN',
      'OPENING_CREATOR',
      'SELECTING_VIDEO',
      'UPLOADING_VIDEO',
      'WAITING_UPLOAD',
      'FILLING_CONTENT',
      'SETTING_COVER',
      'READY_FOR_REVIEW',
      'WAITING_USER_CONFIRM',
      'PUBLISHING',
      'SUCCESS',
      'FAILED',
      'CANCELLED',
    ],
  })
    .notNull()
    .default('CREATED'),
  /** waiting_user 时的人工处理原因：LOGIN_REQUIRED / SECURITY_CHECK / USER_CONFIRM / PAUSED_BY_USER。 */
  waitingReason: text('waiting_reason'),
  progress: integer('progress').notNull().default(0),
  scheduledAt: text('scheduled_at'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  /** 最后成功完成的步骤：失败后原地恢复的依据。 */
  lastCompletedStep: text('last_completed_step'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

/** 任务执行日志：每一步自动化操作都记录。 */
export const publishLogs = sqliteTable('publish_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id')
    .notNull()
    .references(() => publishTasks.id, { onDelete: 'cascade' }),
  level: text('level', { enum: ['info', 'warn', 'error'] }).notNull().default('info'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at'),
});

/** 键值设置（发布确认模式等主进程需要读取的配置）。 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** 素材库：引用本地媒体文件（路径不入内容发布链，仅做素材组织）。 */
export const assets = sqliteTable(
  'assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['video', 'image', 'audio', 'font'] }).notNull(),
    name: text('name').notNull(),
    /** 磁盘绝对路径（唯一，防止重复导入）。 */
    path: text('path').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    tags: text('tags').notNull().default('[]'),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [uniqueIndex('assets_path_unique').on(table.path)],
);

/** 自定义平台（自定义平台接口：名称 + 创作者中心地址即可接入账号管理与登录检测）。 */
export const customPlatforms = sqliteTable('custom_platforms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  creatorUrl: text('creator_url').notNull(),
  loginUrlPattern: text('login_url_pattern'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
