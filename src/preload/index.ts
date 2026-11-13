import { contextBridge, ipcRenderer } from 'electron';
import type { TypstorApi } from '../shared/api';
import { CH } from '../shared/channels';
import type {
  CompileShadow,
  CreateProjectRequest,
  ProjectConfigPatch,
  ProjectWatchChange,
  Settings,
  WorkspaceState,
} from '../shared/types';

const api: TypstorApi & { platform: string } = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke(CH.WIN_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(CH.WIN_TOGGLE_MAXIMIZE),
    isMaximized: () => ipcRenderer.invoke(CH.WIN_IS_MAXIMIZED),
    close: (force = false) => ipcRenderer.invoke(CH.WIN_CLOSE, force),
    onMaximizedChanged: (cb) => {
      const listener = (_event: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on(CH.WIN_MAXIMIZED_CHANGED, listener);
      return () => ipcRenderer.off(CH.WIN_MAXIMIZED_CHANGED, listener);
    },
  },
  project: {
    create: (req: CreateProjectRequest) =>
      ipcRenderer.invoke(CH.PROJECT_CREATE, req),
    importFile: () => ipcRenderer.invoke(CH.PROJECT_IMPORT),
    open: (req: { path?: string; readOnly?: boolean; skipRecent?: boolean }) =>
      ipcRenderer.invoke(CH.PROJECT_OPEN, req),
    recent: () => ipcRenderer.invoke(CH.PROJECT_RECENT),
    removeRecent: (path: string) =>
      ipcRenderer.invoke(CH.PROJECT_REMOVE_RECENT, path),
    wordCount: (path: string, override?: { path: string; content: string }) =>
      ipcRenderer.invoke(CH.PROJECT_WORD_COUNT, path, override),
    thumbnail: (path: string) => ipcRenderer.invoke(CH.PROJECT_THUMBNAIL, path),
    exportPdf: (path: string) =>
      ipcRenderer.invoke(CH.PROJECT_EXPORT_PDF, path),
    exportArchive: (path: string) =>
      ipcRenderer.invoke(CH.PROJECT_EXPORT_ARCHIVE, path),
    deleteProject: (path: string) =>
      ipcRenderer.invoke(CH.PROJECT_DELETE, path),
    saveWorkspace: (path: string, workspace: WorkspaceState) =>
      ipcRenderer.invoke(CH.PROJECT_SAVE_WORKSPACE, path, workspace),
    updateConfig: (path: string, patch: ProjectConfigPatch) =>
      ipcRenderer.invoke(CH.PROJECT_UPDATE_CONFIG, path, patch),
    search: (path: string, query: string, caseSensitive?: boolean) =>
      ipcRenderer.invoke(CH.PROJECT_SEARCH, path, query, caseSensitive),
    stopWatch: (path: string) =>
      ipcRenderer.invoke(CH.PROJECT_WATCH_STOP, path),
    onChanged: (cb) => {
      const listener = (_event: unknown, change: ProjectWatchChange) =>
        cb(change);
      ipcRenderer.on(CH.PROJECT_WATCH_EVENT, listener);
      return () => ipcRenderer.off(CH.PROJECT_WATCH_EVENT, listener);
    },
  },
  snapshot: {
    save: (projectPath: string, filePath: string, content: string) =>
      ipcRenderer.invoke(CH.SNAPSHOT_SAVE, projectPath, filePath, content),
    list: (projectPath: string) =>
      ipcRenderer.invoke(CH.SNAPSHOT_LIST, projectPath),
    delete: (id: number) => ipcRenderer.invoke(CH.SNAPSHOT_DELETE, id),
    clear: (projectPath: string) =>
      ipcRenderer.invoke(CH.SNAPSHOT_CLEAR, projectPath),
  },
  fs: {
    readDir: (path: string) => ipcRenderer.invoke(CH.FS_READ_DIR, path),
    readFile: (path: string) => ipcRenderer.invoke(CH.FS_READ_FILE, path),
    writeFile: (
      path: string,
      content: string,
      expectedMtimeMs?: number,
      force?: boolean,
    ) =>
      ipcRenderer.invoke(
        CH.FS_WRITE_FILE,
        path,
        content,
        expectedMtimeMs,
        force,
      ),
    createEntry: (
      projectPath: string,
      parentDir: string,
      name: string,
      kind: 'file' | 'directory',
      content?: string,
    ) =>
      ipcRenderer.invoke(
        CH.FS_CREATE_ENTRY,
        projectPath,
        parentDir,
        name,
        kind,
        content,
      ),
    renameEntry: (projectPath: string, path: string, name: string) =>
      ipcRenderer.invoke(CH.FS_RENAME_ENTRY, projectPath, path, name),
    deleteEntry: (projectPath: string, path: string) =>
      ipcRenderer.invoke(CH.FS_DELETE_ENTRY, projectPath, path),
    importFiles: (projectPath: string, targetDir: string) =>
      ipcRenderer.invoke(CH.FS_IMPORT_FILES, projectPath, targetDir),
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.SETTINGS_GET),
    set: (patch: Partial<Settings>) =>
      ipcRenderer.invoke(CH.SETTINGS_SET, patch),
  },
  fonts: {
    list: () => ipcRenderer.invoke(CH.FONTS_LIST),
  },
  templates: {
    list: () => ipcRenderer.invoke(CH.TEMPLATES_LIST),
    import: () => ipcRenderer.invoke(CH.TEMPLATES_IMPORT),
    remove: (id: string) => ipcRenderer.invoke(CH.TEMPLATES_DELETE, id),
  },
  compile: {
    document: (
      projectPath: string,
      mainFile: string,
      content: string,
      shadows?: CompileShadow[],
    ) =>
      ipcRenderer.invoke(
        CH.COMPILE_DOCUMENT,
        projectPath,
        mainFile,
        content,
        shadows,
      ),
  },
  exportPdf: {
    run: (
      projectPath: string,
      mainFile: string,
      content: string,
      targetPath?: string,
      shadows?: CompileShadow[],
    ) =>
      ipcRenderer.invoke(
        CH.EXPORT_PDF,
        projectPath,
        mainFile,
        content,
        targetPath,
        shadows,
      ),
  },
  app: {
    info: () => ipcRenderer.invoke(CH.APP_INFO),
    openExternal: (url: string) =>
      ipcRenderer.invoke(CH.APP_OPEN_EXTERNAL, url),
    showItem: (path: string) => ipcRenderer.invoke(CH.APP_SHOW_ITEM, path),
  },
};

contextBridge.exposeInMainWorld('typstor', api);
