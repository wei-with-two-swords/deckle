import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import type { FontFamily } from '../shared/types';

/**
 * Typst 编译器内置的字体（New Computer Modern 是默认正文，DejaVu Sans Mono 是 raw 的默认等宽）。
 * 这些字体不在系统字体目录里，但随时可用。
 */
const BUNDLED_FONTS = [
  'New Computer Modern',
  'New Computer Modern Math',
  'DejaVu Sans Mono',
];

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc']);
const MAX_FILES = 4000;

type NameCandidate = { score: number; value: string };

function readAt(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const read = readSync(fd, buffer, 0, length, position);
  return buffer.subarray(0, read);
}

function decodeName(buffer: Buffer, platformId: number): string {
  if (buffer.length === 0) return '';
  // platform 0（Unicode）与 platform 3（Windows）都是 UTF-16BE。
  if (platformId === 0 || platformId === 3) {
    const even = buffer.subarray(0, buffer.length - (buffer.length % 2));
    return Buffer.from(even).swap16().toString('utf16le');
  }
  return buffer.toString('latin1');
}

/** 从 sfnt（TTF/OTF）的 name 表中读取 family 名；base 是该字体在文件中的起点。 */
function readFamilyName(fd: number, base: number): FontFamily | null {
  const header = readAt(fd, base, 12);
  if (header.length < 12) return null;
  const numTables = header.readUInt16BE(4);
  if (numTables === 0 || numTables > 512) return null;

  const directory = readAt(fd, base + 12, numTables * 16);
  if (directory.length < numTables * 16) return null;

  let nameOffset = -1;
  for (let index = 0; index < numTables; index += 1) {
    const offset = index * 16;
    if (directory.toString('latin1', offset, offset + 4) !== 'name') continue;
    nameOffset = directory.readUInt32BE(offset + 8);
    break;
  }
  if (nameOffset < 0) return null;

  const nameHeader = readAt(fd, nameOffset, 6);
  if (nameHeader.length < 6) return null;
  const count = nameHeader.readUInt16BE(2);
  const stringOffset = nameHeader.readUInt16BE(4);
  if (count === 0 || count > 4096) return null;

  const records = readAt(fd, nameOffset + 6, count * 12);
  if (records.length < count * 12) return null;

  let typographic: NameCandidate | null = null;
  let family: NameCandidate | null = null;
  let chinese: NameCandidate | null = null;

  for (let index = 0; index < count; index += 1) {
    const offset = index * 12;
    const platformId = records.readUInt16BE(offset);
    const languageId = records.readUInt16BE(offset + 4);
    const nameId = records.readUInt16BE(offset + 6);
    const length = records.readUInt16BE(offset + 8);
    const stringIndex = records.readUInt16BE(offset + 10);

    if (nameId !== 1 && nameId !== 16) continue;
    if (length === 0 || length > 1024) continue;
    if (platformId !== 0 && platformId !== 1 && platformId !== 3) continue;

    const raw = readAt(fd, nameOffset + stringOffset + stringIndex, length);
    const value = decodeName(raw, platformId)
      .split('\u0000')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value) continue;

    // 中文（简体优先）本地化名只用于界面展示，不作为传给 Typst 的 family。
    if (languageId === 0x804 || languageId === 0x404) {
      const score =
        (languageId === 0x804 ? 2 : 1) +
        (nameId === 16 ? 1 : 0) +
        (platformId === 3 ? 1 : 0);
      if (!chinese || score > chinese.score) chinese = { score, value };
      continue;
    }

    let score = 0;
    if (platformId === 3) score += 4;
    else if (platformId === 0) score += 3;
    else score += 1;
    if (languageId === 0x409) score += 2;

    const candidate = { score, value };
    if (nameId === 16) {
      if (!typographic || score > typographic.score) typographic = candidate;
    } else if (!family || score > family.score) {
      family = candidate;
    }
  }

  const name = typographic?.value ?? family?.value ?? chinese?.value;
  if (!name) return null;
  return { name, label: chinese?.value ?? name };
}

function readFamilies(filePath: string): FontFamily[] {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const head = readAt(fd, 0, 12);
    if (head.length < 12) return [];

    const families: FontFamily[] = [];
    if (head.toString('latin1', 0, 4) === 'ttcf') {
      // TrueType Collection：每个 face 有自己的 sfnt 目录。
      const numFonts = Math.min(head.readUInt32BE(8), 256);
      const offsets = readAt(fd, 12, numFonts * 4);
      for (let index = 0; index < numFonts; index += 1) {
        const family = readFamilyName(fd, offsets.readUInt32BE(index * 4));
        if (family) families.push(family);
      }
    } else {
      const family = readFamilyName(fd, 0);
      if (family) families.push(family);
    }
    return families;
  } catch {
    return [];
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function collectFontFiles(root: string, depth: number, files: string[]): void {
  if (files.length >= MAX_FILES) return;
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0) collectFontFiles(fullPath, depth - 1, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!FONT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    try {
      if (statSync(fullPath).size < 1024) continue;
    } catch {
      continue;
    }
    files.push(fullPath);
  }
}

function defaultFontDirectories(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    return [
      join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'),
      ...(localAppData
        ? [join(localAppData, 'Microsoft', 'Windows', 'Fonts')]
        : []),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/System/Library/Fonts',
      '/Library/Fonts',
      join(homedir(), 'Library', 'Fonts'),
    ];
  }
  return [
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    join(homedir(), '.local', 'share', 'fonts'),
  ];
}

let cache: { key: string; fonts: FontFamily[] } | null = null;

/** 枚举系统字体与额外字体目录中的 family（去重、排序）。 */
export function listSystemFonts(extraDirs: string[] = []): FontFamily[] {
  const key = extraDirs.join('|');
  if (cache && cache.key === key) return cache.fonts;

  const files: string[] = [];
  for (const directory of [...defaultFontDirectories(), ...extraDirs]) {
    collectFontFiles(directory, 2, files);
  }

  const families = new Map<string, FontFamily>();
  for (const file of files) {
    for (const family of readFamilies(file)) {
      const name = family.name.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      const existing = families.get(lower);
      if (!existing) {
        families.set(lower, {
          name,
          label: family.label.trim() || name,
        });
      } else if (existing.label === existing.name && family.label !== name) {
        existing.label = family.label;
      }
    }
  }

  const bundled: FontFamily[] = BUNDLED_FONTS.filter(
    (font) => !families.has(font.toLowerCase()),
  ).map((font) => ({ name: font, label: font }));

  const fonts = [
    ...bundled,
    ...Array.from(families.values()).sort((left, right) =>
      left.label.localeCompare(right.label, 'zh-CN', { sensitivity: 'base' }),
    ),
  ];

  cache = { key, fonts };
  return fonts;
}
