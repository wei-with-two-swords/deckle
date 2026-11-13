import { createTheme } from '@mui/material/styles';
import type { ThemeMode } from '../../shared/types';

const LIGHT = {
  primary: '#007aff',
  layer1: '#fdfdfd',
  layer2: '#eff0f3',
  textPrimary: '#19181f',
  textSecondary: 'rgb(86 85 101)',
  divider: 'rgb(189 191 204)',
};

const DARK = {
  primary: '#3da8ff',
  layer1: '#19181f',
  layer2: '#2a2934',
  textPrimary: '#fdfdfd',
  textSecondary: 'rgb(163 167 183)',
  divider: '#3b3a48',
};

export function createAppTheme(mode: ThemeMode) {
  const colors = mode === 'dark' ? DARK : LIGHT;

  return createTheme({
    palette: {
      mode,
      primary: { main: colors.primary },
      background: { default: colors.layer2, paper: colors.layer1 },
      text: { primary: colors.textPrimary, secondary: colors.textSecondary },
      divider: colors.divider,
    },
    typography: {
      fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 6 },
    components: {
      MuiButtonBase: {
        defaultProps: { disableRipple: true },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 28, paddingInline: 10 },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: false },
        styleOverrides: {
          tooltip: {
            backgroundColor: '#3b3a48',
            color: '#fdfdfd',
            fontSize: 11,
            borderRadius: 4,
            padding: '4px 8px',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: 'var(--layer-1)',
            backgroundImage: 'none',
            boxShadow: 'var(--effect-shadow-menu)',
            border: '1px solid var(--border-modal)',
            borderRadius: 4,
            minWidth: 172,
            padding: 0,
          },
          list: { padding: '4px 0' },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            height: 28,
            minHeight: 28,
            padding: '0 12px',
            fontSize: 13,
          },
        },
      },
    },
  });
}
