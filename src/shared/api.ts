import type {
  AppInfo,
  CompileResult,
  CompileShadow,
  CreateProjectRequest,
  ExportedFile,
  ExportPdfResult,
  FileContent,
  FileEntry,
  FileWriteResult,
  FontFamily,
  ImportFilesResult,
  ProjectConfig,
  ProjectConfigPatch,
  ProjectOpenResult,
  ProjectThumbnail,
  ProjectWatchChange,
  RecentProject,
  Result,
  SearchHit,
  Settings,
  SnapshotInfo,
  TemplateInfo,
  WorkspaceState,
} from './types';

export interface CloseResult {
  closed: boolean;
  action: 'app' | 'window' | null;
}

/** preload 暴露到 window.deckle 的完整契约。 */
export interface DeckleApi {
  platform: string;
  window: {
    minimize(): Promise<Result<void>>;
    toggleMaximize(): Promise<Result<boolean>>;
    isMaximized(): Promise<Result<boolean>>;
    close(force?: boolean): Promise<Result<CloseResult>>;
    onMaximizedChanged(cb: (maximized: boolean) => void): () => void;
    onCloseRequest(cb: () => void): () => void;
    closeReady(): Promise<Result<void>>;
  };
  project: {
    create(req: CreateProjectRequest): Promise<Result<ProjectOpenResult>>;
    importFile(): Promise<Result<ProjectOpenResult | null>>;
    open(req: {
      path?: string;
      readOnly?: boolean;
      skipRecent?: boolean;
    }): Promise<Result<ProjectOpenResult | null>>;
    recent(): Promise<Result<RecentProject[]>>;
    removeRecent(path: string): Promise<Result<void>>;
    wordCount(
      path: string,
      override?: { path: string; content: string },
    ): Promise<Result<number>>;
    thumbnail(path: string): Promise<Result<ProjectThumbnail | null>>;
    exportPdf(path: string): Promise<Result<ExportedFile | null>>;
    exportArchive(path: string): Promise<Result<ExportedFile | null>>;
    deleteProject(path: string): Promise<Result<void>>;
    saveWorkspace(
      path: string,
      workspace: WorkspaceState,
    ): Promise<Result<void>>;
    updateConfig(
      path: string,
      patch: ProjectConfigPatch,
    ): Promise<Result<ProjectConfig>>;
    search(
      path: string,
      query: string,
      caseSensitive?: boolean,
    ): Promise<Result<SearchHit[]>>;
    stopWatch(path: string): Promise<Result<void>>;
    onChanged(cb: (change: ProjectWatchChange) => void): () => void;
  };
  snapshot: {
    save(
      projectPath: string,
      filePath: string,
      content: string,
    ): Promise<Result<void>>;
    list(projectPath: string): Promise<Result<SnapshotInfo[]>>;
    delete(id: number): Promise<Result<void>>;
    clear(projectPath: string): Promise<Result<void>>;
  };
  fs: {
    readDir(path: string): Promise<Result<FileEntry[]>>;
    readFile(path: string): Promise<Result<FileContent>>;
    writeFile(
      path: string,
      content: string,
      expectedMtimeMs?: number,
      force?: boolean,
    ): Promise<Result<FileWriteResult>>;
    createEntry(
      projectPath: string,
      parentDir: string,
      name: string,
      kind: 'file' | 'directory',
      content?: string,
    ): Promise<Result<FileEntry>>;
    renameEntry(
      projectPath: string,
      path: string,
      name: string,
    ): Promise<Result<FileEntry>>;
    deleteEntry(projectPath: string, path: string): Promise<Result<void>>;
    /** 打开系统多选文件对话框，把所选文件复制到项目内目录；取消时返回 null。 */
    importFiles(
      projectPath: string,
      targetDir: string,
    ): Promise<Result<ImportFilesResult | null>>;
  };
  settings: {
    get(): Promise<Result<Settings>>;
    set(patch: Partial<Settings>): Promise<Result<Settings>>;
  };
  fonts: {
    list(): Promise<Result<FontFamily[]>>;
  };
  templates: {
    list(): Promise<Result<TemplateInfo[]>>;
    import(): Promise<Result<TemplateInfo | null>>;
    remove(id: string): Promise<Result<void>>;
  };
  compile: {
    document(
      projectPath: string,
      mainFile: string,
      content: string,
      shadows?: CompileShadow[],
    ): Promise<Result<CompileResult>>;
  };
  exportPdf: {
    run(
      projectPath: string,
      mainFile: string,
      content: string,
      targetPath?: string,
      shadows?: CompileShadow[],
    ): Promise<Result<ExportPdfResult | null>>;
  };
  app: {
    info(): Promise<Result<AppInfo>>;
    openExternal(url: string): Promise<Result<void>>;
    showItem(path: string): Promise<Result<void>>;
  };
}
