import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { t } from '../lib/i18n';

/** 冒烟与工具栏共用的编辑器实例取用方式。 */
export function getEditorView(): EditorView | null {
  return (
    (window as unknown as { __deckleEditor?: EditorView }).__deckleEditor ??
    null
  );
}

function focus() {
  getEditorView()?.focus();
}

function wrap(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string,
) {
  const { state } = view;
  const transaction = state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);

    if (
      selected.length >= before.length + after.length &&
      selected.startsWith(before) &&
      selected.endsWith(after)
    ) {
      const inner = state.sliceDoc(
        range.from + before.length,
        range.to - after.length,
      );
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }

    const text = selected || placeholder;
    return {
      changes: {
        from: range.from,
        to: range.to,
        insert: `${before}${text}${after}`,
      },
      range: EditorSelection.range(
        range.from + before.length,
        range.from + before.length + text.length,
      ),
    };
  });

  view.dispatch(transaction);
  focus();
}

function prefixLines(view: EditorView, prefix: string) {
  const { state } = view;
  const changes: { from: number; insert: string }[] = [];
  const seen = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) {
      const line = state.doc.line(number);
      if (seen.has(line.from)) continue;
      seen.add(line.from);
      if (!line.text.startsWith(prefix)) {
        changes.push({ from: line.from, insert: prefix });
      }
    }
  }

  if (changes.length === 0) return;
  view.dispatch({ changes });
  focus();
}

export function makeBold(view: EditorView) {
  wrap(view, '*', '*', t('粗体'));
}

export function makeItalic(view: EditorView) {
  wrap(view, '_', '_', t('斜体'));
}

export function makeUnderline(view: EditorView) {
  wrap(view, '#underline[', ']', t('下划线'));
}

export function makeHeading(view: EditorView) {
  prefixLines(view, '= ');
}

export function makeBulletList(view: EditorView) {
  prefixLines(view, '- ');
}

export function makeOrderedList(view: EditorView) {
  prefixLines(view, '+ ');
}

export function makeMath(view: EditorView) {
  wrap(view, '$', '$', 'x');
}

export function makeCode(view: EditorView) {
  wrap(view, '`', '`', 'code');
}

export function insertReference(view: EditorView) {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: '@' },
      range: EditorSelection.cursor(range.from + 1),
    })),
  );
  focus();
}

/** 文本样式菜单：小号 / 大号 / 强调。 */
export function wrapTextSize(view: EditorView, ratio: number) {
  wrap(view, `#text(size: ${ratio}em)[`, ']', t('文本'));
}

export function wrapEmph(view: EditorView) {
  wrap(view, '#emph[', ']', t('强调'));
}

/** 在文档级设置正文字体：优先替换已有的 #set text(font: …)，否则插入到开头。 */
export function setDocumentFont(view: EditorView, family: string) {
  const escaped = family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const rule = `#set text(font: "${escaped}")`;
  const text = view.state.doc.toString();
  const existing = /^#set text\(font: "[^"\n]*"\)[ \t]*$/m.exec(text);

  if (existing && existing.index !== undefined) {
    view.dispatch({
      changes: {
        from: existing.index,
        to: existing.index + existing[0].length,
        insert: rule,
      },
    });
  } else {
    view.dispatch({ changes: { from: 0, to: 0, insert: `${rule}\n` } });
  }
  focus();
}

export function findInEditor(view: EditorView) {
  openSearchPanel(view);
  focus();
}

export function runEditorCommand(
  command: (view: EditorView) => void,
): () => void {
  return () => {
    const view = getEditorView();
    if (view) command(view);
  };
}
