import { describe, expect, it } from 'vitest';
import { previewColors } from '../src/renderer/views/previewTheme';

/** 粗略亮度，用来验证夜间护眼纸面确实比浅色主题更暗。 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r + g + b) / 3;
}

describe('previewColors', () => {
  it('keeps the original white paper when eye care is off', () => {
    for (const theme of ['light', 'dark'] as const) {
      const colors = previewColors(false, theme);
      expect(colors.paper).toBe('#ffffff');
      expect(colors.ink).toBe('#8b8fa2');
    }
  });

  it('changes only the paper color in eye care mode', () => {
    for (const theme of ['light', 'dark'] as const) {
      const colors = previewColors(true, theme);
      expect(colors.paper).not.toBe('#ffffff');
      // 页码文字色与预览区底色都不受护眼模式影响。
      expect(colors.ink).toBe(previewColors(false, theme).ink);
      expect(colors).not.toHaveProperty('backdrop');
    }
    const light = previewColors(true, 'light');
    expect(light.paper).toBe('#c7edcc');
    expect(luminance(light.paper)).toBeLessThan(luminance('#ffffff'));
  });

  it('dims the paper further at night so it is not glaring', () => {
    const light = previewColors(true, 'light');
    const dark = previewColors(true, 'dark');
    expect(dark.paper).not.toBe(light.paper);
    expect(luminance(dark.paper)).toBeLessThan(luminance(light.paper));
    expect(dark.ink).toBe(light.ink);
  });

  it('returns concrete color values for the canvas background', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const eyeCare of [false, true]) {
        const { paper } = previewColors(eyeCare, theme);
        expect(paper).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
