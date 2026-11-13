import { describe, expect, it, vi } from 'vitest';

import { buildCompileInput } from '../src/renderer/lib/compileInput';

const PROJECT = '/proj';
const MAIN = 'main.typ';

describe('buildCompileInput（编译以整个项目为根）', () => {
  it('打开主文件时直接用实时内容，不注入额外 shadow', async () => {
    const readFile = vi.fn(async () => '磁盘上的旧内容');
    const input = await buildCompileInput({
      projectPath: PROJECT,
      mainFile: MAIN,
      activePath: '/proj/main.typ',
      activeContent: '= 编辑中的主文件',
      readFile,
    });
    expect(input).toEqual({ content: '= 编辑中的主文件', shadows: [] });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('打开章节文件时，主文件内容来自磁盘而不是章节内容', async () => {
    const readFile = vi.fn(async () => '= 主文件\n#include "chapters/ch1.typ"');
    const input = await buildCompileInput({
      projectPath: PROJECT,
      mainFile: MAIN,
      activePath: '/proj/chapters/ch1.typ',
      activeContent: '= 第一章（未保存）',
      readFile,
    });
    expect(readFile).toHaveBeenCalledWith('/proj/main.typ');
    expect(input.content).toBe('= 主文件\n#include "chapters/ch1.typ"');
    // 章节内容按自己的真实路径注入，不再冒充主文件
    expect(input.shadows).toEqual([
      { path: '/proj/chapters/ch1.typ', content: '= 第一章（未保存）' },
    ]);
  });

  it('切换不同章节，主文件内容始终不变（错误/预览不再随当前文件漂移）', async () => {
    const readFile = vi.fn(async () => '= 同一个主文件');
    const build = (activePath: string) =>
      buildCompileInput({
        projectPath: PROJECT,
        mainFile: MAIN,
        activePath,
        activeContent: `内容 ${activePath}`,
        readFile,
      });
    const a = await build('/proj/chapters/ch1.typ');
    const b = await build('/proj/chapters/ch5.typ');
    expect(a.content).toBe(b.content);
    expect(a.shadows[0].path).not.toBe(b.shadows[0].path);
  });

  it('主文件路径大小写/斜杠差异也能正确识别', async () => {
    const readFile = vi.fn(async () => '不该读');
    const input = await buildCompileInput({
      projectPath: PROJECT,
      mainFile: MAIN,
      activePath: '/proj\\main.typ',
      activeContent: '= 实时',
      readFile,
    });
    expect(input.content).toBe('= 实时');
    expect(input.shadows).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('主文件读取失败时向上抛错，由调用方生成错误诊断', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    await expect(
      buildCompileInput({
        projectPath: PROJECT,
        mainFile: MAIN,
        activePath: '/proj/chapters/ch1.typ',
        activeContent: 'x',
        readFile,
      }),
    ).rejects.toThrow('ENOENT');
  });
});
