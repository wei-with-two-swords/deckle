import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import type { FileEntry } from '../../shared/types';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
}

function collectFiles(
  tree: Record<string, FileEntry[]>,
  dir: string,
  base: string,
  out: { path: string; label: string }[],
) {
  const entries = tree[dir];
  if (!entries) return;
  for (const entry of entries) {
    if (entry.kind === 'directory') {
      collectFiles(tree, entry.path, base, out);
      continue;
    }
    const relative = entry.path
      .slice(base.length)
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/');
    out.push({ path: entry.path, label: relative });
  }
}

export default function QuickOpen({ open, onClose }: QuickOpenProps) {
  const project = useAppStore((s) => s.project);
  const tree = useAppStore((s) => s.tree);
  const selectFile = useAppStore((s) => s.selectFile);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const files = useMemo(() => {
    if (!project) return [];
    const out: { path: string; label: string }[] = [];
    collectFiles(tree, project.path, project.path, out);
    return out;
  }, [project, tree]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? files.filter((file) => file.label.toLowerCase().includes(normalized))
      : files;
    return filtered.slice(0, 10);
  }, [files, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const choose = (path: string) => {
    selectFile(path);
    onClose();
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'var(--overlay-scrim)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 96,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--layer-1)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          boxShadow: 'var(--effect-shadow-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 44,
            padding: '0 12px',
            borderBottom: '1px solid var(--border-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          <Search size={15} strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('按文件名搜索…')}
            aria-label={t('快速打开文件')}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((value) =>
                  matches.length ? (value + 1) % matches.length : 0,
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((value) =>
                  matches.length
                    ? (value - 1 + matches.length) % matches.length
                    : 0,
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                if (matches[active]) choose(matches[active].path);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
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

        <div style={{ maxHeight: 320, overflow: 'auto', padding: 4 }}>
          {matches.length === 0 ? (
            <div
              style={{
                padding: '16px 12px',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {files.length
                ? t('没有匹配的文件')
                : t('项目里还没有已载入的文件')}
            </div>
          ) : (
            matches.map((file, index) => (
              <button
                key={file.path}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(file.path)}
                data-quick-open-path={file.path}
                style={{
                  width: '100%',
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 8px',
                  border: 'none',
                  borderRadius: 4,
                  background:
                    index === active
                      ? 'var(--action-secondary-hover)'
                      : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'default',
                }}
              >
                <FileText size={14} strokeWidth={1.5} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.label}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
