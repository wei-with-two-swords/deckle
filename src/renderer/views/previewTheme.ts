import type { ThemeMode } from '../../shared/types';

export interface PreviewColors {
  /** 纸面与 canvas 的渲染底色（renderCanvas 需要具体色值，不能用 CSS 变量） */
  paper: string;
  /** 纸面上未渲染时的页码文字；护眼模式只换纸面，文字色保持不变 */
  ink: string;
}

const NORMAL: PreviewColors = {
  paper: '#ffffff',
  ink: '#8b8fa2',
};

/**
 * 护眼豆沙绿；夜间把纸面压暗一档，避免浅色纸面在暗色 UI 里过亮。
 * 预览滚动区底色始终跟随主题变量 --layer-3，不随护眼模式变化。
 */
const EYE_CARE_LIGHT: PreviewColors = {
  paper: '#c7edcc',
  ink: NORMAL.ink,
};

const EYE_CARE_DARK: PreviewColors = {
  paper: '#b4d4b8',
  ink: NORMAL.ink,
};

export function previewColors(
  eyeCare: boolean,
  theme: ThemeMode,
): PreviewColors {
  if (!eyeCare) return NORMAL;
  return theme === 'dark' ? EYE_CARE_DARK : EYE_CARE_LIGHT;
}
