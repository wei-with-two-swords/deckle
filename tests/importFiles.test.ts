import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showOpenDialog: mocks.showOpenDialog },
  shell: { trashItem: vi.fn() },
}));

import { allowRoot, importProjectFiles } from '../src/main/projects';

let temp: string;
let projectDir: string;
let targetDir: string;
let sourceDir: string;

beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'typstor-import-'));
  projectDir = path.join(temp, 'project');
  targetDir = path.join(projectDir, 'assets');
  sourceDir = path.join(temp, 'sources');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  allowRoot(projectDir);
  mocks.showOpenDialog.mockReset();
});

afterEach(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

async function makeSource(name: string, content: Buffer | string) {
  const file = path.join(sourceDir, name);
  await fs.writeFile(file, content);
  return file;
}

describe('importProjectFiles', () => {
  it('returns null when the dialog is cancelled', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(importProjectFiles(projectDir, targetDir)).resolves.toBeNull();
  });

  it('copies binary and text files byte-for-byte', async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    const image = await makeSource('figure.png', binary);
    const typst = await makeSource('chapter.typ', '= 章节\n');
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [image, typst],
    });

    const result = await importProjectFiles(projectDir, targetDir);

    expect(result?.imported.sort()).toEqual(['chapter.typ', 'figure.png']);
    expect(result?.renamed).toEqual([]);
    expect(result?.failed).toEqual([]);
    expect(await fs.readFile(path.join(targetDir, 'figure.png'))).toEqual(
      binary,
    );
    expect(await fs.readFile(path.join(targetDir, 'chapter.typ'), 'utf8')).toBe(
      '= 章节\n',
    );
  });

  it('renames conflicting files instead of overwriting', async () => {
    await fs.writeFile(path.join(targetDir, 'figure.png'), 'old');
    const image = await makeSource('figure.png', 'new');
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [image],
    });

    const result = await importProjectFiles(projectDir, targetDir);

    expect(result?.imported).toEqual(['figure-1.png']);
    expect(result?.renamed).toEqual(['figure-1.png']);
    expect(await fs.readFile(path.join(targetDir, 'figure.png'), 'utf8')).toBe(
      'old',
    );
    expect(
      await fs.readFile(path.join(targetDir, 'figure-1.png'), 'utf8'),
    ).toBe('new');
  });

  it('rejects destinations outside the current project', async () => {
    // 即使该目录本身有权访问，也不允许写进别的项目/目录。
    allowRoot(temp);
    await expect(importProjectFiles(projectDir, sourceDir)).rejects.toThrow(
      '只能导入到当前项目内的文件夹',
    );
  });

  it('reports files from the target folder instead of duplicating them', async () => {
    const same = path.join(targetDir, 'note.typ');
    await fs.writeFile(same, '= 笔记\n');
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [same],
    });

    const result = await importProjectFiles(projectDir, targetDir);

    expect(result?.imported).toEqual([]);
    expect(result?.failed).toEqual([
      { name: 'note.typ', reason: '文件已在目标文件夹中' },
    ]);
  });
});
