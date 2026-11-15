import { app, BrowserWindow, Menu } from 'electron';
import { closeDb, initDb } from './db';
import { registerIpcHandlers } from './ipc';
import { registerProtocolHandler, registerScheme } from './protocol';
import { attachPerfProbe, attachSmoke, prepareSmokeProject } from './smoke';
import { createMainWindow, getMainWindow } from './window';

// 必须在 app ready 之前注册特权 scheme
registerScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.setAppUserModelId('com.typstor.app');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  initDb();
  registerProtocolHandler();
  registerIpcHandlers();

  if (process.env.TYPSTOR_SMOKE === '1') {
    await prepareSmokeProject();
  }

  const win = createMainWindow();

  if (process.env.TYPSTOR_PERF_PROJECT) {
    attachPerfProbe(win, process.env.TYPSTOR_PERF_PROJECT);
  } else if (process.env.TYPSTOR_SMOKE === '1') {
    attachSmoke(win);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
