import { app } from 'electron';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Settings } from '../shared/types';

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: 'light',
  locale: 'zh-CN',
  closeAction: 'ask',
  lastFolder: null,
  lastProject: null,
  editor: {
    fontSize: 13,
    tabSize: 2,
    lineHeight: 1.4,
    wordWrap: false,
    autosave: true,
  },
  preview: {
    zoom: 1,
    fitWidth: true,
    eyeCare: false,
    autoCompile: true,
    syncScroll: false,
    gap: 26,
  },
  window: { width: 1400, height: 900, maximized: false },
  fonts: { extraDirs: [] },
};

let cache: Settings | null = null;

function filePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mergeSettings(base: Settings, saved: unknown): Settings {
  if (!isRecord(saved)) return { ...base };

  return {
    ...base,
    ...saved,
    version: 1,
    editor: { ...base.editor, ...(isRecord(saved.editor) ? saved.editor : {}) },
    preview: {
      ...base.preview,
      ...(isRecord(saved.preview) ? saved.preview : {}),
    },
    window: {
      ...base.window,
      ...(isRecord(saved.window) ? saved.window : {}),
    },
    fonts: { ...base.fonts, ...(isRecord(saved.fonts) ? saved.fonts : {}) },
  } as Settings;
}

export function readSettings(): Settings {
  if (cache) return cache;

  try {
    const raw = readFileSync(filePath(), 'utf8').replace(/^\uFEFF/, '');
    cache = mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }

  return cache;
}

function writeAtomic(target: string, content: string): void {
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const merged = mergeSettings(readSettings(), { ...readSettings(), ...patch });
  cache = merged;

  const target = filePath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeAtomic(target, JSON.stringify(merged, null, 2));

  return merged;
}

export function settingsPath(): string {
  return filePath();
}
