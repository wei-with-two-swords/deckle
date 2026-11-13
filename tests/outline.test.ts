import { describe, expect, it } from 'vitest';

import { parseOutline } from '../src/renderer/views/outlineModel';

describe('parseOutline', () => {
  it('提取标题层级与行号', () => {
    const content = '= 第一章\n\n正文\n\n== 1.1 小节\n\n=== 细节';
    const model = parseOutline(content);
    expect(model.headings).toEqual([
      { line: 0, level: 1, text: '第一章' },
      { line: 4, level: 2, text: '1.1 小节' },
      { line: 6, level: 3, text: '细节' },
    ]);
  });

  it('识别图片 figure 与多行 caption', () => {
    const content = [
      '= 标题',
      '',
      '#figure(',
      '  image("assets/diagram.svg", width: 70%),',
      '  caption: [系统结构示意图，',
      '    包含编辑器与预览],',
      ')',
    ].join('\n');
    const model = parseOutline(content);
    expect(model.figures).toHaveLength(1);
    expect(model.figures[0]).toMatchObject({
      line: 2,
      kind: 'figure',
      caption: '系统结构示意图， 包含编辑器与预览',
    });
    expect(model.tables).toHaveLength(0);
  });

  it('识别表格 figure，并处理 caption 中的嵌套方括号', () => {
    const content = [
      '#figure(',
      '  table(columns: 3, [a], [b], [c]),',
      '  caption: [指标 [含单位] 汇总],',
      ')',
    ].join('\n');
    const model = parseOutline(content);
    expect(model.tables).toHaveLength(1);
    expect(model.tables[0]).toMatchObject({
      line: 0,
      kind: 'table',
      caption: '指标 [含单位] 汇总',
    });
  });

  it('支持显式 kind: table', () => {
    const content =
      '#figure(caption: [结果], kind: table, table(columns: 1, [x]))';
    const model = parseOutline(content);
    expect(model.tables).toHaveLength(1);
    expect(model.figures).toHaveLength(0);
  });

  it('跳过代码块里的 figure 与标题', () => {
    const content = [
      '```typst',
      '= 不是标题',
      '#figure(image("x.png"), caption: [不是图])',
      '```',
      '',
      '= 真标题',
    ].join('\n');
    const model = parseOutline(content);
    expect(model.headings).toHaveLength(1);
    expect(model.headings[0].text).toBe('真标题');
    expect(model.figures).toHaveLength(0);
  });

  it('caption 缺失时给出占位文案', () => {
    const model = parseOutline('#figure(image("x.png"))');
    expect(model.figures[0].caption).toBe('（无图注）');
  });

  it('字符串里的括号不会影响配对', () => {
    const content = '#figure(image("a_(b).png"), caption: [括号 (图) 测试])';
    const model = parseOutline(content);
    expect(model.figures).toHaveLength(1);
    expect(model.figures[0].caption).toBe('括号 (图) 测试');
  });
});
