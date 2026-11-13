import { Copy, Minus, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../lib/i18n';

/** 标题栏窗口级按钮的统一外观：46×40 全高、无圆角、hover 换底。 */
export function ControlButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="no-drag"
      style={{
        width: 46,
        height: 40,
        display: 'grid',
        placeItems: 'center',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-nav)',
        cursor: 'default',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = danger
          ? '#c42b1c'
          : 'var(--action-secondary-hover)';
        event.currentTarget.style.color = danger
          ? '#ffffff'
          : 'var(--text-primary)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
        event.currentTarget.style.color = 'var(--text-nav)';
      }}
    >
      {children}
    </button>
  );
}

export default function WindowControls({ maximized }: { maximized: boolean }) {
  const api = window.typstor.window;

  return (
    <div className="no-drag" style={{ display: 'flex', height: 40 }}>
      <ControlButton label={t('最小化')} onClick={() => void api.minimize()}>
        <Minus size={14} strokeWidth={1.5} />
      </ControlButton>
      <ControlButton
        label={maximized ? t('还原') : t('最大化')}
        onClick={() => void api.toggleMaximize()}
      >
        {maximized ? (
          <Copy size={13} strokeWidth={1.5} />
        ) : (
          <Square size={12} strokeWidth={1.5} />
        )}
      </ControlButton>
      <ControlButton
        label={t('关闭')}
        danger
        onClick={() => void api.close(false)}
      >
        <X size={15} strokeWidth={1.5} />
      </ControlButton>
    </div>
  );
}
