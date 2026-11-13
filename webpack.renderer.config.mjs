import { rules } from './webpack.rules.mjs';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

// codemirror-lang-typst 的 wasm-pack 产物按 ESM 方式 import wasm 命名导出，
// 需要 webpack 的 asyncWebAssembly；typst.ts 渲染器则要 URL（asset/resource）。
rules.push({
  test: /\.wasm$/,
  include: /codemirror-lang-typst/,
  type: 'webassembly/async',
});

rules.push({
  test: /\.wasm$/,
  exclude: /codemirror-lang-typst/,
  type: 'asset/resource',
});

export default {
  module: {
    rules,
  },
  experiments: {
    asyncWebAssembly: true,
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.wasm'],
  },
};
