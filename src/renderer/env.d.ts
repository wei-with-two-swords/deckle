import type { TypstorApi } from '../shared/api';

declare global {
  interface Window {
    typstor: TypstorApi & { platform: string };
    __typstorEditor?: import('@codemirror/view').EditorView;
    __typstorStore?: typeof import('./store/appStore').useAppStore;
  }
}

export {};
