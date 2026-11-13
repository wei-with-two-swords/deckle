import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../src/shared/types';
import {
  allDirsExpanded,
  hasExpandedDir,
  rootOnlyExpanded,
} from '../src/renderer/lib/treeExpand';

const ROOT = 'D:\\proj';

const dir = (path: string, name = path.split('\\').pop()!): FileEntry => ({
  path,
  name,
  kind: 'directory',
});

const file = (path: string): FileEntry => ({
  path,
  name: path.split('\\').pop()!,
  kind: 'file',
});

describe('rootOnlyExpanded', () => {
  it('keeps only the project root expanded', () => {
    expect(rootOnlyExpanded(ROOT)).toEqual({ [ROOT]: true });
  });
});

describe('allDirsExpanded', () => {
  it('returns just the root for an empty tree', () => {
    expect(allDirsExpanded(ROOT, {})).toEqual({ [ROOT]: true });
  });

  it('includes every reachable directory and skips files', () => {
    const tree: Record<string, FileEntry[]> = {
      [ROOT]: [dir(`${ROOT}\\src`), file(`${ROOT}\\main.typ`)],
      [`${ROOT}\\src`]: [
        dir(`${ROOT}\\src\\chapters`),
        file(`${ROOT}\\src\\lib.typ`),
      ],
      [`${ROOT}\\src\\chapters`]: [file(`${ROOT}\\src\\chapters\\one.typ`)],
    };
    expect(allDirsExpanded(ROOT, tree)).toEqual({
      [ROOT]: true,
      [`${ROOT}\\src`]: true,
      [`${ROOT}\\src\\chapters`]: true,
    });
  });

  it('ignores directories that are not reachable from the root', () => {
    const tree: Record<string, FileEntry[]> = {
      [ROOT]: [],
      'D:\\other\\orphan': [dir('D:\\other\\orphan\\nested')],
    };
    expect(allDirsExpanded(ROOT, tree)).toEqual({ [ROOT]: true });
  });

  it('does not loop forever when a directory points back to the root', () => {
    const tree: Record<string, FileEntry[]> = {
      [ROOT]: [dir(`${ROOT}\\loop`)],
      [`${ROOT}\\loop`]: [dir(ROOT), dir(`${ROOT}\\loop`)],
    };
    expect(allDirsExpanded(ROOT, tree)).toEqual({
      [ROOT]: true,
      [`${ROOT}\\loop`]: true,
    });
  });
});

describe('hasExpandedDir', () => {
  it('is false when only the root is expanded', () => {
    expect(hasExpandedDir(ROOT, { [ROOT]: true })).toBe(false);
    expect(
      hasExpandedDir(ROOT, { [ROOT]: true, [`${ROOT}\\src`]: false }),
    ).toBe(false);
  });

  it('is true when any directory below the root is expanded', () => {
    expect(
      hasExpandedDir(ROOT, {
        [ROOT]: true,
        [`${ROOT}\\src`]: true,
        [`${ROOT}\\src\\chapters`]: true,
      }),
    ).toBe(true);
  });

  it('still reports true when the root itself is collapsed', () => {
    expect(hasExpandedDir(ROOT, { [`${ROOT}\\src`]: true })).toBe(true);
  });

  it('ignores expanded paths belonging to another project', () => {
    expect(hasExpandedDir(ROOT, { [ROOT]: true, 'D:\\other\\src': true })).toBe(
      false,
    );
  });

  it('accepts forward-slash child paths', () => {
    expect(hasExpandedDir(ROOT, { [ROOT]: true, 'D:/proj/src': true })).toBe(
      true,
    );
  });
});
