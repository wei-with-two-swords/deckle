import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  Eye,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Upload,
} from 'lucide-react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  TextField,
  Tooltip,
} from '@mui/material';
import type { FileEntry, RailView } from '../../shared/types';
import {
  anchorRectAt,
  closeOnContextMenu,
  closeOnPointerDown,
  contextTargetDir,
  parentOf,
} from '../lib/contextMenu';
import { hasExpandedDir } from '../lib/treeExpand';
import { useAppStore } from '../store/appStore';
import IssuesList from './IssuesList';
import { OutlineList } from './OutlineList';
import { SearchPanel } from './SearchPanel';
import { t } from '../lib/i18n';

interface Row {
  entry: FileEntry;
  depth: number;
  /** 项目根目录行：只展示项目名，不可重命名/删除 */
  isRoot?: boolean;
}

const TITLES: Record<RailView, string> = {
  files: 'Files',
  search: 'Search',
  outline: 'Outline',
  issues: 'Issues',
};

function buildRows(
  root: string | null,
  rootName: string,
  tree: Record<string, FileEntry[]>,
  expanded: Record<string, boolean>,
): Row[] {
  if (!root) return [];
  const rows: Row[] = [
    {
      entry: { name: rootName, path: root, kind: 'directory' },
      depth: 0,
      isRoot: true,
    },
  ];
  if (!expanded[root]) return rows;

  const walk = (dir: string, depth: number) => {
    const entries = tree[dir];
    if (!entries) return;
    for (const entry of entries) {
      rows.push({ entry, depth });
      if (entry.kind === 'directory' && expanded[entry.path]) {
        walk(entry.path, depth + 1);
      }
    }
  };

  walk(root, 1);
  return rows;
}

function FileGlyph({ entry }: { entry: FileEntry }) {
  if (entry.kind === 'directory') {
    return <Folder size={16} strokeWidth={1.5} color="#c09553" />;
  }
  const lower = entry.name.toLowerCase();
  if (lower.endsWith('.typ')) {
    return (
      <span
        style={{
          width: 16,
          height: 16,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid var(--action-primary)',
          borderRadius: 3,
          color: 'var(--action-primary)',
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        T
      </span>
    );
  }
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) {
    return <FileImage size={16} strokeWidth={1.5} color="#a074c4" />;
  }
  if (/\.(pdf)$/.test(lower)) {
    return <FileText size={16} strokeWidth={1.5} color="#d9534f" />;
  }
  if (/\.(bib|csv|json)$/.test(lower)) {
    return <FileCode2 size={16} strokeWidth={1.5} color="#8a8a8a" />;
  }
  return <FileText size={16} strokeWidth={1.5} color="#8a8a8a" />;
}

export default function FilesPanel() {
  const project = useAppStore((s) => s.project);
  const railView = useAppStore((s) => s.railView);
  const tree = useAppStore((s) => s.tree);
  const expanded = useAppStore((s) => s.expanded);
  const loading = useAppStore((s) => s.loading);
  const activeFile = useAppStore((s) => s.activeFile);
  const panelWidth = useAppStore((s) => s.panelWidth);
  const toggleDir = useAppStore((s) => s.toggleDir);
  const selectFile = useAppStore((s) => s.selectFile);
  const openProject = useAppStore((s) => s.openProject);
  const createEntry = useAppStore((s) => s.createEntry);
  const renameEntry = useAppStore((s) => s.renameEntry);
  const deleteEntry = useAppStore((s) => s.deleteEntry);
  const importFiles = useAppStore((s) => s.importFiles);
  const setAllDirsExpanded = useAppStore((s) => s.setAllDirsExpanded);
  const showItem = useAppStore((s) => s.showItem);
  const outlineAllCollapsed = useAppStore((s) => s.outlineAllCollapsed);
  const toggleOutlineAll = useAppStore((s) => s.toggleOutlineAll);

  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  // 「更多」下拉与文件树右键菜单共用同一个非模态菜单状态，避免两层菜单叠加。
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    placement: 'bottom-start' | 'bottom-end';
    source: 'button' | 'tree';
    targetDir: string;
    row?: Row;
  } | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);
  const [prompt, setPrompt] = useState<{
    mode: 'create-file' | 'create-dir' | 'rename';
    parentDir: string;
    target?: FileEntry;
    value: string;
  } | null>(null);
  // 关闭对话框时 prompt 置 null，但 MUI 退出动画期间 Dialog 仍在渲染；
  // 用上一次非 null 的快照渲染，避免最后一帧标题回落到默认的「新建文件」。
  const lastPromptRef = useRef<NonNullable<typeof prompt>>(
    null as unknown as NonNullable<typeof prompt>,
  );
  const dialogPrompt = prompt ?? lastPromptRef.current;
  if (prompt) lastPromptRef.current = prompt;
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const menuAnchor = useMemo(
    () =>
      menu
        ? { getBoundingClientRect: () => anchorRectAt(menu.x, menu.y) }
        : null,
    [menu],
  );

  const root = project?.path ?? null;
  const rows = useMemo(
    () => buildRows(root, project?.config.name ?? '', tree, expanded),
    [root, project?.config.name, tree, expanded],
  );
  const rootHint = (() => {
    if (!root || !expanded[root]) return null;
    if (loading[root] && !tree[root]) return t('正在读取…');
    if (tree[root]?.length === 0) return t('这个项目还没有文件');
    return null;
  })();
  // 根目录之外的目录只要有展开的，按钮就执行「全部折叠」；否则执行「全部展开」。
  const allCollapsed = root ? !hasExpandedDir(root, expanded) : true;
  const hasDirs = Object.values(tree).some((entries) =>
    entries.some((entry) => entry.kind === 'directory'),
  );
  const toggleDisabled = treeBusy || (allCollapsed && !hasDirs);

  const toggleAllDirs = async () => {
    if (!root || toggleDisabled) return;
    setTreeBusy(true);
    try {
      await setAllDirsExpanded(allCollapsed);
    } finally {
      setTreeBusy(false);
    }
  };

  useEffect(() => {
    const row = menu?.row;
    if (row && !rows.some((item) => item.entry.path === row.entry.path)) {
      setMenu(null);
    }
  }, [rows, menu]);

  // 切换侧栏视图或项目后，旧菜单的目标目录已经失效。
  useEffect(() => {
    setMenu(null);
  }, [railView, root]);

  // 非模态菜单的全局关闭规则。右键（button 2）不在 pointerdown 里处理，
  // 而是等 contextmenu 到达文件树后由 onTreeContextMenu 在新位置重开菜单。
  useEffect(() => {
    if (!menu) return;
    const isNode = (target: EventTarget | null): target is Node =>
      target instanceof Node;
    const insideMenu = (target: EventTarget | null) =>
      isNode(target) && !!menuRef.current?.contains(target);
    const insideTree = (target: EventTarget | null) =>
      isNode(target) && !!containerRef.current?.contains(target);
    const onTrigger = (target: EventTarget | null) =>
      isNode(target) && !!moreButtonRef.current?.contains(target);

    const onPointerDown = (event: PointerEvent) => {
      if (
        closeOnPointerDown(
          event.button,
          insideMenu(event.target),
          onTrigger(event.target),
        )
      ) {
        setMenu(null);
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      const decision = closeOnContextMenu(
        insideMenu(event.target),
        insideTree(event.target),
      );
      if (decision.preventDefault) event.preventDefault();
      if (decision.close) setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const dismiss = () => setMenu(null);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
    };
  }, [menu]);

  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    setFocusPath(row.entry.path);
    requestAnimationFrame(() => {
      const element = containerRef.current?.querySelector<HTMLElement>(
        `[data-path="${CSS.escape(row.entry.path)}"]`,
      );
      element?.scrollIntoView({ block: 'nearest' });
    });
  };

  const selectedIndex = rows.findIndex(
    (row) => row.entry.path === (focusPath ?? activeFile),
  );

  const baseDir = activeFile ? parentOf(activeFile) : root;
  const menuIsRoot = !!menu?.row?.isRoot;
  const closeMenu = () => setMenu(null);

  /** 文件树内任意位置右键：菜单已打开时直接换成新位置、新目标，不需要先点一下取消。 */
  const onTreeContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (!root) return;
    const target = event.target as Element | null;
    const rowElement = target?.closest<HTMLElement>('[data-tree-row]');
    const row = rowElement
      ? rows.find((item) => item.entry.path === rowElement.dataset.path)
      : undefined;
    setFocusPath(row?.entry.path ?? null);
    setMenu({
      x: event.clientX,
      y: event.clientY,
      placement: 'bottom-start',
      source: 'tree',
      targetDir: contextTargetDir(row, root),
      row,
    });
  };

  /** 「更多」按钮复用同一菜单，右对齐到按钮下沿；再次点击则收起。 */
  const toggleMoreMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu((current) =>
      current?.source === 'button'
        ? null
        : {
            x: rect.right,
            y: rect.bottom,
            placement: 'bottom-end',
            source: 'button',
            targetDir: baseDir ?? root ?? '',
          },
    );
  };

  const requestCreate = (kind: 'file' | 'directory', parentDir?: string) => {
    const dir = parentDir ?? baseDir;
    if (!root || !dir) return;
    setPrompt({
      mode: kind === 'directory' ? 'create-dir' : 'create-file',
      parentDir: dir,
      value: '',
    });
  };

  const requestImport = (parentDir?: string) => {
    const dir = parentDir ?? baseDir;
    if (!root || !dir) return;
    void importFiles(dir);
  };

  /** 「更多」下拉与文件树右键菜单（行 / 空白区）共用的三项创建动作。 */
  const createMenuItems = (targetDir: string, close: () => void) => [
    <MenuItem
      key="new-file"
      onClick={() => {
        close();
        requestCreate('file', targetDir);
      }}
    >
      {t('新建文件')}
    </MenuItem>,
    <MenuItem
      key="new-dir"
      onClick={() => {
        close();
        requestCreate('directory', targetDir);
      }}
    >
      {t('新建文件夹')}
    </MenuItem>,
    <MenuItem
      key="import"
      onClick={() => {
        close();
        requestImport(targetDir);
      }}
    >
      {t('导入文件…')}
    </MenuItem>,
  ];

  const requestRename = (entry: FileEntry) => {
    setPrompt({
      mode: 'rename',
      parentDir: parentOf(entry.path),
      target: entry,
      value: entry.name,
    });
  };

  const submitPrompt = async () => {
    if (!prompt) return;
    const value = prompt.value.trim();
    if (!value) return;

    if (prompt.mode === 'rename' && prompt.target) {
      if (value === prompt.target.name) {
        setPrompt(null);
        return;
      }
      const ext =
        prompt.target.kind === 'file'
          ? (prompt.target.name.match(/\.[^.]+$/)?.[0] ?? '')
          : '';
      const nextName =
        ext && !/\.[^.]+$/.test(value) ? `${value}${ext}` : value;
      const ok = await renameEntry(prompt.target.path, nextName);
      if (ok) setPrompt(null);
      return;
    }

    const created = await createEntry(
      prompt.parentDir,
      prompt.mode === 'create-file' && !/\.[^.]+$/.test(value)
        ? `${value}.typ`
        : value,
      prompt.mode === 'create-dir' ? 'directory' : 'file',
    );
    if (created) {
      setPrompt(null);
      if (prompt.mode === 'create-file') selectFile(created);
    }
  };

  const requestDelete = async (entry: FileEntry) => {
    if (!window.confirm(t('把“{name}”移到回收站？', { name: entry.name })))
      return;
    await deleteEntry(entry.path);
    setFocusPath(null);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (rows.length === 0) return;
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    const current = rows[index];

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(Math.min(rows.length - 1, index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(Math.max(0, index - 1));
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (current.entry.kind === 'directory') {
          if (!expanded[current.entry.path]) toggleDir(current.entry.path);
          else focusRow(index + 1);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (
          current.entry.kind === 'directory' &&
          expanded[current.entry.path]
        ) {
          toggleDir(current.entry.path);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (current.entry.kind === 'directory') toggleDir(current.entry.path);
        else selectFile(current.entry.path);
        break;
      case 'F2':
        event.preventDefault();
        if (!current.isRoot) requestRename(current.entry);
        break;
      case 'Delete':
        event.preventDefault();
        if (!current.isRoot) void requestDelete(current.entry);
        break;
      default:
        break;
    }
  };

  const renderPlaceholder = () => {
    if (railView === 'files') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: '100%',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <Folder
            size={44}
            strokeWidth={1.2}
            style={{ opacity: 0.5, color: 'var(--text-secondary)' }}
          />
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t('还没有打开项目')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {t('打开一个文件夹或新建项目开始写作')}
          </div>
          <button
            type="button"
            onClick={() => void openProject()}
            style={{
              marginTop: 8,
              height: 30,
              padding: '0 14px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--action-primary)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'default',
            }}
          >
            {t('打开项目')}
          </button>
        </div>
      );
    }

    if (railView === 'issues') {
      return <IssuesList />;
    }

    if (railView === 'search') {
      return <SearchPanel />;
    }

    if (railView === 'outline') {
      return <OutlineList />;
    }

    return null;
  };

  return (
    <section
      aria-label={t('文件面板')}
      style={{
        width: panelWidth,
        flex: `0 0 ${panelWidth}px`,
        background: 'var(--layer-1)',
        borderTopRightRadius: 6,
        borderBottomLeftRadius: 6,
        boxShadow: 'var(--effect-shadow-1)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          minHeight: 40,
          padding: '0 6px 0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
          }}
        >
          {TITLES[railView]}
        </div>
        {railView === 'files' && root && (
          <>
            <Tooltip title={t('新建文件')}>
              <IconButton
                size="small"
                aria-label={t('新建文件')}
                onClick={() => requestCreate('file')}
                sx={{ width: 24, height: 24 }}
              >
                <FilePlus2 size={15} strokeWidth={1.5} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('新建文件夹')}>
              <IconButton
                size="small"
                aria-label={t('新建文件夹')}
                onClick={() => requestCreate('directory')}
                sx={{ width: 24, height: 24 }}
              >
                <FolderPlus size={15} strokeWidth={1.5} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('导入文件')}>
              <IconButton
                size="small"
                aria-label={t('导入文件')}
                onClick={() => requestImport()}
                sx={{ width: 24, height: 24 }}
              >
                <Upload size={15} strokeWidth={1.5} />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={
                allCollapsed && !hasDirs
                  ? t('项目中没有文件夹')
                  : allCollapsed
                    ? t('全部展开文件夹')
                    : t('全部折叠文件夹（根目录保持展开）')
              }
            >
              <span>
                <IconButton
                  size="small"
                  aria-label={
                    allCollapsed ? t('全部展开文件夹') : t('全部折叠文件夹')
                  }
                  disabled={toggleDisabled}
                  onClick={() => void toggleAllDirs()}
                  sx={{ width: 24, height: 24 }}
                >
                  {treeBusy ? (
                    <CircularProgress size={12} />
                  ) : allCollapsed ? (
                    <ChevronsUpDown size={15} strokeWidth={1.5} />
                  ) : (
                    <ChevronsDownUp size={15} strokeWidth={1.5} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('更多操作')}>
              <IconButton
                ref={moreButtonRef}
                size="small"
                aria-label={t('更多操作')}
                onClick={toggleMoreMenu}
                sx={{ width: 24, height: 24 }}
              >
                <Ellipsis size={16} strokeWidth={1.5} />
              </IconButton>
            </Tooltip>
          </>
        )}
        {railView === 'outline' && (
          <Tooltip
            title={
              outlineAllCollapsed
                ? t('全部展开（标题与图/表分组）')
                : t('全部折叠（只显示一级标题，图/表分组收起）')
            }
          >
            <IconButton
              size="small"
              aria-label={outlineAllCollapsed ? t('全部展开') : t('全部折叠')}
              aria-pressed={outlineAllCollapsed}
              onClick={toggleOutlineAll}
              sx={{ width: 24, height: 24 }}
            >
              {outlineAllCollapsed ? (
                <ChevronsUpDown size={15} strokeWidth={1.5} />
              ) : (
                <ChevronsDownUp size={15} strokeWidth={1.5} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </div>

      {!project || railView !== 'files' ? (
        renderPlaceholder()
      ) : (
        <div
          ref={containerRef}
          role="tree"
          tabIndex={0}
          aria-label={t('项目文件')}
          onKeyDown={onKeyDown}
          onContextMenu={onTreeContextMenu}
          onScroll={() => menu && setMenu(null)}
          style={{
            flex: 1,
            overflow: 'auto',
            paddingBottom: 12,
            outline: 'none',
          }}
        >
          {rows.map((row) => {
            const { entry, depth, isRoot } = row;
            const isDir = entry.kind === 'directory';
            const isExpanded = !!expanded[entry.path];
            const isActive = activeFile === entry.path;
            const isFocused = focusPath === entry.path;
            const isLoading = !!loading[entry.path];

            return (
              <div
                key={entry.path}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={isActive}
                aria-expanded={isDir ? isExpanded : undefined}
                data-path={entry.path}
                data-type={entry.kind}
                onClick={() => {
                  setFocusPath(entry.path);
                  if (isDir) toggleDir(entry.path);
                  else selectFile(entry.path);
                }}
                data-tree-row
                style={{
                  minHeight: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: 12 + depth * 12,
                  paddingRight: 12,
                  background: isActive
                    ? 'var(--action-secondary-shaded)'
                    : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: isActive || isRoot ? 600 : 400,
                  cursor: 'default',
                  outline: 'none',
                }}
                onMouseEnter={(event) => {
                  setHoverPath(entry.path);
                  if (!isActive)
                    event.currentTarget.style.background =
                      'var(--action-secondary-shaded)';
                }}
                onMouseLeave={(event) => {
                  setHoverPath(null);
                  if (!isActive)
                    event.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {isDir && (
                    <ChevronRight
                      size={14}
                      strokeWidth={1.5}
                      style={{
                        transform: isExpanded
                          ? 'rotate(90deg)'
                          : 'rotate(0deg)',
                        transition: 'transform 120ms ease',
                      }}
                    />
                  )}
                </span>
                {isDir && isExpanded ? (
                  <FolderOpen size={16} strokeWidth={1.5} color="#c09553" />
                ) : (
                  <FileGlyph entry={entry} />
                )}
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.name}
                </span>
                {!isDir &&
                  (hoverPath === entry.path || isActive || isFocused) && (
                    <Tooltip title={t('在预览中打开')}>
                      <span
                        role="button"
                        aria-label={t('在预览中打开')}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectFile(entry.path);
                        }}
                        style={{
                          marginLeft: 'auto',
                          width: 22,
                          height: 22,
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--text-secondary)',
                          flex: 'none',
                          opacity: 0.75,
                        }}
                      >
                        <Eye size={15} strokeWidth={1.5} />
                      </span>
                    </Tooltip>
                  )}
                {isLoading && (
                  <CircularProgress size={12} sx={{ ml: 'auto' }} />
                )}
              </div>
            );
          })}
          {rootHint && (
            <div
              style={{
                paddingLeft: 24,
                paddingTop: 4,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {rootHint}
            </div>
          )}
        </div>
      )}

      {/* 非模态菜单：没有覆盖全屏的 Backdrop，右键点击文件树能穿透到行上重新定位。 */}
      <Popper
        open={!!menu}
        anchorEl={menuAnchor}
        placement={menu?.placement ?? 'bottom-start'}
        modifiers={[{ name: 'offset', options: { offset: [0, 2] } }]}
        sx={{ zIndex: 1400 }}
      >
        <Paper
          ref={menuRef}
          elevation={0}
          onContextMenu={(event) => event.preventDefault()}
          sx={{
            // 与主题里 MuiMenu.paper 的规格保持一致（Popper 不走 MuiMenu 覆盖）。
            minWidth: 172,
            borderRadius: '4px',
            py: 0,
            backgroundColor: 'var(--layer-1)',
            backgroundImage: 'none',
            border: '1px solid var(--border-modal)',
            boxShadow: 'var(--effect-shadow-menu)',
            '@keyframes filesMenuIn': {
              from: { opacity: 0, transform: 'scale(0.97)' },
              to: { opacity: 1, transform: 'scale(1)' },
            },
            animation: 'filesMenuIn 110ms ease-out',
          }}
        >
          <MenuList
            autoFocusItem
            variant="menu"
            sx={{ p: '4px 0', '&:focus': { outline: 'none' } }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenu(null);
            }}
          >
            {menu && createMenuItems(menu.targetDir, closeMenu)}
            {menu?.row && [
              <Divider key="divider" sx={{ my: 0.5 }} />,
              <MenuItem
                key="rename"
                disabled={menuIsRoot}
                onClick={() => {
                  const row = menu?.row;
                  setMenu(null);
                  if (row && !row.isRoot) requestRename(row.entry);
                }}
              >
                {t('重命名')}
              </MenuItem>,
              <MenuItem
                key="show-item"
                onClick={() => {
                  const row = menu?.row;
                  setMenu(null);
                  if (row) void showItem(row.entry.path);
                }}
              >
                {t('在资源管理器中显示')}
              </MenuItem>,
              <MenuItem
                key="delete"
                disabled={menuIsRoot}
                onClick={() => {
                  const row = menu?.row;
                  setMenu(null);
                  if (row && !row.isRoot) void requestDelete(row.entry);
                }}
              >
                {t('删除')}
              </MenuItem>,
            ]}
          </MenuList>
        </Paper>
      </Popper>

      <Dialog
        open={!!prompt}
        onClose={() => setPrompt(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 600 }}>
          {dialogPrompt?.mode === 'rename'
            ? t('重命名')
            : dialogPrompt?.mode === 'create-dir'
              ? t('新建文件夹')
              : t('新建文件')}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            variant="outlined"
            value={dialogPrompt?.value ?? ''}
            placeholder={
              dialogPrompt?.mode === 'create-dir'
                ? t('文件夹名称')
                : t('文件名')
            }
            onChange={(event) =>
              setPrompt((current) =>
                current ? { ...current, value: event.target.value } : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitPrompt();
              } else if (event.key === 'Escape') {
                setPrompt(null);
              }
            }}
            sx={{
              mt: 1,
              '& .MuiOutlinedInput-root': {
                height: 34,
                fontSize: 13,
              },
            }}
          />
          {dialogPrompt?.mode === 'create-file' && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {t('未填写扩展名时按 .typ 创建')}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '12px 24px 20px' }}>
          <Button size="small" onClick={() => setPrompt(null)}>
            {t('取消')}
          </Button>
          <Button
            size="small"
            variant="contained"
            disableElevation
            disabled={!dialogPrompt?.value.trim()}
            onClick={() => void submitPrompt()}
          >
            {dialogPrompt?.mode === 'rename' ? t('重命名') : t('创建')}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
