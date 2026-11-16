import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import webpack from 'webpack';
import mainConfig from '../webpack.main.config.mjs';
import preloadConfig from '../webpack.preload.config.mjs';
import rendererConfig from '../webpack.renderer.config.mjs';
import utilityConfig from '../webpack.utility.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createConfigs({ mode = 'production' } = {}) {
  return [
    ['main', mainConfig({ mode })],
    ['utility', utilityConfig({ mode })],
    ['preload', preloadConfig({ mode })],
    ['renderer', rendererConfig({ mode })],
  ];
}

function summarize(name, stats) {
  const info = stats.toJson({
    all: false,
    assets: true,
    errors: true,
    warnings: true,
  });
  const assets = (info.assets ?? [])
    .map((asset) => asset.name)
    .filter((file) => !file.endsWith('.map') && !file.endsWith('.LICENSE.txt'));
  console.log(
    `[webpack:${name}] ${stats.hasWarnings() ? 'warnings' : 'ok'} — ${assets.length} assets`,
  );
  for (const warning of (info.warnings ?? []).slice(0, 5)) {
    console.warn(
      `[webpack:${name}] warning: ${typeof warning === 'string' ? warning : warning.message}`,
    );
  }
}

function runOnce(name, config) {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config);
    compiler.run((error, stats) => {
      const finish = (err) => {
        compiler.close(() => (err ? reject(err) : resolve()));
      };
      if (error) return finish(error);
      if (!stats) return finish(new Error(`[webpack:${name}] 没有返回 stats`));
      if (stats.hasErrors()) {
        return finish(
          new Error(
            `[webpack:${name}] 编译失败\n${stats.toString({ colors: false, errors: true })}`,
          ),
        );
      }
      summarize(name, stats);
      finish(null);
    });
  });
}

/** 清空旧产物后依次编译四个 target（共用 .webpack/renderer，必须串行）。 */
export async function buildAll({ mode = 'production' } = {}) {
  await fs.rm(path.resolve(root, '.webpack'), { recursive: true, force: true });
  for (const [name, config] of createConfigs({ mode })) {
    await runOnce(name, config);
  }
  console.log(`[webpack] ${mode} 构建完成 → .webpack/`);
}

/** watch 模式：任一 target 产物变化时触发 onChange（已做 300ms 去抖）。 */
export function watchAll({ mode = 'development', onChange = () => {} } = {}) {
  const configs = createConfigs({ mode });
  let completed = 0;
  let resolveFirst;
  const firstBuild = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  let timer = null;
  function scheduleChange() {
    clearTimeout(timer);
    timer = setTimeout(onChange, 300);
  }

  const watchers = configs.map(([name, config]) =>
    webpack(config).watch(
      { aggregateTimeout: 200, ignored: /node_modules/ },
      (error, stats) => {
        if (error) {
          console.error(`[webpack:${name}]`, error);
          return;
        }
        if (!stats) return;
        if (stats.hasErrors()) {
          console.error(
            `[webpack:${name}] 编译失败\n${stats.toString({ colors: false, errors: true })}`,
          );
          return;
        }
        summarize(name, stats);
        completed += 1;
        if (completed === configs.length) resolveFirst();
        scheduleChange();
      },
    ),
  );

  return {
    firstBuild,
    close: () =>
      Promise.all(
        watchers.map(
          (watcher) => new Promise((resolve) => watcher.close(resolve)),
        ),
      ),
  };
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const mode = process.argv.includes('--dev') ? 'development' : 'production';
  buildAll({ mode }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
