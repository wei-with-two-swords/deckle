import { create } from 'zustand';
import { dirOf, joinRelative, samePath } from '../../shared/paths';
import { allDirsExpanded, rootOnlyExpanded } from '../lib/treeExpand';
import { isOutlineAllCollapsed } from '../lib/documentOutline';
import { buildCompileInput } from '../lib/compileInput';
import { classifyWatchEvent, PendingWrites } from '../lib/saveReconcile';
import type {
  CompileDiagnostic,
  FileEntry,
  ProjectConfigPatch,
  ProjectOpenResult,
  ProjectWatchChange,
  RailView,
  RecentProject,
  Result,
  Settings,
  SnapshotInfo,
  TemplateInfo,
  ThemeMode,
  WorkspaceState,
} from '../../shared/types';
import { t } from '../lib/i18n';

class ApiError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.code);
  return result.data;
}

/** 编译与导出共用：始终以项目主文件为根，编辑中的章节按自身路径注入。 */
function projectCompileInput(
  project: { path: string; config: { mainFile: string } },
  doc: OpenDocument,
) {
  return buildCompileInput({
    projectPath: project.path,
    mainFile: project.config.mainFile,
    activePath: doc.path,
    activeContent: doc.content,
    readFile: async (path) => {
      const raw = await window.typstor.fs.readFile(path);
      if (!raw.ok) throw new Error(raw.message);
      return raw.data.content;
    },
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toRelative(base: string, absolute: string): string {
  const normalizedBase = base.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = absolute.replace(/\\/g, '/');
  if (normalized.startsWith(`${normalizedBase}/`)) {
    return normalized.slice(normalizedBase.length + 1);
  }
  return normalized;
}

let workspaceTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let compileTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let wordCountTimer: ReturnType<typeof setTimeout> | null = null;
let compileSeq = 0;
/** 编译在飞行中时只保留最新请求，避免连续输入把子进程排满。 */
let compileInFlight = false;
let compilePending = false;
/** 正在写入的内容：区分自己的写入回声与外部程序修改。 */
const pendingWrites = new PendingWrites();
/** 正在进行的写盘操作：关闭/切项目时要等它结束，不能只靠 saveState 判断。 */
let activeSave: Promise<boolean> | null = null;

/** 字数统计要遍历项目文件，保存/文件变更时合并成一次，避免频繁扫描。 */
function scheduleWordCount(): void {
  if (wordCountTimer) clearTimeout(wordCountTimer);
  wordCountTimer = setTimeout(() => {
    wordCountTimer = null;
    void useAppStore.getState().refreshWordCount();
  }, 600);
}

export type CompileStatus = 'idle' | 'compiling' | 'ready' | 'error';

export type ToastKind = 'info' | 'error';

export type SettingsSection = 'general' | 'appearance' | 'files' | 'about';

export type SaveState = 'idle' | 'saving' | 'saved' | 'dirty' | 'error';

export type WelcomeLayout = 'grid' | 'table';

export type WelcomeSortMode = 'created' | 'modified' | 'name';

export interface FileConflict {
  path: string;
  /** 编辑器中的本地内容（覆盖保存时写入这一份）。 */
  localContent: string;
  /** 磁盘上的外部版本（重新载入时使用这一份）。 */
  diskContent: string;
}

export interface OpenDocument {
  path: string;
  content: string;
  savedContent: string;
  mtimeMs: number;
  /** 每次从磁盘载入/重载 +1，编辑器据此重建 */
  revision: number;
}

export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

export interface AppState {
  ready: boolean;
  platform: string;
  settings: Settings | null;
  theme: ThemeMode;
  view: 'welcome' | 'project';
  readOnly: boolean;
  recent: RecentProject[];
  project: ProjectOpenResult | null;
  tree: Record<string, FileEntry[]>;
  expanded: Record<string, boolean>;
  loading: Record<string, boolean>;
  activeFile: string | null;
  doc: OpenDocument | null;
  fileLoading: boolean;
  saveState: SaveState;
  conflict: FileConflict | null;
  recovery: SnapshotInfo[] | null;
  compileStatus: CompileStatus;
  compileDurationMs: number;
  diagnostics: CompileDiagnostic[];
  pageCount: number;
  artifact: Uint8Array | null;
  artifactVersion: number;
  /** 同步滚动：编辑区点击后请求预览跳转到对应位置的瞬时信号（nonce 保证重复点击也触发） */
  syncScrollRequest: { line: number; totalLines: number; nonce: number } | null;
  /** 项目内所有 .typ 文件的字数总和（编辑中的文件按实时内容计） */
  projectWordCount: number | null;
  panelVisible: boolean;
  panelWidth: number;
  split: number;
  zoom: number;
  railView: RailView;
  settingsOpen: boolean;
  settingsSection: SettingsSection | null;
  newProjectOpen: boolean;
  newProjectTemplateId: string;
  newProjectTemplateName: string;
  templates: TemplateInfo[];
  welcomeLayout: WelcomeLayout;
  welcomeSort: WelcomeSortMode;
  toast: ToastMessage | null;

  // 大纲折叠 UI 状态（提升到此处，便于面板标题行的「全部折叠/展开」按钮与大纲内容共享）
  outlineHeadingIds: string[];
  outlineHeadingsCollapsed: Set<string>;
  outlineFiguresCollapsed: boolean;
  outlineTablesCollapsed: boolean;
  /** 顶部切换按钮的二态：true=已折叠到只显示一级标题、图/表分组收起 */
  outlineAllCollapsed: boolean;
  setOutlineHeadingIds(ids: string[]): void;
  toggleOutlineHeading(id: string): void;
  toggleOutlineFigures(): void;
  toggleOutlineTables(): void;
  toggleOutlineAll(): void;

  bootstrap(): Promise<void>;
  setTheme(theme: ThemeMode): Promise<void>;
  setSettingsOpen(open: boolean, section?: SettingsSection | null): void;
  setNewProjectOpen(
    open: boolean,
    templateId?: string,
    templateName?: string,
  ): void;
  patchSettings(patch: Partial<Settings>): Promise<Settings | null>;
  refreshRecent(): Promise<void>;
  removeRecent(path: string): Promise<void>;
  exportProjectPdfFile(path: string): Promise<boolean>;
  exportProjectArchiveFile(path: string): Promise<boolean>;
  deleteProjectFolder(path: string): Promise<boolean>;
  refreshTemplates(): Promise<void>;
  importTemplate(): Promise<TemplateInfo | null>;
  deleteTemplate(id: string): Promise<boolean>;
  openProject(
    path?: string,
    options?: {
      readOnly?: boolean;
      skipRecent?: boolean;
      displayName?: string;
    },
  ): Promise<boolean>;
  previewTemplate(id: string): Promise<boolean>;
  importProject(): Promise<boolean>;
  createProject(name: string): Promise<boolean>;
  updateProjectConfig(patch: ProjectConfigPatch): Promise<boolean>;
  closeProject(): Promise<void>;
  /** 窗口关闭握手：清掉定时器、落盘文档与工作区状态。 */
  flushForClose(): Promise<void>;
  loadDir(dir: string): Promise<void>;
  createEntry(
    parentDir: string,
    name: string,
    kind: 'file' | 'directory',
  ): Promise<string | null>;
  renameEntry(path: string, name: string): Promise<boolean>;
  deleteEntry(path: string): Promise<boolean>;
  importFiles(targetDir: string): Promise<boolean>;
  setAllDirsExpanded(expand: boolean): Promise<void>;
  toggleDir(dir: string): void;
  selectFile(file: string): void;
  openFile(file: string): Promise<boolean>;
  updateDoc(content: string): void;
  saveDoc(): Promise<boolean>;
  resolveConflict(action: 'reload' | 'overwrite' | 'cancel'): Promise<void>;
  handleWatchEvent(change: ProjectWatchChange): void;
  checkRecovery(): Promise<void>;
  restoreSnapshot(id: number): Promise<void>;
  dismissRecovery(clear?: boolean): Promise<void>;
  armCompile(delay?: number): void;
  compileNow(): Promise<void>;
  exportPdf(targetPath?: string): Promise<void>;
  showItem(path: string): Promise<void>;
  setPanelWidth(width: number): void;
  setSplit(split: number): void;
  togglePanel(): void;
  setRailView(view: RailView): void;
  setWelcomeLayout(layout: WelcomeLayout): void;
  setWelcomeSort(sort: WelcomeSortMode): void;
  setZoom(zoom: number): void;
  /** 同步滚动：记录编辑区点击的行列信息，供预览区跳转使用 */
  requestSyncScroll(line: number, totalLines: number): void;
  refreshWordCount(): Promise<void>;
  showToast(text: string, kind?: ToastKind): void;
  scheduleWorkspaceSave(): void;
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}

export const useAppStore = create<AppState>((set, get) => {
  const buildWorkspace = (): WorkspaceState => {
    const state = get();
    const workspace: WorkspaceState = {
      version: 1,
      activeView: state.railView,
      panelVisible: state.panelVisible,
      panelWidth: state.panelWidth,
      split: state.split,
      zoom: state.zoom,
      openFile:
        state.activeFile && state.project
          ? toRelative(state.project.path, state.activeFile)
          : null,
      scroll: {},
    };
    return workspace;
  };

  const scheduleSave = () => {
    if (workspaceTimer) clearTimeout(workspaceTimer);
    workspaceTimer = setTimeout(() => {
      workspaceTimer = null;
      const { project, readOnly } = get();
      if (!project || readOnly) return;
      void window.typstor.project
        .saveWorkspace(project.path, buildWorkspace())
        .catch(() => undefined);
    }, 500);
  };

  const scheduleAutosave = () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    const state = get();
    if (state.readOnly) return;
    if (!state.settings?.editor.autosave || !state.doc) return;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      if (get().conflict) return;
      void get().saveDoc();
    }, 300);
  };

  const scheduleSnapshot = (delay = 3000) => {
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      const { project, doc, readOnly } = get();
      if (!project || !doc || readOnly) return;
      void window.typstor.snapshot
        .save(project.path, doc.path, doc.content)
        .catch(() => undefined);
    }, delay);
  };

  const armCompile = (delay = 400) => {
    if (compileTimer) {
      clearTimeout(compileTimer);
      compileTimer = null;
    }
    compileTimer = setTimeout(() => {
      compileTimer = null;
      void get().compileNow();
    }, delay);
  };

  const clearTimers = () => {
    for (const timer of [
      workspaceTimer,
      autosaveTimer,
      compileTimer,
      snapshotTimer,
      wordCountTimer,
    ]) {
      if (timer) clearTimeout(timer);
    }
    workspaceTimer = null;
    autosaveTimer = null;
    compileTimer = null;
    snapshotTimer = null;
    wordCountTimer = null;
  };

  const applyProject = async (
    result: ProjectOpenResult,
    options: { readOnly?: boolean; displayName?: string } = {},
  ) => {
    applyTheme(get().theme);
    const nextProject = options.displayName
      ? {
          ...result,
          config: { ...result.config, name: options.displayName },
        }
      : result;
    const initialFile = joinRelative(
      nextProject.path,
      nextProject.workspace.openFile ?? nextProject.config.mainFile,
    );
    set({
      project: nextProject,
      view: 'project',
      readOnly: options.readOnly ?? false,
      railView: nextProject.workspace.activeView,
      panelVisible: nextProject.workspace.panelVisible,
      panelWidth: nextProject.workspace.panelWidth,
      split: nextProject.workspace.split,
      zoom: nextProject.workspace.zoom,
      activeFile: initialFile,
      doc: null,
      fileLoading: false,
      saveState: 'idle',
      compileStatus: 'idle',
      compileDurationMs: 0,
      diagnostics: [],
      pageCount: 0,
      artifact: null,
      tree: {},
      expanded: { [nextProject.path]: true },
      loading: {},
      outlineHeadingIds: [],
      outlineHeadingsCollapsed: new Set<string>(),
      outlineFiguresCollapsed: false,
      outlineTablesCollapsed: false,
      outlineAllCollapsed: false,
      syncScrollRequest: null,
      projectWordCount: null,
    });
    await get().loadDir(nextProject.path);
    if (initialFile) await get().openFile(initialFile);
    void get().refreshWordCount();
    armCompile(0);
    await get().refreshRecent();
    if (!options.readOnly) void get().checkRecovery();
  };

  return {
    ready: false,
    platform: 'win32',
    settings: null,
    theme: 'light',
    view: 'welcome',
    readOnly: false,
    recent: [],
    project: null,
    tree: {},
    expanded: {},
    loading: {},
    activeFile: null,
    doc: null,
    fileLoading: false,
    saveState: 'idle',
    conflict: null,
    recovery: null,
    compileStatus: 'idle',
    compileDurationMs: 0,
    diagnostics: [],
    pageCount: 0,
    outlineHeadingIds: [],
    outlineHeadingsCollapsed: new Set<string>(),
    outlineFiguresCollapsed: false,
    outlineTablesCollapsed: false,
    outlineAllCollapsed: false,
    artifact: null,
    artifactVersion: 0,
    syncScrollRequest: null,
    projectWordCount: null,
    panelVisible: true,
    panelWidth: 260,
    split: 0.573746,
    zoom: 1,
    railView: 'files',
    settingsOpen: false,
    settingsSection: null,
    newProjectOpen: false,
    newProjectTemplateId: 'paper',
    newProjectTemplateName: '论文模板',
    templates: [],
    welcomeLayout: 'grid',
    welcomeSort: 'created',
    toast: null,

    async bootstrap() {
      try {
        const settings = unwrap(await window.typstor.settings.get());
        const platform = window.typstor.platform;
        const theme = settings.theme;
        applyTheme(theme);
        set({ settings, theme, platform });
        await get().refreshRecent();
        await get().refreshTemplates();

        if (settings.lastProject) {
          await get().openProject(settings.lastProject);
        }
      } catch (error) {
        get().showToast(errorText(error), 'error');
      } finally {
        set({ ready: true });
      }
    },

    async setTheme(theme) {
      applyTheme(theme);
      set({ theme });
      const next = await get().patchSettings({ theme });
      if (!next) applyTheme(get().settings?.theme ?? 'light');
    },

    setSettingsOpen(open, section = null) {
      set({ settingsOpen: open, settingsSection: section });
    },

    setNewProjectOpen(open, templateId = 'paper', templateName = '论文模板') {
      set({
        newProjectOpen: open,
        newProjectTemplateId: templateId,
        newProjectTemplateName: templateName,
      });
    },

    async patchSettings(patch) {
      try {
        const settings = unwrap(await window.typstor.settings.set(patch));
        set({ settings });
        return settings;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return null;
      }
    },

    async refreshRecent() {
      try {
        const recent = unwrap(await window.typstor.project.recent());
        set({ recent });
      } catch (error) {
        get().showToast(errorText(error), 'error');
      }
    },

    async removeRecent(path) {
      try {
        unwrap(await window.typstor.project.removeRecent(path));
        await get().refreshRecent();
      } catch (error) {
        get().showToast(errorText(error), 'error');
      }
    },

    async exportProjectPdfFile(path) {
      try {
        const result = unwrap(await window.typstor.project.exportPdf(path));
        if (!result) return false;
        get().showToast(t('已导出 PDF：{path}', { path: result.path }));
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async exportProjectArchiveFile(path) {
      try {
        const result = unwrap(await window.typstor.project.exportArchive(path));
        if (!result) return false;
        get().showToast(t('已导出压缩包：{path}', { path: result.path }));
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async deleteProjectFolder(path) {
      try {
        unwrap(await window.typstor.project.deleteProject(path));
        await get().refreshRecent();
        get().showToast(t('项目已删除'));
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async refreshTemplates() {
      try {
        const templates = unwrap(await window.typstor.templates.list());
        set({ templates });
      } catch (error) {
        get().showToast(errorText(error), 'error');
      }
    },

    async importTemplate() {
      try {
        const template = unwrap(await window.typstor.templates.import());
        if (!template) return null;
        await get().refreshTemplates();
        get().showToast(t('模板已导入：{name}', { name: template.name }));
        return template;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return null;
      }
    },

    async deleteTemplate(id) {
      try {
        unwrap(await window.typstor.templates.remove(id));
        await get().refreshTemplates();
        get().showToast(t('模板已删除'));
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async openProject(explicitPath, options) {
      try {
        const result = unwrap(
          await window.typstor.project.open({
            path: explicitPath,
            readOnly: options?.readOnly,
            skipRecent: options?.skipRecent,
          }),
        );
        if (!result) return false;
        await applyProject(result, options);
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async previewTemplate(id) {
      const template = get().templates.find((item) => item.id === id);
      if (!template) return false;
      return get().openProject(template.path, {
        readOnly: true,
        skipRecent: true,
        displayName: template.name,
      });
    },

    async importProject() {
      try {
        const result = unwrap(await window.typstor.project.importFile());
        if (!result) return false;
        await applyProject(result);
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async createProject(name) {
      try {
        const result = unwrap(
          await window.typstor.project.create({
            name,
            parentDir: null,
            templateId: get().newProjectTemplateId,
          }),
        );
        await applyProject(result);
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async updateProjectConfig(patch) {
      const project = get().project;
      if (!project) return false;
      try {
        const config = unwrap(
          await window.typstor.project.updateConfig(project.path, patch),
        );
        set({ project: { ...project, config } });
        await get().refreshRecent();
        if (patch.mainFile) armCompile(0);
        get().showToast(t('项目设置已保存'));
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async closeProject() {
      clearTimers();
      const project = get().project;
      if (project) {
        void window.typstor.project
          .stopWatch(project.path)
          .catch(() => undefined);
      }
      compileSeq += 1;
      const wasReadOnly = get().readOnly;
      const doc = get().doc;
      // 必须等保存结束再清掉 doc：saveDoc 的成功回调依赖它更新 savedContent。
      if (project && doc && !wasReadOnly && doc.content !== doc.savedContent) {
        const saved = await get().saveDoc();
        if (!saved) {
          await window.typstor.snapshot
            .save(project.path, doc.path, doc.content)
            .catch(() => undefined);
          get().showToast(t('保存失败，内容已存入恢复快照'), 'error');
        }
        clearTimers();
      }
      set({
        view: 'welcome',
        readOnly: false,
        project: null,
        tree: {},
        expanded: {},
        activeFile: null,
        doc: null,
        fileLoading: false,
        saveState: 'idle',
        conflict: null,
        recovery: null,
        compileStatus: 'idle',
        compileDurationMs: 0,
        diagnostics: [],
        pageCount: 0,
        artifact: null,
        projectWordCount: null,
        panelVisible: true,
      });
      void get().refreshRecent();
      if (!wasReadOnly) void get().patchSettings({ lastProject: null });
    },

    async flushForClose() {
      clearTimers();
      compileSeq += 1;
      const { project, doc, conflict, readOnly } = get();
      if (!project || readOnly) return;

      if (doc && doc.content !== doc.savedContent) {
        if (!conflict) {
          await get().saveDoc();
        } else {
          // 有冲突时不擅自覆盖磁盘版本，至少把本地内容留进恢复快照。
          await window.typstor.snapshot
            .save(project.path, doc.path, doc.content)
            .catch(() => undefined);
        }
      }

      // saveDoc 可能重新挂上自动编译/字数定时器，落盘后统一清掉。
      clearTimers();
      // 保存期间又产生了编辑，或保存被冲突拦下：至少留一份恢复快照。
      const after = get();
      if (after.doc && after.doc.content !== after.doc.savedContent) {
        await window.typstor.snapshot
          .save(project.path, after.doc.path, after.doc.content)
          .catch(() => undefined);
      }
      await window.typstor.project
        .saveWorkspace(project.path, buildWorkspace())
        .catch(() => undefined);
    },

    async loadDir(dir) {
      if (get().loading[dir]) return;
      set((state) => ({ loading: { ...state.loading, [dir]: true } }));
      try {
        const entries = unwrap(await window.typstor.fs.readDir(dir));
        set((state) => ({
          tree: { ...state.tree, [dir]: entries },
          loading: { ...state.loading, [dir]: false },
        }));
      } catch (error) {
        set((state) => ({
          loading: { ...state.loading, [dir]: false },
        }));
        get().showToast(errorText(error), 'error');
      }
    },

    async createEntry(parentDir, name, kind) {
      const project = get().project;
      if (!project) return null;

      try {
        const entry = unwrap(
          await window.typstor.fs.createEntry(
            project.path,
            parentDir,
            name,
            kind,
          ),
        );
        // 目标目录可能处于折叠态（尤其是项目根目录），展开以便看到新建结果。
        set((s) => ({ expanded: { ...s.expanded, [parentDir]: true } }));
        await get().loadDir(parentDir);
        get().showToast(
          kind === 'directory' ? t('文件夹已创建') : t('文件已创建'),
        );
        scheduleSave();
        return entry.path;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return null;
      }
    },

    async renameEntry(entryPath, name) {
      const project = get().project;
      if (!project) return false;

      const active = get().activeFile;
      const touchesActive =
        active === entryPath ||
        (active?.startsWith(`${entryPath}\\`) ?? false) ||
        (active?.startsWith(`${entryPath}/`) ?? false);

      if (touchesActive) {
        await get().saveDoc();
        set({ doc: null, activeFile: null, saveState: 'idle' });
      }

      try {
        const entry = unwrap(
          await window.typstor.fs.renameEntry(project.path, entryPath, name),
        );
        set((s) => {
          const tree: Record<string, FileEntry[]> = {};
          for (const [key, entries] of Object.entries(s.tree)) {
            if (key === entryPath || key.startsWith(`${entryPath}\\`)) continue;
            tree[key] = entries;
          }
          const expanded: Record<string, boolean> = {};
          for (const [key, value] of Object.entries(s.expanded)) {
            if (key === entryPath || key.startsWith(`${entryPath}\\`)) {
              expanded[`${entry.path}${key.slice(entryPath.length)}`] = value;
            } else {
              expanded[key] = value;
            }
          }
          return { tree, expanded };
        });
        await get().loadDir(dirOf(entry.path));
        get().showToast(t('已重命名'));
        scheduleSave();
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async deleteEntry(entryPath) {
      const project = get().project;
      if (!project) return false;

      const active = get().activeFile;
      const touchesActive =
        active === entryPath ||
        (active?.startsWith(`${entryPath}\\`) ?? false) ||
        (active?.startsWith(`${entryPath}/`) ?? false);

      if (touchesActive) {
        set({ doc: null, activeFile: null, saveState: 'idle' });
      }

      try {
        unwrap(await window.typstor.fs.deleteEntry(project.path, entryPath));
        set((s) => {
          const tree: Record<string, FileEntry[]> = {};
          for (const [key, entries] of Object.entries(s.tree)) {
            if (key === entryPath || key.startsWith(`${entryPath}\\`)) continue;
            tree[key] = entries;
          }
          const expanded: Record<string, boolean> = {};
          for (const [key, value] of Object.entries(s.expanded)) {
            if (key !== entryPath && !key.startsWith(`${entryPath}\\`)) {
              expanded[key] = value;
            }
          }
          return { tree, expanded };
        });
        await get().loadDir(dirOf(entryPath));
        get().showToast(t('已移到回收站'));
        scheduleSave();
        return true;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async importFiles(targetDir) {
      const project = get().project;
      if (!project || !targetDir) return false;
      if (get().readOnly) {
        get().showToast(t('只读项目不能导入文件'), 'error');
        return false;
      }

      try {
        const result = unwrap(
          await window.typstor.fs.importFiles(project.path, targetDir),
        );
        if (!result) return false;

        // 与新建一致：导入目标若被折叠（如项目根目录）则展开，避免误以为没导进来。
        set((s) => ({ expanded: { ...s.expanded, [targetDir]: true } }));
        await get().loadDir(targetDir);
        scheduleSave();

        const summary = [
          t('已导入 {count} 个文件', { count: result.imported.length }),
        ];
        if (result.renamed.length > 0) {
          summary.push(
            t('{count} 个同名文件已自动改名', { count: result.renamed.length }),
          );
        }
        if (result.failed.length > 0) {
          const first = result.failed[0];
          summary.push(
            t('{count} 个失败：{name}（{reason}）', {
              count: result.failed.length,
              name: first.name,
              reason: first.reason,
            }),
          );
        }
        get().showToast(
          summary.join('，'),
          result.failed.length > 0 ? 'error' : 'info',
        );
        return result.imported.length > 0;
      } catch (error) {
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    async setAllDirsExpanded(expand) {
      const root = get().project?.path;
      if (!root) return;

      if (!expand) {
        // 根目录始终展开，其余目录全部收起。
        set({ expanded: rootOnlyExpanded(root) });
        scheduleSave();
        return;
      }

      // 目录按需加载：逐层读取尚未加载的目录，直到不再出现新目录。
      // attempted 保证读取失败时不会反复请求、反复弹 toast 或死循环。
      const attempted = new Set<string>();
      for (let pass = 0; pass < 64; pass += 1) {
        const targets = Object.keys(allDirsExpanded(root, get().tree));
        const pending = targets.filter(
          (dir) => !get().tree[dir] && !attempted.has(dir),
        );
        if (pending.length === 0) break;
        for (const dir of pending) attempted.add(dir);
        await Promise.all(pending.map((dir) => get().loadDir(dir)));
      }

      set({ expanded: allDirsExpanded(root, get().tree) });
      scheduleSave();
    },

    toggleDir(dir) {
      const state = get();
      const isExpanded = state.expanded[dir];
      if (!isExpanded) {
        set((s) => ({ expanded: { ...s.expanded, [dir]: true } }));
        if (!state.tree[dir]) void state.loadDir(dir);
      } else {
        set((s) => {
          const expanded = { ...s.expanded };
          delete expanded[dir];
          return { expanded };
        });
      }
      scheduleSave();
    },

    setOutlineHeadingIds(ids) {
      set({ outlineHeadingIds: ids });
    },

    toggleOutlineHeading(id) {
      set((s) => {
        const next = new Set(s.outlineHeadingsCollapsed);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return {
          outlineHeadingsCollapsed: next,
          outlineAllCollapsed: isOutlineAllCollapsed({
            ...s,
            outlineHeadingsCollapsed: next,
          }),
        };
      });
    },

    toggleOutlineFigures() {
      set((s) => ({
        outlineFiguresCollapsed: !s.outlineFiguresCollapsed,
        outlineAllCollapsed: isOutlineAllCollapsed({
          ...s,
          outlineFiguresCollapsed: !s.outlineFiguresCollapsed,
        }),
      }));
    },

    toggleOutlineTables() {
      set((s) => ({
        outlineTablesCollapsed: !s.outlineTablesCollapsed,
        outlineAllCollapsed: isOutlineAllCollapsed({
          ...s,
          outlineTablesCollapsed: !s.outlineTablesCollapsed,
        }),
      }));
    },

    /** 顶部按钮的二态切换：折叠到只显示一级标题 + 图/表分组收起 ↔ 全部展开。 */
    toggleOutlineAll() {
      const s = get();
      if (s.outlineAllCollapsed) {
        set({
          outlineHeadingsCollapsed: new Set<string>(),
          outlineFiguresCollapsed: false,
          outlineTablesCollapsed: false,
          outlineAllCollapsed: false,
        });
      } else {
        set({
          outlineHeadingsCollapsed: new Set(s.outlineHeadingIds),
          outlineFiguresCollapsed: true,
          outlineTablesCollapsed: true,
          outlineAllCollapsed: true,
        });
      }
    },

    selectFile(file) {
      void get().openFile(file);
    },

    async openFile(file) {
      const state = get();
      if (state.activeFile && samePath(state.activeFile, file) && state.doc) {
        return true;
      }

      if (
        state.doc &&
        state.doc.content !== state.doc.savedContent &&
        !(await get().saveDoc())
      ) {
        return false;
      }

      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }

      set({ fileLoading: true });
      try {
        const data = unwrap(await window.typstor.fs.readFile(file));
        const revision = (get().doc?.revision ?? 0) + 1;
        set({
          activeFile: file,
          doc: {
            path: data.path,
            content: data.content,
            savedContent: data.content,
            mtimeMs: data.mtimeMs,
            revision,
          },
          fileLoading: false,
          saveState: 'saved',
        });
        scheduleSave();
        armCompile(0);
        scheduleWordCount();
        return true;
      } catch (error) {
        set({ fileLoading: false, saveState: 'error' });
        get().showToast(errorText(error), 'error');
        return false;
      }
    },

    updateDoc(content) {
      const doc = get().doc;
      if (!doc) return;

      const nextSaveState: SaveState =
        content === doc.savedContent ? 'saved' : 'dirty';
      set({ doc: { ...doc, content }, saveState: nextSaveState });
      scheduleSnapshot();
      // 项目总字数按编辑中的实时内容统计，输入停顿后刷新一次。
      scheduleWordCount();

      if (nextSaveState === 'saved') {
        if (autosaveTimer) {
          clearTimeout(autosaveTimer);
          autosaveTimer = null;
        }
        return;
      }
      scheduleAutosave();
    },

    async saveDoc() {
      // 已有写盘在飞行时先等它结束，再按最新状态决定是否需要再写一次。
      // 关闭握手正是依赖这一点：不能让最后一段编辑留在未完成的写入里。
      if (activeSave) await activeSave;
      const state = get();
      const doc = state.doc;
      if (!doc) return false;
      if (state.readOnly) return true;
      if (state.conflict) return false;

      if (doc.content === doc.savedContent) {
        set({ saveState: 'saved' });
        return true;
      }

      if (state.saveState === 'saving') {
        scheduleAutosave();
        return false;
      }

      set({ saveState: 'saving' });
      const content = doc.content;
      pendingWrites.add(doc.path, content);

      const write = (async () => {
        try {
          const written = unwrap(
            await window.typstor.fs.writeFile(doc.path, content, doc.mtimeMs),
          );
          set((current) => {
            const active = current.doc;
            if (!active || active.path !== doc.path) return {};
            const next: OpenDocument = {
              ...active,
              savedContent: content,
              mtimeMs: written.mtimeMs,
            };
            return {
              doc: next,
              saveState: next.content === next.savedContent ? 'saved' : 'dirty',
            };
          });
          // 自动编译：保存（手动或自动）后立刻重编译，落实「文件保存自动编译」需求。
          if (get().settings?.preview.autoCompile) armCompile(0);
          scheduleWordCount();
          if (get().saveState === 'dirty') scheduleAutosave();
          return true;
        } catch (error) {
          if (error instanceof ApiError && error.code === 'ECONFLICT') {
            let diskContent = content;
            try {
              diskContent = unwrap(
                await window.typstor.fs.readFile(doc.path),
              ).content;
            } catch {
              // 磁盘文件可能已被删除，保留写入时的内容作为占位版本。
            }
            set({
              saveState: 'dirty',
              conflict: {
                path: doc.path,
                localContent: get().doc?.content ?? content,
                diskContent,
              },
            });
            return false;
          }
          set({ saveState: 'error' });
          get().showToast(errorText(error), 'error');
          return false;
        } finally {
          pendingWrites.remove(doc.path);
        }
      })();

      activeSave = write;
      try {
        return await write;
      } finally {
        if (activeSave === write) activeSave = null;
      }
    },

    async resolveConflict(action) {
      const state = get();
      const conflict = state.conflict;
      if (!conflict) return;

      if (action === 'cancel') {
        set({ conflict: null });
        // 不自动重试：磁盘 mtime 仍是外部的，重试只会再次弹框。
        // 但把本地未保存版本放进恢复快照，避免退出时丢内容。
        if (get().doc?.content !== get().doc?.savedContent && state.project) {
          void window.typstor.snapshot
            .save(
              state.project.path,
              conflict.path,
              get().doc?.content ?? conflict.localContent,
            )
            .catch(() => undefined);
        }
        return;
      }

      set({ conflict: null });

      if (action === 'reload') {
        try {
          // 尽量读取最新磁盘版本；读取失败时退回发现冲突时记下的版本。
          let disk = {
            path: conflict.path,
            content: conflict.diskContent,
            mtimeMs: get().doc?.mtimeMs ?? 0,
          };
          try {
            disk = unwrap(await window.typstor.fs.readFile(conflict.path));
          } catch {
            // 文件可能刚被删除，仍按已记录的版本载入。
          }
          set((current) => {
            if (!current.doc || current.doc.path !== conflict.path) return {};
            return {
              doc: {
                path: disk.path,
                content: disk.content,
                savedContent: disk.content,
                mtimeMs: disk.mtimeMs,
                revision: current.doc.revision + 1,
              },
              saveState: 'saved',
            };
          });
          armCompile(0);
        } catch (error) {
          get().showToast(errorText(error), 'error');
        }
        return;
      }

      try {
        const written = unwrap(
          await window.typstor.fs.writeFile(
            conflict.path,
            conflict.localContent,
            undefined,
            true,
          ),
        );
        set((current) => {
          if (!current.doc || current.doc.path !== conflict.path) return {};
          return {
            doc: {
              ...current.doc,
              savedContent: conflict.localContent,
              mtimeMs: written.mtimeMs,
            },
            saveState:
              current.doc.content === conflict.localContent ? 'saved' : 'dirty',
          };
        });
      } catch (error) {
        get().showToast(errorText(error), 'error');
      }
    },

    handleWatchEvent(change) {
      const project = get().project;
      if (!project) return;
      scheduleWordCount();

      const absolute = joinRelative(project.path, change.path);
      const activeFile = get().activeFile;

      if (
        activeFile &&
        samePath(absolute, activeFile) &&
        change.event === 'change'
      ) {
        void (async () => {
          try {
            const disk = unwrap(await window.typstor.fs.readFile(absolute));
            const current = get().doc;
            if (!current || !samePath(current.path, absolute)) return;

            if (get().conflict && samePath(get().conflict!.path, absolute)) {
              return;
            }

            const classification = classifyWatchEvent({
              diskContent: disk.content,
              editorContent: current.content,
              savedContent: current.savedContent,
              // 关键：保存请求已发出但 savedContent 尚未更新时，用「正在写入的内容」
              // 识别自己的写入回声，避免用户在保存期间继续打字被误判为外部冲突。
              pendingContent: pendingWrites.contentFor(absolute),
            });

            if (
              classification === 'identical' ||
              classification === 'own-write'
            ) {
              if (disk.mtimeMs !== current.mtimeMs) {
                set({ doc: { ...current, mtimeMs: disk.mtimeMs } });
              }
              return;
            }

            if (classification === 'external-conflict') {
              set({
                saveState: 'dirty',
                conflict: {
                  path: absolute,
                  localContent: current.content,
                  diskContent: disk.content,
                },
              });
              return;
            }

            // 外部修改且本地没有未保存编辑：静默重载。
            set({
              doc: {
                ...current,
                content: disk.content,
                savedContent: disk.content,
                mtimeMs: disk.mtimeMs,
                revision: current.revision + 1,
              },
              saveState: 'saved',
            });
            armCompile(0);
          } catch {
            // 文件可能刚被删除，交给下面的 tree 事件处理
          }
        })();
        return;
      }

      if (
        change.event === 'unlink' &&
        activeFile &&
        samePath(absolute, activeFile)
      ) {
        set({ activeFile: null, doc: null, saveState: 'idle' });
        armCompile(0);
      }

      if (change.event === 'change') return;

      const parent = dirOf(absolute);
      void get()
        .loadDir(parent)
        .then(() => {
          if (change.event !== 'unlink' && change.event !== 'unlinkDir') return;
          set((state) => {
            const tree = { ...state.tree };
            const expanded = { ...state.expanded };
            const matches = (key: string): boolean =>
              key === absolute ||
              key.startsWith(`${absolute}\\`) ||
              key.startsWith(`${absolute}/`);
            for (const key of Object.keys(tree)) {
              if (matches(key)) delete tree[key];
            }
            for (const key of Object.keys(expanded)) {
              if (matches(key)) delete expanded[key];
            }
            return { tree, expanded };
          });
        })
        .catch(() => undefined);
    },

    async checkRecovery() {
      const project = get().project;
      if (!project) {
        set({ recovery: null });
        return;
      }
      try {
        const result = unwrap(await window.typstor.snapshot.list(project.path));
        set({ recovery: result.length > 0 ? result : null });
      } catch {
        set({ recovery: null });
      }
    },

    async restoreSnapshot(id) {
      const item = (get().recovery ?? []).find(
        (snapshot) => snapshot.id === id,
      );
      if (!item) return;
      if (item.exists) {
        const opened = await get().openFile(item.filePath);
        if (!opened) return;
        const current = get().doc;
        if (current && current.path === item.filePath) {
          set({
            doc: {
              ...current,
              content: item.content,
              revision: current.revision + 1,
            },
            saveState: 'dirty',
          });
          scheduleAutosave();
        }
      }
      await window.typstor.snapshot.delete(id).catch(() => undefined);
      const remaining = (get().recovery ?? []).filter(
        (snapshot) => snapshot.id !== id,
      );
      set({ recovery: remaining.length > 0 ? remaining : null });
      get().showToast(t('已恢复快照内容，记得保存'));
    },

    async dismissRecovery(clear = false) {
      const project = get().project;
      if (clear && project) {
        await window.typstor.snapshot
          .clear(project.path)
          .catch(() => undefined);
      }
      set({ recovery: null });
    },

    async compileNow() {
      if (compileInFlight) {
        compilePending = true;
        return;
      }
      compileInFlight = true;
      const { project, doc } = get();
      if (!project || !doc) {
        compileSeq += 1;
        set({
          compileStatus: 'idle',
          artifact: null,
          pageCount: 0,
          diagnostics: [],
          compileDurationMs: 0,
        });
        return;
      }

      const seq = ++compileSeq;
      set({ compileStatus: 'compiling' });
      try {
        const input = await projectCompileInput(project, doc);
        const result = unwrap(
          await window.typstor.compile.document(
            project.path,
            project.config.mainFile,
            input.content,
            input.shadows,
          ),
        );
        if (seq !== compileSeq) return;
        if (result.vector.byteLength === 0 || result.pageCount === 0) {
          // 保留上一次成功的预览，避免编译失败时画面闪成空白。
          set({
            compileStatus: 'error',
            compileDurationMs: result.durationMs,
            diagnostics: result.diagnostics,
          });
          return;
        }
        set({
          compileStatus: 'ready',
          compileDurationMs: result.durationMs,
          diagnostics: result.diagnostics,
          pageCount: result.pageCount,
          artifact: result.vector,
          artifactVersion: seq,
        });
      } catch (error) {
        if (seq !== compileSeq) return;
        set({
          compileStatus: 'error',
          diagnostics: [
            {
              message: errorText(error),
              path: '',
              severity: 1,
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 0,
            },
          ],
        });
      } finally {
        compileInFlight = false;
        if (compilePending) {
          compilePending = false;
          // 上一次编译期间又发生了编辑：用最新内容补一次，旧结果已被 seq 丢弃。
          void get().compileNow();
        }
      }
    },

    async exportPdf(targetPath) {
      const { project, doc } = get();
      if (!project || !doc) return;
      try {
        const input = await projectCompileInput(project, doc);
        const result = unwrap(
          await window.typstor.exportPdf.run(
            project.path,
            project.config.mainFile,
            input.content,
            targetPath,
            input.shadows,
          ),
        );
        if (result) {
          get().showToast(t('PDF 已导出：{path}', { path: result.path }));
        }
      } catch (error) {
        get().showToast(errorText(error), 'error');
      }
    },

    async showItem(itemPath) {
      try {
        unwrap(await window.typstor.app.showItem(itemPath));
      } catch (error) {
        get().showToast(errorText(error), 'error');
      }
    },

    setPanelWidth(width) {
      set({ panelWidth: Math.min(480, Math.max(200, width)) });
      scheduleSave();
    },

    setSplit(split) {
      set({ split: Math.min(0.8, Math.max(0.2, split)) });
      scheduleSave();
    },

    togglePanel() {
      set((state) => ({ panelVisible: !state.panelVisible }));
      scheduleSave();
    },

    setRailView(view) {
      if (get().railView === view && get().panelVisible) {
        get().togglePanel();
        return;
      }
      set({ railView: view, panelVisible: true });
      scheduleSave();
    },

    setWelcomeLayout(layout) {
      set({ welcomeLayout: layout });
    },

    setWelcomeSort(sort) {
      set({ welcomeSort: sort });
    },

    setZoom(zoom) {
      set({ zoom: Math.min(4, Math.max(0.5, zoom)) });
      scheduleSave();
    },

    requestSyncScroll(line, totalLines) {
      set({ syncScrollRequest: { line, totalLines, nonce: Date.now() } });
    },

    async refreshWordCount() {
      const state = get();
      if (!state.project) {
        set({ projectWordCount: null });
        return;
      }
      const doc = state.doc;
      const override =
        doc && doc.path ? { path: doc.path, content: doc.content } : undefined;
      try {
        const total = unwrap(
          await window.typstor.project.wordCount(state.project.path, override),
        );
        // 请求期间若切换了项目，丢弃过期结果。
        if (get().project?.path !== state.project.path) return;
        set({ projectWordCount: total });
      } catch {
        // 统计失败时保留上次结果，不打断编辑。
      }
    },

    showToast(text, kind = 'info') {
      const id = Date.now();
      set({ toast: { id, text, kind } });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 3000);
    },

    scheduleWorkspaceSave() {
      scheduleSave();
    },

    armCompile(delay = 400) {
      armCompile(delay);
    },
  };
});
