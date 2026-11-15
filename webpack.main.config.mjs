import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rules } from './webpack.rules.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * 主进程 bundle。输出路径必须与 src/main/protocol.ts 里约定的
 * `.webpack/main` / `.webpack/renderer` 布局保持一致。
 */
export default function mainConfig({ mode = 'production' } = {}) {
  return {
    mode,
    target: 'electron-main',
    devtool: 'source-map',
    entry: path.resolve(root, 'src/main/index.ts'),
    output: {
      path: path.resolve(root, '.webpack/main'),
      filename: 'index.cjs',
      libraryTarget: 'commonjs2',
    },
    module: { rules },
    resolve: { extensions: ['.js', '.ts', '.json'] },
    node: { __dirname: false, __filename: false },
    // 只装了 win32-x64 的原生包，其余平台的 optional 依赖解析失败是预期行为。
    ignoreWarnings: [
      /Can't resolve '@myriaddreamin\/typst-ts-node-compiler-/,
      /Can't resolve '\.\/typst-ts-node-compiler\./,
    ],
  };
}
