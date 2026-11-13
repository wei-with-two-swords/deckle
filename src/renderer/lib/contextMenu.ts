import type { FileEntry } from '../../shared/types';

/** 右键菜单命中的文件树行（结构化兼容 FilesPanel 的 Row）。 */
export interface ContextRow {
  entry: FileEntry;
  isRoot?: boolean;
}

/** 返回路径的父目录；已是盘符根或没有分隔符时原样返回。 */
export function parentOf(target: string): string {
  const index = Math.max(target.lastIndexOf('\\'), target.lastIndexOf('/'));
  return index > 0 ? target.slice(0, index) : target;
}

/**
 * 右键菜单里的「新建 / 导入」目标目录：
 * 目录用自身，文件用父目录，树空白处（无 row）用项目根。
 */
export function contextTargetDir(
  row: ContextRow | undefined,
  root: string,
): string {
  if (!row) return root;
  return row.entry.kind === 'directory'
    ? row.entry.path
    : parentOf(row.entry.path);
}

/**
 * 菜单打开期间的 pointerdown 是否应关闭菜单。
 * 右键（button 2）绝不在这里关闭——它由随后到来的 contextmenu 负责
 * 在鼠标新位置重新打开菜单，这样才不会「先关掉再点一次」。
 */
export function closeOnPointerDown(
  button: number,
  insideMenu: boolean,
  onTrigger: boolean,
): boolean {
  if (button === 2) return false;
  return !insideMenu && !onTrigger;
}

export interface ContextMenuDecision {
  close: boolean;
  preventDefault: boolean;
}

/**
 * 菜单打开期间收到 contextmenu 时的处理决定：
 * - 点在菜单自身：阻止浏览器原生菜单，保持当前菜单；
 * - 点在文件树内：不干预，交给文件树 handler 在新位置重开菜单；
 * - 其它位置：关闭菜单，且不阻止该处自身的右键行为。
 */
export function closeOnContextMenu(
  insideMenu: boolean,
  insideTree: boolean,
): ContextMenuDecision {
  if (insideMenu) return { close: false, preventDefault: true };
  if (insideTree) return { close: false, preventDefault: false };
  return { close: true, preventDefault: false };
}

/** 把鼠标坐标变成 Popper 可用的零尺寸虚拟锚点。 */
export function anchorRectAt(x: number, y: number): DOMRect {
  return {
    x,
    y,
    top: y,
    left: x,
    right: x,
    bottom: y,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect;
}
