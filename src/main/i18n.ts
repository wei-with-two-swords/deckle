/** 主进程侧的文案入口：错误提示、系统对话框等按当前设置的语言生成。 */
import { translate, DEFAULT_LOCALE } from '../shared/i18n';
import type { Locale } from '../shared/types';
import { readSettings } from './settings';

export function currentLocale(): Locale {
  return readSettings().locale ?? DEFAULT_LOCALE;
}

export function t(
  source: string,
  params?: Record<string, string | number>,
): string {
  return translate(currentLocale(), source, params);
}
