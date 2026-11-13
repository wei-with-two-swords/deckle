/**
 * 渲染进程侧的文案入口。
 *
 * `t()` 直接读 store 里的当前语言，因此可以在普通函数、事件回调、
 * store action 中使用；界面整体会在语言变化时由根组件重新渲染，
 * 所有 t() 调用随之重新求值。
 */
import { useCallback } from 'react';
import { translate, DEFAULT_LOCALE } from '../../shared/i18n';
import type { Locale } from '../../shared/types';
import { useAppStore } from '../store/appStore';

export function currentLocale(): Locale {
  return useAppStore.getState().settings?.locale ?? DEFAULT_LOCALE;
}

export function t(
  source: string,
  params?: Record<string, string | number>,
): string {
  return translate(currentLocale(), source, params);
}

/** 订阅语言变化，用于根组件触发整棵 UI 树重渲染。 */
export function useLocale(): Locale {
  return useAppStore((s) => s.settings?.locale ?? DEFAULT_LOCALE);
}

/** 组件内使用的稳定 t 函数（等价于 t，但显式订阅语言变化）。 */
export function useT(): typeof t {
  const locale = useLocale();
  return useCallback(
    (source: string, params?: Record<string, string | number>) =>
      translate(locale, source, params),
    [locale],
  );
}
