import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { typstHighlightTag, typstTags } from 'codemirror-lang-typst';

const tg = (name: string) => typstHighlightTag[name];

/**
 * Typst 语法高亮。颜色全部走 CSS 变量，主题切换时不需要重建编辑器。
 */
export const typstHighlightStyle = HighlightStyle.define([
  {
    tag: tg('typ-comment'),
    color: 'var(--syntax-comment)',
    fontStyle: 'italic',
  },
  { tag: tg('typ-strong'), fontWeight: '700' },
  { tag: tg('typ-emph'), fontStyle: 'italic' },
  {
    tag: [tg('typ-link'), tg('typ-label'), tg('typ-ref')],
    color: 'var(--text-link)',
  },
  {
    tag: tg('typ-raw'),
    color: 'var(--syntax-code)',
    fontFamily: 'var(--font-mono)',
  },
  { tag: tg('typ-heading'), color: 'var(--syntax-keyword)', fontWeight: '700' },
  { tag: tg('typ-marker'), color: 'var(--syntax-list)' },
  { tag: tg('typ-term'), fontWeight: '700' },
  { tag: tg('typ-math-delim'), color: 'var(--syntax-string)' },
  { tag: tg('typ-math-op'), color: 'var(--syntax-math)' },
  { tag: tg('typ-key'), color: 'var(--syntax-keyword)' },
  { tag: tg('typ-op'), color: 'var(--syntax-math)' },
  { tag: tg('typ-num'), color: 'var(--syntax-number)' },
  { tag: tg('typ-str'), color: 'var(--syntax-string)' },
  { tag: tg('typ-func'), color: 'var(--syntax-function)' },
  { tag: tg('typ-pol'), color: 'var(--syntax-list)' },
  { tag: tg('typ-escape'), color: 'var(--syntax-math)' },
  { tag: tg('typ-punct'), color: 'var(--syntax-comment)' },
  {
    tag: tg('typ-error'),
    color: 'var(--action-critical)',
    textDecoration: 'wavy underline',
  },
  { tag: tg('typ-math-group'), color: 'var(--syntax-math)' },
  { tag: typstTags.mathDelimiter, color: 'var(--syntax-string)' },
  { tag: typstTags.listMarker, color: 'var(--syntax-list)' },
  { tag: typstTags.interpolated, color: 'var(--syntax-list)' },
  { tag: t.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: t.number, color: 'var(--syntax-number)' },
  { tag: t.keyword, color: 'var(--syntax-keyword)' },
  { tag: t.operator, color: 'var(--syntax-math)' },
  { tag: t.typeName, color: 'var(--syntax-function)' },
  { tag: [t.atom, t.bool, t.null], color: 'var(--syntax-keyword)' },
  { tag: t.invalid, color: 'var(--action-critical)' },
]);

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--layer-1)',
    color: 'var(--text-primary)',
    fontSize: 'var(--editor-font-size, 13px)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.45',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '10px 0 40vh',
    caretColor: 'var(--action-primary)',
  },
  '.cm-line': {
    padding: '0 16px 0 4px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--layer-1)',
    color: 'var(--editor-gutter)',
    border: 'none',
    borderRight: '1px solid var(--border-secondary)',
    paddingLeft: 2,
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 5px 0 6px',
    minWidth: 24,
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--editor-active-line)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--editor-gutter-active)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--action-primary)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'var(--editor-selection)',
    },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--editor-active-line)',
  },
  '.cm-foldGutter .cm-gutterElement': {
    color: 'var(--text-secondary)',
    padding: '0 2px',
  },
  '.cm-fold-marker': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    opacity: 0.55,
    transition: 'opacity .12s ease',
  },
  '.cm-fold-marker:hover': {
    opacity: 1,
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--action-secondary-shaded)',
    border: '1px solid var(--border-secondary)',
    color: 'var(--text-secondary)',
    borderRadius: 3,
    margin: '0 2px',
  },
  '.cm-panels': {
    backgroundColor: 'var(--layer-1)',
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-secondary)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--border-secondary)',
    borderTop: 'none',
  },
  '.cm-search': {
    padding: '7px 10px',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-secondary)',
  },
  '.cm-search label': {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  '.cm-search .cm-textfield': {
    height: 26,
    padding: '0 8px',
    margin: '0 4px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 4,
    background: 'var(--action-secondary-shaded)',
    color: 'var(--text-primary)',
    font: 'inherit',
    fontSize: 12,
    outline: 'none',
    verticalAlign: 'middle',
  },
  '.cm-search .cm-textfield:focus': {
    borderColor: 'var(--action-primary)',
    background: 'var(--layer-1)',
    boxShadow: '0 0 0 1px var(--border-focus)',
  },
  '.cm-search .cm-button': {
    height: 26,
    padding: '0 9px',
    marginRight: 4,
    border: '1px solid var(--border-secondary)',
    borderRadius: 4,
    background: 'var(--action-secondary-shaded)',
    backgroundImage: 'none',
    color: 'var(--text-primary)',
    fontSize: 12,
    verticalAlign: 'middle',
    cursor: 'default',
  },
  '.cm-search .cm-button:hover': {
    background: 'var(--action-secondary-hover)',
  },
  '.cm-search .cm-button:active': {
    background: 'var(--action-secondary-active)',
  },
  '.cm-search [name="close"]': {
    minWidth: 26,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 16,
    lineHeight: 1,
  },
  '.cm-search [name="close"]:hover': {
    background: 'var(--action-secondary-hover)',
    color: 'var(--text-primary)',
  },
  '.cm-search input[type="checkbox"]': {
    accentColor: 'var(--action-primary)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--editor-active-line)',
    outline: '1px solid var(--border-focus)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--action-secondary-hover)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--layer-1)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-secondary)',
    borderRadius: 4,
    boxShadow: 'var(--effect-shadow-menu)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--action-secondary-hover)',
    color: 'var(--text-primary)',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    padding: '2px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  },
});

export const typstEditorTheme = [baseTheme];
