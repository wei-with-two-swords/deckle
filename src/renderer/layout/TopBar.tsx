import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, Moon, Sun } from 'lucide-react';
import { Menu, MenuItem, Divider } from '@mui/material';
import { redo, undo } from '@codemirror/commands';
import { useAppStore } from '../store/appStore';
import { findInEditor, getEditorView } from '../editor/commands';
import WindowControls, { ControlButton } from './WindowControls';
import { t } from '../lib/i18n';

type MenuKey = 'project' | 'file' | 'edit' | 'view' | 'help';

export default function TopBar() {
  const view = useAppStore((s) => s.view);
  const project = useAppStore((s) => s.project);
  const activeFile = useAppStore((s) => s.activeFile);
  const saveState = useAppStore((s) => s.saveState);
  const readOnly = useAppStore((s) => s.readOnly);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const openProject = useAppStore((s) => s.openProject);
  const closeProject = useAppStore((s) => s.closeProject);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const setNewProjectOpen = useAppStore((s) => s.setNewProjectOpen);
  const templates = useAppStore((s) => s.templates);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const importProject = useAppStore((s) => s.importProject);
  const showToast = useAppStore((s) => s.showToast);
  const welcomeLayout = useAppStore((s) => s.welcomeLayout);
  const setWelcomeLayout = useAppStore((s) => s.setWelcomeLayout);
  const welcomeSort = useAppStore((s) => s.welcomeSort);
  const setWelcomeSort = useAppStore((s) => s.setWelcomeSort);
  const showItem = useAppStore((s) => s.showItem);
  const platform = useAppStore((s) => s.platform);

  const [anchor, setAnchor] = useState<{
    key: MenuKey;
    element: HTMLElement;
  } | null>(null);
  const [templateAnchor, setTemplateAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.deckle.window;
    void api.isMaximized().then((result) => {
      if (result.ok) setMaximized(result.data);
    });
    return api.onMaximizedChanged(setMaximized);
  }, []);

  const openMenu = (key: MenuKey) => (event: React.MouseEvent<HTMLElement>) => {
    setTemplateAnchor(null);
    setAnchor({ key, element: event.currentTarget });
  };
  const closeMenu = () => {
    setAnchor(null);
    setTemplateAnchor(null);
  };

  const openTutorial = async () => {
    const result = await window.deckle.app.openExternal(
      'https://typst.app/docs/tutorial/',
    );
    if (!result.ok) showToast(result.message, 'error');
  };

  const relative = (() => {
    if (!project || !activeFile) return [];
    const base = project.path.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = activeFile.replace(/\\/g, '/');
    if (!normalized.startsWith(`${base}/`)) return [];
    return normalized.slice(base.length + 1).split('/');
  })();

  const menuButton = (key: MenuKey, label: string) => (
    <button
      type="button"
      className="no-drag"
      onClick={openMenu(key)}
      style={{
        height: 24,
        padding: '0 12px',
        border: 'none',
        background:
          anchor?.key === key ? 'var(--action-secondary-hover)' : 'transparent',
        color: 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'default',
        borderRadius: 4,
      }}
      onMouseEnter={(event) => {
        if (anchor?.key !== key)
          event.currentTarget.style.background =
            'var(--action-secondary-shaded)';
      }}
      onMouseLeave={(event) => {
        if (anchor?.key !== key)
          event.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );

  return (
    <header
      className="drag"
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) {
          void window.deckle.window.toggleMaximize();
        }
      }}
      style={{
        gridArea: '1 / 1 / 2 / 3',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: 0,
        background: 'transparent',
        height: 40,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flex: '1 1 0',
          minWidth: 0,
          height: 40,
          paddingLeft: 8,
        }}
      >
        {view === 'project' && (
          <div
            className="no-drag"
            style={{
              flex: 'none',
              // 抵消左栏 paddingLeft，让按钮贴齐窗口左上角
              marginLeft: -8,
              display: 'flex',
              height: 40,
            }}
          >
            <ControlButton
              label={t('返回欢迎页')}
              onClick={() => void closeProject()}
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </ControlButton>
          </div>
        )}

        <span
          aria-label="Deckle"
          style={{
            height: 24,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            userSelect: 'none',
          }}
        >
          Deckle
        </span>
        {view === 'welcome' ? (
          <>
            {menuButton('project', t('项目'))}
            {menuButton('view', t('视图'))}
            {menuButton('help', t('帮助'))}
          </>
        ) : (
          <>
            {menuButton('file', t('文件'))}
            {menuButton('edit', t('编辑'))}
            {menuButton('view', t('视图'))}
            {menuButton('help', t('帮助'))}
          </>
        )}

        <Menu
          open={anchor?.key === 'project'}
          anchorEl={anchor?.element ?? null}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              setNewProjectOpen(true, 'blank', '空白项目');
            }}
          >
            {t('新建空白项目')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              void importProject();
            }}
          >
            {t('打开文件（.typ）…')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              void openProject();
            }}
          >
            {t('打开文件夹…')}
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            aria-haspopup="menu"
            onMouseEnter={(event) => setTemplateAnchor(event.currentTarget)}
            onClick={(event) => setTemplateAnchor(event.currentTarget)}
            sx={{ justifyContent: 'space-between', gap: 2 }}
          >
            {t('从模板开始')}
            <ChevronRight size={14} strokeWidth={1.6} />
          </MenuItem>
        </Menu>

        <Menu
          open={!!templateAnchor}
          anchorEl={templateAnchor}
          onClose={() => setTemplateAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {templates.map((template) => (
            <MenuItem
              key={template.id}
              title={t(template.description)}
              onClick={() => {
                setTemplateAnchor(null);
                closeMenu();
                setNewProjectOpen(true, template.id, template.name);
              }}
            >
              {t(template.name)}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          open={anchor?.key === 'file'}
          anchorEl={anchor?.element ?? null}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              setNewProjectOpen(true);
            }}
          >
            {t('新建项目…')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              void openProject();
            }}
          >
            {t('打开项目…')}
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            disabled={!project}
            onClick={() => {
              closeMenu();
              closeProject();
            }}
          >
            {t('关闭项目')}
          </MenuItem>
          <MenuItem
            disabled={view !== 'project'}
            onClick={() => {
              closeMenu();
              window.dispatchEvent(new CustomEvent('deckle:quick-open'));
            }}
          >
            {t('快速打开…')}
          </MenuItem>
          <MenuItem
            disabled={!project}
            onClick={() => {
              closeMenu();
              if (project) void showItem(project.path);
            }}
          >
            {t('在资源管理器中显示')}
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              closeMenu();
              setSettingsOpen(true);
            }}
          >
            {view === 'project' ? t('项目设置…') : t('应用设置…')}
          </MenuItem>
        </Menu>

        <Menu
          open={anchor?.key === 'edit'}
          anchorEl={anchor?.element ?? null}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <MenuItem
            disabled={view !== 'project'}
            onClick={() => {
              closeMenu();
              const editor = getEditorView();
              if (editor) undo(editor);
            }}
          >
            {t('撤销')}
          </MenuItem>
          <MenuItem
            disabled={view !== 'project'}
            onClick={() => {
              closeMenu();
              const editor = getEditorView();
              if (editor) redo(editor);
            }}
          >
            {t('重做')}
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            disabled={view !== 'project'}
            onClick={() => {
              closeMenu();
              const editor = getEditorView();
              if (editor) findInEditor(editor);
            }}
          >
            {t('查找与替换…')}
          </MenuItem>
        </Menu>

        <Menu
          open={anchor?.key === 'view'}
          anchorEl={anchor?.element ?? null}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          {view === 'project' && (
            <MenuItem
              onClick={() => {
                closeMenu();
                togglePanel();
              }}
            >
              {t('切换文件面板（Ctrl+B）')}
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              closeMenu();
              void setTheme(theme === 'dark' ? 'light' : 'dark');
            }}
          >
            {t('切换到{theme}主题', {
              theme: theme === 'dark' ? t('亮色') : t('暗色'),
            })}
          </MenuItem>
          {view === 'welcome' && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem
                selected={welcomeLayout === 'grid'}
                onClick={() => {
                  setWelcomeLayout('grid');
                  closeMenu();
                }}
              >
                <span
                  style={{
                    width: 16,
                    display: 'inline-block',
                    color: 'var(--action-primary)',
                  }}
                >
                  {welcomeLayout === 'grid' ? '✓' : ''}
                </span>
                {t('网格视图')}
              </MenuItem>
              <MenuItem
                selected={welcomeLayout === 'table'}
                onClick={() => {
                  setWelcomeLayout('table');
                  closeMenu();
                }}
              >
                <span
                  style={{
                    width: 16,
                    display: 'inline-block',
                    color: 'var(--action-primary)',
                  }}
                >
                  {welcomeLayout === 'table' ? '✓' : ''}
                </span>
                {t('列表视图')}
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              {(
                [
                  ['name', t('名称')],
                  ['created', t('创建时间')],
                  ['modified', t('更新时间')],
                ] as const
              ).map(([mode, label]) => (
                <MenuItem
                  key={mode}
                  selected={welcomeSort === mode}
                  onClick={() => {
                    setWelcomeSort(mode);
                    closeMenu();
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      display: 'inline-block',
                      color: 'var(--action-primary)',
                    }}
                  >
                    {welcomeSort === mode ? '✓' : ''}
                  </span>
                  {label}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        <Menu
          open={anchor?.key === 'help'}
          anchorEl={anchor?.element ?? null}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <MenuItem
            onClick={() => {
              closeMenu();
              void openTutorial();
            }}
          >
            {t('新手教程')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu();
              setSettingsOpen(true, 'about');
            }}
          >
            {t('关于 Deckle')}
          </MenuItem>
        </Menu>
      </div>

      <div
        style={{
          flex: '2 1 0',
          minWidth: 0,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          color: 'var(--text-secondary)',
          fontSize: 13,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {view === 'project' && project ? (
          <>
            <span
              style={{
                width: 18,
                height: 18,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text-secondary)',
                flex: 'none',
              }}
            >
              <Folder size={14} strokeWidth={1.5} />
            </span>
            <span
              style={{
                padding: '2px 4px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {project.config.name}
            </span>
            {relative.map((segment, index) => (
              <span
                key={`${segment}-${index}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <ChevronRight size={12} strokeWidth={1.5} />
                <span
                  style={{
                    padding: '2px 4px',
                    borderRadius: 4,
                    fontWeight: index === relative.length - 1 ? 600 : 400,
                    color:
                      index === relative.length - 1
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {segment}
                </span>
              </span>
            ))}
            {readOnly && (
              <span
                title={t('模板预览为只读模式')}
                style={{
                  marginLeft: 6,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  background: 'var(--action-secondary-shaded)',
                  color: 'var(--text-secondary)',
                  flex: 'none',
                }}
              >
                {t('只读预览')}
              </span>
            )}
          </>
        ) : (
          <span
            style={{
              padding: '4px 6px',
              color: 'var(--text-primary)',
              fontWeight: 600,
            }}
          >
            Dashboard
          </span>
        )}
      </div>

      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0,
        }}
      >
        {view === 'project' && saveState !== 'idle' && (
          <span
            title={t('保存状态（Ctrl+S 立即保存）')}
            aria-live="polite"
            style={{
              fontSize: 11,
              marginRight: 6,
              color:
                saveState === 'dirty'
                  ? 'var(--action-warning)'
                  : saveState === 'error'
                    ? 'var(--text-critical)'
                    : 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {saveState === 'saving'
              ? t('保存中…')
              : saveState === 'dirty'
                ? t('未保存')
                : saveState === 'error'
                  ? t('保存失败')
                  : t('已保存')}
          </span>
        )}
        <button
          type="button"
          className="no-drag"
          aria-label={theme === 'dark' ? t('切换到亮色') : t('切换到暗色')}
          title={theme === 'dark' ? t('切换到亮色') : t('切换到暗色')}
          onClick={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{
            width: 46,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            color: 'var(--text-nav)',
            cursor: 'default',
            flex: 'none',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background =
              'var(--action-secondary-hover)';
            event.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'transparent';
            event.currentTarget.style.color = 'var(--text-nav)';
          }}
        >
          {theme === 'dark' ? (
            <Sun size={15} strokeWidth={1.5} />
          ) : (
            <Moon size={15} strokeWidth={1.5} />
          )}
        </button>
        {platform !== 'darwin' && <WindowControls maximized={maximized} />}
      </div>
    </header>
  );
}
