import { CircleAlert, CircleX, FileText } from 'lucide-react';
import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import type { CompileDiagnostic } from '../../shared/types';
import { t } from '../lib/i18n';

/** 项目内路径显示相对路径；包内路径 / 未定位的诊断显示原值。 */
function displayPath(path: string, projectPath: string): string {
  if (!path) return t('项目（未定位到文件）');
  const normalized = path.replace(/\\/g, '/');
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (root && normalized.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return normalized.slice(root.length + 1);
  }
  return normalized;
}

interface IssueGroup {
  path: string;
  label: string;
  items: CompileDiagnostic[];
  errors: number;
}

function IssueRow({
  item,
  onJump,
}: {
  item: CompileDiagnostic;
  onJump: () => void;
}) {
  const isError = item.severity === 1;
  const Icon = isError ? CircleX : CircleAlert;
  return (
    <button
      type="button"
      data-issue-line={item.startLine}
      data-issue-path={item.path}
      onClick={onJump}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 12px 8px 16px',
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        color: 'var(--text-primary)',
        cursor: 'default',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--action-secondary-shaded)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon
        size={15}
        strokeWidth={1.6}
        style={{
          flex: 'none',
          marginTop: 1,
          color: isError
            ? 'var(--text-critical)'
            : 'var(--text-warning, #b14c00)',
        }}
      />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {item.message}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
        >
          {t('第 {line} 行 · 第 {column} 列', {
            line: item.startLine + 1,
            column: item.startColumn + 1,
          })}
        </span>
      </span>
    </button>
  );
}

export default function IssuesList() {
  const project = useAppStore((s) => s.project);
  const diagnostics = useAppStore((s) => s.diagnostics);

  const errorCount = diagnostics.filter((item) => item.severity === 1).length;
  const warningCount = diagnostics.length - errorCount;

  // 全局诊断按所属文件分组：错误多的文件排前面，同组内保持编译器返回顺序。
  const groups = useMemo<IssueGroup[]>(() => {
    const map = new Map<string, CompileDiagnostic[]>();
    for (const item of diagnostics) {
      const key = item.path || '';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .map(([path, items]) => ({
        path,
        label: displayPath(path, project?.path ?? ''),
        items,
        errors: items.filter((item) => item.severity === 1).length,
      }))
      .sort((a, b) => b.errors - a.errors || a.label.localeCompare(b.label));
  }, [diagnostics, project?.path]);

  const jump = (item: CompileDiagnostic) => {
    // 无路径（包内/合成诊断）或明显不是文件路径时不跳转，避免误开文件。
    if (!item.path || !/[\\/]/.test(item.path)) return;
    window.dispatchEvent(
      new CustomEvent('typstor:goto-line', {
        detail: {
          file: item.path,
          line: item.startLine,
          column: item.startColumn,
        },
      }),
    );
  };

  if (!project) {
    return (
      <div
        style={{ padding: 16, fontSize: 12, color: 'var(--text-secondary)' }}
      >
        {t('打开项目后显示编译问题')}
      </div>
    );
  }

  if (diagnostics.length === 0) {
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
          color: 'var(--text-secondary)',
        }}
      >
        <CircleAlert size={36} strokeWidth={1.2} style={{ opacity: 0.6 }} />
        <div style={{ fontSize: 12 }}>{t('没有编译问题')}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        data-issues-summary
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 32,
          padding: '0 12px',
          borderBottom: '1px solid var(--border-secondary)',
          fontSize: 11.5,
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('全项目')}
        </span>
        <span
          style={{
            color: errorCount ? 'var(--text-critical)' : undefined,
            fontWeight: errorCount ? 600 : 400,
          }}
        >
          {t('{count} 个错误', { count: errorCount })}
        </span>
        <span>·</span>
        <span>{t('{count} 个警告', { count: warningCount })}</span>
        <span style={{ marginLeft: 'auto' }}>
          {t('{count} 个文件', { count: groups.length })}
        </span>
      </div>
      <div
        style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 12 }}
      >
        {groups.map((group) => (
          <div key={group.path || '__unlocated__'}>
            <div
              data-issue-group={group.label}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 28,
                padding: '0 12px',
                background: 'var(--layer-2)',
                borderBottom: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              <FileText
                size={13}
                strokeWidth={1.6}
                style={{ flexShrink: 0, color: 'var(--text-secondary)' }}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {group.label}
              </span>
              {group.errors > 0 && (
                <span style={{ color: 'var(--text-critical)' }}>
                  {group.errors}
                </span>
              )}
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                {t('{count} 条', { count: group.items.length })}
              </span>
            </div>
            {group.items.map((item, index) => (
              <IssueRow
                key={`${item.path}:${item.startLine}:${item.startColumn}:${index}`}
                item={item}
                onJump={() => jump(item)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
