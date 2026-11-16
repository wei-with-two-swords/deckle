import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { readSettings, saveSettings } from './settings';
import { appUrl } from './protocol';
import { isCloseAllowed, requestWindowClose, resetCloseState } from './close';

// 主进程 bundle 位于 .webpack/main，preload 位于 .webpack/renderer/main_window。
// 开发态（electron .）与打包态（app.asar 内）都满足这一相对布局。
const PRELOAD_PATH = path.resolve(
  __dirname,
  '../renderer/main_window/preload.cjs',
);

let mainWindow: BrowserWindow | null = null;

function isVisible(bounds: {
  x?: number;
  y?: number;
  width: number;
  height: number;
}): boolean {
  if (bounds.x === undefined || bounds.y === undefined) return false;

  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x! < area.x + area.width &&
      bounds.x! + bounds.width > area.x &&
      bounds.y! < area.y + area.height &&
      bounds.y! + bounds.height > area.y
    );
  });
}

export function createMainWindow(): BrowserWindow {
  const settings = readSettings();
  const saved = settings.window;
  const bounds = isVisible(saved)
    ? {
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height,
      }
    : { width: saved.width, height: saved.height };

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition:
      process.platform === 'darwin' ? { x: 16, y: 14 } : undefined,
    backgroundColor: settings.theme === 'dark' ? '#2a2934' : '#eff0f3',
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      // preload bundle 会 require('events') 等内建模块，沙箱 preload 只允许
      // electron/timers/url，故保持 sandbox:false；仍启用 contextIsolation
      // 并禁用 nodeIntegration。
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    if (settings.window.maximized) win.maximize();
    win.show();
  });

  const notifyMaximized = () => {
    win.webContents.send('win:maximized-changed', win.isMaximized());
  };
  win.on('maximize', notifyMaximized);
  win.on('unmaximize', notifyMaximized);

  win.on('close', (event) => {
    if (!isCloseAllowed()) {
      // 统一走关闭握手：询问关闭方式 → 等渲染层 flush → 再触发下一次 close。
      event.preventDefault();
      void requestWindowClose(win);
      return;
    }
    if (!win.isDestroyed()) {
      const normal = win.getNormalBounds();
      saveSettings({
        window: {
          width: normal.width,
          height: normal.height,
          x: normal.x,
          y: normal.y,
          maximized: win.isMaximized(),
        },
      });
    }
  });

  win.on('closed', () => {
    mainWindow = null;
    resetCloseState();
  });

  // Ctrl/⌘+滚轮缩放由预览面板自己处理（见 PreviewPane 的 wheel 监听），
  // 兜底禁掉 Chromium 的整页缩放，避免整个界面跟着一起变大变小。
  win.webContents.on('zoom-changed', () => {
    setImmediate(() => {
      if (win.isDestroyed()) return;
      if (win.webContents.getZoomLevel() !== 0) {
        win.webContents.setZoomLevel(0);
      }
    });
  });

  // 应用菜单被移除后，默认的 Toggle DevTools 加速键也随之消失，
  // 这里补回 Ctrl/Cmd+Shift+I 与 F12。
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const toggle =
      input.key === 'F12' ||
      ((input.control || input.meta) &&
        input.shift &&
        input.key.toLowerCase() === 'i');
    if (!toggle) return;
    win.webContents.toggleDevTools();
    event.preventDefault();
  });

  // 开发与打包都走 typstor:// 自定义 scheme，由 protocol.ts 从
  // .webpack/renderer 读取 HTML / JS / wasm，避免 file:// 的跨域限制。
  void win.loadURL(appUrl());

  if (process.env.TYPSTOR_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow = win;
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setTitleFromProject(name: string | null): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.setTitle(name ? `${name} — Typstor` : 'Typstor');
}

export function projectRelative(projectPath: string, target: string): string {
  return path.relative(projectPath, target).split(path.sep).join('/');
}
