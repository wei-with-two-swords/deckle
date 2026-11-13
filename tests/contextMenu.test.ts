import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../src/shared/types';
import {
  anchorRectAt,
  closeOnContextMenu,
  closeOnPointerDown,
  contextTargetDir,
  parentOf,
} from '../src/renderer/lib/contextMenu';

const ROOT = 'D:\\proj';

const entry = (
  path: string,
  kind: 'file' | 'directory' = 'file',
): FileEntry => ({
  path,
  name: path.split('\\').pop()!,
  kind,
});

describe('closeOnPointerDown', () => {
  it('never closes on right click so contextmenu can reopen at the new position', () => {
    expect(closeOnPointerDown(2, false, false)).toBe(false);
    expect(closeOnPointerDown(2, true, false)).toBe(false);
    expect(closeOnPointerDown(2, false, true)).toBe(false);
  });

  it('closes on left/middle click outside the menu and the trigger button', () => {
    expect(closeOnPointerDown(0, false, false)).toBe(true);
    expect(closeOnPointerDown(1, false, false)).toBe(true);
  });

  it('keeps the menu for clicks inside the menu or on the trigger', () => {
    expect(closeOnPointerDown(0, true, false)).toBe(false);
    expect(closeOnPointerDown(0, false, true)).toBe(false);
  });
});

describe('closeOnContextMenu', () => {
  it('keeps the menu and suppresses the native menu when right-clicking the menu', () => {
    expect(closeOnContextMenu(true, false)).toEqual({
      close: false,
      preventDefault: true,
    });
  });

  it('leaves tree right-clicks to the tree handler so the menu relocates', () => {
    expect(closeOnContextMenu(false, true)).toEqual({
      close: false,
      preventDefault: false,
    });
  });

  it('closes on right-click elsewhere without blocking that area', () => {
    expect(closeOnContextMenu(false, false)).toEqual({
      close: true,
      preventDefault: false,
    });
  });
});

describe('contextTargetDir', () => {
  it('uses the project root for the blank area of the tree', () => {
    expect(contextTargetDir(undefined, ROOT)).toBe(ROOT);
  });

  it('uses the directory itself for a directory row', () => {
    expect(
      contextTargetDir({ entry: entry(`${ROOT}\\src`, 'directory') }, ROOT),
    ).toBe(`${ROOT}\\src`);
  });

  it('uses the parent directory for a file row', () => {
    expect(
      contextTargetDir({ entry: entry(`${ROOT}\\src\\main.typ`) }, ROOT),
    ).toBe(`${ROOT}\\src`);
  });

  it('resolves the root row back to the project root', () => {
    expect(
      contextTargetDir({ entry: entry(ROOT, 'directory'), isRoot: true }, ROOT),
    ).toBe(ROOT);
  });
});

describe('parentOf', () => {
  it('handles both path separators', () => {
    expect(parentOf(`${ROOT}\\main.typ`)).toBe(ROOT);
    expect(parentOf(`D:/proj/main.typ`)).toBe('D:/proj');
  });

  it('returns the input unchanged when there is no separator', () => {
    expect(parentOf('main.typ')).toBe('main.typ');
  });
});

describe('anchorRectAt', () => {
  it('creates a zero-size rect pinned at the pointer', () => {
    const rect = anchorRectAt(120, 340);
    expect(rect.x).toBe(120);
    expect(rect.y).toBe(340);
    expect(rect.top).toBe(340);
    expect(rect.left).toBe(120);
    expect(rect.right).toBe(120);
    expect(rect.bottom).toBe(340);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it('provides toJSON so it satisfies DOMRect consumers', () => {
    expect(anchorRectAt(1, 2).toJSON()).toEqual({});
  });
});
