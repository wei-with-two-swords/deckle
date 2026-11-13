import { ChevronRight } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircularProgress, IconButton } from '@mui/material';

import { useAppStore } from '../store/appStore';
import { samePath, joinRelative } from '../../shared/paths';
import {
  buildOutlineItems,
  computeOutlineView,
  DEFAULT_OUTLINE_WEIGHTS,
  resizeOutlineSections,
  type FloatItem,
  type HeadingItem,
  type OutlineItem,
  type OutlineSectionKey,
  type OutlineWeights,
} from '../lib/documentOutline';
import { t } from '../lib/i18n';

const OUTLINE_WEIGHTS_KEY = 'typstor.outline.sectionWeights';

/** 用户拖拽后的分区高度权重存在本地，重启后仍保留（VSCode 行为）。 */
function loadWeights(): OutlineWeights {
  try {
    const raw = window.localStorage?.getItem(OUTLINE_WEIGHTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OutlineWeights>;
      if (
        typeof parsed.headings === 'number' &&
        parsed.headings > 0 &&
        typeof parsed.figures === 'number' &&
        parsed.figures > 0 &&
        typeof parsed.tables === 'number' &&
        parsed.tables > 0
      ) {
        return {
          headings: parsed.headings,
          figures: parsed.figures,
          tables: parsed.tables,
        };
      }
    }
  } catch {
    // 本地存储不可用或内容损坏时回退到默认权重
  }
  return { ...DEFAULT_OUTLINE_WEIGHTS };
}

/** 向编辑器派发跳转事件；跨文件时由 AppShell 先打开对应文件再定位。 */
function jumpTo(file: string, line: number) {
  window.dispatchEvent(
    new CustomEvent('typstor:goto-line', {
      detail: { file, line, column: 0 },
    }),
  );
}

/** 分区标题行：可折叠分区带旋转三角，论文目录分区不可折叠（占位对齐）。 */
function SectionHeader({
  label,
  count,
  expanded,
  collapsible,
  topBorder,
  onToggle,
}: {
  label: string;
  count: number;
  expanded: boolean;
  collapsible: boolean;
  /** 上方已有透明托条时不再画横线；其余边界保留 1px 分界。 */
  topBorder: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      role="treeitem"
      aria-expanded={collapsible ? expanded : undefined}
      aria-label={t('{label}分区', { label })}
      data-outline-group={label}
      onClick={collapsible ? onToggle : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: '0 0 30px',
        height: 30,
        minHeight: 30,
        boxSizing: 'border-box',
        padding: '0 12px',
        background: 'var(--layer-2)',
        borderTop: topBorder ? '1px solid var(--border-secondary)' : 'none',
        color: 'var(--text-primary)',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'default',
        userSelect: 'none',
      }}
      onMouseEnter={(event) => {
        if (collapsible) {
          event.currentTarget.style.background =
            'var(--action-secondary-shaded)';
        }
      }}
      onMouseLeave={(event) => {
        if (collapsible) {
          event.currentTarget.style.background = 'var(--layer-2)';
        }
      }}
    >
      {collapsible ? (
        <IconButton
          size="small"
          aria-label={
            expanded ? t('折叠{label}', { label }) : t('展开{label}', { label })
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          sx={{ width: 18, height: 18, flexShrink: 0, mr: 0.5 }}
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            style={{
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms ease',
              color: 'var(--text-secondary)',
            }}
          />
        </IconButton>
      ) : (
        <span style={{ width: 22, flexShrink: 0 }} />
      )}
      <span>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 400,
          color: 'var(--text-secondary)',
          opacity: 0.8,
        }}
      >
        {count}
      </span>
    </div>
  );
}

/** 一个固定分区：标题行 + 独立滚动的内容区，高度由外层 flex 分配。 */
function OutlineSection({
  flex,
  label,
  count,
  expanded,
  collapsible,
  topBorder,
  onToggle,
  children,
}: {
  flex: string;
  label: string;
  count: number;
  expanded: boolean;
  collapsible: boolean;
  topBorder: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        flex,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <SectionHeader
        label={label}
        count={count}
        expanded={expanded}
        collapsible={collapsible}
        topBorder={topBorder}
        onToggle={onToggle}
      />
      {expanded && (
        <div
          data-outline-section={label}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingBottom: 8,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * 可拖拽分隔条：零高度、不占布局空间，上下分区紧贴无间隙。
 * 命中区绝对定位跨在边界上（上下各 4px）；平时完全透明，
 * 鼠标悬浮或拖拽中才显示 1px 高亮线——颜色、线宽、过渡与编辑区 Splitter 一致。
 */
function Sash({
  dragging,
  onPointerDown,
  onReset,
}: {
  dragging: boolean;
  onPointerDown: (clientY: number) => void;
  onReset: () => void;
}) {
  const [hover, setHover] = useState(false);
  const active = hover || dragging;
  return (
    <div
      style={{
        flex: '0 0 0px',
        height: 0,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('调整分区高度')}
        title={t('拖动调整分区高度，双击重置')}
        onPointerDown={(event) => {
          event.preventDefault();
          onPointerDown(event.clientY);
        }}
        onDoubleClick={onReset}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'absolute',
          top: -4,
          left: 0,
          right: 0,
          height: 8,
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
          cursor: 'row-resize',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            height: 1,
            background: active ? 'var(--action-primary)' : 'transparent',
            transition: dragging ? 'none' : 'background 120ms ease',
          }}
        />
      </div>
    </div>
  );
}

function FloatRow({ item, onJump }: { item: FloatItem; onJump: () => void }) {
  return (
    <div
      role="treeitem"
      aria-label={item.floatKind === 'figure' ? t('图') : t('表')}
      data-outline-kind={item.floatKind}
      data-outline-line={item.line}
      data-outline-file={item.file}
      onClick={onJump}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minHeight: 28,
        padding: '0 8px 0 12px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-primary)',
        fontSize: 12.5,
        textAlign: 'left',
        cursor: 'default',
        overflow: 'hidden',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--action-secondary-shaded)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--text-secondary)',
          minWidth: 30,
        }}
      >
        {item.floatKind === 'figure' ? t('图') : t('表')} {item.index}
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {item.caption}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        fontSize: 11.5,
        color: 'var(--text-secondary)',
        opacity: 0.8,
      }}
    >
      {children}
    </div>
  );
}

interface SectionMeta {
  key: OutlineSectionKey;
  label: string;
  shortLabel: string;
  count: number;
  expanded: boolean;
  collapsible: boolean;
  onToggle?: () => void;
  items: FloatItem[];
}

export function OutlineList() {
  const project = useAppStore((s) => s.project);
  const activeFile = useAppStore((s) => s.activeFile);
  const railView = useAppStore((s) => s.railView);
  const docContent = useAppStore((s) => s.doc?.content);

  // 折叠状态提升到 store，供面板标题行的「全部折叠/展开」按钮共享。
  const collapsedHeadings = useAppStore((s) => s.outlineHeadingsCollapsed);
  const figuresCollapsed = useAppStore((s) => s.outlineFiguresCollapsed);
  const tablesCollapsed = useAppStore((s) => s.outlineTablesCollapsed);
  const toggleHeading = useAppStore((s) => s.toggleOutlineHeading);
  const toggleFigures = useAppStore((s) => s.toggleOutlineFigures);
  const toggleTables = useAppStore((s) => s.toggleOutlineTables);
  const setOutlineHeadingIds = useAppStore((s) => s.setOutlineHeadingIds);

  const [items, setItems] = useState<OutlineItem[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [weights, setWeights] = useState<OutlineWeights>(loadWeights);
  // 正在拖拽的托条（用它的上分区 key 标识）：拖拽中鼠标常会移出命中区，靠它保持高亮。
  const [draggingSash, setDraggingSash] = useState<OutlineSectionKey | null>(
    null,
  );

  const cacheRef = useRef(new Map<string, string>());
  const buildToken = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    upper: OutlineSectionKey;
    lower: OutlineSectionKey;
    startY: number;
    height: number;
    weights: OutlineWeights;
    expanded: OutlineSectionKey[];
  } | null>(null);

  // 入口文件：优先用项目 mainFile，否则退化为活动文件。
  const rebuild = useCallback(async () => {
    const state = useAppStore.getState();
    const rootFile = project?.config.mainFile
      ? joinRelative(project.path, project.config.mainFile)
      : (state.activeFile ?? null);
    if (!rootFile) {
      setItems(null);
      setOutlineHeadingIds([]);
      return;
    }
    const token = ++buildToken.current;
    setBuilding(true);
    try {
      const readFile = async (path: string) => {
        let cached = cacheRef.current.get(path);
        if (cached === undefined) {
          const raw = await window.typstor.fs.readFile(path);
          if (!raw.ok) throw new Error(raw.message);
          cached = raw.data.content;
          cacheRef.current.set(path, cached);
        }
        return { content: cached, mtimeMs: 0 };
      };
      const result = await buildOutlineItems({
        rootFile,
        activeFile: state.activeFile ?? undefined,
        liveContent:
          state.activeFile && samePath(state.activeFile, rootFile)
            ? state.doc?.content
            : undefined,
        readFile,
      });
      if (token !== buildToken.current) return;
      setItems(result.items);
      setErrors(result.errors);
      // 供「全部折叠」计算所有可折叠标题 id。
      setOutlineHeadingIds(
        result.items
          .filter((item): item is HeadingItem => item.kind === 'heading')
          .map((item) => item.id),
      );
    } finally {
      if (token === buildToken.current) setBuilding(false);
    }
  }, [project?.path, project?.workspace, setOutlineHeadingIds]);

  // 切换项目时清空内容缓存，避免读到上一项目的文件。
  useEffect(() => {
    cacheRef.current.clear();
  }, [project?.path, project?.workspace]);

  // 项目 / 活动文件 / 视图切换后立即重建。
  useEffect(() => {
    if (railView !== 'outline') return;
    void rebuild();
  }, [rebuild, railView, activeFile]);

  // 活动文件内容变化（编辑中）防抖重建，沿用实时内容、其余文件走缓存。
  useEffect(() => {
    if (railView !== 'outline') return;
    const timer = setTimeout(() => void rebuild(), 350);
    return () => clearTimeout(timer);
  }, [docContent, railView, rebuild]);

  // 记住用户调整过的分区高度。
  useEffect(() => {
    try {
      window.localStorage?.setItem(
        OUTLINE_WEIGHTS_KEY,
        JSON.stringify(weights),
      );
    } catch {
      // 本地存储不可用时仅保留本次会话内的布局
    }
  }, [weights]);

  // 分隔条拖拽：全局监听常驻，未拖拽时 dragRef 为空直接返回。
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setWeights(
        resizeOutlineSections({
          weights: drag.weights,
          expanded: drag.expanded,
          upper: drag.upper,
          lower: drag.lower,
          deltaRatio: (event.clientY - drag.startY) / drag.height,
        }),
      );
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDraggingSash(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // 窗口失焦时 pointerup 可能丢失，兜底清掉拖拽态，避免高亮残留。
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const view = useMemo(
    () => computeOutlineView(items ?? [], collapsedHeadings),
    [items, collapsedHeadings],
  );

  const startDrag = (
    clientY: number,
    upper: OutlineSectionKey,
    lower: OutlineSectionKey,
    expanded: OutlineSectionKey[],
  ) => {
    dragRef.current = {
      upper,
      lower,
      startY: clientY,
      height: Math.max(1, containerRef.current?.clientHeight ?? 1),
      weights: { ...weights },
      expanded,
    };
    setDraggingSash(upper);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const resetWeights = () => setWeights({ ...DEFAULT_OUTLINE_WEIGHTS });

  if (items === null) {
    if (building) {
      return (
        <Centered>
          <CircularProgress size={20} />
          <div style={{ fontSize: 12 }}>{t('正在生成大纲…')}</div>
        </Centered>
      );
    }
    return (
      <Centered>
        <div style={{ fontSize: 12 }}>{t('打开文件后显示大纲')}</div>
      </Centered>
    );
  }

  if (items.length === 0) {
    return (
      <Centered>
        <div style={{ fontSize: 12 }}>{t('当前文档没有标题、图或表')}</div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>
          {t('用')}
          <code>{t('= 标题')}</code>
          {t('或')}
          <code>#figure(…)</code>
          {t('添加')}
        </div>
      </Centered>
    );
  }

  // 三段分区：论文目录始终展开在顶部；图/表可各自折叠，折叠的沉到底部。
  const groups = [
    {
      key: 'figures' as const,
      label: t('图片大纲'),
      shortLabel: t('图'),
      items: view.figures,
      expanded: !figuresCollapsed,
      onToggle: toggleFigures,
    },
    {
      key: 'tables' as const,
      label: t('表格大纲'),
      shortLabel: t('表'),
      items: view.tables,
      expanded: !tablesCollapsed,
      onToggle: toggleTables,
    },
  ];
  const orderedGroups = [
    ...groups.filter((group) => group.expanded),
    ...groups.filter((group) => !group.expanded),
  ];
  const sections: SectionMeta[] = [
    {
      key: 'headings',
      label: t('论文目录'),
      shortLabel: t('标题'),
      count: view.headings.length,
      expanded: true,
      collapsible: false,
      items: [],
    },
    ...orderedGroups.map((group) => ({
      key: group.key,
      label: group.label,
      shortLabel: group.shortLabel,
      count: group.items.length,
      expanded: group.expanded,
      collapsible: true,
      onToggle: group.onToggle,
      items: group.items,
    })),
  ];
  const expandedKeys = sections
    .filter((section) => section.expanded)
    .map((section) => section.key);

  const headingRows =
    view.headings.length === 0 ? (
      <EmptyHint>{t('当前文档没有标题')}</EmptyHint>
    ) : (
      view.headings.map(({ item, indent }) => {
        const expanded = !collapsedHeadings.has(item.id);
        return (
          <div
            key={item.id}
            role="treeitem"
            aria-level={item.level}
            aria-expanded={item.hasChildren ? expanded : undefined}
            data-outline-kind="heading"
            data-outline-line={item.line}
            data-outline-file={item.file}
            onClick={() => jumpTo(item.file, item.line)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              minHeight: 28,
              padding: `0 8px 0 ${12 + indent * 14}px`,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 12.5,
              fontWeight: item.level <= 2 ? 600 : 400,
              textAlign: 'left',
              cursor: 'default',
              overflow: 'hidden',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background =
                'var(--action-secondary-shaded)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
            }}
          >
            {item.hasChildren ? (
              <IconButton
                size="small"
                aria-label={expanded ? t('折叠') : t('展开')}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleHeading(item.id);
                }}
                sx={{ width: 18, height: 18, flexShrink: 0, mr: 2 }}
              >
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  style={{
                    transform: expanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 120ms ease',
                    color: 'var(--text-secondary)',
                  }}
                />
              </IconButton>
            ) : (
              <span style={{ width: 18 + 8, flexShrink: 0 }} />
            )}
            {item.prefix ? (
              <span
                style={{
                  flexShrink: 0,
                  marginRight: 6,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
              >
                {item.prefix}
              </span>
            ) : null}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.text}
            </span>
          </div>
        );
      })
    );

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label={t('大纲')}
      data-outline-list
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {sections.map((section, index) => {
        const next = sections[index + 1];
        const prev = sections[index - 1];
        // 只有相邻两个分区都展开时才允许拖拽；折叠分区固定只占标题栏。
        const draggable = !!next && section.expanded && next.expanded;
        // 上方已有透明托条时去掉标题行的 1px 顶线，两个分区真正紧贴。
        const topBorder = index === 0 || !(prev?.expanded && section.expanded);
        return (
          <Fragment key={section.key}>
            <OutlineSection
              flex={
                section.expanded ? `${weights[section.key]} 1 0` : '0 0 30px'
              }
              label={section.label}
              count={section.count}
              expanded={section.expanded}
              collapsible={section.collapsible}
              topBorder={topBorder}
              onToggle={section.onToggle}
            >
              {section.key === 'headings' ? (
                <>
                  {headingRows}
                  {errors.length > 0 && (
                    <div
                      style={{
                        padding: '10px 12px',
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {t('{count} 个文件读取失败，大纲可能不完整', {
                        count: errors.length,
                      })}
                    </div>
                  )}
                </>
              ) : section.items.length === 0 ? (
                <EmptyHint>
                  {t('当前文档没有{label}', { label: section.shortLabel })}
                </EmptyHint>
              ) : (
                section.items.map((item) => (
                  <FloatRow
                    key={item.id}
                    item={item}
                    onJump={() => jumpTo(item.file, item.line)}
                  />
                ))
              )}
            </OutlineSection>
            {draggable && (
              <Sash
                dragging={draggingSash === section.key}
                onPointerDown={(clientY) =>
                  startDrag(clientY, section.key, next.key, expandedKeys)
                }
                onReset={resetWeights}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flex: 1,
        minHeight: 0,
        padding: 24,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  );
}
