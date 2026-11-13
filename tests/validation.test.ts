import { describe, expect, it } from 'vitest';
import {
  entryNameError,
  sanitizeEntryName,
  uniqueEntryName,
} from '../src/shared/validation';

describe('entryNameError', () => {
  it('accepts ordinary names', () => {
    expect(entryNameError('main.typ')).toBeNull();
    expect(entryNameError('引言.typ')).toBeNull();
    expect(entryNameError('figures 2026')).toBeNull();
  });

  it('rejects empty, dot names and separators', () => {
    expect(entryNameError('   ')).toBe('名称不能为空');
    expect(entryNameError('.')).toBe('名称不能是 . 或 ..');
    expect(entryNameError('..')).toBe('名称不能是 . 或 ..');
    expect(entryNameError('a/b')).toContain('\\ / : * ?');
    expect(entryNameError('a:b')).toContain('\\ / : * ?');
    expect(entryNameError('a*b')).toContain('\\ / : * ?');
  });

  it('trims trailing spaces but rejects trailing dots', () => {
    expect(entryNameError('main.')).toBe('名称不能以空格或句点结尾');
    // 名称先 trim，末尾普通空格会被去掉，不算错误。
    expect(entryNameError('main ')).toBeNull();
    expect(sanitizeEntryName('main ')).toBe('main');
  });

  it('rejects Windows reserved names', () => {
    expect(entryNameError('CON')).toBe('这是 Windows 保留名称，请换一个');
    expect(entryNameError('lpt9.typ')).toBe('这是 Windows 保留名称，请换一个');
    expect(entryNameError('console')).toBeNull();
  });

  it('rejects names longer than 200 bytes', () => {
    expect(entryNameError('a'.repeat(200))).toBeNull();
    expect(entryNameError('a'.repeat(201))).toBe('名称过长');
    expect(entryNameError('中'.repeat(67))).toBe('名称过长');
  });
});

describe('sanitizeEntryName', () => {
  it('trims surrounding whitespace only', () => {
    expect(sanitizeEntryName('  main.typ  ')).toBe('main.typ');
    expect(sanitizeEntryName('   ')).toBe('');
  });
});

describe('uniqueEntryName', () => {
  it('keeps the original name when unused', () => {
    expect(uniqueEntryName('figure.png', new Set(['main.typ']))).toBe(
      'figure.png',
    );
    expect(uniqueEntryName('  intro.typ  ', new Set())).toBe('intro.typ');
  });

  it('adds a numeric suffix before the extension', () => {
    const used = new Set(['figure.png', 'figure-1.png', 'main.typ']);
    expect(uniqueEntryName('figure.png', used)).toBe('figure-2.png');
  });

  it('compares names case-insensitively', () => {
    expect(uniqueEntryName('Photo.PNG', new Set(['photo.png']))).toBe(
      'Photo-1.PNG',
    );
  });

  it('handles dotfiles and extension-less names', () => {
    expect(uniqueEntryName('.gitignore', new Set(['.gitignore']))).toBe(
      '.gitignore-1',
    );
    expect(uniqueEntryName('README', new Set(['readme']))).toBe('README-1');
  });
});
