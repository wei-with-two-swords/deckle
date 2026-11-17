import { app, dialog } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BUILTIN_TEMPLATES } from './projectTemplates';
import { resolveTemplateRoot } from './templateLayout';
import { extractTemplateZip } from './templateZip';
import type { TemplateInfo } from '../shared/types';
import { AppError } from './errors';
import { t } from './i18n';

interface TemplateMeta {
  version: number;
  name: string;
  description: string;
  createdAt: number;
  mainFile: string;
}

const IGNORED_DIRS = new Set([
  '.deckle',
  '.typstor',
  '.git',
  'node_modules',
  'out',
  '.webpack',
  'tmp',
]);

const TEMPLATE_ID = /^[a-z0-9][a-z0-9._-]*$/i;

export function templatesRoot(): string {
  return path.join(app.getPath('userData'), 'templates');
}

function shouldCopy(root: string, src: string): boolean {
  const relative = path.relative(root, src);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  if (parts.length === 1 && parts[0] === 'template.json') return false;
  return !IGNORED_DIRS.has(parts[0]);
}

function templateDir(id: string): string {
  if (!TEMPLATE_ID.test(id)) {
    throw new AppError('EINVAL', t('模板标识不合法'));
  }
  const root = templatesRoot();
  const dir = path.resolve(root, id);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (dir !== root && !dir.startsWith(prefix)) {
    throw new AppError('EINVAL', t('模板路径越界'));
  }
  return dir;
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const ascii = base.replace(/[^a-z0-9._-]/g, '');
  return (ascii || `template-${Date.now()}`).slice(0, 48);
}

async function readMeta(dir: string): Promise<TemplateMeta | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'template.json'), 'utf8');
    const meta = JSON.parse(raw) as Partial<TemplateMeta>;
    if (!meta || typeof meta.name !== 'string') return null;
    return {
      version: meta.version ?? 1,
      name: meta.name,
      description: meta.description ?? '',
      createdAt: meta.createdAt ?? 0,
      mainFile: meta.mainFile ?? 'main.typ',
    };
  } catch {
    return null;
  }
}

async function writeMeta(dir: string, meta: TemplateMeta): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'template.json'),
    `${JSON.stringify(meta, null, 2)}\n`,
    'utf8',
  );
}

async function ensureSeeded(): Promise<void> {
  const root = templatesRoot();
  try {
    await fs.access(root);
    return;
  } catch {
    // 首次运行时写入内置模板；之后用户删除模板不会再自动恢复。
  }
  await fs.mkdir(root, { recursive: true });
  for (const template of BUILTIN_TEMPLATES) {
    const dir = templateDir(template.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.typ'), template.content, 'utf8');
    await writeMeta(dir, {
      version: 1,
      name: template.name,
      description: template.description,
      createdAt: Date.now(),
      mainFile: 'main.typ',
    });
  }
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  await ensureSeeded();
  const root = templatesRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const templates: TemplateInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const meta = await readMeta(dir);
    if (!meta) continue;
    try {
      await fs.access(path.join(dir, meta.mainFile));
    } catch {
      continue;
    }
    templates.push({
      id: entry.name,
      name: meta.name,
      description: meta.description,
      createdAt: meta.createdAt,
      path: dir,
      mainFile: meta.mainFile,
    });
  }
  templates.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  return templates;
}

async function uniqueTemplateId(base: string): Promise<string> {
  const root = templatesRoot();
  let candidate = base || `template-${Date.now()}`;
  let suffix = 2;
  for (;;) {
    try {
      await fs.access(path.join(root, candidate));
      candidate = `${base}-${suffix}`;
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function importTemplate(): Promise<TemplateInfo | null> {
  await ensureSeeded();
  const result = await dialog.showOpenDialog({
    title: t('导入模板'),
    buttonLabel: t('导入'),
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: t('Typst 模板（.typ / .zip）'), extensions: ['typ', 'zip'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const source = result.filePaths[0];
  const stat = await fs.stat(source);
  const ext = path.extname(source).toLowerCase();

  let baseName = '';
  let mainFile = 'main.typ';
  let description = '导入的 Typst 模板';
  let id = '';
  let dir = '';

  if (stat.isDirectory()) {
    const resolved = await resolveTemplateRoot(source);
    baseName = path.basename(source);
    mainFile = resolved.mainFile;
    id = await uniqueTemplateId(slugify(baseName));
    dir = templateDir(id);
    await fs.cp(resolved.root, dir, {
      recursive: true,
      filter: (src) => shouldCopy(resolved.root, src),
    });
  } else if (ext === '.typ') {
    baseName = path.basename(source, ext);
    id = await uniqueTemplateId(slugify(baseName));
    dir = templateDir(id);
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(source, path.join(dir, 'main.typ'));
  } else if (ext === '.zip') {
    baseName = path.basename(source, ext);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'deckle-template-'));
    try {
      await extractTemplateZip(source, temp);
      const resolved = await resolveTemplateRoot(temp);
      mainFile = resolved.mainFile;
      id = await uniqueTemplateId(slugify(baseName));
      dir = templateDir(id);
      await fs.cp(resolved.root, dir, {
        recursive: true,
        filter: (src) => shouldCopy(resolved.root, src),
      });
      description = '从压缩包导入的 Typst 模板';
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  } else {
    throw new AppError(
      'EINVAL',
      t('请选择 .typ 文件、.zip 压缩包或模板文件夹'),
    );
  }

  if (!(await exists(path.join(dir, mainFile)))) {
    throw new AppError(
      'EINVAL',
      t('模板入口文件 {file} 不存在', { file: mainFile }),
    );
  }

  const meta: TemplateMeta = {
    version: 1,
    name: baseName,
    description,
    createdAt: Date.now(),
    mainFile,
  };
  await writeMeta(dir, meta);
  return {
    id,
    name: meta.name,
    description: meta.description,
    createdAt: meta.createdAt,
    path: dir,
    mainFile,
  };
}

export async function deleteTemplate(id: string): Promise<void> {
  const dir = templateDir(id);
  try {
    await fs.access(dir);
  } catch {
    throw new AppError('ENOENT', t('模板不存在或已删除'));
  }
  await fs.rm(dir, { recursive: true, force: true });
}

export async function templateMainFile(id: string): Promise<string> {
  const dir = templateDir(id);
  const meta = await readMeta(dir);
  if (!meta) throw new AppError('ENOENT', t('模板不存在或已删除'));
  return meta.mainFile;
}

/**
 * 把模板目录复制到新项目目录，跳过 .typstor 等元数据，保证从模板开始写论文时
 * 不会修改模板本身。
 */
export async function copyTemplateInto(
  id: string,
  targetDir: string,
): Promise<string> {
  await ensureSeeded();
  const dir = templateDir(id);
  let meta: TemplateMeta | null = null;
  try {
    meta = await readMeta(dir);
  } catch {
    meta = null;
  }
  if (!meta) throw new AppError('ENOENT', t('模板不存在或已删除'));
  await fs.cp(dir, targetDir, {
    recursive: true,
    filter: (src) => shouldCopy(dir, src),
  });
  return meta.mainFile;
}
