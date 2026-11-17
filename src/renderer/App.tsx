import { useEffect, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import AppShell from './layout/AppShell';
import ConflictDialog from './components/ConflictDialog';
import RecoveryDialog from './components/RecoveryDialog';
import { useAppStore } from './store/appStore';
import { createAppTheme } from './theme/mui';
import { useLocale } from './lib/i18n';

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const bootstrap = useAppStore((s) => s.bootstrap);
  // 订阅语言：变化时整棵 UI 树重渲染，所有 t() 文案随之更新。
  const locale = useLocale();

  useEffect(() => {
    window.__deckleStore = useAppStore;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // 主进程在关闭窗口前发来握手请求：先把未保存内容和工作区状态落盘。
    return window.deckle.window.onCloseRequest(() => {
      void (async () => {
        try {
          await useAppStore.getState().flushForClose();
        } finally {
          await window.deckle.window.closeReady();
        }
      })();
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const muiTheme = useMemo(() => createAppTheme(theme), [theme]);

  return (
    <ThemeProvider theme={muiTheme}>
      <AppShell />
      <ConflictDialog />
      <RecoveryDialog />
    </ThemeProvider>
  );
}
