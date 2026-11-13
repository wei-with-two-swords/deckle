import { dirOf, joinRelative, samePath } from '../../shared/paths';
import { parseOutline } from '../views/outlineModel';

/** 大纲中的一条条目：标题或图/表，都带有其所属文件的绝对路径。 */
export interface HeadingItem {
  kind: 'heading';
  /** `${file}::${line}`，作为折叠状态的唯一键 */
  id: string;
  /** 所属文件绝对路径（用于跨文件跳转） */
  file: string;
  /** 0-based 行号（相对于所属文件） */
  line: number;
  level: number;
  text: string;
  /** 自动计算的编号，如 "1.1.1" */
  prefix: string;
  /** 其后（直到同级或更高级标题出现前）是否还有子标题或图/表 */
  hasChildren: boolean;
}

export interface FloatItem {
  kind: 'float';
  id: string;
  file: string;
  line: number;
  floatKind: 'figure' | 'table';
  caption: string;
  /** 文档中按出现顺序的图/表序号（图、表各自计数） */
  index: number;
}

export type OutlineItem = HeadingItem | FloatItem;

export interface OutlineBuildResult {
  items: OutlineItem[];
  errors: string[];
}

export interface ReadFileFn {
  (path: string): Promise<{ content: string; mtimeMs: number }>;
}

const INCLUDE_RE = /#include\s*(?:\(\s*)?"([^"]+)"\s*\)?/g;

/** 从一段 Typst 源码里找出被 #include 引用的相对路径。
 * 只跟随 #include：#import 仅引入名称（模块文件不会作为正文渲染），不应计入大纲。 */
export function findIncludes(content: string): string[] {
  const result: string[] = [];
  let match: RegExpExecArray | null = INCLUDE_RE.exec(content);
  while (match !== null) {
    if (match[1]) result.push(match[1]);
    match = INCLUDE_RE.exec(content);
  }
  return result;
}

/**
 * 从入口文件出发，按文档顺序（前序 DFS）递归收集所有被包含的文件。
 * 同时解析 #include 与 #import，处理循环引用（同一文件只进一次）。
 */
export async function resolveIncludedFiles(
  rootFile: string,
  readFile: ReadFileFn,
): Promise<{ files: string[]; errors: string[] }> {
  const files: string[] = [];
  const errors: string[] = [];
  const norm = (value: string) =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const seen = new Set<string>([norm(rootFile)]);

  const visit = async (file: string): Promise<void> => {
    files.push(file);
    let content: string;
    try {
      content = (await readFile(file)).content;
    } catch {
      errors.push(file);
      return;
    }
    for (const relative of findIncludes(content)) {
      const absolute = joinRelative(dirOf(file), relative);
      if (!seen.has(norm(absolute))) {
        seen.add(norm(absolute));
        await visit(absolute);
      }
    }
  };

  await visit(rootFile);
  return { files, errors };
}

/**
 * 构建「全文大纲」：从入口文件递归读取所有被包含的文件，逐文件解析标题 / 图 / 表，
 * 按文档顺序合并，并给每条打上所属文件与自动编号。
 * 活动文件优先使用实时内容（liveContent），其余文件通过 readFile 读取（调用方应做缓存）。
 */
export async function buildOutlineItems(opts: {
  rootFile: string;
  activeFile?: string;
  liveContent?: string;
  readFile: ReadFileFn;
}): Promise<OutlineBuildResult> {
  const { files, errors } = await resolveIncludedFiles(
    opts.rootFile,
    opts.readFile,
  );
  const all: OutlineItem[] = [];
  let figureIndex = 0;
  let tableIndex = 0;

  for (const file of files) {
    let content: string;
    if (
      opts.activeFile &&
      opts.liveContent != null &&
      samePath(file, opts.activeFile)
    ) {
      content = opts.liveContent;
    } else {
      try {
        content = (await opts.readFile(file)).content;
      } catch {
        continue;
      }
    }

    const model = parseOutline(content);
    const entries: Array<{ line: number; emit: () => OutlineItem }> = [];

    for (const heading of model.headings) {
      entries.push({
        line: heading.line,
        emit: (): OutlineItem => ({
          kind: 'heading',
          id: `${file}::${heading.line}`,
          file,
          line: heading.line,
          level: heading.level,
          text: heading.text,
          prefix: '',
          hasChildren: false,
        }),
      });
    }
    for (const figure of model.figures) {
      figureIndex += 1;
      const index = figureIndex;
      entries.push({
        line: figure.line,
        emit: (): OutlineItem => ({
          kind: 'float',
          id: `${file}::${figure.line}`,
          file,
          line: figure.line,
          floatKind: 'figure',
          caption: figure.caption,
          index,
        }),
      });
    }
    for (const table of model.tables) {
      tableIndex += 1;
      const index = tableIndex;
      entries.push({
        line: table.line,
        emit: (): OutlineItem => ({
          kind: 'float',
          id: `${file}::${table.line}`,
          file,
          line: table.line,
          floatKind: 'table',
          caption: table.caption,
          index,
        }),
      });
    }

    entries.sort((a, b) => a.line - b.line);
    for (const entry of entries) all.push(entry.emit());
  }

  // 自动编号：1 / 1.1 / 1.1.1 ……（跳级时按层级计数，与 Typst heading(numbering) 一致）
  const counters: number[] = [];
  for (const item of all) {
    if (item.kind !== 'heading') continue;
    while (counters.length < item.level) counters.push(0);
    counters[item.level - 1] += 1;
    counters.length = item.level;
    item.prefix = counters.join('.');
  }

  // hasChildren：向后扫描，直到遇到同级或更高级标题之前，是否出现过更深层的子标题。
  // 图/表已独立为文件夹分组，不再作为标题子级参与，避免显示无法展开的空三角。
  for (let i = 0; i < all.length; i += 1) {
    const item = all[i];
    if (item.kind !== 'heading') continue;
    let has = false;
    for (let j = i + 1; j < all.length; j += 1) {
      const next = all[j];
      if (next.kind !== 'heading') continue;
      if (next.level <= item.level) break;
      has = true;
      break;
    }
    item.hasChildren = has;
  }

  return { items: all, errors };
}

export interface OutlineView {
  /** 按标题层级 + 折叠状态计算出的可见标题行（缩进 = level - 1） */
  headings: Array<{ item: HeadingItem; indent: number }>;
  /** 全文所有图（按文档出现顺序），由 UI 的「图」分组决定折叠显示 */
  figures: FloatItem[];
  /** 全文所有表（按文档出现顺序），由 UI 的「表」分组决定折叠显示 */
  tables: FloatItem[];
}

/**
 * 根据折叠状态计算大纲视图。
 * - 标题按层级嵌套：被折叠的标题会隐藏其后的子标题（直到同级或更高级标题出现）。
 * - 图/表不再内联，分别汇总为独立的「图」「表」分组（类似文件夹，各自可独立折叠）。
 */
export function computeOutlineView(
  items: OutlineItem[],
  collapsedHeadings: ReadonlySet<string>,
): OutlineView {
  const headings: Array<{ item: HeadingItem; indent: number }> = [];
  const figures: FloatItem[] = [];
  const tables: FloatItem[] = [];
  const stack: HeadingItem[] = [];

  for (const item of items) {
    if (item.kind === 'float') {
      if (item.floatKind === 'figure') figures.push(item);
      else tables.push(item);
      continue;
    }
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    const ancestorsExpanded = stack.every(
      (heading) => !collapsedHeadings.has(heading.id),
    );
    if (ancestorsExpanded) {
      headings.push({ item, indent: item.level - 1 });
    }
    stack.push(item);
  }

  return { headings, figures, tables };
}

export type OutlineSectionKey = 'headings' | 'figures' | 'tables';
export type OutlineWeights = Record<OutlineSectionKey, number>;

/** 初始权重只是默认值，用户可拖拽分隔条自由调整（VSCode SplitView 行为）。 */
export const DEFAULT_OUTLINE_WEIGHTS: OutlineWeights = {
  headings: 2,
  figures: 1,
  tables: 1,
};

/**
 * VSCode SplitView 式的分区高度调整：拖动分隔条时，相邻两个展开分区的权重
 * 此消彼长、总权重不变；折叠分区不参与分配（只占标题栏高度）。
 *
 * @param deltaRatio 拖拽位移占可用高度的比例（向下拖为正）
 */
export function resizeOutlineSections(opts: {
  weights: OutlineWeights;
  expanded: readonly OutlineSectionKey[];
  upper: OutlineSectionKey;
  lower: OutlineSectionKey;
  deltaRatio: number;
  minWeight?: number;
}): OutlineWeights {
  const {
    weights,
    expanded,
    upper,
    lower,
    deltaRatio,
    minWeight = 0.25,
  } = opts;
  if (
    upper === lower ||
    !expanded.includes(upper) ||
    !expanded.includes(lower)
  ) {
    return { ...weights };
  }
  const total = expanded.reduce((sum, key) => sum + weights[key], 0);
  if (total <= 0) return { ...weights };

  const pair = weights[upper] + weights[lower];
  const delta = deltaRatio * total;
  const nextUpper = Math.max(
    minWeight,
    Math.min(pair - minWeight, weights[upper] + delta),
  );
  return {
    ...weights,
    [upper]: nextUpper,
    [lower]: pair - nextUpper,
  };
}

/**
 * 大纲是否处于「全部折叠」态：标题全部折叠 + 图/表分组都折叠。
 * 顶部二态按钮与手动折叠分组共用此判定，避免用户单独点开某个分组后按钮状态不同步。
 */
export function isOutlineAllCollapsed(state: {
  outlineHeadingsCollapsed: ReadonlySet<string>;
  outlineHeadingIds: readonly string[];
  outlineFiguresCollapsed: boolean;
  outlineTablesCollapsed: boolean;
}): boolean {
  return (
    state.outlineFiguresCollapsed &&
    state.outlineTablesCollapsed &&
    state.outlineHeadingsCollapsed.size >= state.outlineHeadingIds.length
  );
}
