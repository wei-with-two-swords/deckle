import { BrowserWindow, dialog, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteText, WriteConflictError } from './atomicWrite';
import {
  entryNameError,
  sanitizeEntryName,
  uniqueEntryName,
} from '../shared/validation';
import type {
  CreateProjectRequest,
  FileContent,
  FileEntry,
  FileWriteResult,
  ImportFilesResult,
  ProjectConfig,
  ProjectConfigPatch,
  ProjectOpenResult,
  WorkspaceState,
} from '../shared/types';
import {
  listRecentProjects,
  removeRecentProject,
  touchRecentProject,
} from './db';
import { readSettings, saveSettings } from './settings';
import { AppError } from './errors';
import { copyTemplateInto } from './templates';
import { t } from './i18n';

const IGNORED_NAMES = new Set([
  '.typstor',
  '.git',
  'node_modules',
  '.DS_Store',
]);

export const DEFAULT_WORKSPACE: WorkspaceState = {
  version: 1,
  activeView: 'files',
  panelVisible: true,
  panelWidth: 260,
  split: 0.573746,
  zoom: 1,
  openFile: null,
  scroll: {},
};

const allowedRoots = new Set<string>();

function normalize(target: string): string {
  const resolved = path.resolve(target);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function allowRoot(root: string): void {
  allowedRoots.add(normalize(root));
}

export function assertInside(target: string): void {
  const resolved = normalize(target);

  for (const root of allowedRoots) {
    if (resolved === root) return;
    if (resolved.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) {
      return;
    }
  }

  throw new AppError('EACCES', t('无权访问该路径，请先打开项目'));
}

export function currentRoots(): string[] {
  return [...allowedRoots];
}

function toPosix(relative: string): string {
  return relative.split(path.sep).join('/');
}

async function readJson(file: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

function sanitizeWorkspace(raw: unknown): WorkspaceState {
  const input = (typeof raw === 'object' && raw ? raw : {}) as Partial<
    Record<keyof WorkspaceState, unknown>
  >;

  const clamp = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;

  const views = ['files', 'search', 'outline', 'issues'] as const;
  const activeView = views.includes(input.activeView as (typeof views)[number])
    ? (input.activeView as WorkspaceState['activeView'])
    : DEFAULT_WORKSPACE.activeView;

  return {
    version: 1,
    activeView,
    panelVisible:
      typeof input.panelVisible === 'boolean'
        ? input.panelVisible
        : DEFAULT_WORKSPACE.panelVisible,
    panelWidth: clamp(input.panelWidth, 200, 480, DEFAULT_WORKSPACE.panelWidth),
    split: clamp(input.split, 0.2, 0.8, DEFAULT_WORKSPACE.split),
    zoom: clamp(input.zoom, 0.5, 4, DEFAULT_WORKSPACE.zoom),
    openFile:
      typeof input.openFile === 'string'
        ? input.openFile
        : (null as string | null),
    scroll:
      typeof input.scroll === 'object' && input.scroll
        ? (input.scroll as Record<string, number>)
        : {},
  };
}

function validateConfig(
  raw: unknown,
  fallbackName: string,
): ProjectConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<ProjectConfig>;
  if (typeof value.mainFile !== 'string' || value.mainFile.length === 0) {
    return null;
  }

  return {
    version: 1,
    name:
      typeof value.name === 'string' && value.name ? value.name : fallbackName,
    mainFile: toPosix(value.mainFile),
    createdAt:
      typeof value.createdAt === 'string'
        ? value.createdAt
        : new Date().toISOString(),
    template: 'blank',
  };
}

async function detectConfig(projectPath: string): Promise<ProjectConfig> {
  const stored = await readJson(
    path.join(projectPath, '.typstor', 'project.json'),
  );
  const parsed = validateConfig(stored, path.basename(projectPath));
  if (parsed) return parsed;

  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const typFiles = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.typ'),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const mainFile = typFiles.includes('main.typ')
    ? 'main.typ'
    : typFiles.length === 1
      ? typFiles[0]
      : null;

  if (!mainFile) {
    throw new AppError(
      'EINVAL',
      t('无法确定主文件：请创建 main.typ，或让项目只包含一个 .typ 文件'),
    );
  }

  return {
    version: 1,
    name: path.basename(projectPath),
    mainFile,
    createdAt: new Date().toISOString(),
    template: 'blank',
  };
}

async function readWorkspace(projectPath: string): Promise<WorkspaceState> {
  const raw = await readJson(
    path.join(projectPath, '.typstor', 'workspace.json'),
  );
  return sanitizeWorkspace(raw);
}

/** 在不修改最近项目/设置的前提下读取项目描述，供缩略图与导出使用。 */
export async function describeProject(projectPath: string): Promise<{
  config: ProjectConfig;
  mainPath: string;
}> {
  const stats = await fs.stat(projectPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new AppError(
      'ENOENT',
      t('项目目录不存在：{path}', { path: projectPath }),
    );
  }
  allowRoot(projectPath);
  const config = await detectConfig(projectPath);
  const mainPath = path.resolve(projectPath, config.mainFile);
  assertInside(mainPath);
  return { config, mainPath };
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new AppError('EINVAL', t('项目名不能为空'));
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    throw new AppError('EINVAL', t('名称不能包含 \\ / : * ? " < > |'));
  }
  return trimmed;
}

export async function createProject(
  request: CreateProjectRequest,
): Promise<ProjectOpenResult> {
  const name = validateName(request.name);
  const templateId = request.templateId?.trim() || 'paper';

  let parentDir = request.parentDir;
  if (!parentDir) {
    const result = await dialog.showOpenDialog({
      title: t('选择项目位置'),
      buttonLabel: t('创建到此处'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      throw new AppError('EINVAL', t('已取消新建项目'));
    }
    parentDir = result.filePaths[0];
  }

  const target = path.join(parentDir, name);
  try {
    await fs.access(target);
    throw new AppError(
      'EEXIST',
      t('目标位置已存在同名文件夹：{path}', { path: target }),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
  }

  await fs.mkdir(path.join(target, '.typstor'), { recursive: true });
  const mainFile = await copyTemplateInto(templateId, target);
  const config: ProjectConfig = {
    version: 1,
    name,
    mainFile,
    createdAt: new Date().toISOString(),
    template: templateId,
    templateId,
  };
  await writeJsonAtomic(path.join(target, '.typstor', 'project.json'), config);
  await writeJsonAtomic(
    path.join(target, '.typstor', 'workspace.json'),
    DEFAULT_WORKSPACE,
  );

  allowRoot(target);
  touchRecentProject({ path: target, name, mainFile: config.mainFile });
  saveSettings({ lastProject: target, lastFolder: target });

  return { path: target, config, workspace: { ...DEFAULT_WORKSPACE } };
}

/**
 * 从一个已有的 .typ 文件创建项目：在文件同级目录下建立同名项目文件夹，
 * 把文件内容复制为 main.typ，不修改原文件。
 */
export async function importProjectFile(): Promise<ProjectOpenResult | null> {
  const focused = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = {
    title: t('选择 Typst 文件'),
    buttonLabel: t('导入'),
    properties: ['openFile'],
    filters: [{ name: t('Typst 文档'), extensions: ['typ'] }],
  };
  const picked = focused
    ? await dialog.showOpenDialog(focused, options)
    : await dialog.showOpenDialog(options);
  if (picked.canceled || picked.filePaths.length === 0) return null;

  return importTypstFile(picked.filePaths[0]);
}

/** 把指定 .typ 文件复制为一个新项目（不修改源文件）。 */
export async function importTypstFile(
  source: string,
): Promise<ProjectOpenResult> {
  const stats = await fs.stat(source);
  if (!stats.isFile() || !source.toLowerCase().endsWith('.typ')) {
    throw new AppError('EINVAL', t('请选择一个 .typ 文件'));
  }
  if (stats.size > MAX_EDITABLE_BYTES) {
    throw new AppError('EINVAL', t('文件超过 4 MB，无法导入'));
  }

  let content = await fs.readFile(source, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const name = validateName(path.basename(source, path.extname(source)));
  const target = path.join(path.dirname(source), name);

  try {
    await fs.access(target);
    throw new AppError('EEXIST', t('同名项目已存在：{path}', { path: target }));
  } catch (error) {
    if (error instanceof AppError) throw error;
  }

  await fs.mkdir(path.join(target, '.typstor'), { recursive: true });
  await fs.writeFile(path.join(target, 'main.typ'), content, 'utf8');
  const config: ProjectConfig = {
    version: 1,
    name,
    mainFile: 'main.typ',
    createdAt: new Date().toISOString(),
    template: 'blank',
  };
  await writeJsonAtomic(path.join(target, '.typstor', 'project.json'), config);
  await writeJsonAtomic(
    path.join(target, '.typstor', 'workspace.json'),
    DEFAULT_WORKSPACE,
  );

  allowRoot(target);
  touchRecentProject({ path: target, name, mainFile: config.mainFile });
  saveSettings({ lastProject: target, lastFolder: target });

  return { path: target, config, workspace: { ...DEFAULT_WORKSPACE } };
}

export async function openProject(
  explicitPath?: string,
  options: { readOnly?: boolean; skipRecent?: boolean } = {},
): Promise<ProjectOpenResult | null> {
  let projectPath = explicitPath;

  if (!projectPath) {
    const focused = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: t('打开项目文件夹'),
      buttonLabel: t('打开'),
      properties: ['openDirectory'],
    };
    const result = focused
      ? await dialog.showOpenDialog(focused, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    projectPath = result.filePaths[0];
  }

  const stats = await fs.stat(projectPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new AppError(
      'ENOENT',
      t('项目目录不存在：{path}', { path: projectPath }),
    );
  }

  const config = await detectConfig(projectPath);
  const workspace = await readWorkspace(projectPath);

  allowRoot(projectPath);

  if (!options.skipRecent) {
    touchRecentProject({
      path: projectPath,
      name: config.name,
      mainFile: config.mainFile,
    });
    saveSettings({ lastProject: projectPath, lastFolder: projectPath });
  }

  return { path: projectPath, config, workspace };
}

export function recentProjects() {
  return listRecentProjects();
}

export function forgetRecentProject(projectPath: string): void {
  removeRecentProject(path.resolve(projectPath));
}

export async function saveProjectWorkspace(
  projectPath: string,
  workspace: WorkspaceState,
): Promise<void> {
  assertInside(projectPath);
  await writeJsonAtomic(
    path.join(projectPath, '.typstor', 'workspace.json'),
    sanitizeWorkspace(workspace),
  );
}

async function validateMainFile(
  projectPath: string,
  value: string,
): Promise<string> {
  const raw = value.trim().replace(/\\/g, '/');
  if (!raw) throw new AppError('EINVAL', t('主文件不能为空'));
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    throw new AppError('EINVAL', t('主文件必须是项目内的相对路径'));
  }

  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new AppError('EINVAL', t('主文件不能超出项目目录'));
  }
  if (!normalized.toLowerCase().endsWith('.typ')) {
    throw new AppError('EINVAL', t('主文件必须是 .typ 文件'));
  }

  const absolute = path.join(projectPath, ...normalized.split('/'));
  assertInside(absolute);
  const stats = await fs.stat(absolute).catch(() => null);
  if (!stats || !stats.isFile()) {
    throw new AppError(
      'ENOENT',
      t('主文件不存在：{path}', { path: normalized }),
    );
  }

  return normalized;
}

export async function updateProjectConfig(
  projectPath: string,
  patch: ProjectConfigPatch,
): Promise<ProjectConfig> {
  assertInside(projectPath);
  const current = await detectConfig(projectPath);
  const next: ProjectConfig = { ...current };

  if (patch.name !== undefined) {
    next.name = validateName(patch.name);
  }
  if (patch.mainFile !== undefined) {
    next.mainFile = await validateMainFile(projectPath, patch.mainFile);
  }

  await writeJsonAtomic(
    path.join(projectPath, '.typstor', 'project.json'),
    next,
  );
  touchRecentProject({
    path: projectPath,
    name: next.name,
    mainFile: next.mainFile,
  });

  return next;
}

export async function readProjectDirectory(
  dirPath: string,
): Promise<FileEntry[]> {
  assertInside(dirPath);

  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  const entries: FileEntry[] = [];

  for (const dirent of dirents) {
    if (IGNORED_NAMES.has(dirent.name)) continue;

    const fullPath = path.join(dirPath, dirent.name);
    let kind: FileEntry['kind'] = 'file';

    if (dirent.isDirectory()) {
      kind = 'directory';
    } else if (dirent.isSymbolicLink()) {
      const stats = await fs.stat(fullPath).catch(() => null);
      kind = stats?.isDirectory() ? 'directory' : 'file';
    }

    entries.push({ name: dirent.name, path: fullPath, kind });
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  return entries;
}

export function lastProjectPath(): string | null {
  return readSettings().lastProject;
}

const MAX_EDITABLE_BYTES = 4 * 1024 * 1024;

export async function readProjectFile(filePath: string): Promise<FileContent> {
  assertInside(filePath);

  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new AppError('EINVAL', t('只能打开文件'));
  }
  if (stats.size > MAX_EDITABLE_BYTES) {
    throw new AppError('EINVAL', t('文件超过 4 MB，无法在编辑器中打开'));
  }

  let content = await fs.readFile(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  return { path: filePath, content, mtimeMs: stats.mtimeMs };
}

export async function writeProjectFile(
  filePath: string,
  content: string,
  expectedMtimeMs?: number,
  force = false,
): Promise<FileWriteResult> {
  assertInside(filePath);

  const before = await fs.stat(filePath);
  if (!before.isFile()) {
    throw new AppError('EINVAL', t('只能写入文件'));
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_EDITABLE_BYTES) {
    throw new AppError('EINVAL', t('内容超过 4 MB，已拒绝保存'));
  }

  try {
    // 原子写入 + 同进程串行：校验与 rename 之间没有其它保存能插进来。
    return await atomicWriteText(filePath, content, {
      expectedMtimeMs,
      force,
    });
  } catch (error) {
    if (error instanceof WriteConflictError) {
      throw new AppError('ECONFLICT', t('文件已被外部修改，请先重新载入'));
    }
    throw error;
  }
}

function validateEntryName(raw: string): string {
  const name = sanitizeEntryName(raw);
  const error = entryNameError(name);
  if (error) throw new AppError('EINVAL', t(error));
  return name;
}

export async function createProjectEntry(
  projectPath: string,
  parentDir: string,
  name: string,
  kind: FileEntry['kind'],
  content = '',
): Promise<FileEntry> {
  assertInside(projectPath);
  assertInside(parentDir);

  const parent = await fs.stat(parentDir);
  if (!parent.isDirectory()) {
    throw new AppError('EINVAL', t('父级不是文件夹'));
  }

  const safeName = validateEntryName(name);
  const target = path.join(parentDir, safeName);
  assertInside(target);

  const exists = await fs
    .access(target)
    .then(() => true)
    .catch(() => false);
  if (exists) throw new AppError('EEXIST', t('同名文件或文件夹已存在'));

  if (kind === 'directory') {
    await fs.mkdir(target);
  } else {
    if (Buffer.byteLength(content, 'utf8') > MAX_EDITABLE_BYTES) {
      throw new AppError('EINVAL', t('内容超过 4 MB'));
    }
    await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  }

  return { name: safeName, path: target, kind };
}

/**
 * 把计算机上的文件复制进当前项目的指定目录。
 * 与 createProjectEntry 不同：这里按字节复制，图片 / PDF 等二进制文件同样适用；
 * 不覆盖已有文件，同名时自动追加 -1/-2… 后缀。
 */
export async function importProjectFiles(
  projectPath: string,
  targetDir: string,
): Promise<ImportFilesResult | null> {
  assertInside(projectPath);
  assertInside(targetDir);

  const project = path.resolve(projectPath);
  const destination = path.resolve(targetDir);
  const relative = path.relative(project, destination);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError('EACCES', t('只能导入到当前项目内的文件夹'));
  }
  const targetStat = await fs.stat(destination);
  if (!targetStat.isDirectory()) {
    throw new AppError('EINVAL', t('导入目标不是文件夹'));
  }

  const focused = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = {
    title: t('导入文件到项目'),
    buttonLabel: t('导入'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: t('所有文件'), extensions: ['*'] }],
  };
  const picked = focused
    ? await dialog.showOpenDialog(focused, options)
    : await dialog.showOpenDialog(options);
  if (picked.canceled || picked.filePaths.length === 0) return null;

  const used = new Set(
    (await fs.readdir(destination)).map((name) => name.toLowerCase()),
  );
  const result: ImportFilesResult = { imported: [], renamed: [], failed: [] };

  for (const source of picked.filePaths) {
    const rawName = sanitizeEntryName(path.basename(source));
    const nameError = entryNameError(rawName);
    if (nameError || IGNORED_NAMES.has(rawName)) {
      result.failed.push({
        name: rawName,
        reason: nameError ? t(nameError) : t('该名称不会显示在文件面板中'),
      });
      continue;
    }

    try {
      const stats = await fs.stat(source);
      if (!stats.isFile()) {
        result.failed.push({ name: rawName, reason: t('只能导入文件') });
        continue;
      }
      if (normalize(path.dirname(source)) === normalize(destination)) {
        result.failed.push({
          name: rawName,
          reason: t('文件已在目标文件夹中'),
        });
        continue;
      }

      const name = uniqueEntryName(rawName, used);
      const generatedError = entryNameError(name);
      if (generatedError) {
        result.failed.push({ name: rawName, reason: t(generatedError) });
        continue;
      }
      used.add(name.toLowerCase());
      const target = path.join(destination, name);
      assertInside(target);
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      result.imported.push(name);
      if (name !== rawName) result.renamed.push(name);
    } catch (error) {
      result.failed.push({
        name: rawName,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export async function renameProjectEntry(
  projectPath: string,
  entryPath: string,
  name: string,
): Promise<FileEntry> {
  assertInside(projectPath);
  assertInside(entryPath);

  const safeName = validateEntryName(name);
  const stats = await fs.stat(entryPath);
  const parentDir = path.dirname(entryPath);
  const target = path.join(parentDir, safeName);
  assertInside(target);

  if (path.resolve(target) === path.resolve(entryPath)) {
    return {
      name: safeName,
      path: entryPath,
      kind: stats.isDirectory() ? 'directory' : 'file',
    };
  }

  const exists = await fs
    .access(target)
    .then(() => true)
    .catch(() => false);
  if (exists) throw new AppError('EEXIST', t('同名文件或文件夹已存在'));

  await fs.rename(entryPath, target);
  return {
    name: safeName,
    path: target,
    kind: stats.isDirectory() ? 'directory' : 'file',
  };
}

export async function deleteProjectEntry(
  projectPath: string,
  entryPath: string,
): Promise<void> {
  assertInside(projectPath);
  assertInside(entryPath);

  if (path.resolve(entryPath) === path.resolve(projectPath)) {
    throw new AppError('EINVAL', t('不能删除项目根目录'));
  }

  try {
    await shell.trashItem(entryPath);
  } catch {
    throw new AppError('EINTERNAL', t('无法移到回收站，请手动删除该文件'));
  }
}
