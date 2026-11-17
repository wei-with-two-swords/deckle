import type { DeckleApi } from '../shared/api';

declare global {
  interface Window {
    deckle: DeckleApi & { platform: string };
    __deckleEditor?: import('@codemirror/view').EditorView;
    __deckleStore?: typeof import('./store/appStore').useAppStore;
  }
}

export {};
