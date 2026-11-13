import { CaseSensitive, Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { SearchHit } from '../../shared/types';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

function baseName(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[parts.length - 1] ?? relativePath;
}

function dirName(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts.slice(0, -1).join('/');
}

export function SearchPanel() {
  const project = useAppStore((state) => state.project);
  const openFile = useAppStore((state) => state.openFile);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!project || trimmed.length === 0) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.typstor.project
        .search(project.path, trimmed, caseSensitive)
        .then((result) => {
          if (seq !== requestSeq.current) return;
          if (result.ok) {
            setHits(result.data);
            setError(null);
          } else {
            setHits([]);
            setError(result.message);
          }
          setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [project, query, caseSensitive]);

  if (!project) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 24,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        {t('打开项目后可以搜索')}
      </div>
    );
  }

  return (
    <div
      data-search-panel
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '4px 10px 8px', display: 'flex', gap: 4 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            padding: '0 8px',
            border: '1px solid var(--border-input, var(--border-secondary))',
            borderRadius: 4,
            background: 'var(--action-secondary-shaded)',
          }}
        >
          <Search size={14} strokeWidth={1.6} color="var(--text-secondary)" />
          <input
            autoFocus
            aria-label={t('搜索项目')}
            value={query}
            placeholder={t('搜索 .typ 文件')}
            onChange={(event) => setQuery(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 12.5,
            }}
          />
        </div>
        <button
          type="button"
          aria-label={t('区分大小写')}
          aria-pressed={caseSensitive}
          title={t('区分大小写')}
          onClick={() => setCaseSensitive((value) => !value)}
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-secondary)',
            borderRadius: 4,
            background: caseSensitive
              ? 'var(--action-secondary-active)'
              : 'transparent',
            color: caseSensitive
              ? 'var(--action-primary)'
              : 'var(--text-secondary)',
            cursor: 'default',
          }}
        >
          <CaseSensitive size={15} strokeWidth={1.6} />
        </button>
      </div>

      <div
        style={{
          padding: '0 12px 6px',
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        {loading
          ? t('搜索中…')
          : error
            ? error
            : query.trim()
              ? t('{count} 个结果', { count: hits.length })
              : t('输入关键词搜索项目')}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 18,
              color: 'var(--text-secondary)',
            }}
          >
            <Loader2 size={16} className="spin" />
          </div>
        )}
        {!loading &&
          hits.map((hit) => (
            <button
              key={`${hit.path}:${hit.line}:${hit.column}`}
              type="button"
              data-search-path={hit.path}
              data-search-line={hit.line}
              onClick={() => {
                const separator = project.path.includes('\\') ? '\\' : '/';
                const absolute = `${project.path.replace(/[\\/]+$/, '')}${separator}${hit.path.replace(
                  /[\\/]+/g,
                  separator,
                )}`;
                void openFile(absolute).then((opened) => {
                  if (!opened) return;
                  window.setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent('typstor:goto-line', {
                        detail: { line: hit.line, column: hit.column },
                      }),
                    );
                  }, 120);
                });
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 12px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'default',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background =
                  'var(--action-secondary-shaded)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'baseline',
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>{baseName(hit.path)}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  {dirName(hit.path)}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  :{hit.line + 1}
                </span>
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11.5,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {hit.preview}
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
