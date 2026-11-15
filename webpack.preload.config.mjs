import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AssetRelocatorPatch from './scripts/webpack/AssetRelocatorPatch.mjs';
import { rendererRules } from './webpack.rules.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

// preload 运行在 sandbox:false 的隔离世界，electron 等内建模块必须走 require。
const EXTERNALS = [
  'electron',
  'electron/renderer',
  'electron/common',
  'events',
  'timers',
  'url',
];

/** preload bundle，输出到 .webpack/renderer/main_window/preload.cjs。 */
export default function preloadConfig({ mode = 'production' } = {}) {
  const production = mode === 'production';

  return {
    mode,
    target: 'web',
    devtool: production ? false : 'eval-source-map',
    entry: { main_window: path.resolve(root, 'src/preload/index.ts') },
    output: {
      path: path.resolve(root, '.webpack/renderer'),
      filename: '[name]/preload.cjs',
      globalObject: 'self',
      publicPath: production ? '' : '/',
    },
    externalsType: 'commonjs2',
    externals: EXTERNALS,
    module: { rules: rendererRules },
    experiments: { asyncWebAssembly: true },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.wasm'],
    },
    node: { __dirname: false, __filename: false },
    plugins: [new AssetRelocatorPatch()],
  };
}
