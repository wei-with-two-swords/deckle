import { promises as fs } from 'node:fs';
import path from 'node:path';
import { countWords } from '../shared/wordCount';
import { allowRoot, assertInside } from './projects';

const MAX_DEPTH = 12;
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const SKIP_DIRS = new Set([
  '.deckle',
  '.typstor',
  '.git',
  'node_modules',
  'out',
  '.webpack',
  'tmp',
  'dist',
  'build',
]);

export interface WordCountOverride {
  /** 绝对路径：编辑中的文件内容（可能尚未落盘） */
  path: string;
  content: string;
}

function normalize(target: string): string {
  const resolved = path.resolve(target);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * 统计项目内所有 .typ 文件的字数总和。
 * 传入 override 时，用编辑中的实时内容替代该文件在磁盘上的内容，
 * 这样自动保存未触发时「项目总字数」也能反映当前编辑。
 */
export async function countProjectWords(
  projectPath: string,
  override?: WordCountOverride,
): Promise<number> {
  allowRoot(projectPath);
  assertInside(projectPath);

  let total = 0;
  let visited = 0;
  const overridePath = override ? normalize(override.path) : null;
  let overrideUsed = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || visited >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= MAX_FILES) return;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          await walk(absolute, depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.typ')) {
        continue;
      }
      visited += 1;
      let content: string;
      if (override && overridePath && normalize(absolute) === overridePath) {
        content = override.content;
        overrideUsed = true;
      } else {
        try {
          const stats = await fs.stat(absolute);
          if (stats.size > MAX_FILE_BYTES) continue;
          content = await fs.readFile(absolute, 'utf8');
        } catch {
          continue;
        }
      }
      total += countWords(content.replace(/^\uFEFF/, ''));
    }
  };

  await walk(projectPath, 0);
  // 编辑中的文件可能位于跳过名单之外的新路径，补算一次避免漏计。
  if (override?.content && !overrideUsed) total += countWords(override.content);
  return total;
}
