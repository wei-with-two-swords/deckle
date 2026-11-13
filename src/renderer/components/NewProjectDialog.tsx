import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

export default function NewProjectDialog() {
  const open = useAppStore((s) => s.newProjectOpen);
  const templateName = useAppStore((s) => s.newProjectTemplateName);
  const setOpen = useAppStore((s) => s.setNewProjectOpen);
  const createProject = useAppStore((s) => s.createProject);

  const [name, setName] = useState(t('未命名项目'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(t('未命名项目'));
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    const created = await createProject(name.trim());
    setBusy(false);
    if (created) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) setOpen(false);
      }}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: 420,
            backgroundColor: 'var(--layer-1)',
            backgroundImage: 'none',
            borderRadius: '6px',
            boxShadow: 'var(--effect-shadow-modal)',
          },
        },
      }}
    >
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, padding: '16px 20px' }}>
        {t('新建项目')}
        <span
          style={{
            marginLeft: 8,
            fontSize: 12,
            fontWeight: 400,
            color: 'var(--text-secondary)',
          }}
        >
          {t(templateName)}
        </span>
      </DialogTitle>
      <DialogContent sx={{ padding: '4px 20px 8px' }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label={t('项目名称')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          helperText={t('创建后会打开系统对话框选择存放位置')}
        />
      </DialogContent>
      <DialogActions sx={{ padding: '12px 20px 16px' }}>
        <Button
          onClick={() => setOpen(false)}
          disabled={busy}
          sx={{ color: 'var(--text-primary)' }}
        >
          {t('取消')}
        </Button>
        <Button
          variant="contained"
          disabled={busy || !name.trim()}
          onClick={() => void submit()}
        >
          {busy ? t('创建中…') : t('选择位置并创建')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
