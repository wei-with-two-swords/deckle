import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useAppStore } from '../store/appStore';
import { getEditorView } from '../editor/commands';
import { samePath } from '../../shared/paths';
import Rail from './Rail';
import TopBar from './TopBar';
import Splitter from './Splitter';
import FilesPanel from '../views/FilesPanel';
import EditorPane from '../views/EditorPane';
import PreviewPane from '../views/PreviewPane';
import { MIN_EDITOR_WIDTH, MIN_PREVIEW_WIDTH } from './layoutMetrics';
import Welcome from '../views/Welcome';
import NewProjectDialog from '../components/NewProjectDialog';
import SettingsDialog from '../components/SettingsDialog';
import QuickOpen from '../components/QuickOpen';
import Toast from '../components/Toast';
import { t } from '../lib/i18n';

export default function AppShell() {
  const ready = useAppStore((s) => s.ready);
  const view = useAppStore((s) => s.view);
  const panelVisible = useAppStore((s) => s.panelVisible);
  const panelWidth = useAppStore((s) => s.panelWidth);
  const split = useAppStore((s) => s.split);
  const setPanelWidth = useAppStore((s) => s.setPanelWidth);
  const setSplit = useAppStore((s) => s.setSplit);
  const project = useAppStore((s) => s.project);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'p'
      ) {
        if (!project) return;
        event.preventDefault();
        setQuickOpen((value) => !value);
        return;
      }
      // Ctrl/Cmd+B：折叠/展开文件面板。编辑器内的 Mod-b 由 CodeMirror
      // 处理为粗体并已 preventDefault，这里跳过，避免抢掉粗体快捷键。
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'b' &&
        !event.defaultPrevented &&
        project
      ) {
        event.preventDefault();
        useAppStore.getState().togglePanel();
        return;
      }
      // Ctrl/Cmd+S：全局保存，无论焦点在编辑器、预览区还是文件面板都能触发；
      // 同时抑制浏览器「保存网页」对话框。保存成功后会按自动编译设置立即重编译。
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault();
        const state = useAppStore.getState();
        if (state.doc && !state.readOnly) void state.saveDoc();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const onQuickOpen = () => {
      if (project) setQuickOpen(true);
    };
    window.addEventListener('deckle:quick-open', onQuickOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('deckle:quick-open', onQuickOpen);
    };
  }, [project]);

  useEffect(() => {
    const unsubscribe = window.deckle.project.onChanged((change) => {
      useAppStore.getState().handleWatchEvent(change);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const getEditorFilePath = () =>
      (window as unknown as { __deckleEditorFilePath?: string })
        .__deckleEditorFilePath ?? null;

    const onGotoLine = async (event: Event) => {
      const detail = (
        event as CustomEvent<{
          file?: string;
          line: number;
          column: number;
        }>
      ).detail;
      if (!detail) return;

      // 跨文件跳转：若目标不在当前文件，先打开对应文件再滚动定位。
      const targetFile = detail.file;
      if (targetFile) {
        const state = useAppStore.getState();
        if (!state.activeFile || !samePath(targetFile, state.activeFile)) {
          await state.selectFile(targetFile);
        }
      }

      const scroll = () => {
        const editor = getEditorView();
        if (!editor) return;
        const lineNo = Math.min(
          Math.max(1, detail.line + 1),
          editor.state.doc.lines,
        );
        const line = editor.state.doc.line(lineNo);
        const pos = Math.min(line.from + Math.max(0, detail.column), line.to);
        editor.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        });
        editor.focus();
      };

      // 等待编辑器切换到目标文件（按文件路径全局标记判断），避免滚动到旧文件。
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const editor = getEditorView();
        const ready =
          editor != null &&
          (!targetFile || samePath(getEditorFilePath() ?? '', targetFile));
        if (ready) {
          scroll();
          return;
        }
        await new Promise((resolve) =>
          requestAnimationFrame(() => resolve(null)),
        );
      }
      scroll();
    };
    window.addEventListener('deckle:goto-line', onGotoLine);
    return () => window.removeEventListener('deckle:goto-line', onGotoLine);
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    panelStart: number;
    splitStart: number;
    available: number;
  } | null>(null);

  if (!ready) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--layer-2)',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 36,
              height: 36,
              margin: '0 auto 12px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              border: '1.5px solid var(--text-nav)',
              fontWeight: 700,
            }}
          >
            T
          </div>
          <div style={{ fontSize: 12 }}>{t('正在启动 Deckle…')}</div>
        </div>
      </div>
    );
  }

  const available = () => {
    const width = contentRef.current?.getBoundingClientRect().width ?? 0;
    return Math.max(1, width - (panelVisible ? panelWidth + 6 : 0) - 6);
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: '56px 1fr',
        gridTemplateRows: '40px 1fr',
        background: 'var(--layer-2)',
      }}
    >
      <Rail />
      <TopBar />

      <div
        ref={contentRef}
        className={view === 'welcome' ? 'dashboard-sheet' : undefined}
        style={{
          gridArea: '2 / 2',
          margin: '4px 4px 4px 0',
          borderRadius: view === 'welcome' ? 6 : 0,
          overflow: 'hidden',
          display: 'flex',
          minWidth: 0,
          minHeight: 0,
          background: view === 'welcome' ? 'var(--layer-1)' : 'var(--layer-2)',
        }}
      >
        {view === 'welcome' ? (
          <Welcome />
        ) : (
          <>
            {panelVisible && (
              <>
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flex: '0 0 auto',
                  }}
                >
                  <FilesPanel />
                </div>
                <Splitter
                  label={t('调整文件面板宽度')}
                  onStart={() => {
                    drag.current = {
                      panelStart: panelWidth,
                      splitStart: split,
                      available: available(),
                    };
                  }}
                  onDrag={(dx) => {
                    if (drag.current) {
                      setPanelWidth(drag.current.panelStart + dx);
                    }
                  }}
                  onDoubleClick={() => setPanelWidth(260)}
                />
              </>
            )}

            <div
              style={{
                flex: `${split} 1 0`,
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                paddingRight: 0,
              }}
            >
              <EditorPane />
            </div>

            <Splitter
              label={t('调整编辑与预览比例')}
              onStart={() => {
                drag.current = {
                  panelStart: panelWidth,
                  splitStart: split,
                  available: available(),
                };
              }}
              onDrag={(dx) => {
                const state = drag.current;
                if (!state) return;
                const maxSplit = Math.min(
                  0.8,
                  1 - MIN_PREVIEW_WIDTH / state.available,
                );
                const minSplit = Math.min(
                  maxSplit,
                  Math.max(0.2, MIN_EDITOR_WIDTH / state.available),
                );
                const next = state.splitStart + dx / state.available;
                setSplit(Math.max(minSplit, Math.min(maxSplit, next)));
              }}
              onDoubleClick={() => setSplit(0.573746)}
            />

            <div
              style={{
                flex: `${1 - split} 1 0`,
                minWidth: MIN_PREVIEW_WIDTH,
                minHeight: 0,
                display: 'flex',
              }}
            >
              <PreviewPane />
            </div>
          </>
        )}
      </div>

      <NewProjectDialog />
      <SettingsDialog />
      <QuickOpen open={quickOpen} onClose={() => setQuickOpen(false)} />
      <Toast />
    </div>
  );
}
