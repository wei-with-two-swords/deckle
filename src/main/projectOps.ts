import { BrowserWindow, dialog, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { ExportedFile } from '../shared/types';
import { AppError } from './errors';
import { compileProject, exportProjectPdf } from './compile';
import { forgetRecentProject, describeProject } from './projects';
import { listRecentProjects } from './db';
import { t } from './i18n';

const ARCHIVE_EXCLUDES = new Set([
  'node_modules',
  '.git',
  'out',
  '.webpack',
  'tmp',
]);

function shouldArchive(relative: string): boolean {
  const normalized = relative.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => ARCHIVE_EXCLUDES.has(segment))) return false;
  // 工作区状态属于本机，不进入分享包；项目配置保留。
  if (
    normalized === '.deckle/workspace.json' ||
    normalized === '.typstor/workspace.json'
  ) {
    return false;
  }
  return true;
}

export async function projectThumbnail(
  projectPath: string,
): Promise<Uint8Array | null> {
  const { config, mainPath } = await describeProject(projectPath);
  const raw = await fs.readFile(mainPath, 'utf8').catch(() => null);
  if (raw == null) return null;
  const result = await compileProject(
    projectPath,
    config.mainFile,
    raw.replace(/^\uFEFF/, ''),
  );
  return result.vector.length > 0 ? result.vector : null;
}

async function showExportDialog(
  title: string,
  defaultPath: string,
  filters: Electron.FileFilter[],
): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow();
  const options: Electron.SaveDialogOptions = {
    title,
    defaultPath,
    filters,
  };
  const result = focused
    ? await dialog.showSaveDialog(focused, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

export async function exportProjectPdfFile(
  projectPath: string,
): Promise<ExportedFile | null> {
  const { config, mainPath } = await describeProject(projectPath);
  const content = await fs.readFile(mainPath, 'utf8');
  const targetPath = await showExportDialog(
    t('导出 PDF'),
    path.join(projectPath, `${config.name || 'main'}.pdf`),
    [{ name: 'PDF', extensions: ['pdf'] }],
  );
  if (!targetPath) return null;
  const result = await exportProjectPdf(
    projectPath,
    config.mainFile,
    content.replace(/^\uFEFF/, ''),
    targetPath,
  );
  return { path: result.path };
}

export async function exportProjectArchive(
  projectPath: string,
): Promise<ExportedFile | null> {
  const { config } = await describeProject(projectPath);
  const targetPath = await showExportDialog(
    t('导出压缩包'),
    path.join(projectPath, `${config.name || 'project'}.zip`),
    [{ name: t('ZIP 压缩包'), extensions: ['zip'] }],
  );
  if (!targetPath) return null;

  const zip = new AdmZip();
  zip.addLocalFolder(projectPath, '', (entry) => shouldArchive(entry));
  zip.writeZip(targetPath);
  return { path: targetPath };
}

function sameProjectPath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export async function deleteProjectFolder(projectPath: string): Promise<void> {
  // 安全校验：只允许删除「最近项目」里登记过的路径，避免任意目录被移到回收站。
  // 这里不能复用 describeProject —— 它会要求目录存在且配置完好，而用户手动删掉
  // 文件夹（或删掉主文件）后恰恰过不了校验，导致记录永远清不掉。
  const known = listRecentProjects().some((entry) =>
    sameProjectPath(entry.path, projectPath),
  );
  if (!known) {
    throw new AppError('EACCES', t('无权删除该项目'));
  }

  const stats = await fs.stat(projectPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    // 磁盘上的目录已不存在：清掉最近项目记录即可，让用户能删掉这张卡片。
    forgetRecentProject(projectPath);
    return;
  }

  try {
    await shell.trashItem(projectPath);
  } catch {
    throw new AppError('EINTERNAL', t('无法将项目移动到回收站'));
  }
  forgetRecentProject(projectPath);
}
