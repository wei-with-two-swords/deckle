import { describe, expect, it } from 'vitest';
import {
  MAX_FIT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  fitZoomForWidth,
  zoomFromWheel,
} from '../src/renderer/views/previewZoom';

describe('zoomFromWheel', () => {
  it('zooms in on wheel up and out on wheel down', () => {
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 100)).toBeLessThan(1);
    expect(zoomFromWheel(1, 0)).toBe(1);
  });

  it('is symmetric for opposite deltas', () => {
    const up = zoomFromWheel(1, -50);
    const down = zoomFromWheel(1, 50);
    expect(up * down).toBeCloseTo(1, 6);
  });

  it('clamps to 50%–400%', () => {
    expect(zoomFromWheel(MAX_ZOOM, -5000)).toBe(MAX_ZOOM);
    expect(zoomFromWheel(MIN_ZOOM, 5000)).toBe(MIN_ZOOM);
    expect(zoomFromWheel(3.9, -1000)).toBeLessThanOrEqual(MAX_ZOOM);
    expect(zoomFromWheel(0.55, 1000)).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it('normalizes line and page delta modes', () => {
    expect(zoomFromWheel(1, -3, 1)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, -3, 1)).toBeGreaterThan(zoomFromWheel(1, -3));
    expect(zoomFromWheel(1, -1, 2)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 1, 2)).toBeLessThan(1);
  });

  it('keeps fit-to-width capped below the manual zoom ceiling', () => {
    expect(MAX_FIT_ZOOM).toBeLessThan(MAX_ZOOM);
    expect(MIN_ZOOM).toBe(0.5);
  });
});

describe('fitZoomForWidth', () => {
  const PAGE_WIDTH_PX = 595.28 * 1.28;

  it('returns 100% when the usable width matches one page', () => {
    expect(fitZoomForWidth(PAGE_WIDTH_PX + 52, PAGE_WIDTH_PX)).toBe(1);
  });

  it('follows container width so dragging the split keeps it fitted', () => {
    const wide = fitZoomForWidth(900, PAGE_WIDTH_PX);
    const narrow = fitZoomForWidth(700, PAGE_WIDTH_PX);
    expect(wide).not.toBeNull();
    expect(narrow).not.toBeNull();
    expect(wide!).toBeGreaterThan(narrow!);
  });

  it('clamps to 50%–200%', () => {
    expect(fitZoomForWidth(50_000, PAGE_WIDTH_PX)).toBe(MAX_FIT_ZOOM);
    expect(fitZoomForWidth(100, PAGE_WIDTH_PX)).toBe(MIN_ZOOM);
  });

  it('skips the update while the container has no usable width', () => {
    expect(fitZoomForWidth(52, PAGE_WIDTH_PX)).toBeNull();
    expect(fitZoomForWidth(10, PAGE_WIDTH_PX)).toBeNull();
  });

  it('honors custom padding', () => {
    expect(fitZoomForWidth(PAGE_WIDTH_PX + 20, PAGE_WIDTH_PX, 10)).toBe(1);
  });
});
