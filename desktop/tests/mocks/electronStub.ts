/**
 * 单测用的 electron 轻量桩：只覆盖主进程服务链实际调用的接口。
 * 任何返回路径都指向临时目录，绝不触碰真实 %APPDATA%。
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const app = {
  getPath: (name: string): string => join(tmpdir(), 'nmw-electron-stub', name),
  getVersion: (): string => '0.0.0-test',
  setName: (): void => undefined,
  setPath: (): void => undefined,
  setAppUserModelId: (): void => undefined,
  whenReady: (): Promise<void> => Promise.resolve(),
  on: (): void => undefined,
  once: (): void => undefined,
  quit: (): void => undefined,
  exit: (code = 0): void => {
    process.exit(code);
  },
};

export const ipcMain = {
  handle: (): void => undefined,
  on: (): void => undefined,
  removeListener: (): void => undefined,
};

export const ipcRenderer = {
  invoke: async (): Promise<undefined> => undefined,
  on: (): void => undefined,
  removeListener: (): void => undefined,
};

export const BrowserWindow = class {
  static fromWebContents(): null {
    return null;
  }
};

export const shell = {
  openExternal: (): Promise<void> => Promise.resolve(),
};

export const dialog = {
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({ canceled: true, filePaths: [] }),
};

export const webUtils = {
  getPathForFile: (): string => '',
};

export const contextBridge = {
  exposeInMainWorld: (): void => undefined,
};

export default { app };
