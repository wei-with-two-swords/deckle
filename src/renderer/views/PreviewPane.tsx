import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  Leaf,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCw,
  Zap,
} from 'lucide-react';
import { CircularProgress, Menu, MenuItem, Tooltip } from '@mui/material';
import { joinRelative } from '../../shared/paths';
import { currentRenderGeneration } from '../lib/renderLifecycle';
import { useAppStore } from '../store/appStore';
import { getTypstRenderer, useRendererSmoke } from '../lib/rendererSmoke';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  fitZoomForWidth,
  zoomFromWheel,
} from './previewZoom';
import { previewColors } from './previewTheme';
import { MIN_PREVIEW_WIDTH } from '../layout/layoutMetrics';
import { t } from '../lib/i18n';

const PAGE_WIDTH_PT = 595.28;
const PAGE_HEIGHT_PT = 841.89;
const PX_PER_PT = 1.28;
const PAGE_WIDTH_PX = PAGE_WIDTH_PT * PX_PER_PT;
const PAGE_GAP = 26;
const PAGE_PADDING = 26;

/** 串行化渲染：避免同一时刻多个 session 争用 wasm 实例。 */
let renderQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(task, task);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

interface PageSize {
  width: number;
  height: number;
}

/** 预览显示偏好写入全局设置；值没变化时不重复写盘。 */
function updatePreviewSetting(patch: {
  fitWidth?: boolean;
  eyeCare?: boolean;
  autoCompile?: boolean;
  syncScroll?: boolean;
}): void {
  const state = useAppStore.getState();
  const current = state.settings?.preview;
  if (!current) return;
  const next = { ...current, ...patch };
  if (
    next.fitWidth === current.fitWidth &&
    next.eyeCare === current.eyeCare &&
    next.autoCompile === current.autoCompile &&
    next.syncScroll === current.syncScroll
  ) {
    return;
  }
  void state.patchSettings({ preview: next });
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        style={{
          minWidth: 28,
          height: '100%',
          padding: '0 8px',
          border: 'none',
          borderRadius: 0,
          background: 'transparent',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-primary)',
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
        {children}
      </button>
    </Tooltip>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
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

export function ModeButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      title={
        active
          ? t('{label}（已激活，点击关闭）', { label })
          : t('{label}（点击开启）', { label })
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        style={{
          height: 30,
          minWidth: 30,
          padding: '0 7px',
          border: `1px solid ${active ? 'var(--action-primary)' : 'var(--border-secondary)'}`,
          borderRadius: 6,
          background: active ? 'var(--action-secondary-shaded)' : 'transparent',
          color: active ? 'var(--action-primary)' : 'var(--text-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'default',
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function navButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    minWidth: 30,
    height: '100%',
    padding: '0 6px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
    display: 'grid',
    placeItems: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

export default function PreviewPane() {
  const project = useAppStore((s) => s.project);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const artifact = useAppStore((s) => s.artifact);
  const compileStatus = useAppStore((s) => s.compileStatus);
  const diagnostics = useAppStore((s) => s.diagnostics);
  const exportPdf = useAppStore((s) => s.exportPdf);
  const compileNow = useAppStore((s) => s.compileNow);
  const settings = useAppStore((s) => s.settings);
  const syncScrollRequest = useAppStore((s) => s.syncScrollRequest);
  const theme = useAppStore((s) => s.theme);
  const { status, error, retry } = useRendererSmoke();

  // settings 尚在异步读取时按默认值处理，与 DEFAULT_SETTINGS 保持一致。
  const fitWidth = settings?.preview.fitWidth ?? true;
  const eyeCare = settings?.preview.eyeCare ?? false;
  const autoCompile = settings?.preview.autoCompile ?? true;
  const syncScroll = settings?.preview.syncScroll ?? false;
  const colors = previewColors(eyeCare, theme);

  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  /** 用户手动改过缩放：在设置写回前立即阻止自动适应，避免被 ResizeObserver 覆盖。 */
  const manualRef = useRef(false);
  /** Ctrl/⌘+滚轮缩放前记录视口中心在文档中的相对位置，缩放后按新高度还原 */
  const zoomAnchorRef = useRef<number | null>(null);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpText, setJumpText] = useState<string | null>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  /** 缩放控件仅在 Ctrl/⌘+滚轮缩放时显隐：悬停时保持，离开后延时隐藏。 */
  const [showZoom, setShowZoom] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  /** 宽工具栏时页码组绝对居中；窄工具栏保持 flex 排布，避免与两侧按钮重叠。 */
  const [centerPageNav, setCenterPageNav] = useState(false);
  const zoomHideTimer = useRef<number | null>(null);
  const armZoomHide = useCallback(() => {
    if (zoomHideTimer.current !== null) {
      window.clearTimeout(zoomHideTimer.current);
    }
    zoomHideTimer.current = window.setTimeout(() => {
      setShowZoom(false);
      zoomHideTimer.current = null;
    }, 1800);
  }, []);
  const revealZoom = useCallback(() => {
    setShowZoom(true);
    armZoomHide();
  }, [armZoomHide]);

  /** 跳转到指定页（index 从 0 开始），并把当前页状态同步过去。 */
  const goToPage = useCallback((index: number) => {
    const scroller = contentRef.current;
    const pages =
      pagesRef.current?.querySelectorAll<HTMLElement>('.preview-page');
    const page = pages?.[index];
    if (!scroller || !page) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    scroller.scrollTop += pageRect.top - scrollerRect.top;
    setCurrentPage(index + 1);
  }, []);

  /** 根据滚动视口中心所在的页面，更新"当前页"指示器。 */
  const computeCurrentPage = useCallback(() => {
    const scroller = contentRef.current;
    const pages =
      pagesRef.current?.querySelectorAll<HTMLElement>('.preview-page');
    if (!scroller || !pages || pages.length === 0) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const centerY = scrollerRect.top + scroller.clientHeight / 2;
    let found = 0;
    pages.forEach((page, index) => {
      const rect = page.getBoundingClientRect();
      if (rect.top <= centerY && rect.bottom > centerY) found = index;
    });
    if (found === 0) {
      const last = pages[pages.length - 1].getBoundingClientRect();
      if (centerY >= last.bottom) found = pages.length - 1;
    }
    setCurrentPage(found + 1);
  }, []);

  const prevPage = useCallback(() => {
    if (currentPage > 1) goToPage(currentPage - 2);
  }, [currentPage, goToPage]);

  const nextPage = useCallback(() => {
    if (currentPage < pageSizes.length) goToPage(currentPage);
  }, [currentPage, pageSizes.length, goToPage]);

  const commitJump = useCallback(() => {
    setJumpText((text) => {
      const raw = text?.trim();
      if (raw) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= pageSizes.length) {
          goToPage(n - 1);
        }
      }
      return null;
    });
  }, [pageSizes.length, goToPage]);

  /** 立即按当前容器宽度算一次适应缩放，不等设置写回。 */
  const applyFit = () => {
    const element = contentRef.current;
    if (!element) return;
    const next = fitZoomForWidth(
      element.clientWidth,
      PAGE_WIDTH_PX,
      PAGE_PADDING,
    );
    if (next === null) return;
    const state = useAppStore.getState();
    if (Math.abs(state.zoom - next) > 0.005) state.setZoom(next);
  };

  /** 适应宽度是可切换的自动模式：开启后容器宽度变化（拖拽分隔条）持续重算。 */
  const toggleFitWidth = () => {
    if (fitWidth) {
      manualRef.current = true;
      updatePreviewSetting({ fitWidth: false });
    } else {
      manualRef.current = false;
      updatePreviewSetting({ fitWidth: true });
      applyFit();
    }
  };

  // 只在自动模式下监听尺寸变化；关闭后缩放完全交给用户。
  useEffect(() => {
    const element = contentRef.current;
    if (!element || !fitWidth) return;
    manualRef.current = false;
    let frame = 0;
    const fit = () => {
      frame = 0;
      if (manualRef.current) return;
      const next = fitZoomForWidth(
        element.clientWidth,
        PAGE_WIDTH_PX,
        PAGE_PADDING,
      );
      if (next === null) return;
      const current = useAppStore.getState().zoom;
      if (Math.abs(current - next) > 0.005) setZoom(next);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(fit);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [setZoom, project?.path, fitWidth]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // 阻止 Chromium 默认的整页缩放。React 的 onWheel 是 passive 监听，
      // preventDefault 不生效，所以这里挂非 passive 的原生监听。
      event.preventDefault();

      const state = useAppStore.getState();
      const current = state.zoom;
      const next = zoomFromWheel(current, event.deltaY, event.deltaMode);
      if (Math.abs(next - current) < 0.001) return;

      const scroller = contentRef.current;
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        zoomAnchorRef.current =
          (scroller.scrollTop + scroller.clientHeight / 2) /
          scroller.scrollHeight;
      }
      // Ctrl/⌘+滚轮属于手动缩放：退出自动适应，否则下一次尺寸变化会把比例覆盖回去。
      manualRef.current = true;
      updatePreviewSetting({ fitWidth: false });
      state.setZoom(next);
      revealZoom();
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      if (zoomHideTimer.current !== null) {
        window.clearTimeout(zoomHideTimer.current);
        zoomHideTimer.current = null;
      }
    };
  }, [revealZoom]);

  useEffect(() => {
    if (!artifact || artifact.byteLength === 0) {
      setPageSizes([]);
      return;
    }
    const renderer = getTypstRenderer();
    if (status !== 'ready' || !renderer) return;
    let cancelled = false;
    const generation = currentRenderGeneration();
    void (async () => {
      try {
        await enqueue(() =>
          renderer.runWithSession(
            { format: 'vector', artifactContent: artifact },
            async (session) => {
              // 切项目后旧 artifact 的 session 不再读取，及时退出。
              if (cancelled || generation !== currentRenderGeneration()) return;
              const infos = session.retrievePagesInfo();
              setPageSizes(
                infos.map((info) => ({
                  width: info.width,
                  height: info.height,
                })),
              );
            },
          ),
        );
      } catch (reason) {
        console.error('[preview] page info failed', reason);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifact, status]);

  useEffect(() => {
    const container = pagesRef.current;
    const scroller = contentRef.current;
    const renderer = getTypstRenderer();
    if (!container || !scroller) return;
    if (
      !artifact ||
      artifact.byteLength === 0 ||
      !renderer ||
      pageSizes.length === 0
    ) {
      container.replaceChildren();
      zoomAnchorRef.current = null;
      return;
    }

    let cancelled = false;
    const generation = currentRenderGeneration();
    const savedScroll = scroller.scrollTop;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pages: HTMLDivElement[] = [];
    const rendering = new Set<number>();
    const rendered = new Set<number>();
    setRenderError(null);

    const renderPage = async (index: number) => {
      if (
        cancelled ||
        generation !== currentRenderGeneration() ||
        rendered.has(index) ||
        rendering.has(index)
      ) {
        return;
      }
      const page = pages[index];
      const info = pageSizes[index];
      if (!page || !info) return;
      rendering.add(index);

      const cssWidth = Math.round(info.width * PX_PER_PT * zoom);
      const cssHeight = Math.round(info.height * PX_PER_PT * zoom);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.style.display = 'block';
      canvas.setAttribute('data-page-offset', String(index));
      const ctx = canvas.getContext('2d');

      try {
        if (!ctx) throw new Error(t('无法创建预览画布'));
        await enqueue(() =>
          renderer.runWithSession(
            { format: 'vector', artifactContent: artifact },
            async (session) => {
              if (cancelled || generation !== currentRenderGeneration()) return;
              await session.renderCanvas({
                canvas: ctx,
                pageOffset: index,
                pixelPerPt: PX_PER_PT * zoom * dpr,
                backgroundColor: colors.paper,
              });
            },
          ),
        );
        if (cancelled) return;
        page.replaceChildren(canvas);
        page.dataset.rendered = '1';
        rendered.add(index);
      } catch (reason) {
        if (cancelled) return;
        console.error('[preview] render failed', reason);
        setRenderError(t('预览渲染失败，请重试'));
      } finally {
        rendering.delete(index);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (Number.isNaN(index)) continue;
          void renderPage(index);
        }
      },
      { root: scroller, rootMargin: '800px 0px' },
    );

    container.replaceChildren();
    pageSizes.forEach((info, index) => {
      const cssWidth = Math.round(info.width * PX_PER_PT * zoom);
      const cssHeight = Math.round(info.height * PX_PER_PT * zoom);

      const page = document.createElement('div');
      page.className = 'preview-page';
      page.dataset.pageIndex = String(index);
      page.style.width = `${cssWidth}px`;
      page.style.height = `${cssHeight}px`;
      page.style.flex = 'none';
      page.style.background = colors.paper;
      page.style.boxShadow = 'var(--effect-shadow-page)';
      page.style.borderRadius = '1px';
      page.style.overflow = 'hidden';
      page.style.display = 'grid';
      page.style.placeItems = 'center';
      page.style.color = colors.ink;
      page.style.fontSize = '11px';
      page.textContent = String(index + 1);

      pages.push(page);
      container.appendChild(page);
      observer.observe(page);
    });

    // 保持滚动位置：页面尺寸未变，恢复到原位置避免每次编译都跳回顶部。
    const restore = requestAnimationFrame(() => {
      const anchor = zoomAnchorRef.current;
      zoomAnchorRef.current = null;
      if (anchor !== null) {
        // 缩放后页面高度变了，按视口中心的相对位置还原，避免跳回别处。
        scroller.scrollTop = Math.max(
          0,
          anchor * scroller.scrollHeight - scroller.clientHeight / 2,
        );
      } else {
        scroller.scrollTop = Math.min(savedScroll, scroller.scrollHeight);
      }
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(restore);
    };
    // 护眼模式切换后 canvas 必须按新纸面色重渲染。
  }, [artifact, pageSizes, zoom, status, colors.paper, colors.ink]);

  // 滚动时（rAF 节流）更新当前页码指示。
  useEffect(() => {
    const scroller = contentRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        computeCurrentPage();
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [computeCurrentPage]);

  // 工具栏页码组：宽度足够时相对整个工具栏绝对居中；否则参与 flex 排布，
  // 宁可略偏也不与两侧按钮重叠。阈值按左右组实际宽度计算，避免写死
  // 480px 后在中等宽度下仍然覆盖左侧按钮。页码组自身宽度基本固定
  // （约 160–180px），预留 180px，避免用会随 flex 拉伸的测量值造成死锁。
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const update = () => {
      const left = toolbar.firstElementChild as HTMLElement | null;
      const right = toolbar.lastElementChild as HTMLElement | null;
      if (!left || !right) return;
      const sideWidth = Math.max(
        left.getBoundingClientRect().width,
        right.getBoundingClientRect().width,
      );
      const required = 180 + sideWidth * 2 + 16;
      setCenterPageNav(toolbar.clientWidth >= required);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  // 宽工具栏的后置校验：页码组必须与整个工具栏中心重合。布局一旦被
  // 无意改动（例如左右组再次等分或某一侧 flex 变化），开发时会留下明确
  // 的告警，而不是只表现为“看起来有点歪”。
  useEffect(() => {
    if (!centerPageNav) return;
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const frame = requestAnimationFrame(() => {
      const nav = toolbar.querySelector<HTMLElement>('[data-preview-page-nav]');
      if (!nav) return;
      const toolbarRect = toolbar.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const offset =
        navRect.left +
        navRect.width / 2 -
        (toolbarRect.left + toolbarRect.width / 2);
      if (Math.abs(offset) > 1) {
        console.warn('[preview-layout] page navigation is off-center', {
          offset,
          toolbarWidth: toolbarRect.width,
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [centerPageNav, pageSizes, zoom]);

  // 页面数量或缩放变化后重新计算当前页（上一渲染 effect 已重建 DOM）。
  useEffect(() => {
    computeCurrentPage();
  }, [pageSizes, zoom, computeCurrentPage]);

  // 同步滚动：编辑区点击后，按点击行在文档中的比例把预览滚动到对应位置。
  useEffect(() => {
    if (!syncScroll) {
      // 关闭时清空待处理的跳转请求，避免之后重新开启跳到旧位置。
      if (syncScrollRequest) {
        useAppStore.setState({ syncScrollRequest: null });
      }
      return;
    }
    if (!syncScrollRequest) return;
    const scroller = contentRef.current;
    if (scroller) {
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max > 0) {
        const fraction =
          (syncScrollRequest.line - 0.5) /
          Math.max(1, syncScrollRequest.totalLines);
        scroller.scrollTop = Math.max(0, Math.min(max, fraction * max));
      }
    }
    // 消费后清空，避免重复触发。
    useAppStore.setState({ syncScrollRequest: null });
  }, [syncScrollRequest, syncScroll]);

  const zoomBy = (delta: number) => {
    // 手动改比例时退出适应宽度，保留用户选择的倍率。
    manualRef.current = true;
    updatePreviewSetting({ fitWidth: false });
    setZoom(
      Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, Math.round((zoom + delta) * 100) / 100),
      ),
    );
    revealZoom();
  };

  const placeholderWidth = Math.round(PAGE_WIDTH_PT * PX_PER_PT * zoom);
  const placeholderHeight = Math.round(PAGE_HEIGHT_PT * PX_PER_PT * zoom);
  const errorCount = diagnostics.filter((item) => item.severity === 1).length;
  const compiling = compileStatus === 'compiling';
  const canExport = compileStatus === 'ready' && !!artifact;
  /** 下拉菜单的「导出到项目目录」：跳过保存对话框，直接用主文件名落盘。 */
  const exportToProject = useCallback(() => {
    if (!project) return;
    const base = (
      project.config.mainFile.split(/[\\/]/).pop() ?? 'main'
    ).replace(/\.[^.]+$/, '');
    void exportPdf(joinRelative(project.path, `${base}.pdf`));
  }, [project, exportPdf]);
  const totalPages = pageSizes.length;
  const atStart = currentPage <= 1;
  const atEnd = currentPage >= totalPages;

  return (
    <section
      ref={sectionRef}
      aria-label={t('预览')}
      style={{
        flex: 1,
        minWidth: MIN_PREVIEW_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      <div
        ref={toolbarRef}
        data-preview-toolbar="true"
        style={{
          height: 30,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
        }}
      >
        {/* 左：显示模式（同步滚动、护眼、适应宽度） */}
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ModeButton
            label={t('同步滚动')}
            active={syncScroll}
            onClick={() => updatePreviewSetting({ syncScroll: !syncScroll })}
          >
            <Crosshair size={15} strokeWidth={1.5} />
          </ModeButton>
          <ModeButton
            label={t('护眼模式')}
            active={eyeCare}
            onClick={() => updatePreviewSetting({ eyeCare: !eyeCare })}
          >
            <Leaf size={15} strokeWidth={1.5} />
          </ModeButton>
          <ModeButton
            label={t('适应宽度')}
            active={fitWidth}
            onClick={toggleFitWidth}
          >
            <Maximize2 size={15} strokeWidth={1.5} />
          </ModeButton>
          <ModeButton
            label={t('自动编译')}
            active={autoCompile}
            onClick={() => {
              const state = useAppStore.getState();
              const preview = state.settings?.preview;
              if (!preview) return;
              void state.patchSettings({
                preview: { ...preview, autoCompile: !autoCompile },
              });
            }}
          >
            <RefreshCw size={15} strokeWidth={1.5} />
          </ModeButton>
          <ToolGroup>
            <Tooltip title={t('立即编译并刷新预览')}>
              <button
                type="button"
                aria-label={t('立即编译')}
                disabled={compiling}
                onClick={() => void compileNow()}
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
                  opacity: compiling ? 0.6 : 1,
                }}
                onMouseEnter={(event) => {
                  if (compiling) return;
                  event.currentTarget.style.background =
                    'var(--action-secondary-hover)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                {compiling ? (
                  <CircularProgress size={14} />
                ) : (
                  <Zap size={16} strokeWidth={1.5} />
                )}
              </button>
            </Tooltip>
          </ToolGroup>
        </div>

        {/* 中：页码导航。必须占据剩余空间才能居中；改成 flex:none 会紧贴
            左侧模式按钮组，是之前“页码控件靠左”的回归原因。 */}
        <div
          data-preview-page-nav="true"
          style={
            centerPageNav
              ? {
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  height: 30,
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                }
              : {
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  justifyContent: 'center',
                }
          }
        >
          {totalPages > 0 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'stretch',
                height: 30,
                border: '1px solid var(--border-secondary)',
                borderRadius: 6,
                overflow: 'hidden',
                background: 'transparent',
              }}
            >
              <button
                type="button"
                aria-label={t('上一页')}
                disabled={atStart}
                onClick={prevPage}
                style={navButtonStyle(atStart)}
                onMouseEnter={(event) => {
                  if (!atStart)
                    event.currentTarget.style.background =
                      'var(--action-secondary-hover)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                <ChevronUp size={15} strokeWidth={1.8} />
              </button>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '0 8px',
                  borderLeft: '1px solid var(--border-secondary)',
                  borderRight: '1px solid var(--border-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={t('跳转到页码')}
                  title={t('输入页码后回车跳转')}
                  value={jumpText === null ? String(currentPage) : jumpText}
                  onChange={(event) =>
                    setJumpText(event.target.value.replace(/[^0-9]/g, ''))
                  }
                  onFocus={() => setJumpText('')}
                  onBlur={commitJump}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitJump();
                      (event.target as HTMLInputElement).blur();
                    } else if (event.key === 'Escape') {
                      setJumpText(null);
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                  style={{
                    width: '3.4em',
                    textAlign: 'center',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                    padding: 0,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>
                  / {totalPages}
                </span>
              </div>
              <button
                type="button"
                aria-label={t('下一页')}
                disabled={atEnd}
                onClick={nextPage}
                style={navButtonStyle(atEnd)}
                onMouseEnter={(event) => {
                  if (!atEnd)
                    event.currentTarget.style.background =
                      'var(--action-secondary-hover)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                <ChevronDown size={15} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </div>

        {/* 右：编译状态 + 导出 */}
        <div
          style={{
            // 右侧固定内容宽度；页码组绝对居中时靠 auto margin 贴右。
            flex: '0 0 auto',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <div
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              color:
                status === 'error' || compileStatus === 'error'
                  ? 'var(--text-critical)'
                  : 'var(--text-secondary)',
              fontSize: 11,
            }}
          >
            {status === 'loading' && <CircularProgress size={12} />}
            {status === 'ready' && compileStatus === 'compiling' && (
              <>
                <CircularProgress size={12} />
                <span>{t('编译中')}</span>
              </>
            )}
            {status === 'ready' &&
              compileStatus === 'error' &&
              (errorCount > 0 ? (
                <span>
                  {t('{count} 个错误', { count: errorCount })}
                  {diagnostics.length > errorCount
                    ? t(' · {count} 个警告', {
                        count: diagnostics.length - errorCount,
                      })
                    : ''}
                  {artifact ? t(' · 显示上次成功预览') : ''}
                </span>
              ) : (
                <span>
                  {t('编译失败')}
                  {artifact ? t(' · 显示上次成功预览') : ''}
                </span>
              ))}
            {status === 'error' && (
              <>
                <span title={error ?? ''}>{t('渲染引擎加载失败')}</span>
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    height: 22,
                    padding: '0 8px',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: 6,
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'default',
                  }}
                >
                  <RotateCw size={11} strokeWidth={1.5} />
                  {t('重试')}
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'inline-flex' }}>
            <Tooltip title={t('导出 PDF')}>
              <button
                type="button"
                aria-label={t('导出 PDF')}
                disabled={!canExport}
                onClick={() => void exportPdf()}
                style={{
                  height: 30,
                  padding: '0 8px',
                  border: '1px solid var(--border-secondary)',
                  borderRight: 'none',
                  borderRadius: '6px 0 0 6px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: canExport ? 1 : 0.5,
                  cursor: 'default',
                }}
                onMouseEnter={(event) => {
                  if (!canExport) return;
                  event.currentTarget.style.background =
                    'var(--action-secondary-hover)';
                  event.currentTarget.style.borderColor =
                    'var(--border-toolbar)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                  event.currentTarget.style.borderColor =
                    'var(--border-secondary)';
                }}
              >
                <Download size={15} strokeWidth={1.5} />
              </button>
            </Tooltip>
            <Tooltip title={t('导出选项')}>
              <button
                type="button"
                aria-label={t('导出选项')}
                disabled={!canExport}
                onClick={(event) => setExportMenuAnchor(event.currentTarget)}
                style={{
                  height: 30,
                  width: 22,
                  padding: 0,
                  border: '1px solid var(--border-secondary)',
                  borderRadius: '0 6px 6px 0',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: canExport ? 1 : 0.5,
                  cursor: 'default',
                }}
                onMouseEnter={(event) => {
                  if (!canExport) return;
                  event.currentTarget.style.background =
                    'var(--action-secondary-hover)';
                  event.currentTarget.style.borderColor =
                    'var(--border-toolbar)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                  event.currentTarget.style.borderColor =
                    'var(--border-secondary)';
                }}
              >
                <ChevronDown size={12} strokeWidth={1.5} />
              </button>
            </Tooltip>
          </div>
          <Menu
            anchorEl={exportMenuAnchor}
            open={exportMenuAnchor !== null}
            onClose={() => setExportMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => {
                setExportMenuAnchor(null);
                void exportPdf();
              }}
            >
              {t('导出到…')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setExportMenuAnchor(null);
                exportToProject();
              }}
            >
              {t('导出到项目目录')}
            </MenuItem>
          </Menu>
        </div>
      </div>

      <div
        ref={contentRef}
        data-preview-scroll="true"
        style={{
          flex: 1,
          minHeight: 0,
          marginTop: 12,
          background: 'var(--layer-3)',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          paddingTop: PAGE_PADDING,
          paddingLeft: PAGE_PADDING,
          paddingRight: PAGE_PADDING,
          paddingBottom: PAGE_PADDING + 44,
          overflow: 'auto',
          // 适应宽度按 clientWidth 计算；滚动条出现/消失会改变 clientWidth，
          // 在临界宽度上形成“缩放→滚动条→再缩放”的抖动。始终预留滚动条槽位。
          scrollbarGutter: 'stable',
          display: 'flex',
          flexDirection: 'column',
          // 页面容器自己负责居中：比视口窄时 margin:auto 居中；比视口宽时
          // 宽度取 max-content、margin 归零，左边缘可见且可横向滚动，
          // 不会被 flex 居中裁掉。
          alignItems: 'flex-start',
          gap: PAGE_GAP,
        }}
      >
        <div
          ref={pagesRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: PAGE_GAP,
            width: 'max-content',
            minWidth: '100%',
            margin: '0 auto',
          }}
        />

        {renderError && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              background: 'var(--layer-1)',
              color: 'var(--text-critical)',
              fontSize: 11,
              boxShadow: 'var(--effect-shadow-1)',
              alignSelf: 'center',
            }}
          >
            {renderError}
          </div>
        )}

        {project && !artifact && (
          <div
            style={{
              width: placeholderWidth,
              height: placeholderHeight,
              flex: 'none',
              margin: '0 auto',
              background: colors.paper,
              boxShadow: 'var(--effect-shadow-page)',
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-caption)',
              fontFamily: 'var(--font-ui)',
              textAlign: 'center',
              padding: 24,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {compileStatus === 'error' ? (
                  t('编译失败')
                ) : (
                  <>
                    <CircularProgress size={14} />
                    {t('正在编译…')}
                  </>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {compileStatus === 'error'
                  ? t('查看左侧 Issues 面板中的错误位置')
                  : project.config.mainFile}
              </div>
            </div>
          </div>
        )}

        {!project && (
          <div
            style={{
              margin: 'auto',
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            {t('打开项目后显示预览')}
          </div>
        )}
      </div>

      {/* 悬浮：缩放（仅在 Ctrl/⌘+滚轮缩放时显隐） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          transform: 'translateX(-50%)',
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'stretch',
          height: 30,
          border: '1px solid var(--border-secondary)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--layer-1)',
          boxShadow: 'var(--effect-shadow-1)',
          opacity: showZoom ? 1 : 0,
          pointerEvents: showZoom ? 'auto' : 'none',
          transition: 'opacity 160ms ease',
        }}
        onMouseEnter={() => {
          if (zoomHideTimer.current !== null) {
            window.clearTimeout(zoomHideTimer.current);
            zoomHideTimer.current = null;
          }
        }}
        onMouseLeave={() => armZoomHide()}
      >
        <ZoomButton label={t('缩小')} onClick={() => zoomBy(-0.01)}>
          <Minus size={15} strokeWidth={1.5} />
        </ZoomButton>
        <button
          type="button"
          title={t('恢复 100%')}
          aria-label={t('恢复 100%')}
          onClick={() => {
            manualRef.current = true;
            updatePreviewSetting({ fitWidth: false });
            setZoom(1);
          }}
          style={{
            minWidth: '3.4em',
            height: '100%',
            padding: '0 4px',
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            fontSize: 12,
            color: 'var(--text-primary)',
            cursor: 'default',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomButton label={t('放大')} onClick={() => zoomBy(0.01)}>
          <Plus size={15} strokeWidth={1.5} />
        </ZoomButton>
      </div>
    </section>
  );
}
