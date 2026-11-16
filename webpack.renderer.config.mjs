import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import AssetRelocatorPatch from './scripts/webpack/AssetRelocatorPatch.mjs';
import { rendererRules } from './webpack.rules.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * 生产 CSP。blob:/data: 是 typst.ts 图片解码与字体加载必需的；
 * 'wasm-unsafe-eval' 允许编译 WASM，脚本本身仍禁止 inline/eval。
 * 开发环境不注入（eval-source-map 需要 eval）。
 */
const PRODUCTION_CSP = [
  "default-src 'self' typstor: blob: data:;",
  "script-src 'self' typstor: 'wasm-unsafe-eval';",
  "style-src 'self' 'unsafe-inline' typstor:;",
  "img-src 'self' typstor: blob: data:;",
  "font-src 'self' typstor: data:;",
  "connect-src 'self' typstor: blob: data:;",
  "worker-src 'self' typstor: blob:;",
].join(' ');

/** 渲染器 bundle + index.html，输出到 .webpack/renderer。 */
export default function rendererConfig({ mode = 'production' } = {}) {
  const production = mode === 'production';

  return {
    mode,
    target: 'web',
    devtool: production ? false : 'eval-source-map',
    entry: { main_window: path.resolve(root, 'src/renderer/index.tsx') },
    output: {
      path: path.resolve(root, '.webpack/renderer'),
      filename: '[name]/index.js',
      globalObject: 'self',
    },
    module: { rules: rendererRules },
    experiments: { asyncWebAssembly: true },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.wasm'],
    },
    node: { __dirname: false, __filename: false },
    plugins: [
      new AssetRelocatorPatch(),
      new HtmlWebpackPlugin({
        title: 'Typstor',
        template: path.resolve(root, 'src/renderer/index.html'),
        filename: 'main_window/index.html',
        chunks: ['main_window'],
        templateParameters: { csp: production ? PRODUCTION_CSP : '' },
      }),
    ],
  };
}
