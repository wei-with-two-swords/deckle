import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  foldService,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { lintGutter, lintKeymap } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { typstLezerLinter, typst_lezer } from 'codemirror-lang-typst';
import {
  makeBold,
  makeHeading,
  makeItalic,
  makeMath,
  makeUnderline,
} from './commands';
import { typstEditorTheme, typstHighlightStyle } from './theme';
import { t } from '../lib/i18n';

/** 折叠按钮：圆角 chevron，比默认的 ⌄/› 更柔和。 */
function foldMarker(open: boolean): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cm-fold-marker';
  span.title = open ? t('折叠') : t('展开');
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" style="display:block;' +
    `transform:rotate(${open ? 0 : -90}deg);transition:transform .12s ease">` +
    '<path d="m6 9 6 6 6-6"/></svg>';
  return span;
}

/** 折叠到下一个同级或更高级标题为止。 */
const headingFolding = foldService.of((state, lineStart) => {
  const heading = /^(=+)\s+/.exec(state.doc.lineAt(lineStart).text);
  if (!heading) return null;
  const level = heading[1].length;
  const from = state.doc.lineAt(lineStart).to;
  let pos = from + 1;
  while (pos <= state.doc.length) {
    const line = state.doc.lineAt(pos);
    const next = /^(=+)\s+/.exec(line.text);
    if (next && next[1].length <= level) {
      return { from, to: Math.max(from, line.from - 1) };
    }
    pos = line.to + 1;
  }
  return { from, to: state.doc.length };
});

export interface TypstEditorOptions {
  onSave: () => void;
  onChange: (doc: string) => void;
  wordWrap: boolean;
  readOnly?: boolean;
  /** 同步滚动：编辑区点击时回报点击所在行与总行数，供预览跳转 */
  onSyncScroll?: (line: number, totalLines: number) => void;
}

export function createTypstExtensions(
  options: TypstEditorOptions,
): Extension[] {
  // 语言包自带的 Lezer linter 会在文档变化后异步调用 setDiagnostics，
  // 覆盖编译器的诊断；这里去掉它，只保留 Typst 编译器诊断。
  const typstSupport = typst_lezer();
  const supportList: Extension[] = Array.isArray(typstSupport.support)
    ? typstSupport.support
    : [typstSupport.support];
  const typstExtensions = supportList.filter(
    (extension) => extension !== typstLezerLinter,
  );
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    EditorState.readOnly.of(options.readOnly ?? false),
    EditorView.editable.of(!(options.readOnly ?? false)),
    highlightSpecialChars(),
    history(),
    lintGutter(),
    foldGutter({ markerDOM: foldMarker }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(typstHighlightStyle),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorState.phrases.of({
      Find: t('查找'),
      Replace: t('替换'),
      next: t('下一个'),
      previous: t('上一个'),
      all: t('全部'),
      'match case': t('区分大小写'),
      'by word': t('全字匹配'),
      regexp: t('正则表达式'),
      replace: t('替换'),
      'replace all': t('全部替换'),
      close: t('关闭'),
    }),
    typstSupport.language,
    ...typstExtensions,
    headingFolding,
    typstEditorTheme,
    options.wordWrap ? EditorView.lineWrapping : [],
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
      {
        key: 'Mod-b',
        preventDefault: true,
        run: (view) => {
          makeBold(view);
          return true;
        },
      },
      {
        key: 'Mod-i',
        preventDefault: true,
        run: (view) => {
          makeItalic(view);
          return true;
        },
      },
      {
        key: 'Mod-u',
        preventDefault: true,
        run: (view) => {
          makeUnderline(view);
          return true;
        },
      },
      {
        key: 'Mod-Shift-1',
        preventDefault: true,
        run: (view) => {
          makeHeading(view);
          return true;
        },
      },
      {
        key: 'Mod-Shift-m',
        preventDefault: true,
        run: (view) => {
          makeMath(view);
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const line = view.state.doc.lineAt(pos).number;
        options.onSyncScroll?.(line, view.state.doc.lines);
        return false;
      },
    }),
  ];
}
