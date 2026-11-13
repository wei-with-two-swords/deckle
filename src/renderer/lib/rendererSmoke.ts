import { useEffect, useState } from 'react';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';
import wasmUrl from '@myriaddreamin/typst-ts-renderer/wasm';

export type RendererSmoke = 'idle' | 'loading' | 'ready' | 'error';

type TypstRenderer = ReturnType<typeof createTypstRenderer>;

let task: Promise<void> | null = null;
let cached: RendererSmoke = 'idle';
let instance: TypstRenderer | null = null;

export function getTypstRenderer(): TypstRenderer | null {
  return instance;
}

export function initRendererSmoke(): Promise<void> {
  if (!task) {
    cached = 'loading';
    task = (async () => {
      const renderer = createTypstRenderer();
      await renderer.init({
        getModule: () => wasmUrl,
      });
      instance = renderer;
    })();
  }
  return task;
}

export function useRendererSmoke(): {
  status: RendererSmoke;
  error: string | null;
  retry(): void;
} {
  const [status, setStatus] = useState<RendererSmoke>(cached);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    initRendererSmoke()
      .then(() => {
        cached = 'ready';
        if (alive) setStatus('ready');
      })
      .catch((reason: unknown) => {
        cached = 'error';
        if (alive) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setStatus('error');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return {
    status,
    error,
    retry() {
      task = null;
      cached = 'idle';
      setError(null);
      setStatus('idle');
      setTick((value) => value + 1);
      void initRendererSmoke()
        .then(() => {
          cached = 'ready';
          setStatus('ready');
        })
        .catch((reason: unknown) => {
          cached = 'error';
          setError(reason instanceof Error ? reason.message : String(reason));
          setStatus('error');
        });
    },
  };
}
