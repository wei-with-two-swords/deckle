import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { CompileDiagnostic } from '../../shared/types';
import { applyDiagnostics } from './diagnostics';
import { createTypstExtensions } from './setup';

export interface TypstEditorProps {
  initialDoc: string;
  wordWrap: boolean;
  readOnly?: boolean;
  diagnostics: CompileDiagnostic[];
  filePath: string | null;
  locale: string;
  onSave: () => void;
  onChange: (doc: string) => void;
  onSyncScroll?: (line: number, totalLines: number) => void;
}

interface CachedEditor {
  state: EditorState;
  wordWrap: boolean;
}

/** 按文件缓存编辑器状态：切回文件时保留撤销历史与光标位置。 */
const stateCache = new Map<string, CachedEditor>();
const STATE_CACHE_LIMIT = 30;

function rememberState(path: string, state: EditorState, wordWrap: boolean) {
  stateCache.delete(path);
  stateCache.set(path, { state, wordWrap });
  if (stateCache.size > STATE_CACHE_LIMIT) {
    const oldest = stateCache.keys().next().value;
    if (oldest) stateCache.delete(oldest);
  }
}

export default function TypstEditor({
  initialDoc,
  wordWrap,
  readOnly = false,
  diagnostics,
  filePath,
  locale,
  onSave,
  onChange,
  onSyncScroll,
}: TypstEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!host.current) return undefined;

    // 语言会写进 CodeMirror 的查找/替换面板文案，切换语言时不能复用旧 state。
    const cacheKey = filePath ? `${filePath}:${locale}` : undefined;
    const cached = cacheKey ? stateCache.get(cacheKey) : undefined;
    const reusable =
      cached &&
      cached.wordWrap === wordWrap &&
      cached.state.doc.toString() === initialDoc;

    const state = reusable
      ? cached.state
      : EditorState.create({
          doc: initialDoc,
          extensions: createTypstExtensions({
            onSave,
            onChange,
            wordWrap,
            readOnly,
            onSyncScroll,
          }),
        });

    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    // 冒烟脚本用：读/写编辑器内容，验证自动保存闭环。
    (window as unknown as { __deckleEditor?: EditorView }).__deckleEditor =
      instance;
    // 跨文件跳转用：标记当前编辑器实例正在编辑哪个文件。
    (
      window as unknown as { __deckleEditorFilePath?: string }
    ).__deckleEditorFilePath = filePath ?? undefined;
    instance.focus();

    return () => {
      if (cacheKey) rememberState(cacheKey, instance.state, wordWrap);
      instance.destroy();
      view.current = null;
      delete (window as unknown as { __deckleEditor?: EditorView })
        .__deckleEditor;
      delete (window as unknown as { __deckleEditorFilePath?: string })
        .__deckleEditorFilePath;
    };
    // 文件切换由父组件通过 key 重建，这里只负责挂载与销毁。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!view.current) return;
    applyDiagnostics(view.current, diagnostics, filePath);
  }, [diagnostics, filePath]);

  return <div ref={host} style={{ height: '100%', minHeight: 0 }} />;
}
