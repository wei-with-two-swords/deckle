/**
 * 渲染进程崩溃 / 无响应处理。
 *
 * 崩溃时渲染层来不及执行关闭握手，此时不能默默白屏：提示用户重新载入，
 * 载入后 bootstrap → openProject → checkRecovery 会自动弹出恢复快照对话框。
 */
import { BrowserWindow, dialog } from 'electron';
import { t as translate } from './i18n';
import { acknowledgeCloseReady, resetCloseState } from './close';

/** 同一窗口连续崩溃时，避免对话框反复弹出形成死循环。 */
const reloadCounts = new WeakMap<BrowserWindow, number>();
const MAX_AUTO_PROMPTS = 2;

/** 崩溃处理链里 t() 不能再抛：DB 损坏时 readSettings 本身就可能失败。 */
function t(source: string): string {
  try {
    return translate(source);
  } catch {
    return source;
  }
}

interface CrashDetails {
  reason?: string;
  exitCode?: number;
}

function describeCrash(details?: CrashDetails): string {
  const reason = details?.reason;
  const exitCode = details?.exitCode;
  if (!reason) return '';
  return `\n${t('原因：')}${reason}${exitCode === undefined ? '' : ` (${exitCode})`}`;
}

/** 崩溃后解除关闭握手等待，避免窗口卡在「正在保存」。 */
function unblockClose(): void {
  resetCloseState();
  acknowledgeCloseReady();
}

export function attachCrashRecovery(win: BrowserWindow): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    // 正常退出（含我们主动关闭）不算崩溃。
    if (details.reason === 'clean-exit') return;
    console.error('[deckle] renderer gone:', details);
    unblockClose();

    const count = reloadCounts.get(win) ?? 0;
    if (count >= MAX_AUTO_PROMPTS) {
      console.error('[deckle] renderer crashed repeatedly; closing window');
      win.destroy();
      return;
    }

    const response = dialog.showMessageBoxSync({
      type: 'error',
      title: t('页面已崩溃'),
      message: t('预览或编辑器意外退出。可以重新载入并尝试恢复未保存的内容。'),
      detail: describeCrash(details),
      buttons: [t('重新载入'), t('关闭窗口')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response !== 0) {
      win.close();
      return;
    }
    reloadCounts.set(win, count + 1);
    win.webContents.reload();
  });

  win.on('unresponsive', () => {
    console.warn('[deckle] renderer unresponsive');
    const response = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: t('页面无响应'),
      message: t('界面暂时无响应，是否等待或重新载入？'),
      buttons: [t('重新载入'), t('继续等待')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) {
      unblockClose();
      reloadCounts.set(win, (reloadCounts.get(win) ?? 0) + 1);
      win.webContents.reload();
    }
  });
}
