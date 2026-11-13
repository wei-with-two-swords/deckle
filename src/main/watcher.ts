import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import { CH } from '../shared/channels';
import type { ProjectWatchChange } from '../shared/types';
import { getMainWindow } from './window';
import { t } from './i18n';

/** 不参与监听的项目内目录（与项目服务忽略规则保持一致）。 */
const IGNORED_DIRS = new Set([
  '.typstor',
  '.git',
  'node_modules',
  'out',
  '.webpack',
  'tmp',
  '.npm-cache',
]);

let watcher: FSWatcher | null = null;
let watchedRoot: string | null = null;

function shouldIgnore(absolutePath: string, projectRoot: string): boolean {
  const relative = path.relative(projectRoot, absolutePath);
  if (!relative) return false;
  const segments = relative.split(/[\\/]+/);
  if (segments.some((segment) => IGNORED_DIRS.has(segment))) return true;
  const base = segments[segments.length - 1] ?? '';
  return (
    base.endsWith('.swp') || base.endsWith('~') || base.startsWith('.smoke')
  );
}

/** 开始监听项目目录；重复调用同一项目时复用现有 watcher。 */
export function startProjectWatcher(projectPath: string): void {
  if (watchedRoot === projectPath && watcher) return;
  stopProjectWatcher();
  watchedRoot = projectPath;
  const root = projectPath;

  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    depth: 12,
    ignored: (candidate) => shouldIgnore(path.resolve(candidate), root),
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
  });

  const emit = (
    event: ProjectWatchChange['event'],
    absolutePath: string,
  ): void => {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || !watchedRoot) return;
    const relative = path.relative(watchedRoot, absolutePath);
    if (!relative || relative.startsWith('..')) return;
    const change: ProjectWatchChange = {
      kind: 'tree',
      event,
      path: relative.split(path.sep).join('/'),
    };
    win.webContents.send(CH.PROJECT_WATCH_EVENT, change);
  };

  watcher.on('add', (p) => emit('add', p));
  watcher.on('addDir', (p) => emit('addDir', p));
  watcher.on('unlink', (p) => emit('unlink', p));
  watcher.on('unlinkDir', (p) => emit('unlinkDir', p));
  watcher.on('change', (p) => emit('change', p));
  watcher.on('error', (error) => {
    console.warn(t('[watcher] 监听失败'), error);
  });
}

export function stopProjectWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  watchedRoot = null;
}
