import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDatabase } from '../database/db';
import { accounts, browserProfiles, contents, publishTasks } from '../database/schema';
import { browserProfileManager } from '../browser/BrowserProfileManager';
import { resolvePlatformName } from './customPlatformService';
import type { DashboardSummary } from '@shared/types/ipc';
import type {
  AccountView,
  AccountLoginStatus,
  ContentItem,
  ContentStatus,
  Platform,
  PublishStep,
  PublishTask,
  PublishTaskStatus,
  TaskPriority,
  WaitingReason,
} from '@shared/types/domain';

type AccountRow = typeof accounts.$inferSelect;
type ContentRow = typeof contents.$inferSelect;
type TaskRow = typeof publishTasks.$inferSelect;

function toAccountView(row: AccountRow, profile: typeof browserProfiles.$inferSelect): AccountView {
  return {
    id: row.id,
    platform: row.platform as Platform,
    name: row.name,
    platformName: resolvePlatformName(row.platform),
    profileId: row.profileId,
    profileName: profile.name,
    profilePath: profile.profilePath,
    browserStatus: browserProfileManager.isRunning(profile.id) ? 'running' : (profile.status as 'stopped' | 'crashed'),
    loginStatus: row.loginStatus as AccountLoginStatus,
    loginUsername: row.loginUsername,
    loginDisplayName: row.loginDisplayName,
    lastLoginCheckAt: row.lastLoginCheckAt,
    lastLoginErrorCode: row.lastLoginErrorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toContent(row: ContentRow): ContentItem {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    videoPath: row.videoPath,
    coverPath: row.coverPath,
    tags,
    durationSeconds: row.durationSeconds,
    fileSizeBytes: row.fileSizeBytes,
    status: row.status as ContentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTask(row: TaskRow, contentTitle: string | null): PublishTask {
  return {
    id: row.id,
    contentId: row.contentId,
    contentTitle: contentTitle ?? `内容 #${row.contentId}`,
    platform: row.platform as Platform,
    platformName: resolvePlatformName(row.platform),
    accountId: row.accountId,
    accountName: null,
    browserProfileId: row.browserProfileId,
    status: row.status as PublishTaskStatus,
    priority: row.priority as TaskPriority,
    currentStep: row.currentStep as PublishStep,
    waitingReason: row.waitingReason as WaitingReason | null,
    progress: row.progress,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    lastCompletedStep: row.lastCompletedStep as PublishStep | null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    nextRetryAt: row.nextRetryAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function todayStartIso(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

/** Dashboard 汇总：全部来自 SQLite 实时查询，无内存缓存。 */
export function getDashboardSummary(): DashboardSummary {
  const db = getDatabase();
  const todayStart = todayStartIso();

  const drafts =
    db.select({ value: count() }).from(contents).where(eq(contents.status, 'draft')).all()[0]?.value ?? 0;

  const todayPending =
    db
      .select({ value: count() })
      .from(publishTasks)
      .where(inArray(publishTasks.status, ['pending', 'running', 'waiting_user']))
      .all()[0]?.value ?? 0;

  const todayCompleted =
    db
      .select({ value: count() })
      .from(publishTasks)
      .where(and(eq(publishTasks.status, 'success'), gte(publishTasks.finishedAt, todayStart)))
      .all()[0]?.value ?? 0;

  const todayFailed =
    db
      .select({ value: count() })
      .from(publishTasks)
      .where(and(eq(publishTasks.status, 'failed'), gte(publishTasks.finishedAt, todayStart)))
      .all()[0]?.value ?? 0;

  const recentTasks = db
    .select({ task: publishTasks, contentTitle: contents.title })
    .from(publishTasks)
    .leftJoin(contents, eq(publishTasks.contentId, contents.id))
    .orderBy(desc(publishTasks.id))
    .limit(10)
    .all()
    .map((row) => toTask(row.task, row.contentTitle));

  const recentContents = db
    .select()
    .from(contents)
    .orderBy(desc(contents.createdAt))
    .limit(10)
    .all()
    .map(toContent);

  const accountList = db
    .select({ account: accounts, profile: browserProfiles })
    .from(accounts)
    .innerJoin(browserProfiles, eq(accounts.profileId, browserProfiles.id))
    .orderBy(asc(accounts.id))
    .all()
    .map((row) => toAccountView(row.account, row.profile));

  return {
    stats: {
      todayPending,
      todayCompleted,
      todayFailed,
      drafts,
    },
    accounts: accountList,
    recentTasks,
    recentContents,
  };
}
