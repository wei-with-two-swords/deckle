/** 所有进程共享的纯类型；运行时不得依赖任何模块。 */

export type ThemeMode = 'light' | 'dark';

/** 界面语言。 */
export type Locale = 'zh-CN' | 'en-US';

export type FileKind = 'file' | 'directory';

export interface FileEntry {
  name: string;
  path: string;
  kind: FileKind;
}

export interface FileContent {
  path: string;
  content: string;
  /** 读取时的 mtime，用于写入冲突检测 */
  mtimeMs: number;
}

export interface FileWriteResult {
  path: string;
  mtimeMs: number;
}

/** 单个导入失败项；name 为原始文件名，reason 为可直接展示的原因。 */
export interface ImportFilesFailure {
  name: string;
  reason: string;
}

/** 把外部文件复制进项目目录的结果，文件名均为目标目录内的名称。 */
export interface ImportFilesResult {
  imported: string[];
  /** 因同名而自动改名（追加 -1/-2…）的文件 */
  renamed: string[];
  failed: ImportFilesFailure[];
}

/** 项目搜索结果；path 为相对项目根、正斜杠；line/column 0-based */
export interface SearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

/** 自动快照；filePath 为绝对路径 */
export interface SnapshotInfo {
  id: number;
  projectPath: string;
  filePath: string;
  content: string;
  createdAt: number;
  preview: string;
  exists: boolean;
}

export interface ProjectConfig {
  version: 1;
  name: string;
  /** 相对项目根，统一正斜杠 */
  mainFile: string;
  createdAt: string;
  /** 旧字段，保留以兼容既有 project.json */
  template?: string;
  templateId?: string;
}

export type RailView = 'files' | 'search' | 'outline' | 'issues';

/** 文件系统监听事件；path 为相对项目根、正斜杠 */
export interface ProjectWatchChange {
  kind: 'tree' | 'file';
  event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
}

export interface ProjectConfigPatch {
  name?: string;
  /** 相对项目根，统一正斜杠 */
  mainFile?: string;
}

export interface WorkspaceState {
  version: 1;
  activeView: RailView;
  panelVisible: boolean;
  /** 200..480 */
  panelWidth: number;
  /** 编辑区占比 0.2..0.8 */
  split: number;
  /** 0.5..4 */
  zoom: number;
  /** 相对路径 */
  openFile: string | null;
  scroll: Record<string, number>;
}

export interface RecentProject {
  path: string;
  name: string;
  mainFile: string;
  openedAt: number;
  /** 项目目录创建时间（含主文件 mtime 兜底） */
  createdAt: number;
  /** 项目最近更改时间：目录或主文件 mtime 的较大值 */
  modifiedAt: number;
  pinned: boolean;
}

/** 首页项目封面：首屏渲染所需的 vector 字节 */
export interface ProjectThumbnail {
  vector: Uint8Array;
}

export interface ExportedFile {
  path: string;
}

export interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
  lineHeight: number;
  wordWrap: boolean;
  autosave: boolean;
}

export interface PreviewSettings {
  zoom: number;
  /** 自动适应宽度：拖拽改变预览宽度时由 ResizeObserver 重算缩放 */
  fitWidth: boolean;
  /** 护眼模式：纸面与预览底色改为浅绿系 */
  eyeCare: boolean;
  /** 自动编译：编辑/自动保存后自动重新编译并刷新预览；关闭后仅“立即编译”按钮手动刷新 */
  autoCompile: boolean;
  /** 同步滚动：在编辑区点击后，预览自动跳转到对应位置 */
  syncScroll: boolean;
  gap: number;
}

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface FontFamily {
  /** 传给 Typst 的 font family 名（通常是英文名）。 */
  name: string;
  /** 界面上显示的本地化名称（如“宋体”），没有本地化名时等于 name。 */
  label: string;
}

export interface Settings {
  version: 1;
  theme: ThemeMode;
  /** 界面语言：zh-CN 简体中文 / en-US English */
  locale: Locale;
  closeAction: 'ask' | 'app' | 'window';
  lastFolder: string | null;
  lastProject: string | null;
  editor: EditorSettings;
  preview: PreviewSettings;
  window: WindowBounds;
  fonts: { extraDirs: string[] };
}

export interface ProjectOpenResult {
  path: string;
  config: ProjectConfig;
  workspace: WorkspaceState;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  /** 模板目录的绝对路径，可直接作为项目打开以修改模板 */
  path: string;
  mainFile: string;
}

export interface CreateProjectRequest {
  name: string;
  /** 为空时由主进程弹出目录选择框 */
  parentDir?: string | null;
  /** 模板 id，默认 paper */
  templateId?: string;
}

export type ErrorCode =
  | 'EACCES'
  | 'ENOENT'
  | 'ECONFLICT'
  | 'EINVAL'
  | 'EEXIST'
  | 'EINTERNAL';

export interface Ok<T> {
  ok: true;
  data: T;
}

export interface Err {
  ok: false;
  code: ErrorCode;
  message: string;
}

export type Result<T> = Ok<T> | Err;

export interface AppInfo {
  version: string;
  electron: string;
  node: string;
  chrome: string;
}

/** 编译时的文件内容覆盖：把编辑中的实时内容按文件自身路径注入编译器。 */
export interface CompileShadow {
  /** 文件绝对路径，或相对项目根的路径；必须位于已打开的项目内 */
  path: string;
  content: string;
}

export interface CompileDiagnostic {
  message: string;
  path: string;
  /** 1 = error, 2 = warning */
  severity: number;
  startLine: number;
  /** 0-based UTF-16 code unit */
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CompileResult {
  vector: Uint8Array;
  pageCount: number;
  durationMs: number;
  diagnostics: CompileDiagnostic[];
}

export interface ExportPdfResult {
  path: string;
}
