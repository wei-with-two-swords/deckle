import { rules } from './webpack.rules.mjs';

export default {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main/index.ts',
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  // 只装了 win32-x64 的原生包，其余平台的 optional 依赖解析失败是预期行为。
  ignoreWarnings: [
    /Can't resolve '@myriaddreamin\/typst-ts-node-compiler-/,
    /Can't resolve '\.\/typst-ts-node-compiler\./,
  ],
};
