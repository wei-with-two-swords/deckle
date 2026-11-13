import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function ConflictDialog() {
  const conflict = useAppStore((s) => s.conflict);
  const resolveConflict = useAppStore((s) => s.resolveConflict);
  const [busy, setBusy] = useState(false);

  const run = async (action: 'reload' | 'overwrite' | 'cancel') => {
    if (busy) return;
    setBusy(true);
    await resolveConflict(action);
    setBusy(false);
  };

  return (
    <Dialog
      open={Boolean(conflict)}
      onClose={() => {
        if (!busy) void resolveConflict('cancel');
      }}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: 440,
            backgroundColor: 'var(--layer-1)',
            backgroundImage: 'none',
            borderRadius: '6px',
            boxShadow: 'var(--effect-shadow-modal)',
          },
        },
      }}
    >
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, padding: '16px 20px' }}>
        {t('文件已被外部修改')}
      </DialogTitle>
      <DialogContent sx={{ padding: '4px 20px 8px' }}>
        <Typography
          sx={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}
        >
          {t(
            '「{file}」在磁盘上已被其他程序修改。你的本地编辑还没有保存，请选择如何处理：',
            {
              file: conflict ? basename(conflict.path) : t('当前文件'),
            },
          )}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ padding: '12px 20px 16px', gap: 1 }}>
        <Button
          onClick={() => void run('cancel')}
          disabled={busy}
          sx={{ color: 'var(--text-primary)' }}
        >
          {t('取消')}
        </Button>
        <Button onClick={() => void run('reload')} disabled={busy}>
          {t('重新载入磁盘版本')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => void run('overwrite')}
          disabled={busy}
        >
          {t('覆盖保存')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
