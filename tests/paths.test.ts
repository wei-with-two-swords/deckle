import { describe, expect, it } from 'vitest';
import { dirOf, joinRelative, samePath } from '../src/shared/paths';

describe('joinRelative', () => {
  it('keeps the separator style of the base path', () => {
    expect(joinRelative('C:\\Code\\paper', 'figures/plot.png')).toBe(
      'C:\\Code\\paper\\figures\\plot.png',
    );
    expect(joinRelative('/home/me/paper/', 'figures/plot.png')).toBe(
      '/home/me/paper/figures/plot.png',
    );
  });

  it('tolerates mixed separators on the right side', () => {
    expect(joinRelative('C:\\paper', '.typstor\\project.json')).toBe(
      'C:\\paper\\.typstor\\project.json',
    );
  });
});

describe('dirOf', () => {
  it('handles both separators', () => {
    expect(dirOf('C:\\paper\\main.typ')).toBe('C:\\paper');
    expect(dirOf('/home/me/paper/main.typ')).toBe('/home/me/paper');
  });

  it('returns the input for a bare name', () => {
    expect(dirOf('main.typ')).toBe('main.typ');
  });
});

describe('samePath', () => {
  it('ignores case, separator style and trailing slashes', () => {
    expect(samePath('C:\\Paper\\main.typ', 'c:/paper/main.typ')).toBe(true);
    expect(samePath('C:\\Paper\\', 'c:/paper')).toBe(true);
  });

  it('rejects different paths', () => {
    expect(samePath('C:\\paper\\main.typ', 'C:\\paper\\other.typ')).toBe(false);
  });
});
