import type { FileEntry } from '../../shared/types';

/** 路径是否位于项目根之下（不含根目录自身），用于过滤其它项目遗留的展开状态。 */
function isBelowRoot(root: string, target: string): boolean {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = target.replace(/\\/g, '/');
  return normalized.startsWith(`${base}/`);
}

/**
 * 全部折叠后的展开状态：只保留项目根目录，根目录永远不收起。
 */
export function rootOnlyExpanded(root: string): Record<string, boolean> {
  return { [root]: true };
}

/**
 * 按当前已加载的目录树计算「全部展开」状态。
 * 目录是按需读取的，这里只覆盖从根可达的目录；调用方负责先把深层目录加载进来。
 * 用 seen 集合防止符号链接形成环时死循环。
 */
export function allDirsExpanded(
  root: string,
  tree: Record<string, FileEntry[]>,
): Record<string, boolean> {
  const expanded: Record<string, boolean> = { [root]: true };
  const seen = new Set<string>([root]);
  const queue = [root];

  while (queue.length > 0) {
    const dir = queue.shift()!;
    for (const entry of tree[dir] ?? []) {
      if (entry.kind !== 'directory' || seen.has(entry.path)) continue;
      seen.add(entry.path);
      expanded[entry.path] = true;
      queue.push(entry.path);
    }
  }

  return expanded;
}

/** 除了根目录以外，是否还有处于展开态的文件夹（决定头部按钮显示折叠还是展开）。 */
export function hasExpandedDir(
  root: string,
  expanded: Record<string, boolean>,
): boolean {
  return Object.entries(expanded).some(
    ([path, value]) => value && isBelowRoot(root, path),
  );
}
