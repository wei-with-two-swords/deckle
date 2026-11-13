import { describe, expect, it } from 'vitest';

import {
  buildOutlineItems,
  computeOutlineView,
  DEFAULT_OUTLINE_WEIGHTS,
  findIncludes,
  isOutlineAllCollapsed,
  resizeOutlineSections,
  resolveIncludedFiles,
  type FloatItem,
  type HeadingItem,
  type OutlineItem,
  type ReadFileFn,
} from '../src/renderer/lib/documentOutline';

const isHeading = (item: OutlineItem): item is HeadingItem =>
  item.kind === 'heading';
const isFloat = (item: OutlineItem): item is FloatItem => item.kind === 'float';

/** 用内存 Map 充当只读文件系统，避免触碰真实磁盘。 */
function fakeFs(map: Record<string, string>): ReadFileFn {
  return async (path: string) => {
    if (!(path in map)) throw new Error(`ENOENT: ${path}`);
    return { content: map[path], mtimeMs: 0 };
  };
}

const MAIN = '/proj/main.typ';
const CH1 = '/proj/chapters/ch1.typ';

const SAMPLE: Record<string, string> = {
  [MAIN]: [
    '#include "chapters/ch1.typ"',
    '= 摘要',
    '',
    '#import "utils.typ": *',
  ].join('\n'),
  [CH1]: [
    '= 第一章',
    '== 1.1 小节',
    '#figure(image("a.png"), caption: [图A])',
    '== 1.2 另一节',
    '#figure(table(columns: 2, [x]), kind: table, caption: [表一])',
  ].join('\n'),
  // 被 import 的「工具模块」不会作为正文渲染，故不应计入大纲（findIncludes 仅匹配 #include）
  '/proj/utils.typ': ['#let helper = x => x', '= 不该出现'].join('\n'),
};

describe('findIncludes', () => {
  it('匹配带/不带括号的 #include', () => {
    const content = [
      '#include "a.typ"',
      '#include("b.typ")',
      '#import "c.typ": *',
      '#import("d.typ")',
    ].join('\n');
    // 只跟随 #include（#import 仅引入名称，不计入大纲）
    expect(findIncludes(content).sort()).toEqual(['a.typ', 'b.typ'].sort());
  });
});

describe('resolveIncludedFiles', () => {
  it('前序 DFS 收集且去重，处理循环引用', async () => {
    const files = {
      '/p/main.typ': '#include "a.typ"\n#include "b.typ"',
      '/p/a.typ': '#include "b.typ"',
      '/p/b.typ': '#include "main.typ"',
    };
    const { files: resolved, errors } = await resolveIncludedFiles(
      '/p/main.typ',
      fakeFs(files),
    );
    // 前序：main -> a -> b（b 里的循环回指 main 已被 seen 过滤）
    expect(resolved).toEqual(['/p/main.typ', '/p/a.typ', '/p/b.typ']);
    expect(errors).toEqual([]);
  });

  it('读取失败的文件进入 errors 但不中断其它文件', async () => {
    const files = {
      '/p/main.typ': '#include "missing.typ"\n#include "ok.typ"',
      '/p/ok.typ': '= 好的',
    };
    const { files: resolved, errors } = await resolveIncludedFiles(
      '/p/main.typ',
      fakeFs(files),
    );
    expect(resolved).toEqual(['/p/main.typ', '/p/missing.typ', '/p/ok.typ']);
    expect(errors).toEqual(['/p/missing.typ']);
  });
});

describe('buildOutlineItems', () => {
  it('跨文件按文档顺序合并，标注文件与编号', async () => {
    const { items } = await buildOutlineItems({
      rootFile: MAIN,
      readFile: fakeFs(SAMPLE),
    });
    // 顺序：main 的 摘要，再 ch1 的 第一章 / 1.1 / 图A / 1.2 / 表一
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual([
      'heading',
      'heading',
      'heading',
      'float',
      'heading',
      'float',
    ]);

    const byText = (text: string) =>
      items.filter(isHeading).filter((h) => h.text === text);
    expect(byText('摘要')[0].file).toBe(MAIN);
    expect(byText('第一章')[0].file).toBe(CH1);
    // 编号：摘要=1，第一章=2
    expect(byText('摘要')[0].prefix).toBe('1');
    expect(byText('第一章')[0].prefix).toBe('2');
    expect(byText('第一章')[0].hasChildren).toBe(true);

    const figures = items
      .filter(isFloat)
      .filter((f) => f.floatKind === 'figure');
    expect(figures).toHaveLength(1);
    expect(figures[0].caption).toBe('图A');
    expect(figures[0].index).toBe(1);

    const tables = items.filter(isFloat).filter((f) => f.floatKind === 'table');
    expect(tables[0].caption).toBe('表一');
    expect(tables[0].index).toBe(1);
  });

  it('活动文件优先使用实时内容而非磁盘', async () => {
    const { items } = await buildOutlineItems({
      rootFile: MAIN,
      activeFile: CH1,
      liveContent: '= 仅实时\n== 实时小节',
      readFile: fakeFs(SAMPLE),
    });
    const texts = items.filter(isHeading).map((h) => h.text);
    expect(texts).toEqual(['摘要', '仅实时', '实时小节']);
  });
});

describe('computeOutlineView', () => {
  it('折叠标题会隐藏其子标题，但不影响图/表分组', async () => {
    const { items } = await buildOutlineItems({
      rootFile: MAIN,
      readFile: fakeFs(SAMPLE),
    });
    const ch1 = items.find((i) => i.kind === 'heading' && i.text === '第一章')!;
    const view = computeOutlineView(items, new Set([ch1.id]));
    const visibleHeadings = view.headings.map((n) => n.item.text);
    // 第一章被折叠：其 1.1 / 1.2 子标题被隐藏，第一章本身仍显示
    expect(visibleHeadings).toEqual(['摘要', '第一章']);
    // 图/表独立分组，不受标题折叠影响，仍全部保留
    expect(view.figures).toHaveLength(1);
    expect(view.tables).toHaveLength(1);
  });

  it('图/表分别归入独立的 figures / tables 分组（按文档顺序）', async () => {
    const { items } = await buildOutlineItems({
      rootFile: MAIN,
      readFile: fakeFs(SAMPLE),
    });
    const figA = items.find((i) => i.kind === 'float' && i.caption === '图A')!;
    const table1 = items.find(
      (i) => i.kind === 'float' && i.caption === '表一',
    )!;
    const view = computeOutlineView(items, new Set());
    expect(view.figures.map((f) => f.id)).toEqual([figA.id]);
    expect(view.tables.map((t) => t.id)).toEqual([table1.id]);
    // headings 里不再混入任何图/表
    expect(view.headings.every((n) => n.item.kind === 'heading')).toBe(true);
  });

  it('标题缩进 = level - 1', async () => {
    const { items } = await buildOutlineItems({
      rootFile: MAIN,
      readFile: fakeFs(SAMPLE),
    });
    const view = computeOutlineView(items, new Set());
    const indents = view.headings.map((n) => n.item.level - 1);
    expect(view.headings.map((n) => n.indent)).toEqual(indents);
    expect(view.headings.map((n) => n.item.text)).toEqual([
      '摘要',
      '第一章',
      '1.1 小节',
      '1.2 另一节',
    ]);
  });
});

describe('resizeOutlineSections（VSCode 式可拖拽分区）', () => {
  const all = ['headings', 'figures', 'tables'] as const;

  it('初始权重只是默认值，不是写死的高度比例', () => {
    expect(DEFAULT_OUTLINE_WEIGHTS).toEqual({
      headings: 2,
      figures: 1,
      tables: 1,
    });
  });

  it('向下拖动：上分区变大、下分区变小，总权重守恒', () => {
    const next = resizeOutlineSections({
      weights: DEFAULT_OUTLINE_WEIGHTS,
      expanded: all,
      upper: 'headings',
      lower: 'figures',
      deltaRatio: 0.1,
    });
    expect(next.headings).toBeCloseTo(2.4);
    expect(next.figures).toBeCloseTo(0.6);
    expect(next.tables).toBe(1);
    expect(next.headings + next.figures + next.tables).toBeCloseTo(4);
  });

  it('向上拖动：上分区变小、下分区变大', () => {
    const next = resizeOutlineSections({
      weights: DEFAULT_OUTLINE_WEIGHTS,
      expanded: all,
      upper: 'figures',
      lower: 'tables',
      deltaRatio: -0.25,
    });
    // total=4，delta=-1；figures 从 1 降到下限 0.25，tables 升到 1.75
    expect(next.figures).toBeCloseTo(0.25);
    expect(next.tables).toBeCloseTo(1.75);
    expect(next.headings).toBe(2);
  });

  it('拖到极限时受 minWeight 限制，分区不会被拖没或变成负值', () => {
    const next = resizeOutlineSections({
      weights: DEFAULT_OUTLINE_WEIGHTS,
      expanded: all,
      upper: 'headings',
      lower: 'tables',
      deltaRatio: 100,
    });
    expect(next.tables).toBeGreaterThanOrEqual(0.25);
    expect(next.headings).toBeGreaterThan(0);
    expect(next.headings + next.tables).toBeCloseTo(3);
  });

  it('折叠分区不参与分配，位移换算只基于展开分区的总权重', () => {
    const next = resizeOutlineSections({
      weights: DEFAULT_OUTLINE_WEIGHTS,
      expanded: ['headings', 'figures'],
      upper: 'headings',
      lower: 'figures',
      deltaRatio: 0.1,
    });
    // total=3（tables 折叠不计入），delta=0.3
    expect(next.headings).toBeCloseTo(2.3);
    expect(next.figures).toBeCloseTo(0.7);
    expect(next.tables).toBe(1);
  });

  it('相邻分区有一方折叠或 key 非法时保持原样', () => {
    const base = DEFAULT_OUTLINE_WEIGHTS;
    expect(
      resizeOutlineSections({
        weights: base,
        expanded: ['headings', 'figures'],
        upper: 'headings',
        lower: 'tables',
        deltaRatio: 0.3,
      }),
    ).toEqual(base);
    expect(
      resizeOutlineSections({
        weights: base,
        expanded: all,
        upper: 'headings',
        lower: 'headings',
        deltaRatio: 0.3,
      }),
    ).toEqual(base);
  });
});

describe('isOutlineAllCollapsed（顶部二态按钮与手动折叠同步）', () => {
  const base = {
    outlineHeadingsCollapsed: new Set<string>(['a', 'b']),
    outlineHeadingIds: ['a', 'b'],
    outlineFiguresCollapsed: true,
    outlineTablesCollapsed: true,
  };

  it('标题全折叠 + 图/表都折叠 → 全部折叠态', () => {
    expect(isOutlineAllCollapsed(base)).toBe(true);
  });

  it('手动展开任一图/表分组 → 不再是全部折叠态', () => {
    expect(
      isOutlineAllCollapsed({ ...base, outlineFiguresCollapsed: false }),
    ).toBe(false);
    expect(
      isOutlineAllCollapsed({ ...base, outlineTablesCollapsed: false }),
    ).toBe(false);
  });

  it('手动展开任一标题 → 不再是全部折叠态', () => {
    expect(
      isOutlineAllCollapsed({
        ...base,
        outlineHeadingsCollapsed: new Set(['a']),
      }),
    ).toBe(false);
  });

  it('没有标题的文档也能正确判定', () => {
    expect(
      isOutlineAllCollapsed({
        ...base,
        outlineHeadingsCollapsed: new Set(),
        outlineHeadingIds: [],
      }),
    ).toBe(true);
  });
});
