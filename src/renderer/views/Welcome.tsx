import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  ArrowDownWideNarrow,
  Eye,
  FileDown,
  FilePlus2,
  FolderOpen,
  LayoutGrid,
  List,
  Package,
  Pencil,
  Play,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { getTypstRenderer, initRendererSmoke } from '../lib/rendererSmoke';
import type { RecentProject, TemplateInfo } from '../../shared/types';
import { t } from '../lib/i18n';

function formatOpenedAt(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return t('今天 {time}', {
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    });
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : 'T';
}

interface ProjectCardProps {
  project: RecentProject;
  onOpen: () => void;
  onExportPdf: () => void;
  onExportArchive: () => void;
  onDelete: () => void;
}

const coverCache = new Map<string, Promise<string | null>>();
let coverQueue: Promise<unknown> = Promise.resolve();

function renderProjectCover(project: RecentProject): Promise<string | null> {
  const key = `${project.path}:${project.modifiedAt}`;
  const cached = coverCache.get(key);
  if (cached) return cached;

  const task = (coverQueue = coverQueue
    .then(async () => {
      const response = await window.typstor.project.thumbnail(project.path);
      if (!response.ok || !response.data) return null;
      await initRendererSmoke();
      const renderer = getTypstRenderer();
      if (!renderer) return null;
      return renderer.runWithSession(
        { format: 'vector', artifactContent: response.data.vector },
        async (session) => {
          const pages = session.retrievePagesInfo();
          if (pages.length === 0) return null;
          const page = pages[0];
          const scale = 320 / page.width;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(page.width * scale));
          canvas.height = Math.max(1, Math.round(page.height * scale));
          const context = canvas.getContext('2d');
          if (!context) return null;
          await session.renderCanvas({
            canvas: context,
            pageOffset: 0,
            pixelPerPt: scale,
            backgroundColor: '#ffffff',
          });
          return canvas.toDataURL('image/png');
        },
      );
    })
    .catch(() => null)) as Promise<string | null>;

  if (coverCache.size > 80) coverCache.clear();
  coverCache.set(key, task);
  return task;
}

function ProjectCover({ project }: { project: RecentProject }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    void renderProjectCover(project).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [project]);

  if (url)
    return (
      <img className="project-card-cover" src={url} alt="" draggable={false} />
    );
  return (
    <span className="project-card-initial">{initialOf(project.name)}</span>
  );
}

function ProjectCard({
  project,
  onOpen,
  onExportPdf,
  onExportArchive,
  onDelete,
}: ProjectCardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        className="project-card"
        data-project-path={project.path}
        role="button"
        tabIndex={0}
        title={project.path}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <ProjectCover project={project} />
        <div
          className="project-card-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <Tooltip title={t('打开编辑')}>
            <button
              type="button"
              className="dashboard-icon-btn template-action"
              aria-label={t('打开编辑')}
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              <Pencil size={17} strokeWidth={1.7} />
            </button>
          </Tooltip>
          <Tooltip title={t('导出 PDF')}>
            <button
              type="button"
              className="dashboard-icon-btn template-action"
              aria-label={t('导出 PDF')}
              onClick={(event) => {
                event.stopPropagation();
                onExportPdf();
              }}
            >
              <FileDown size={17} strokeWidth={1.7} />
            </button>
          </Tooltip>
          <Tooltip title={t('导出压缩包')}>
            <button
              type="button"
              className="dashboard-icon-btn template-action"
              aria-label={t('导出压缩包')}
              onClick={(event) => {
                event.stopPropagation();
                onExportArchive();
              }}
            >
              <Package size={17} strokeWidth={1.7} />
            </button>
          </Tooltip>
          <Tooltip title={t('删除项目')}>
            <button
              type="button"
              className="dashboard-icon-btn template-action template-action-danger"
              aria-label={t('删除项目')}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={17} strokeWidth={1.7} />
            </button>
          </Tooltip>
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {project.name}
      </span>
    </div>
  );
}

function TemplateRow({
  template,
  onStart,
  onPreview,
  onEdit,
  onDelete,
}: {
  template: TemplateInfo;
  onStart: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="template-row" data-template-id={template.id}>
      <span className="template-row-main">
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t(template.name)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t(template.description || template.id)}
        </span>
      </span>
      <div className="template-actions">
        <Tooltip title={t('从模板开始')}>
          <button
            type="button"
            className="dashboard-icon-btn template-action"
            aria-label={t('从模板开始')}
            onClick={onStart}
          >
            <Play size={16} strokeWidth={1.6} />
          </button>
        </Tooltip>
        <Tooltip title={t('预览')}>
          <button
            type="button"
            className="dashboard-icon-btn template-action"
            aria-label={t('预览模板')}
            onClick={onPreview}
          >
            <Eye size={16} strokeWidth={1.6} />
          </button>
        </Tooltip>
        <Tooltip title={t('编辑')}>
          <button
            type="button"
            className="dashboard-icon-btn template-action"
            aria-label={t('编辑模板')}
            onClick={onEdit}
          >
            <Pencil size={16} strokeWidth={1.6} />
          </button>
        </Tooltip>
        <Tooltip title={t('删除')}>
          <button
            type="button"
            className="dashboard-icon-btn template-action template-action-danger"
            aria-label={t('删除模板')}
            onClick={onDelete}
          >
            <Trash2 size={16} strokeWidth={1.6} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export default function Welcome() {
  const projects = useAppStore((s) => s.recent);
  const templates = useAppStore((s) => s.templates);
  const layout = useAppStore((s) => s.welcomeLayout);
  const sort = useAppStore((s) => s.welcomeSort);
  const setLayout = useAppStore((s) => s.setWelcomeLayout);
  const setSort = useAppStore((s) => s.setWelcomeSort);
  const openProject = useAppStore((s) => s.openProject);
  const previewTemplate = useAppStore((s) => s.previewTemplate);
  const setNewProjectOpen = useAppStore((s) => s.setNewProjectOpen);
  const importTemplate = useAppStore((s) => s.importTemplate);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const exportProjectPdfFile = useAppStore((s) => s.exportProjectPdfFile);
  const exportProjectArchiveFile = useAppStore(
    (s) => s.exportProjectArchiveFile,
  );
  const deleteProjectFolder = useAppStore((s) => s.deleteProjectFolder);

  const [query, setQuery] = useState('');
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateInfo | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<RecentProject | null>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? projects.filter(
          (project) =>
            project.name.toLowerCase().includes(normalized) ||
            project.path.toLowerCase().includes(normalized),
        )
      : [...projects];

    filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'modified') return b.modifiedAt - a.modifiedAt;
      return b.createdAt - a.createdAt;
    });
    return filtered;
  }, [projects, query, sort]);

  const createBlank = () => {
    setNewProjectOpen(true, 'blank', '空白项目');
  };

  const handleImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await importTemplate();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTemplate = (template: TemplateInfo) => {
    setDeleteTarget(template);
  };

  const confirmDeleteTemplate = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (target) await deleteTemplate(target.id);
  };

  const sortLabel =
    sort === 'name'
      ? t('名称')
      : sort === 'modified'
        ? t('更新时间')
        : t('创建时间');

  return (
    <div
      data-dashboard-grid
      style={{
        height: '100%',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'auto',
        padding: '24px 32px 32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
        columnGap: 40,
        rowGap: 20,
      }}
    >
      <h2
        style={{
          gridColumn: '1',
          gridRow: '1',
          alignSelf: 'center',
          margin: 0,
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        Dashboard
      </h2>

      <div
        style={{
          gridColumn: '2',
          gridRow: '1',
          alignSelf: 'center',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 40,
          padding: '0 12px',
          borderRadius: 4,
          backgroundColor: 'var(--action-secondary-shaded)',
          border: '1px solid var(--border-secondary)',
        }}
      >
        <Search size={15} strokeWidth={1.6} color="var(--text-secondary)" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('搜索项目')}
          aria-label={t('搜索项目')}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
        />
      </div>

      <div
        style={{
          gridColumn: '3',
          gridRow: '2',
          alignSelf: 'center',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          className="dashboard-tile"
          style={{ width: '100%' }}
          onClick={() => void handleImport()}
          disabled={busy}
        >
          {busy ? (
            <CircularProgress size={18} />
          ) : (
            <Upload size={18} strokeWidth={1.6} color="var(--action-primary)" />
          )}
          {t('导入模板')}
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--text-secondary)',
            }}
          >
            {t('支持 .typ、文件夹或 .zip')}
          </span>
        </button>
      </div>

      <button
        type="button"
        className="dashboard-tile"
        onClick={createBlank}
        style={{ gridColumn: '1', gridRow: '2' }}
      >
        <FilePlus2 size={18} strokeWidth={1.6} color="var(--action-primary)" />
        {t('新建项目')}
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--text-secondary)',
          }}
        >
          {t('从空白项目开始')}
        </span>
      </button>

      <button
        type="button"
        className="dashboard-tile"
        onClick={() => void openProject()}
        style={{ gridColumn: '2', gridRow: '2' }}
      >
        <FolderOpen size={18} strokeWidth={1.6} color="var(--action-primary)" />
        {t('打开文件夹')}
      </button>

      <div
        style={{
          gridColumn: '1 / 3',
          gridRow: '3',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 30,
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <Tooltip title={t('网格视图')}>
            <button
              type="button"
              className="dashboard-icon-btn"
              aria-label={t('网格视图')}
              aria-pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
              style={{
                width: 32,
                height: 30,
                borderRadius: 0,
                color:
                  layout === 'grid'
                    ? 'var(--action-primary)'
                    : 'var(--text-secondary)',
                ...(layout === 'grid'
                  ? { backgroundColor: 'var(--action-secondary-active)' }
                  : null),
              }}
            >
              <LayoutGrid size={15} strokeWidth={1.6} />
            </button>
          </Tooltip>
          <Tooltip title={t('列表视图')}>
            <button
              type="button"
              className="dashboard-icon-btn"
              aria-label={t('列表视图')}
              aria-pressed={layout === 'table'}
              onClick={() => setLayout('table')}
              style={{
                width: 32,
                height: 30,
                borderRadius: 0,
                color:
                  layout === 'table'
                    ? 'var(--action-primary)'
                    : 'var(--text-secondary)',
                ...(layout === 'table'
                  ? { backgroundColor: 'var(--action-secondary-active)' }
                  : null),
              }}
            >
              <List size={15} strokeWidth={1.6} />
            </button>
          </Tooltip>
        </div>
        <button
          type="button"
          className="dashboard-btn"
          onClick={(event) => setSortAnchor(event.currentTarget)}
        >
          <ArrowDownWideNarrow size={15} strokeWidth={1.6} />
          {sortLabel}
        </button>
        <Menu
          open={!!sortAnchor}
          anchorEl={sortAnchor}
          onClose={() => setSortAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {[
            { value: 'created' as const, label: t('创建时间') },
            { value: 'modified' as const, label: t('更新时间') },
            { value: 'name' as const, label: t('名称') },
          ].map((item) => (
            <MenuItem
              key={item.value}
              selected={sort === item.value}
              onClick={() => {
                setSort(item.value);
                setSortAnchor(null);
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </div>

      <div
        style={{
          gridColumn: '1 / 3',
          gridRow: '4',
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {visible.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--border-secondary)',
              borderRadius: 6,
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            {query.trim()
              ? t('没有匹配的项目')
              : t('还没有项目，新建或打开一个开始写论文')}
          </div>
        ) : layout === 'grid' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 160px)',
              gap: 16,
              justifyContent: 'start',
              alignContent: 'start',
            }}
          >
            {visible.map((project) => (
              <ProjectCard
                key={project.path}
                project={project}
                onOpen={() => void openProject(project.path)}
                onExportPdf={() => void exportProjectPdfFile(project.path)}
                onExportArchive={() =>
                  void exportProjectArchiveFile(project.path)
                }
                onDelete={() => setDeleteProjectTarget(project)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map((project) => (
              <div
                key={project.path}
                className="project-list-row"
                data-project-path={project.path}
                role="button"
                tabIndex={0}
                onClick={() => void openProject(project.path)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void openProject(project.path);
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {formatOpenedAt(project.modifiedAt)}
                </span>
                <FolderOpen
                  size={14}
                  strokeWidth={1.5}
                  color="var(--text-secondary)"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          gridColumn: '3',
          gridRow: '3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {t('模板列表')}
        </span>
      </div>

      <section
        style={{
          gridColumn: '3',
          gridRow: '4 / 5',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div
          data-template-list
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1,
            minHeight: 0,
            paddingRight: 4,
          }}
        >
          {templates.length === 0 ? (
            <div
              style={{
                border: '1px dashed var(--border-secondary)',
                borderRadius: 6,
                padding: '24px 12px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {t('还没有模板，点击右上角“导入模板”')}
            </div>
          ) : (
            templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                onStart={() =>
                  setNewProjectOpen(true, template.id, template.name)
                }
                onPreview={() => void previewTemplate(template.id)}
                onEdit={() =>
                  void openProject(template.path, {
                    skipRecent: true,
                    displayName: template.name,
                  })
                }
                onDelete={() => handleDeleteTemplate(template)}
              />
            ))
          )}
        </div>
      </section>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        slotProps={{ paper: { sx: { width: 400, borderRadius: '6px' } } }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>
          {t('删除模板')}
        </DialogTitle>
        <DialogContent sx={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {t('确定删除模板“{name}”吗？模板文件会从本机移除，此操作不可撤销。', {
            name: deleteTarget?.name ?? '',
          })}
        </DialogContent>
        <DialogActions sx={{ padding: '12px 20px 16px' }}>
          <Button size="small" onClick={() => setDeleteTarget(null)}>
            {t('取消')}
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => void confirmDeleteTemplate()}
          >
            {t('删除')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!deleteProjectTarget}
        onClose={() => setDeleteProjectTarget(null)}
        slotProps={{ paper: { sx: { width: 420, borderRadius: '6px' } } }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>
          {t('删除项目')}
        </DialogTitle>
        <DialogContent sx={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {t(
            '确定删除项目“{name}”吗？项目文件夹会被移到回收站，并从列表中移除。',
            {
              name: deleteProjectTarget?.name ?? '',
            },
          )}
        </DialogContent>
        <DialogActions sx={{ padding: '12px 20px 16px' }}>
          <Button size="small" onClick={() => setDeleteProjectTarget(null)}>
            {t('取消')}
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => {
              const target = deleteProjectTarget;
              setDeleteProjectTarget(null);
              if (target) void deleteProjectFolder(target.path);
            }}
          >
            {t('删除')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
