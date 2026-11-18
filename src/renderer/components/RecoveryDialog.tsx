import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';

import { useAppStore } from '../store/appStore';
import { t, useLocale } from '../lib/i18n';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function formatTime(value: number, locale: string): string {
  return new Date(value).toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RecoveryDialog() {
  const recovery = useAppStore((state) => state.recovery);
  const restoreSnapshot = useAppStore((state) => state.restoreSnapshot);
  const dismissRecovery = useAppStore((state) => state.dismissRecovery);
  const [busy, setBusy] = useState(false);
  const locale = useLocale();

  if (!recovery || recovery.length === 0) return null;

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) void dismissRecovery(false);
      }}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: 520,
            backgroundColor: 'var(--layer-1)',
            backgroundImage: 'none',
            borderRadius: '6px',
            boxShadow: 'var(--effect-shadow-modal)',
          },
        },
      }}
    >
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, padding: '16px 20px' }}>
        {t('发现未保存的快照')}
      </DialogTitle>
      <DialogContent sx={{ padding: '0 20px 8px' }}>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            marginBottom: 10,
          }}
        >
          {t(
            '这些文件在崩溃或关闭前还有未写入磁盘的内容，可以恢复其中一个版本。',
          )}
        </div>
        <div
          data-recovery-list
          style={{ maxHeight: 320, overflowY: 'auto', margin: '0 -4px' }}
        >
          {recovery.map((item) => (
            <div
              key={item.id}
              data-recovery-file={item.filePath}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 4px',
                borderTop: '1px solid var(--border-secondary)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {basename(item.filePath)}
                  </span>
                  <span
                    style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                  >
                    {formatTime(item.createdAt, locale)}
                  </span>
                  {!item.exists && (
                    <span style={{ fontSize: 11, color: 'var(--critical)' }}>
                      {t('文件已不存在')}
                    </span>
                  )}
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
                  {item.preview || t('（空内容）')}
                </div>
              </div>
              <IconButton
                size="small"
                aria-label={t('恢复快照')}
                disabled={busy || !item.exists}
                onClick={() => {
                  setBusy(true);
                  void restoreSnapshot(item.id).finally(() => setBusy(false));
                }}
                sx={{ width: 28, height: 28 }}
              >
                <Check size={15} />
              </IconButton>
            </div>
          ))}
        </div>
      </DialogContent>
      <DialogActions sx={{ padding: '12px 20px 16px', gap: 1 }}>
        <Button
          onClick={() => void dismissRecovery(true)}
          disabled={busy}
          sx={{ color: 'var(--text-secondary)' }}
          startIcon={<Trash2 size={14} />}
        >
          {t('丢弃全部')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void dismissRecovery(false)}
          disabled={busy}
        >
          {t('稍后')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
