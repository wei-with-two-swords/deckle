import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors';
import { t } from './i18n';

const IGNORED_DIRS = new Set([
  '.deckle',
  '.typstor',
  '.git',
  'node_modules',
  'out',
  '.webpack',
  'tmp',
]);

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** 在目录中找入口：main.typ 优先，否则根目录下唯一的 .typ。 */
export async function findMainFile(dir: string): Promise<string> {
  if (await exists(path.join(dir, 'main.typ'))) return 'main.typ';
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const typFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.typ'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (typFiles.length === 0) {
    throw new AppError(
      'EINVAL',
      t('模板文件夹里需要有一个 main.typ，或至少一个 .typ 文件'),
    );
  }
  return typFiles[0];
}

/**
 * 支持两种常见压缩包结构：入口在根目录，或整个模板包在一层文件夹里。
 * 返回真正包含入口的根目录与入口文件名。
 */
export async function resolveTemplateRoot(
  dir: string,
): Promise<{ root: string; mainFile: string }> {
  if (await exists(path.join(dir, 'main.typ'))) {
    return { root: dir, mainFile: 'main.typ' };
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const typFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.typ'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (typFiles.length === 1) {
    return { root: dir, mainFile: typFiles[0] };
  }

  const candidates: { root: string; mainFile: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
    const child = path.join(dir, entry.name);
    try {
      candidates.push({ root: child, mainFile: await findMainFile(child) });
    } catch {
      // 这个子目录没有 Typst 入口，忽略。
    }
  }
  if (candidates.length === 1) return candidates[0];
  throw new AppError(
    'EINVAL',
    t('没有找到入口文件：需要 main.typ，或唯一的 .typ 文件'),
  );
}
