import { app, BrowserWindow, dialog, Menu } from 'electron';
import { closeDb, initDb } from './db';
import { shutdownCompileWorker } from './compile';
import { currentLocale } from './i18n';
import { DEFAULT_LOCALE, translate } from '../shared/i18n';
import { registerIpcHandlers } from './ipc';
import { registerProtocolHandler, registerScheme } from './protocol';
import { attachPerfProbe, attachSmoke, prepareSmokeProject } from './smoke';
import { createMainWindow, getMainWindow } from './window';
import { migrateLegacyUserData } from './userDataMigration';

// userData 目录随产品名变化；必须在任何数据库/设置读写之前完成迁移。
migrateLegacyUserData();

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

app.setAppUserModelId('com.deckle.app');

/** 启动链任何一步失败都要留下可见诊断，而不是留下一个永远不出现的窗口。 */
function reportStartupError(error: unknown): void {
  console.error('[deckle] startup failed:', error);
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  let locale = DEFAULT_LOCALE;
  try {
    locale = currentLocale();
  } catch {
    // 数据库损坏时读不到语言设置，保留默认语言。
  }
  try {
    dialog.showErrorBox(
      translate(locale, '启动失败'),
      `${translate(locale, 'Deckle 启动时遇到错误，无法继续。')}\n\n${detail}`,
    );
  } finally {
    app.quit();
  }
}

app
  .whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null);

    initDb();
    registerProtocolHandler();
    registerIpcHandlers();

    if (process.env.DECKLE_SMOKE === '1') {
      await prepareSmokeProject();
    }

    const win = createMainWindow();

    if (process.env.DECKLE_PERF_PROJECT) {
      attachPerfProbe(win, process.env.DECKLE_PERF_PROJECT);
    } else if (process.env.DECKLE_SMOKE === '1') {
      attachSmoke(win);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          createMainWindow();
        } catch (error) {
          reportStartupError(error);
        }
      }
    });
  })
  .catch(reportStartupError);

app.on('before-quit', () => {
  shutdownCompileWorker();
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
