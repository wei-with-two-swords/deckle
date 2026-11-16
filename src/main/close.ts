/** 窗口关闭流程：先询问关闭方式，再等渲染层把未保存内容落盘，最后才真正关闭。 */
import { app, BrowserWindow, dialog } from 'electron';
import type { CloseResult } from '../shared/api';
import { CH } from '../shared/channels';
import { t } from './i18n';
import { readSettings, saveSettings } from './settings';

const CLOSE_ACTIONS = ['app', 'window'] as const;
/** 渲染层无响应时的兜底：不能让关闭操作永远悬着。 */
const FLUSH_TIMEOUT_MS = 2000;

let closing = false;
let allowClose = false;
let flushResolve: (() => void) | null = null;

export function isCloseAllowed(): boolean {
  return allowClose;
}

export function resetCloseState(): void {
  closing = false;
  allowClose = false;
  flushResolve = null;
}

/** 渲染层完成 flush 后调用，提前结束等待。 */
export function acknowledgeCloseReady(): void {
  flushResolve?.();
}

async function askCloseAction(
  win: BrowserWindow | null,
  { force = false }: { force?: boolean } = {},
): Promise<'app' | 'window' | null> {
  const { closeAction } = readSettings();
  if (!force && (CLOSE_ACTIONS as readonly string[]).includes(closeAction)) {
    return closeAction as 'app' | 'window';
  }

  const options = {
    type: 'question' as const,
    title: t('关闭'),
    message: t('要关闭应用，还是只关闭当前窗口？'),
    detail: t('关闭应用会退出 Typstor；只关闭窗口则保留应用在后台运行。'),
    buttons: [t('关闭应用'), t('关闭窗口'), t('取消')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    checkboxLabel: t('记住我的选择'),
    checkboxChecked: false,
  };

  const { response, checkboxChecked } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);

  if (response === 2) return null;

  const action = response === 0 ? 'app' : 'window';
  if (checkboxChecked) saveSettings({ closeAction: action });

  return action;
}

function waitForRendererFlush(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (done: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      flushResolve = null;
      resolve(done);
    };
    const timer = setTimeout(() => finish(false), FLUSH_TIMEOUT_MS);
    flushResolve = () => finish(true);

    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      finish(false);
      return;
    }
    try {
      win.webContents.send(CH.APP_CLOSE_REQUEST);
    } catch {
      finish(false);
    }
  });
}

/**
 * 所有关闭入口（标题栏 ×、Alt+F4、app.quit()）统一走这里。
 * 取消对话框时不关闭；确认后先给渲染层一次落盘机会。
 */
export async function requestWindowClose(
  win: BrowserWindow | null,
  options: { force?: boolean } = {},
): Promise<CloseResult> {
  if (!win || win.isDestroyed() || closing) {
    return { closed: false, action: null };
  }
  closing = true;

  try {
    const action = await askCloseAction(win, options);
    if (!action) {
      closing = false;
      return { closed: false, action: null };
    }

    await waitForRendererFlush(win);

    allowClose = true;
    if (action === 'app') {
      app.quit();
    } else {
      win.close();
    }
    return { closed: true, action };
  } catch (error) {
    closing = false;
    throw error;
  }
}
