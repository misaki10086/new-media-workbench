import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AccountView, AssetItem, BrowserProfile, ContentItem, CustomPlatform, PublishConfirmMode, PublishTask, TaskLogEntry } from '@shared/types/domain';
import type {
  AccountCreateInput,
  AiConfigInput,
  BatchCreateResult,
  CreateBatchPublishTasksInput,
  CreatePublishTaskInput,
  CustomPlatformCreateInput,
  CustomPlatformUpdateInput,
  DashboardSummary,
  ImportResult,
  LoginCheckResult,
  NewMediaApi,
  PlatformCatalogEntry,
  ProfileCreateInput,
  ProfileRenameInput,
  UpdatePublishTaskInput,
} from '@shared/types/ipc';

/** Electron IPC 的错误信息带长前缀（"Error invoking remote method 'x': Error: 真实原因"），解包后再抛给渲染层。 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : String(cause);
    const unwrapped = /Error: ([\s\S]*)$/.exec(raw);
    throw new Error(unwrapped ? unwrapped[1] : raw);
  }
}

const api = {
  app: {
    getVersion: (): Promise<string> => invoke('app:getVersion'),
  },
  window: {
    minimize: (): Promise<void> => invoke('window:minimize'),
    toggleMaximize: (): Promise<void> => invoke('window:toggleMaximize'),
    close: (): Promise<void> => invoke('window:close'),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized);
      ipcRenderer.on('window:maximized-changed', listener);
      return () => {
        ipcRenderer.removeListener('window:maximized-changed', listener);
      };
    },
  },
  utility: {
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },
  content: {
    list: (): Promise<ContentItem[]> => invoke('content:list'),
    create: (input: Parameters<NewMediaApi['content']['create']>[0]): Promise<ContentItem> =>
      invoke('content:create', input),
    update: (id: number, patch: Parameters<NewMediaApi['content']['update']>[1]): Promise<ContentItem> =>
      invoke('content:update', id, patch),
    remove: (id: number): Promise<void> => invoke('content:remove', id),
    importFiles: (paths: string[]): Promise<ImportResult> => invoke('content:import-files', paths),
    pickAndImport: (): Promise<ImportResult> => invoke('content:pick-and-import'),
  },
  dashboard: {
    summary: (): Promise<DashboardSummary> => invoke('dashboard:summary'),
  },
  account: {
    list: (): Promise<AccountView[]> => invoke('account:list'),
    create: (input: AccountCreateInput): Promise<AccountView> => invoke('account:create', input),
    delete: (id: number): Promise<void> => invoke('account:delete', id),
    openLogin: (id: number): Promise<AccountView> => invoke('account:open-login', id),
    checkLogin: (id: number): Promise<{ account: AccountView; debug: LoginCheckResult }> =>
      invoke('account:check-login', id),
  },
  publish: {
    list: (): Promise<PublishTask[]> => invoke('publish:list'),
    get: (id: number): Promise<PublishTask> => invoke('publish:get', id),
    create: (input: CreatePublishTaskInput): Promise<PublishTask> => invoke('publish:create', input),
    createBatch: (input: CreateBatchPublishTasksInput): Promise<BatchCreateResult> =>
      invoke('publish:create-batch', input),
    start: (id: number): Promise<PublishTask> => invoke('publish:start', id),
    pause: (id: number): Promise<PublishTask> => invoke('publish:pause', id),
    resume: (id: number): Promise<PublishTask> => invoke('publish:resume', id),
    cancel: (id: number): Promise<PublishTask> => invoke('publish:cancel', id),
    confirm: (id: number): Promise<PublishTask> => invoke('publish:confirm', id),
    logs: (id: number): Promise<TaskLogEntry[]> => invoke('publish:logs', id),
    update: (input: UpdatePublishTaskInput): Promise<PublishTask> => invoke('publish:update', input),
  },
  ai: {
    getConfig: (): Promise<import('@shared/types/ipc').AiConfigView> => invoke('ai:get-config'),
    saveConfig: (input: AiConfigInput): Promise<import('@shared/types/ipc').AiConfigView> =>
      invoke('ai:save-config', input),
    generate: (input: { topic: string }): Promise<import('@shared/types/ipc').AiIdeasResult> =>
      invoke('ai:generate', input),
    testConfig: (): Promise<import('@shared/types/ipc').AiConnectionTestResult> => invoke('ai:test-config'),
  },
  analytics: {
    summary: (): Promise<import('@shared/types/ipc').AnalyticsSummary> => invoke('analytics:summary'),
  },
  platform: {
    list: (): Promise<PlatformCatalogEntry[]> => invoke('platform:list'),
  },
  platformCustom: {
    list: (): Promise<CustomPlatform[]> => invoke('platformCustom:list'),
    create: (input: CustomPlatformCreateInput): Promise<CustomPlatform> => invoke('platformCustom:create', input),
    update: (input: CustomPlatformUpdateInput): Promise<CustomPlatform> => invoke('platformCustom:update', input),
    delete: (id: number): Promise<void> => invoke('platformCustom:delete', id),
  },
  asset: {
    list: (filter?: { type?: 'video' | 'image' | 'audio' | 'font' | 'all'; search?: string; favorite?: boolean }): Promise<AssetItem[]> =>
      invoke('asset:list', filter ?? {}),
    importPaths: (paths: string[], defaultType?: 'video' | 'image' | 'audio' | 'font'): Promise<{ imported: AssetItem[]; skipped: number }> =>
      invoke('asset:import-paths', { paths, defaultType }),
    pickAndImport: (): Promise<{ imported: AssetItem[]; skipped: number }> => invoke('asset:pick-and-import'),
    setFavorite: (id: number, favorite: boolean): Promise<AssetItem> => invoke('asset:set-favorite', id, favorite),
    setTags: (id: number, tags: string[]): Promise<AssetItem> => invoke('asset:set-tags', id, tags),
    remove: (id: number): Promise<void> => invoke('asset:remove', id),
    openInSystem: (path: string): Promise<void> => invoke('asset:open-in-system', path),
  },
  browserProfile: {
    list: (): Promise<BrowserProfile[]> => invoke('browserProfile:list'),
    create: (input: ProfileCreateInput): Promise<BrowserProfile> => invoke('browserProfile:create', input),
    delete: (id: number): Promise<void> => invoke('browserProfile:delete', id),
    launch: (id: number): Promise<BrowserProfile> => invoke('browserProfile:launch', id),
    close: (id: number): Promise<void> => invoke('browserProfile:close', id),
    status: (id: number): Promise<BrowserProfile> => invoke('browserProfile:status', id),
    rename: (input: ProfileRenameInput): Promise<BrowserProfile> => invoke('browserProfile:rename', input),
  },
  settings: {
    get: (key: 'publish_confirm_mode'): Promise<PublishConfirmMode> => invoke('settings:get', key),
    set: (key: 'publish_confirm_mode', value: PublishConfirmMode): Promise<PublishConfirmMode> =>
      invoke('settings:set', key, value),
  },
} satisfies NewMediaApi;

contextBridge.exposeInMainWorld('newMedia', api);
