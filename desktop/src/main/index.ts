import { join } from 'node:path';
import { BrowserWindow, app, shell } from 'electron';
import { ensureAppDirectories } from './appPaths';
import { closeDatabase, databaseFilePath, initDatabase } from './database/db';
import { registerIpc } from './ipc';
import { runAccountSmoke, runDouyinProbe, runPlatformLoginSmoke, runPlatformProbe } from './accountSmoke';
import { runPublishSmoke } from './publishSmoke';
import { seedDryrun } from './seedDryrun';
import { runDbSmoke } from './dbSmoke';
import { browserProfileManager } from './browser/BrowserProfileManager';
import { printProfilesAndCleanup, runBrowserSmoke } from './browser/browserSmoke';
import { cleanupStaleRunningProfiles } from './services/browserProfileService';
import { getPublishScheduler } from './publishing/PublishScheduler';
import { devLog } from './services/logger';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    title: '新媒体工作台',
    backgroundColor: '#f5f5f6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // 无边框窗口的最大化状态变化需要通知渲染层切换 最大化/还原 图标。
  const sendMaximized = (maximized: boolean): void => {
    win.webContents.send('window:maximized-changed', maximized);
  };
  win.on('maximize', () => sendMaximized(true));
  win.on('unmaximize', () => sendMaximized(false));

  // 外部链接交给系统默认浏览器打开，不在应用内跳转。
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

// 规范要求数据目录固定为 %APPDATA%/NewMediaWorkbench/；开发模式下 Electron 会回退到
// 默认的 %APPDATA%/Electron，因此在 ready 之前显式指定。
app.setName('NewMediaWorkbench');
app.setPath('userData', join(app.getPath('appData'), 'NewMediaWorkbench'));

// 单实例锁：避免两个应用实例同时操作同一数据库与浏览器 Profile。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  app.whenReady().then(async () => {
  app.setAppUserModelId('com.personal.newmediaworkbench');

  ensureAppDirectories();

  // `electron . --db-smoke`：五张表读写冒烟测试，跑完退出，不打开窗口。
  if (process.argv.includes('--db-smoke')) {
    const ok = await runDbSmoke();
    app.exit(ok ? 0 : 1);
    return;
  }

  // `electron . --browser-smoke`：Profile 生命周期验收（启动真实 Chromium）。
  if (process.argv.includes('--browser-smoke')) {
    initDatabase(databaseFilePath(ensureAppDirectories().database));
    const ok = await runBrowserSmoke();
    app.exit(ok ? 0 : 1);
    return;
  }

  // `electron . --publish-smoke`：发布状态机端到端验收（本地 fixture 页，不触真实平台）。
  if (process.argv.includes('--publish-smoke')) {
    initDatabase(databaseFilePath(ensureAppDirectories().database));
    const ok = await runPublishSmoke();
    app.exit(ok ? 0 : 1);
    return;
  }

  // `electron . --platform-login-smoke`：三平台登录检测端到端验收（真实页面，未登录场景）。
  if (process.argv.includes('--platform-login-smoke')) {
    initDatabase(databaseFilePath(ensureAppDirectories().database));
    const ok = await runPlatformLoginSmoke();
    app.exit(ok ? 0 : 1);
    return;
  }

  // `electron . --probe-platforms`：诊断小红书 / B站 / 视频号创作者中心标记命中情况。
  if (process.argv.includes('--probe-platforms')) {
    await runPlatformProbe();
    app.exit(0);
    return;
  }

  // `electron . --probe-douyin`：诊断创作者中心页面标记命中情况。
  if (process.argv.includes('--probe-douyin')) {
    await runDouyinProbe();
    app.exit(0);
    return;
  }

  // `electron . --account-smoke`：账号 ↔ Profile 关联与登录检测验收（启动真实 Chromium 访问抖音）。
  if (process.argv.includes('--account-smoke')) {
    initDatabase(databaseFilePath(ensureAppDirectories().database));
    const ok = await runAccountSmoke();
    app.exit(ok ? 0 : 1);
    return;
  }

  // `electron . --print-profiles`：新进程中打印 Profile 列表并清理验收数据。
  if (process.argv.includes('--print-profiles')) {
    printProfilesAndCleanup();
    app.exit(0);
    return;
  }

  // 主进程持有唯一的数据库连接，窗口关闭时统一释放。
  initDatabase(databaseFilePath(ensureAppDirectories().database));
  const stale = cleanupStaleRunningProfiles();
  if (stale > 0) devLog.warn(`${stale} 个 Profile 上次会话异常退出，已标记为 crashed`);
  registerIpc();
  getPublishScheduler().start();
  createWindow();

  // Phase 5.1 真实抖音 dry-run：自动准备素材并启动任务（窗口照常打开，用户可全程在 UI 操作）。
  if (process.argv.includes('--seed-dryrun')) {
    void seedDryrun().catch((error) => {
      devLog.error(`[dryrun] seed failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前关闭全部浏览器 context 与本地调度器，避免残留 Chromium 进程。
let quittingAfterBrowserClose = false;
app.on('before-quit', (event) => {
  getPublishScheduler().stop();
  if (quittingAfterBrowserClose || browserProfileManager.listRunningIds().length === 0) return;
  event.preventDefault();
  quittingAfterBrowserClose = true;
  devLog.info('应用退出：关闭全部浏览器 Profile');
  void browserProfileManager.closeAll().finally(() => app.quit());
});

app.on('will-quit', () => {
  closeDatabase();
});
