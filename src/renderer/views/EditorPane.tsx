import { useCallback, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  AtSign,
  Bold,
  Code2,
  Heading1,
  Italic,
  List,
  ListOrdered,
  Save,
  Search,
  Sigma,
  Underline,
} from 'lucide-react';
import {
  CircularProgress,
  InputAdornment,
  Popover,
  TextField,
  Tooltip,
} from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import TypstEditor from '../editor/TypstEditor';
import { ModeButton } from './PreviewPane';
import {
  getEditorView,
  insertReference,
  makeBold,
  makeBulletList,
  makeCode,
  makeHeading,
  makeItalic,
  makeMath,
  makeOrderedList,
  makeUnderline,
  setDocumentFont,
} from '../editor/commands';
import { useAppStore } from '../store/appStore';
import { t, useLocale } from '../lib/i18n';
import { countWords } from '../../shared/wordCount';
import type { FontFamily } from '../../shared/types';

function ToolButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        style={{
          width: 30,
          height: '100%',
          padding: 0,
          border: 'none',
          borderRadius: 0,
          background: 'transparent',
          color: 'var(--text-primary)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'default',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background =
            'var(--action-secondary-hover)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'transparent';
        }}
      >
        <Icon size={16} strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}

function ToolGroup({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: 30,
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid var(--border-secondary)',
        borderRadius: 6,
        overflow: 'hidden',
        flex: 'none',
      }}
    >
      {children}
    </div>
  );
}

function run(command: (view: EditorView) => void) {
  const view = getEditorView();
  if (view) command(view);
}

export default function EditorPane() {
  const project = useAppStore((s) => s.project);
  const activeFile = useAppStore((s) => s.activeFile);
  const doc = useAppStore((s) => s.doc);
  const fileLoading = useAppStore((s) => s.fileLoading);
  const diagnostics = useAppStore((s) => s.diagnostics);
  const settings = useAppStore((s) => s.settings);
  const updateDoc = useAppStore((s) => s.updateDoc);
  const saveDoc = useAppStore((s) => s.saveDoc);
  const requestSyncScroll = useAppStore((s) => s.requestSyncScroll);
  const projectWordCount = useAppStore((s) => s.projectWordCount);
  const [fontAnchor, setFontAnchor] = useState<HTMLElement | null>(null);
  const [fontQuery, setFontQuery] = useState('');
  const [fonts, setFonts] = useState<FontFamily[] | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const fontRequest = useRef<Promise<FontFamily[]> | null>(null);

  const loadFonts = useCallback(async () => {
    if (fonts) return;
    if (!fontRequest.current) {
      fontRequest.current = (async () => {
        const result = await window.deckle.fonts.list();
        if (!result.ok) throw new Error(result.message);
        return result.data;
      })();
    }
    try {
      setFontError(null);
      setFonts(await fontRequest.current);
    } catch (error) {
      fontRequest.current = null;
      setFontError(
        error instanceof Error ? error.message : t('无法读取字体列表'),
      );
    }
  }, [fonts]);

  const openFontMenu = (event: ReactMouseEvent<HTMLElement>) => {
    setFontAnchor(event.currentTarget);
    setFontQuery('');
    void loadFonts();
  };

  const applyFont = (font: FontFamily) => {
    run((view) => setDocumentFont(view, font.name));
    useAppStore
      .getState()
      .showToast(t('已设置字体：{name}', { name: font.label }));
    setFontAnchor(null);
  };

  const normalizedQuery = fontQuery.trim().toLowerCase();
  const filteredFonts =
    fonts?.filter(
      (font) =>
        font.label.toLowerCase().includes(normalizedQuery) ||
        font.name.toLowerCase().includes(normalizedQuery),
    ) ?? [];

  const relative = (() => {
    if (!project || !activeFile) return null;
    const base = project.path.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = activeFile.replace(/\\/g, '/');
    return normalized.startsWith(`${base}/`)
      ? normalized.slice(base.length + 1)
      : normalized;
  })();

  const readOnly = useAppStore((s) => s.readOnly);
  const locale = useLocale();

  const autosave = settings?.editor.autosave ?? true;

  const disabled = !doc || readOnly;
  const fileWordCount = useMemo(
    () => (doc ? countWords(doc.content) : 0),
    [doc?.content],
  );
  const totalWordCount = projectWordCount ?? 0;

  return (
    <section
      aria-label={t('编辑器')}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          height: 30,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          pointerEvents: disabled ? 'none' : 'auto',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <ToolGroup>
          <Tooltip title={t('字体')}>
            <button
              type="button"
              aria-label={t('字体')}
              disabled={disabled}
              onClick={openFontMenu}
              style={{
                width: 34,
                height: '100%',
                padding: 0,
                border: 'none',
                borderRadius: 0,
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'default',
                opacity: disabled ? 0.5 : 1,
              }}
              onMouseEnter={(event) => {
                if (disabled) return;
                event.currentTarget.style.background =
                  'var(--action-secondary-hover)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
              }}
            >
              Ag
            </button>
          </Tooltip>
        </ToolGroup>
        <ToolGroup>
          <ToolButton
            label={t('粗体')}
            icon={Bold}
            onClick={() => run(makeBold)}
          />
          <ToolButton
            label={t('斜体')}
            icon={Italic}
            onClick={() => run(makeItalic)}
          />
          <ToolButton
            label={t('下划线')}
            icon={Underline}
            onClick={() => run(makeUnderline)}
          />
        </ToolGroup>
        <ToolGroup>
          <ToolButton
            label={t('一级标题')}
            icon={Heading1}
            onClick={() => run(makeHeading)}
          />
        </ToolGroup>
        <ToolGroup>
          <ToolButton
            label={t('无序列表')}
            icon={List}
            onClick={() => run(makeBulletList)}
          />
          <ToolButton
            label={t('有序列表')}
            icon={ListOrdered}
            onClick={() => run(makeOrderedList)}
          />
        </ToolGroup>
        <ToolGroup>
          <ToolButton
            label={t('数学')}
            icon={Sigma}
            onClick={() => run(makeMath)}
          />
          <ToolButton
            label={t('代码')}
            icon={Code2}
            onClick={() => run(makeCode)}
          />
        </ToolGroup>
        <ToolGroup>
          <ToolButton
            label={t('引用标签')}
            icon={AtSign}
            onClick={() => run(insertReference)}
          />
        </ToolGroup>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Tooltip
            title={t(
              '当前文件字数 / 项目总字数：中文按字、英文按词统计，忽略 Typst 标记与注释',
            )}
          >
            <span
              data-word-count="true"
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                cursor: 'default',
              }}
            >
              {t('{current} / {total} 字', {
                current: fileWordCount.toLocaleString(locale),
                total:
                  projectWordCount === null
                    ? '—'
                    : totalWordCount.toLocaleString(locale),
              })}
            </span>
          </Tooltip>
          <ModeButton
            label={t('自动保存')}
            active={autosave}
            onClick={() => {
              const state = useAppStore.getState();
              const editor = state.settings?.editor;
              if (!editor) return;
              void state.patchSettings({
                editor: { ...editor, autosave: !autosave },
              });
            }}
          >
            <Save size={15} strokeWidth={1.5} />
          </ModeButton>
        </div>

        <Popover
          open={!!fontAnchor}
          anchorEl={fontAnchor}
          onClose={() => setFontAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              sx: {
                width: 320,
                maxHeight: 480,
                mt: 0.5,
                borderRadius: '6px',
                background: 'var(--layer-1)',
                boxShadow: 'var(--effect-shadow-menu)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              },
            },
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div style={{ padding: '10px 10px 6px', flex: 'none' }}>
              <TextField
                size="small"
                fullWidth
                autoFocus
                placeholder={
                  fonts
                    ? t('搜索字体（共 {count} 个）', { count: fonts.length })
                    : t('搜索字体…')
                }
                value={fontQuery}
                onChange={(event) => setFontQuery(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={14} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </div>
            <div
              data-font-list="true"
              style={{
                overflowY: 'auto',
                flex: 1,
                minHeight: 0,
                padding: '0 4px 6px',
              }}
            >
              {fontError ? (
                <div
                  style={{
                    padding: '12px 10px',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {fontError}
                </div>
              ) : !fonts ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '14px 10px',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <CircularProgress size={12} />
                  {t('正在读取系统字体…')}
                </div>
              ) : filteredFonts.length === 0 ? (
                <div
                  style={{
                    padding: '12px 10px',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('没有找到匹配的字体')}
                </div>
              ) : (
                filteredFonts.map((font) => (
                  <button
                    key={font.name}
                    type="button"
                    data-font-family={font.name}
                    data-font-label={font.label}
                    onClick={() => applyFont(font)}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background =
                        'var(--action-secondary-hover)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent';
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      width: '100%',
                      padding: '7px 10px',
                      border: 'none',
                      borderRadius: 4,
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontFamily: `"${font.name}", sans-serif`,
                      fontSize: 15,
                      textAlign: 'left',
                      cursor: 'default',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {font.label}
                    </span>
                    {font.label !== font.name ? (
                      <span
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          flex: 'none',
                        }}
                      >
                        {font.name}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </Popover>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          marginTop: 12,
          background: 'var(--layer-1)',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          boxShadow: 'var(--effect-shadow-1)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {doc ? (
          <TypstEditor
            key={`${doc.path}:${doc.revision}:${readOnly}:${locale}`}
            initialDoc={doc.content}
            wordWrap={settings?.editor.wordWrap ?? false}
            readOnly={readOnly}
            diagnostics={diagnostics}
            filePath={doc.path}
            locale={locale}
            onChange={updateDoc}
            onSave={() => void saveDoc()}
            onSyncScroll={requestSyncScroll}
          />
        ) : fileLoading ? (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CircularProgress size={20} />
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              padding: 32,
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {relative
                  ? t('无法打开 {file}', { file: relative })
                  : t('选择一个文件开始编辑')}
              </div>
              <div style={{ fontSize: 12 }}>
                {relative
                  ? t('文件可能已被移动或删除，请从左侧重新选择')
                  : t('按 Ctrl+P 可以快速打开文件')}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
