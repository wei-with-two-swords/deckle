import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rules } from './webpack.rules.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

/** 编译子进程 bundle：运行在 ELECTRON_RUN_AS_NODE 环境，路径与主进程一致。 */
export default function utilityConfig({ mode = 'production' } = {}) {
  return {
    mode,
    target: 'node',
    devtool: mode === 'production' ? false : 'source-map',
    entry: path.resolve(root, 'src/main/compileWorker.ts'),
    output: {
      path: path.resolve(root, '.webpack/utility'),
      filename: 'compile.cjs',
      libraryTarget: 'commonjs2',
    },
    module: {
      rules: [
        {
          test: /@myriaddreamin[\\/]typst-ts-node-compiler[\\/]index-napi\.js$/,
          use: [
            {
              loader: path.resolve(
                root,
                'scripts/native-asset-base-loader.cjs',
              ),
            },
          ],
        },
        ...rules,
      ],
    },
    resolve: { extensions: ['.js', '.ts', '.json'] },
    node: { __dirname: false, __filename: false },
    ignoreWarnings: [
      /Can't resolve '@myriaddreamin\/typst-ts-node-compiler-/,
      /Can't resolve '\.\/typst-ts-node-compiler\./,
    ],
  };
}
