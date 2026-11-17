import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveTemplateRoot } from '../src/main/templateLayout';

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'deckle-layout-test-'));
}

describe('resolveTemplateRoot', () => {
  it('入口在根目录', async () => {
    const dir = await tempRoot();
    await fs.writeFile(path.join(dir, 'main.typ'), '#set page(paper: "a4")');
    await expect(resolveTemplateRoot(dir)).resolves.toEqual({
      root: dir,
      mainFile: 'main.typ',
    });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('根目录只有一个 .typ 时用它作入口', async () => {
    const dir = await tempRoot();
    await fs.writeFile(path.join(dir, 'paper.typ'), '= 论文');
    await expect(resolveTemplateRoot(dir)).resolves.toEqual({
      root: dir,
      mainFile: 'paper.typ',
    });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('模板包在一层文件夹里', async () => {
    const dir = await tempRoot();
    const nested = path.join(dir, 'my-template');
    await fs.mkdir(nested);
    await fs.writeFile(path.join(nested, 'main.typ'), '#set page(paper: "a4")');
    await expect(resolveTemplateRoot(dir)).resolves.toEqual({
      root: nested,
      mainFile: 'main.typ',
    });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('没有入口时报错', async () => {
    const dir = await tempRoot();
    await fs.writeFile(path.join(dir, 'readme.txt'), 'no typst');
    await expect(resolveTemplateRoot(dir)).rejects.toThrow(/没有找到入口/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
