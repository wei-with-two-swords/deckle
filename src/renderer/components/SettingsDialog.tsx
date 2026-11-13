import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Switch,
  TextField,
} from '@mui/material';
import type { AppInfo, Locale, ThemeMode } from '../../shared/types';
import { LOCALE_OPTIONS } from '../../shared/i18n';
import type { SettingsSection } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

type Tab = SettingsSection;

/** 保留中文源串，渲染时再翻译，避免模块加载时锁定语言。 */
const APP_TABS: Array<{ id: Tab; label: string }> = [
  { id: 'appearance', label: '外观' },
  { id: 'files', label: '文件' },
  { id: 'about', label: '关于' },
];

const PROJECT_TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: '常规' },
  { id: 'about', label: '关于' },
];

function Row({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        minHeight: 40,
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</div>
      <div>
        {children}
        {hint && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const section = useAppStore((s) => s.settingsSection);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const settings = useAppStore((s) => s.settings);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const patchSettings = useAppStore((s) => s.patchSettings);
  const view = useAppStore((s) => s.view);
  const project = useAppStore((s) => s.project);
  const updateProjectConfig = useAppStore((s) => s.updateProjectConfig);

  const isProject = view === 'project' && !!project;
  const tabs = isProject ? PROJECT_TABS : APP_TABS;
  const [tab, setTab] = useState<Tab>('appearance');
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftMainFile, setDraftMainFile] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const allowed = (isProject ? PROJECT_TABS : APP_TABS).some(
      (item) => item.id === section,
    );
    setTab(allowed && section ? section : isProject ? 'general' : 'appearance');
  }, [open, section, isProject]);

  useEffect(() => {
    if (!open) return;
    if (!info) {
      void window.typstor.app.info().then((result) => {
        if (result.ok) setInfo(result.data);
      });
    }
  }, [open, info]);

  useEffect(() => {
    if (!project) return;
    setDraftName(project.config.name);
    setDraftMainFile(project.config.mainFile);
  }, [project]);

  const dirty =
    isProject &&
    !!project &&
    (draftName.trim() !== project.config.name ||
      draftMainFile.trim() !== project.config.mainFile);

  const saveProject = async () => {
    if (!dirty) return;
    setSaving(true);
    const ok = await updateProjectConfig({
      name: draftName,
      mainFile: draftMainFile,
    });
    setSaving(false);
    if (ok) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: 560,
            minHeight: 420,
            backgroundColor: 'var(--layer-1)',
            backgroundImage: 'none',
            borderRadius: '6px',
            boxShadow: 'var(--effect-shadow-modal)',
          },
        },
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 20px',
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        {isProject ? t('项目设置') : t('设置')}
      </div>
      <Divider sx={{ borderColor: 'var(--border-modal)', margin: 0 }} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav
          style={{
            width: 140,
            padding: 8,
            borderRight: '1px solid var(--border-modal)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                height: 30,
                padding: '0 12px',
                textAlign: 'left',
                border: 'none',
                borderRadius: 4,
                background:
                  tab === item.id
                    ? 'var(--action-secondary-shaded)'
                    : 'transparent',
                color: 'var(--text-primary)',
                fontWeight: tab === item.id ? 600 : 400,
                fontSize: 13,
                cursor: 'default',
              }}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
          {/* 语言是应用级偏好，在 Dashboard 与项目内都可达。 */}
          <Row label={t('界面语言')}>
            <Select
              size="small"
              value={settings?.locale ?? 'zh-CN'}
              onChange={(event) =>
                void patchSettings({ locale: event.target.value as Locale })
              }
              sx={{ width: 220 }}
            >
              {LOCALE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </Row>
          <Divider
            sx={{ borderColor: 'var(--border-modal)', margin: '8px 0 12px' }}
          />

          {tab === 'general' && isProject && project && (
            <>
              <Row label={t('项目名称')}>
                <TextField
                  size="small"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  fullWidth
                />
              </Row>
              <Row
                label={t('主文件')}
                hint={t('相对项目根目录的 .typ 文件，编译与导出以它作为入口')}
              >
                <TextField
                  size="small"
                  value={draftMainFile}
                  onChange={(event) => setDraftMainFile(event.target.value)}
                  fullWidth
                />
              </Row>
              <Row label={t('项目位置')}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {project.path}
                </div>
              </Row>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                }}
              >
                {t(
                  '这里只配置当前项目。应用级设置（主题、关闭行为、字体目录）请回到\n                Dashboard 后打开“应用设置”。',
                )}
              </div>
            </>
          )}

          {tab === 'appearance' && !isProject && (
            <>
              <Row label={t('主题')}>
                <RadioGroup
                  row
                  value={theme}
                  onChange={(event) =>
                    void setTheme(event.target.value as ThemeMode)
                  }
                >
                  <FormControlLabel
                    value="light"
                    control={<Radio size="small" />}
                    label={t('亮色')}
                  />
                  <FormControlLabel
                    value="dark"
                    control={<Radio size="small" />}
                    label={t('暗色')}
                  />
                </RadioGroup>
              </Row>
              <Row label={t('关闭按钮行为')}>
                <Select
                  size="small"
                  value={settings?.closeAction ?? 'ask'}
                  onChange={(event) =>
                    void patchSettings({
                      closeAction: event.target.value as
                        | 'ask'
                        | 'app'
                        | 'window',
                    })
                  }
                  sx={{ width: 220 }}
                >
                  <MenuItem value="ask">{t('每次询问')}</MenuItem>
                  <MenuItem value="app">{t('关闭应用')}</MenuItem>
                  <MenuItem value="window">{t('只关闭窗口')}</MenuItem>
                </Select>
              </Row>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                {t('主题跟随应用设置，不自动跟随系统。')}
              </div>
            </>
          )}

          {tab === 'files' && !isProject && (
            <>
              <Row label={t('自动保存')} hint={t('编辑后自动保存文件内容')}>
                <Switch
                  size="small"
                  checked={settings?.editor.autosave ?? true}
                  onChange={(event) =>
                    void patchSettings({
                      editor: {
                        ...(settings?.editor ?? {
                          fontSize: 13,
                          tabSize: 2,
                          lineHeight: 1.4,
                          wordWrap: false,
                          autosave: true,
                        }),
                        autosave: event.target.checked,
                      },
                    })
                  }
                />
              </Row>
              <Row label={t('额外字体目录')} hint={t('为预览加载自定义字体')}>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  {(settings?.fonts.extraDirs ?? []).length === 0 ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {t('尚未添加目录')}
                    </div>
                  ) : (
                    settings?.fonts.extraDirs.map((dir) => (
                      <div
                        key={dir}
                        style={{
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {dir}
                      </div>
                    ))
                  )}
                </div>
              </Row>
            </>
          )}

          {tab === 'about' && (
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                Typstor
              </div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                {t('桌面版 Typst 论文编辑器')}
              </div>
              <div>
                {t('版本：')}
                {info?.version ?? '—'}
              </div>
              <div>
                {t('Electron：')}
                {info?.electron ?? '—'}
              </div>
              <div>
                {t('Node：')}
                {info?.node ?? '—'}
              </div>
              <div>
                {t('Chromium：')}
                {info?.chrome ?? '—'}
              </div>
              <div>{t('Typst 引擎：0.14.2（typst.ts 0.7.0）')}</div>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                }}
              >
                {t(
                  'Typst 编译器与 typst.ts 以 Apache-2.0 许可分发。界面图标来自\n                Lucide（ISC），界面与图标均为独立实现，不复制 typst.app\n                的图标或页面资源。Typstor 与 typst.app 无关联。',
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <Divider sx={{ borderColor: 'var(--border-modal)', margin: 0 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '12px 20px',
        }}
      >
        {isProject && tab === 'general' ? (
          <>
            <Button variant="outlined" onClick={() => setOpen(false)}>
              {t('取消')}
            </Button>
            <Button
              variant="contained"
              disabled={!dirty || saving}
              onClick={() => void saveProject()}
            >
              {saving ? t('保存中…') : t('保存')}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => setOpen(false)}>
            {t('完成')}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
