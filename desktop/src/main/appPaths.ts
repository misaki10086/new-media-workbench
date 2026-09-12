import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * 所有本地数据统一保存在 %APPDATA%/NewMediaWorkbench/。
 * productName 为 NewMediaWorkbench，Electron 的 userData 即指向该目录。
 */
export interface AppDirectories {
  root: string;
  database: string;
  browserProfiles: string;
  media: string;
  logs: string;
  screenshots: string;
  cache: string;
}

let directories: AppDirectories | null = null;

export function appDirectories(): AppDirectories {
  if (directories) return directories;
  const root = app.getPath('userData');
  directories = {
    root,
    database: join(root, 'database'),
    browserProfiles: join(root, 'browser-profiles'),
    media: join(root, 'media'),
    logs: join(root, 'logs'),
    screenshots: join(root, 'logs', 'screenshots'),
    cache: join(root, 'cache'),
  };
  return directories;
}

/** 启动时确保目录存在；Phase 2 起数据库与浏览器 Profile 会写入这些目录。 */
export function ensureAppDirectories(): AppDirectories {
  const dirs = appDirectories();
  for (const dir of Object.values(dirs)) {
    mkdirSync(dir, { recursive: true });
  }
  return dirs;
}
