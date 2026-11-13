import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CH } from '../../shared/channels';
import type {
  CompileShadow,
  CreateProjectRequest,
  Err,
  Ok,
  ProjectConfigPatch,
  Result,
  Settings,
  SnapshotInfo,
  WorkspaceState,
} from '../../shared/types';
import { AppError, toErrorCode, toErrorMessage } from '../errors';
import { compileProject, exportProjectPdf } from '../compile';
import {
  assertInside,
  createProject,
  createProjectEntry,
  deleteProjectEntry,
  forgetRecentProject,
  importProjectFile,
  importProjectFiles,
  openProject,
  readProjectDirectory,
  readProjectFile,
  recentProjects,
  renameProjectEntry,
  saveProjectWorkspace,
  updateProjectConfig,
  writeProjectFile,
} from '../projects';
import {
  deleteProjectFolder,
  exportProjectArchive,
  exportProjectPdfFile,
  projectThumbnail,
} from '../projectOps';
import { countProjectWords } from '../wordCount';
import {
  clearSnapshots,
  latestSnapshots,
  removeSnapshot,
  saveSnapshot,
  snapshotPreview,
} from '../db';
import { readSettings, saveSettings } from '../settings';
import { searchProject } from '../search';
import { listSystemFonts } from '../fonts';
import { deleteTemplate, importTemplate, listTemplates } from '../templates';
import { startProjectWatcher, stopProjectWatcher } from '../watcher';
import { getMainWindow, setTitleFromProject } from '../window';
import { t } from '../i18n';

function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

function fail(error: unknown): Err {
  return {
    ok: false,
    code: toErrorCode(error),
    message: toErrorMessage(error),
  };
}

function assertSender(event: IpcMainInvokeEvent): void {
  const win = getMainWindow();
  if (!win || event.sender !== win.webContents) {
    throw new Error(t('非法的 IPC 调用来源'));
  }
}

function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertSender(event);
      return ok(await fn(event, ...(args as TArgs)));
    } catch (error) {
      return fail(error);
    }
  });
}

const CLOSE_ACTIONS = ['app', 'window'] as const;

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

function closeWindow(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.close();
}

export function registerIpcHandlers(): void {
  handle(CH.WIN_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  handle(CH.WIN_TOGGLE_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  handle(CH.WIN_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  handle(CH.WIN_CLOSE, async (event, force: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const action = await askCloseAction(win, { force });

    if (!action) return { closed: false, action: null };

    if (action === 'app') {
      setImmediate(() => app.quit());
    } else {
      setImmediate(() => closeWindow(win));
    }

    return { closed: true, action };
  });

  handle(CH.PROJECT_CREATE, async (_event, request: CreateProjectRequest) => {
    const result = await createProject(request);
    setTitleFromProject(result.config.name);
    startProjectWatcher(result.path);
    return result;
  });

  handle(
    CH.PROJECT_OPEN,
    async (
      _event,
      request: { path?: string; readOnly?: boolean; skipRecent?: boolean } = {},
    ) => {
      const result = await openProject(request.path, {
        readOnly: request.readOnly,
        skipRecent: request.skipRecent,
      });
      if (result) {
        setTitleFromProject(result.config.name);
        if (!request.readOnly) startProjectWatcher(result.path);
        else stopProjectWatcher();
      }
      return result;
    },
  );

  handle(CH.PROJECT_IMPORT, async () => {
    const result = await importProjectFile();
    if (result) {
      setTitleFromProject(result.config.name);
      startProjectWatcher(result.path);
    }
    return result;
  });

  handle(CH.PROJECT_WATCH_STOP, () => {
    stopProjectWatcher();
  });

  handle(CH.PROJECT_RECENT, () => recentProjects());

  handle(CH.PROJECT_REMOVE_RECENT, (_event, projectPath: string) => {
    forgetRecentProject(projectPath);
  });

  handle(
    CH.PROJECT_WORD_COUNT,
    async (
      _event,
      projectPath: string,
      override?: { path: string; content: string },
    ) => countProjectWords(projectPath, override),
  );

  handle(CH.PROJECT_THUMBNAIL, async (_event, projectPath: string) => {
    const vector = await projectThumbnail(projectPath);
    return vector ? { vector } : null;
  });

  handle(CH.PROJECT_EXPORT_PDF, (_event, projectPath: string) => {
    return exportProjectPdfFile(projectPath);
  });

  handle(CH.PROJECT_EXPORT_ARCHIVE, (_event, projectPath: string) => {
    return exportProjectArchive(projectPath);
  });

  handle(CH.PROJECT_DELETE, async (_event, projectPath: string) => {
    await deleteProjectFolder(projectPath);
  });

  handle(
    CH.PROJECT_SAVE_WORKSPACE,
    async (_event, projectPath: string, workspace: WorkspaceState) => {
      await saveProjectWorkspace(projectPath, workspace);
    },
  );

  handle(
    CH.PROJECT_UPDATE_CONFIG,
    async (_event, projectPath: string, patch: ProjectConfigPatch) => {
      const config = await updateProjectConfig(projectPath, patch);
      setTitleFromProject(config.name);
      return config;
    },
  );

  handle(
    CH.PROJECT_SEARCH,
    (_event, projectPath: string, query: string, caseSensitive?: boolean) => {
      return searchProject(projectPath, query, caseSensitive);
    },
  );

  handle(
    CH.SNAPSHOT_SAVE,
    (_event, projectPath: string, filePath: string, content: string) => {
      assertInside(projectPath);
      assertInside(filePath);
      if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) {
        throw new AppError('EINVAL', t('快照内容过大'));
      }
      saveSnapshot(projectPath, filePath, content);
    },
  );

  handle(CH.SNAPSHOT_LIST, async (_event, projectPath: string) => {
    assertInside(projectPath);
    const rows = latestSnapshots(projectPath);
    const result: SnapshotInfo[] = [];
    for (const row of rows) {
      let exists = true;
      let disk = '';
      try {
        disk = await fs.readFile(row.file_path, 'utf8');
      } catch {
        exists = false;
      }
      if (exists && disk.replace(/^\uFEFF/, '') === row.content) {
        continue;
      }
      result.push({
        id: row.id,
        projectPath: row.project_path,
        filePath: row.file_path,
        content: row.content,
        createdAt: row.created_at,
        preview: snapshotPreview(row.content),
        exists,
      });
    }
    return result;
  });

  handle(CH.SNAPSHOT_DELETE, (_event, id: number) => {
    removeSnapshot(id);
  });

  handle(CH.SNAPSHOT_CLEAR, (_event, projectPath: string) => {
    assertInside(projectPath);
    clearSnapshots(projectPath);
  });

  handle(CH.FS_READ_DIR, (_event, dirPath: string) => {
    return readProjectDirectory(dirPath);
  });

  handle(CH.FS_READ_FILE, (_event, filePath: string) => {
    return readProjectFile(filePath);
  });

  handle(
    CH.FS_WRITE_FILE,
    (
      _event,
      filePath: string,
      content: string,
      expectedMtimeMs?: number,
      force?: boolean,
    ) => {
      return writeProjectFile(filePath, content, expectedMtimeMs, force);
    },
  );

  handle(
    CH.FS_CREATE_ENTRY,
    (
      _event,
      projectPath: string,
      parentDir: string,
      name: string,
      kind: 'file' | 'directory',
      content?: string,
    ) => {
      return createProjectEntry(
        projectPath,
        parentDir,
        name,
        kind,
        content ?? '',
      );
    },
  );

  handle(
    CH.FS_RENAME_ENTRY,
    (_event, projectPath: string, entryPath: string, name: string) => {
      return renameProjectEntry(projectPath, entryPath, name);
    },
  );

  handle(
    CH.FS_DELETE_ENTRY,
    (_event, projectPath: string, entryPath: string) => {
      return deleteProjectEntry(projectPath, entryPath);
    },
  );

  handle(
    CH.FS_IMPORT_FILES,
    (_event, projectPath: string, targetDir: string) => {
      return importProjectFiles(projectPath, targetDir);
    },
  );

  handle(CH.SETTINGS_GET, () => readSettings());

  handle(CH.FONTS_LIST, () => {
    const settings = readSettings();
    const extraDirs = Array.isArray(settings.fonts?.extraDirs)
      ? settings.fonts.extraDirs.filter(
          (dir): dir is string => typeof dir === 'string' && dir.length > 0,
        )
      : [];
    return listSystemFonts(extraDirs);
  });

  handle(CH.TEMPLATES_LIST, () => listTemplates());

  handle(CH.TEMPLATES_IMPORT, async () => importTemplate());

  handle(CH.TEMPLATES_DELETE, async (_event, id: string) => {
    if (typeof id !== 'string' || !id) {
      throw new AppError('EINVAL', t('模板标识无效'));
    }
    await deleteTemplate(id);
  });

  handle(
    CH.COMPILE_DOCUMENT,
    (
      _event,
      projectPath: string,
      mainFile: string,
      content: string,
      shadows?: CompileShadow[],
    ) => {
      return compileProject(projectPath, mainFile, content, shadows);
    },
  );

  handle(
    CH.EXPORT_PDF,
    async (
      event,
      projectPath: string,
      mainFile: string,
      content: string,
      targetPath?: string,
      shadows?: CompileShadow[],
    ) => {
      if (typeof targetPath === 'string' && targetPath.length > 0) {
        if (path.extname(targetPath).toLowerCase() !== '.pdf') {
          throw new AppError('EINVAL', t('导出文件必须使用 .pdf 扩展名'));
        }
        assertInside(targetPath);
        return exportProjectPdf(
          projectPath,
          mainFile,
          content,
          targetPath,
          shadows,
        );
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      const base = path.basename(mainFile, path.extname(mainFile));
      const options = {
        title: t('导出 PDF'),
        defaultPath: path.join(projectPath, `${base}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      };
      const { canceled, filePath } = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (canceled || !filePath) return null;
      return exportProjectPdf(
        projectPath,
        mainFile,
        content,
        filePath,
        shadows,
      );
    },
  );

  handle(CH.SETTINGS_SET, (event, patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setBackgroundColor(next.theme === 'dark' ? '#2a2934' : '#eff0f3');
    return next;
  });

  handle(CH.APP_INFO, () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    node: process.versions.node,
    chrome: process.versions.chrome,
  }));

  handle(CH.APP_OPEN_EXTERNAL, async (_event, url: string) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError('EINVAL', t('链接格式无效'));
    }
    const allowedHosts = new Set(['typst.app', 'www.typst.app']);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      throw new AppError('EINVAL', t('只允许打开 Typst 官方文档链接'));
    }
    await shell.openExternal(parsed.toString());
  });

  handle(CH.APP_SHOW_ITEM, async (_event, itemPath: string) => {
    if (typeof itemPath !== 'string' || itemPath.length === 0) {
      throw new AppError('EINVAL', t('路径无效'));
    }
    const absolute = path.resolve(itemPath);
    await fs.access(absolute);
    shell.showItemInFolder(absolute);
  });
}

export type IpcResult<T> = Result<T>;
