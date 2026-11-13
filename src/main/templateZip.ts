import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors';
import { t } from './i18n';

const MAX_ENTRIES = 3000;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

export function safeEntryName(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    segments.some((segment) => segment === '..' || segment === '.')
  ) {
    throw new AppError(
      'EINVAL',
      t('压缩包含有非法路径：{path}', { path: entryName }),
    );
  }
  return segments.join('/');
}

/**
 * 把 .zip 模板安全解压到目标目录：拒绝绝对路径与 `..`，并限制条目数量与总大小。
 * 不依赖 Electron，便于单独验证。
 */
export async function extractTemplateZip(
  zipPath: string,
  destDir: string,
): Promise<void> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new AppError('EINVAL', t('无法读取压缩包，请确认是有效的 .zip 文件'));
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new AppError('EINVAL', t('压缩包是空的'));
  }
  if (entries.length > MAX_ENTRIES) {
    throw new AppError('EINVAL', t('压缩包内文件太多（上限 3000 个）'));
  }

  const root = path.resolve(destDir);
  await fs.mkdir(root, { recursive: true });

  let totalBytes = 0;
  let written = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const relative = safeEntryName(entry.entryName);
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new AppError(
        'EINVAL',
        t('压缩包含有非法路径：{path}', { path: entry.entryName }),
      );
    }

    const size = entry.header.size;
    if (size > 50 * 1024 * 1024) {
      throw new AppError(
        'EINVAL',
        t('压缩包内文件过大（{name}），已取消导入', { name: entry.entryName }),
      );
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new AppError('EINVAL', t('压缩包解压后超过 150MB，已取消导入'));
    }

    const data = entry.getData();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    written += 1;
  }

  if (written === 0) {
    throw new AppError('EINVAL', t('压缩包里没有可导入的文件'));
  }
}
