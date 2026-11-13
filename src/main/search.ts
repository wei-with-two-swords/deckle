import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { SearchHit } from '../shared/types';
import { allowRoot, assertInside } from './projects';
import { t } from './i18n';

const MAX_FILES = 400;
const MAX_HITS = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEPTH = 8;
const SKIP_DIRS = new Set([
  '.typstor',
  '.git',
  'node_modules',
  'out',
  '.webpack',
  'tmp',
]);

interface FoundFile {
  absolute: string;
  relative: string;
}

function collectTypFiles(root: string, limit: number): FoundFile[] {
  const found: FoundFile[] = [];
  const walk = (dir: string, depth: number): void => {
    if (found.length >= limit || depth > MAX_DEPTH) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (found.length >= limit) return;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.typ')) {
        continue;
      }
      let size = 0;
      try {
        size = statSync(absolute).size;
      } catch {
        continue;
      }
      if (size > MAX_FILE_BYTES) continue;
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      found.push({ absolute, relative });
    }
  };
  walk(root, 0);
  return found;
}

function makePreview(line: string, column: number): string {
  const text = line.replace(/\t/g, ' ').trimEnd();
  const max = 160;
  if (text.length <= max) return text;
  const start = Math.max(0, Math.min(column - 40, text.length - max));
  const end = Math.min(text.length, start + max);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const slice = text.slice(start, end);
  return `${prefix}${slice}${suffix}`;
}

/** 在项目内 .typ 文件里做字面量搜索；大小写可选，返回相对路径与 0-based 行列。 */
export function searchProject(
  projectPath: string,
  query: string,
  caseSensitive = false,
): SearchHit[] {
  const root = path.resolve(projectPath);
  allowRoot(root);
  assertInside(root);

  const needle = query.trim();
  if (needle.length === 0) {
    throw new Error(t('搜索内容不能为空'));
  }
  if (needle.length > 200) {
    throw new Error(t('搜索内容过长'));
  }

  const hits: SearchHit[] = [];
  const files = collectTypFiles(root, MAX_FILES);
  const normalizedNeedle = caseSensitive ? needle : needle.toLowerCase();

  for (const file of files) {
    if (hits.length >= MAX_HITS) break;
    let content: string;
    try {
      content = readFileSync(file.absolute, 'utf8').replace(/^\uFEFF/, '');
    } catch {
      continue;
    }
    const lines = content.split(/\r\n|\n|\r/);
    for (let index = 0; index < lines.length; index += 1) {
      if (hits.length >= MAX_HITS) break;
      const line = lines[index];
      const haystack = caseSensitive ? line : line.toLowerCase();
      const column = haystack.indexOf(normalizedNeedle);
      if (column === -1) continue;
      hits.push({
        path: file.relative,
        line: index,
        column,
        preview: makePreview(line, column),
      });
    }
  }

  hits.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.line - b.line;
  });
  return hits;
}
