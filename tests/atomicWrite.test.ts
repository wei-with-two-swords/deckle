import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWriteText, WriteConflictError } from '../src/main/atomicWrite';

let dir: string | null = null;

async function makeFile(content = 'initial'): Promise<string> {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckle-atomic-'));
  const target = path.join(dir, 'main.typ');
  await fs.writeFile(target, content, 'utf8');
  return target;
}

afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('atomicWriteText', () => {
  it('写入内容并返回磁盘 mtime', async () => {
    const target = await makeFile();
    const result = await atomicWriteText(target, '= 新内容');
    expect(await fs.readFile(target, 'utf8')).toBe('= 新内容');
    expect(result.path).toBe(target);
    expect(
      Math.abs(result.mtimeMs - (await fs.stat(target)).mtimeMs),
    ).toBeLessThan(3);
  });

  it('mtime 不匹配时拒绝写入并保持原内容', async () => {
    const target = await makeFile();
    await expect(
      atomicWriteText(target, '不应写入', { expectedMtimeMs: 1 }),
    ).rejects.toBeInstanceOf(WriteConflictError);
    expect(await fs.readFile(target, 'utf8')).toBe('initial');
  });

  it('force 跳过 mtime 校验', async () => {
    const target = await makeFile();
    const result = await atomicWriteText(target, '覆盖', {
      expectedMtimeMs: 1,
      force: true,
    });
    expect(await fs.readFile(target, 'utf8')).toBe('覆盖');
    expect(result.mtimeMs).toBeGreaterThan(0);
  });

  it('连续保存每次带上一轮的 mtime，不产生假冲突', async () => {
    const target = await makeFile();
    let mtime = (await fs.stat(target)).mtimeMs;
    for (let index = 0; index < 12; index += 1) {
      const result = await atomicWriteText(target, `content-${index}`, {
        expectedMtimeMs: mtime,
      });
      mtime = result.mtimeMs;
    }
    expect(await fs.readFile(target, 'utf8')).toBe('content-11');
  });

  it('并发写入按入队顺序串行落盘，无异常无临时文件', async () => {
    const target = await makeFile();
    const writes = Array.from({ length: 12 }, (_, index) =>
      atomicWriteText(target, `content-${index}`),
    );
    const results = await Promise.all(writes);
    expect(results).toHaveLength(12);
    expect((await fs.readFile(target, 'utf8')).startsWith('content-')).toBe(
      true,
    );
    expect(await fs.readdir(dir!)).toEqual(['main.typ']);
  });

  it('写入后不残留临时文件', async () => {
    const target = await makeFile();
    await atomicWriteText(target, 'clean');
    const files = await fs.readdir(dir!);
    expect(files).toEqual(['main.typ']);
  });
});
