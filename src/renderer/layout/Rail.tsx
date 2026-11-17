import { useState } from 'react';
import {
  CircleAlert,
  CircleHelp,
  Folder,
  ListTree,
  Search,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from '@mui/material';
import type { RailView } from '../../shared/types';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

/** 保留中文源串，渲染时再翻译，避免模块加载时锁定语言。 */
const TOP: Array<{ view: RailView; label: string; icon: LucideIcon }> = [
  { view: 'files', label: '文件', icon: Folder },
  { view: 'search', label: '搜索', icon: Search },
  { view: 'outline', label: '大纲', icon: ListTree },
  { view: 'issues', label: '问题', icon: CircleAlert },
];

function RailButton({
  label,
  title,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  active?: boolean;
  badge?: { count: number; tone: 'error' | 'warning' };
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const background = active
    ? 'var(--action-secondary-active)'
    : hover
      ? 'var(--action-secondary-hover)'
      : 'transparent';
  return (
    <Tooltip title={title ?? label} placement="right">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative',
          width: 56,
          height: 56,
          padding: 18,
          display: 'grid',
          placeItems: 'center',
          border: 'none',
          background,
          color: active
            ? 'var(--action-primary)'
            : hover
              ? 'var(--text-primary)'
              : 'var(--text-nav)',
          cursor: 'default',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        {active && (
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 16,
              width: 2,
              height: 24,
              background: 'var(--action-primary)',
              borderRadius: '0 2px 2px 0',
            }}
          />
        )}
        {children}
        {badge && badge.count > 0 && (
          <span
            data-rail-badge={label}
            aria-label={t('{count} 个{kind}', {
              count: badge.count,
              kind: badge.tone === 'error' ? t('错误') : t('警告'),
            })}
            style={{
              position: 'absolute',
              top: 7,
              right: 5,
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              borderRadius: 7,
              background:
                badge.tone === 'error'
                  ? 'var(--action-critical)'
                  : 'var(--text-warning)',
              color: 'var(--on-critical)',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
              textAlign: 'center',
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          >
            {badge.count > 99 ? '99+' : badge.count}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export default function Rail() {
  const view = useAppStore((s) => s.view);
  const railView = useAppStore((s) => s.railView);
  const panelVisible = useAppStore((s) => s.panelVisible);
  const setRailView = useAppStore((s) => s.setRailView);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const diagnostics = useAppStore((s) => s.diagnostics);
  const projectLabel = view === 'project' ? t('项目设置') : t('应用设置');

  // 全局错误/警告角标：不随当前打开的文件变化，编译诊断是全项目汇总。
  const errorCount = diagnostics.filter((item) => item.severity === 1).length;
  const warningCount = diagnostics.length - errorCount;
  const issuesBadge =
    errorCount > 0
      ? { count: errorCount, tone: 'error' as const }
      : warningCount > 0
        ? { count: warningCount, tone: 'warning' as const }
        : undefined;
  const issuesTitle =
    errorCount > 0 || warningCount > 0
      ? t('问题（全项目 {errors} 个错误 · {warnings} 个警告）', {
          errors: errorCount,
          warnings: warningCount,
        })
      : t('问题');

  return (
    <nav
      aria-label={t('主导航')}
      style={{
        gridArea: '2 / 1 / 3 / 2',
        margin: '4px 0',
        width: 56,
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column' }}>
        {view === 'project' &&
          TOP.map(({ view: itemView, label, icon: Icon }) => (
            <RailButton
              key={itemView}
              label={t(label)}
              title={itemView === 'issues' ? issuesTitle : undefined}
              badge={itemView === 'issues' ? issuesBadge : undefined}
              active={panelVisible && railView === itemView}
              onClick={() => setRailView(itemView)}
            >
              <Icon size={20} strokeWidth={1.5} />
            </RailButton>
          ))}
      </div>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }}
      >
        <RailButton
          label={projectLabel}
          active={false}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={20} strokeWidth={1.5} />
        </RailButton>
        <RailButton
          label={t('帮助')}
          active={false}
          onClick={() => setSettingsOpen(true, 'about')}
        >
          <CircleHelp size={20} strokeWidth={1.5} />
        </RailButton>
        <div
          aria-label="Deckle"
          style={{
            height: 158,
            paddingBottom: 12,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            color: 'var(--text-nav)',
          }}
        >
          <span
            style={{
              writingMode: 'vertical-rl',
              transform: 'translateX(-4px) rotate(180deg)',
              fontFamily: "'Times New Roman', Times, serif",
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: '0.12em',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            Deckle
          </span>
        </div>
      </div>
    </nav>
  );
}
