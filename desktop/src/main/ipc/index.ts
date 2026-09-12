import { z } from 'zod';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { accountIdSchema, createAccountSchema } from '@shared/validators/account';
import { createBatchPublishTasksSchema, createPublishTaskSchema, publishTaskIdSchema, updatePublishTaskSchema } from '@shared/validators/publish';
import { aiConfigSchema, aiGenerateSchema } from '@shared/validators/publish';
import { customPlatformCreateSchema, customPlatformUpdateSchema } from '@shared/validators/browserProfile';
import {
  createProfileSchema,
  profileIdSchema,
  renameProfileSchema,
} from '@shared/validators/browserProfile';
import {
  contentCreateSchema,
  contentUpdateSchema,
  idSchema,
  importPathsSchema,
  publishConfirmModeSchema,
  settingsKeySchema,
  settingsValueSchema,
} from '@shared/validators/content';
import { browserProfileManager } from '../browser/BrowserProfileManager';
import {
  createAccount,
  deleteAccount,
  listAccounts,
  openAccountLogin,
  checkAccountLogin,
} from '../services/accountService';
import {
  cancelTask,
  confirmPublish,
  createBatchTasks,
  createTask,
  getTask,
  getTaskLogs,
  listTasks,
  pauseTask,
  resumeTask,
  startTask,
  updateTaskSchedule,
} from '../services/publishService';
import { generateIdeas, getAiRuntimeConfig, saveAiConfig, testAiConnection } from '../services/aiService';
import {
  createCustomPlatform,
  deleteCustomPlatform,
  listAllPlatformEntries,
  listCustomPlatforms,
  updateCustomPlatform,
} from '../services/customPlatformService';
import { getAnalyticsSummary } from '../services/analyticsService';
import { importAssets, deleteAsset, listAssets, setAssetFavorite, setAssetTags } from '../services/assetService';
import { assetIdSchema, assetListFilterSchema, assetTagsSchema, importAssetPathsSchema } from '@shared/validators/asset';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  renameProfile,
} from '../services/browserProfileService';
import {
  createContent,
  deleteContent,
  importVideoFiles,
  listContents,
  updateContent,
} from '../services/contentService';
import { getDashboardSummary } from '../services/dashboardService';
import { getPublishConfirmMode, setSetting } from '../services/settingsService';
import { registerWindowIpc } from './windowIpc';
import { ApiError } from './apiError';

/** list 时把运行中的实时状态合并进去（DB 状态由 manager 在事件里维护，双保险）。 */
function listProfilesWithRuntime() {
  return listProfiles().map((profile) =>
    browserProfileManager.isRunning(profile.id) ? { ...profile, status: 'running' as const } : profile,
  );
}

/**
 * 所有 IPC 通道的唯一注册点。
 * 安全边界：渲染层只能通过 window.newMedia（preload）访问这些通道；
 * 每个入参都经 zod 校验，数据库只存在于主进程内。
 */
export function registerIpc(): void {
  registerWindowIpc();

  ipcMain.handle('content:list', () => listContents());

  ipcMain.handle('content:create', (_event, rawInput: unknown) => {
    const input = contentCreateSchema.parse(rawInput);
    return createContent(input);
  });

  ipcMain.handle('content:update', (_event, rawId: unknown, rawPatch: unknown) => {
    const id = idSchema.parse(rawId);
    const patch = contentUpdateSchema.parse(rawPatch);
    return updateContent(id, patch);
  });

  ipcMain.handle('content:remove', (_event, rawId: unknown) => {
    const id = idSchema.parse(rawId);
    deleteContent(id);
  });

  ipcMain.handle('content:import-files', (_event, rawPaths: unknown) => {
    const paths = importPathsSchema.parse(rawPaths);
    return importVideoFiles(paths);
  });

  ipcMain.handle('content:pick-and-import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: '导入视频',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'webm'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: [], skipped: 0 };
    }
    return importVideoFiles(result.filePaths);
  });

  ipcMain.handle('dashboard:summary', () => getDashboardSummary());

  ipcMain.handle('account:list', () => listAccounts());

  ipcMain.handle('account:create', (_event, rawInput: unknown) => {
    const input = createAccountSchema.parse(rawInput);
    return createAccount(input.platform, input.name, input.profileId);
  });

  ipcMain.handle('account:delete', (_event, rawId: unknown) => {
    const id = accountIdSchema.parse(rawId);
    deleteAccount(id);
  });

  ipcMain.handle('account:open-login', async (_event, rawId: unknown) => {
    const id = accountIdSchema.parse(rawId);
    return openAccountLogin(id);
  });

  ipcMain.handle('account:check-login', async (_event, rawId: unknown) => {
    const id = accountIdSchema.parse(rawId);
    return checkAccountLogin(id);
  });

  ipcMain.handle('publish:list', () => listTasks());

  ipcMain.handle('publish:get', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return getTask(id);
  });

  ipcMain.handle('publish:create', (_event, rawInput: unknown) => {
    const input = createPublishTaskSchema.parse(rawInput);
    return createTask(input.contentId, input.accountId);
  });

  ipcMain.handle('publish:create-batch', (_event, rawInput: unknown) => {
    const input = createBatchPublishTasksSchema.parse(rawInput);
    return createBatchTasks(input.contentIds, input.accountIds, {
      scheduledAt: input.scheduledAt === '' ? null : input.scheduledAt,
    });
  });

  ipcMain.handle('publish:start', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return startTask(id);
  });

  ipcMain.handle('publish:cancel', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return cancelTask(id);
  });

  ipcMain.handle('publish:pause', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return pauseTask(id);
  });

  ipcMain.handle('publish:resume', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return resumeTask(id);
  });

  ipcMain.handle('publish:confirm', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return confirmPublish(id);
  });

  ipcMain.handle('publish:logs', (_event, rawId: unknown) => {
    const id = publishTaskIdSchema.parse(rawId);
    return getTaskLogs(id);
  });

  ipcMain.handle('publish:update', (_event, rawInput: unknown) => {
    const input = updatePublishTaskSchema.parse(rawInput);
    return updateTaskSchedule(input.id, {
      scheduledAt: input.scheduledAt === '' ? null : input.scheduledAt,
      priority: input.priority,
    });
  });

  ipcMain.handle('browserProfile:list', () => listProfilesWithRuntime());

  // ---- AI 内容助手 ----
  ipcMain.handle('ai:get-config', () => {
    const config = getAiRuntimeConfig();
    return {
      baseUrl: config.baseUrl,
      model: config.model,
      hasApiKey: config.apiKey.length > 0,
      apiKeyFromEnv: config.apiKeyFromEnv,
    };
  });

  ipcMain.handle('ai:save-config', (_event, rawInput: unknown) => {
    const input = aiConfigSchema.parse(rawInput);
    const config = saveAiConfig({ baseUrl: input.baseUrl, model: input.model, apiKey: input.apiKey });
    return {
      baseUrl: config.baseUrl,
      model: config.model,
      hasApiKey: config.apiKey.length > 0,
      apiKeyFromEnv: config.apiKeyFromEnv,
    };
  });

  ipcMain.handle('ai:generate', async (_event, rawInput: unknown) => {
    const input = aiGenerateSchema.parse(rawInput);
    return generateIdeas(input.topic);
  });

  ipcMain.handle('ai:test-config', async () => testAiConnection());

  ipcMain.handle('analytics:summary', () => getAnalyticsSummary());

  // ---- 平台目录与自定义平台 ----
  ipcMain.handle('platform:list', () => listAllPlatformEntries());

  ipcMain.handle('platformCustom:list', () => listCustomPlatforms());

  ipcMain.handle('platformCustom:create', (_event, rawInput: unknown) => {
    const input = customPlatformCreateSchema.parse(rawInput);
    return createCustomPlatform(input.name, input.creatorUrl, input.loginUrlPattern ?? null);
  });

  ipcMain.handle('platformCustom:update', (_event, rawInput: unknown) => {
    const input = customPlatformUpdateSchema.parse(rawInput);
    const patch: { name?: string; creatorUrl?: string; loginUrlPattern?: string | null } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.creatorUrl !== undefined) patch.creatorUrl = input.creatorUrl;
    if (input.loginUrlPattern !== undefined) patch.loginUrlPattern = input.loginUrlPattern;
    return updateCustomPlatform(input.id, patch);
  });

  ipcMain.handle('platformCustom:delete', (_event, rawId: unknown) => {
    const id = idSchema.parse(rawId);
    deleteCustomPlatform(id);
  });

  // ---- 素材库 ----
  ipcMain.handle('asset:list', (_event, rawFilter: unknown) => {
    const filter = assetListFilterSchema.parse(rawFilter ?? {});
    return listAssets(filter);
  });

  ipcMain.handle('asset:import-paths', (_event, rawInput: unknown) => {
    const input = importAssetPathsSchema.parse(rawInput);
    return importAssets(input.paths, input.defaultType);
  });

  ipcMain.handle('asset:pick-and-import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: '导入素材',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [
        { name: '全部素材', extensions: ['mp4', 'mov', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3', 'wav', 'm4a', 'flac', 'ttf', 'otf', 'woff', 'woff2'] },
      ],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { imported: [], skipped: 0 };
    return importAssets(result.filePaths);
  });

  ipcMain.handle('asset:set-favorite', (_event, rawId: unknown, rawFavorite: unknown) => {
    const id = assetIdSchema.parse(rawId);
    const favorite = z.boolean().parse(rawFavorite);
    return setAssetFavorite(id, favorite);
  });

  ipcMain.handle('asset:set-tags', (_event, rawId: unknown, rawTags: unknown) => {
    const id = assetIdSchema.parse(rawId);
    const tags = assetTagsSchema.parse(rawTags);
    return setAssetTags(id, tags);
  });

  ipcMain.handle('asset:remove', (_event, rawId: unknown) => {
    const id = assetIdSchema.parse(rawId);
    deleteAsset(id);
  });

  ipcMain.handle('asset:open-in-system', (_event, rawPath: unknown) => {
    const path = z.string().min(1).parse(rawPath);
    return shell.openPath(path);
  });

  ipcMain.handle('browserProfile:create', (_event, rawInput: unknown) => {
    const input = createProfileSchema.parse(rawInput);
    return createProfile(input.platform, input.name);
  });

  ipcMain.handle('browserProfile:delete', (_event, rawId: unknown) => {
    const id = profileIdSchema.parse(rawId);
    if (browserProfileManager.isRunning(id)) {
      throw ApiError.badRequest('Profile 正在运行，请先关闭浏览器再删除');
    }
    deleteProfile(id);
  });

  ipcMain.handle('browserProfile:launch', async (_event, rawId: unknown) => {
    const id = profileIdSchema.parse(rawId);
    return browserProfileManager.launch(id);
  });

  ipcMain.handle('browserProfile:close', async (_event, rawId: unknown) => {
    const id = profileIdSchema.parse(rawId);
    await browserProfileManager.close(id);
  });

  ipcMain.handle('browserProfile:status', (_event, rawId: unknown) => {
    const id = profileIdSchema.parse(rawId);
    const profile = getProfile(id);
    return browserProfileManager.isRunning(id) ? { ...profile, status: 'running' as const } : profile;
  });

  ipcMain.handle('browserProfile:rename', (_event, rawInput: unknown) => {
    const input = renameProfileSchema.parse(rawInput);
    return renameProfile(input.id, input.name);
  });

  ipcMain.handle('settings:get', (_event, rawKey: unknown) => {
    const key = settingsKeySchema.parse(rawKey);
    if (key === 'publish_confirm_mode') return getPublishConfirmMode();
    throw ApiError.badRequest('未知的设置项');
  });

  ipcMain.handle('settings:set', (_event, rawKey: unknown, rawValue: unknown) => {
    const key = settingsKeySchema.parse(rawKey);
    const value = settingsValueSchema.parse(rawValue);
    if (key === 'publish_confirm_mode') {
      const mode = publishConfirmModeSchema.parse(value);
      setSetting(key, mode);
      return getPublishConfirmMode();
    }
    throw ApiError.badRequest('未知的设置项');
  });
}
