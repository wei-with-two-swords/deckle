import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractTemplateZip, safeEntryName } from '../src/main/templateZip';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'typstor-zip-test-'));
}

describe('extractTemplateZip', () => {
  it('解压普通模板压缩包', async () => {
    const root = await makeTempDir();
    const zipPath = path.join(root, 'template.zip');
    const zip = new AdmZip();
    zip.addFile('main.typ', Buffer.from('#set page(paper: "a4")\nHello'));
    zip.addFile('assets/logo.txt', Buffer.from('logo'));
    zip.writeZip(zipPath);

    const dest = path.join(root, 'out');
    await extractTemplateZip(zipPath, dest);

    await expect(
      fs.readFile(path.join(dest, 'main.typ'), 'utf8'),
    ).resolves.toContain('Hello');
    await expect(
      fs.readFile(path.join(dest, 'assets', 'logo.txt'), 'utf8'),
    ).resolves.toBe('logo');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('拒绝路径逃逸的条目名', () => {
    expect(() => safeEntryName('../evil.txt')).toThrow(/非法路径/);
    expect(() => safeEntryName('/abs/evil.txt')).toThrow(/非法路径/);
    expect(() => safeEntryName('a/../../evil.txt')).toThrow(/非法路径/);
    expect(safeEntryName('assets/logo.png')).toBe('assets/logo.png');
  });
});
