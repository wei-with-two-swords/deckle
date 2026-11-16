import { useAppStore } from '../store/appStore';

export default function Toast() {
  const toast = useAppStore((s) => s.toast);
  if (!toast) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 1400,
        maxWidth: 520,
        padding: '8px 14px',
        borderRadius: 6,
        background: 'var(--toast-bg)',
        color: 'var(--toast-text)',
        fontSize: 13,
        boxShadow: 'var(--effect-shadow-toast)',
        borderLeft:
          toast.kind === 'error' ? '3px solid var(--action-critical)' : 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      {toast.text}
    </div>
  );
}
