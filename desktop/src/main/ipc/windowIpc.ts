import { app, BrowserWindow, ipcMain } from 'electron';

function windowFromEvent(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    windowFromEvent(event)?.minimize();
  });

  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = windowFromEvent(event);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle('window:close', (event) => {
    windowFromEvent(event)?.close();
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
}
