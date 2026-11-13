/** 预览缩放的边界；适应宽度另限 200%，避免宽屏把页面放得过大。 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const MAX_FIT_ZOOM = 2;

/**
 * Ctrl/⌘+滚轮的连续缩放：向上滚（deltaY < 0）放大，向下滚缩小。
 * deltaMode 0=像素、1=行、2=页，先换算成像素再用指数映射，
 * 让鼠标滚轮一格与触控板的小步捏合都保持相近手感。
 */
export function zoomFromWheel(
  current: number,
  deltaY: number,
  deltaMode = 0,
): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  return Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, current * Math.exp(-deltaY * unit * 0.0008)),
  );
}

/**
 * 适应宽度：按可用宽度算缩放比例，clamp 到 50%–200%。
 * 容器还没布局好（宽度 <= 两侧 padding）时返回 null，调用方跳过本次更新。
 */
export function fitZoomForWidth(
  clientWidth: number,
  pageWidthPx: number,
  padding = 26,
): number | null {
  const available = clientWidth - padding * 2;
  if (available <= 0) return null;
  return Math.max(
    MIN_ZOOM,
    Math.min(MAX_FIT_ZOOM, Math.round((available / pageWidthPx) * 100) / 100),
  );
}
