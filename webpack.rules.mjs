// 基础规则：主进程使用。
// 渲染器 / preload 使用下方的 rendererRules，避免直接 push 共享数组造成规则串味。
export const rules = [
  {
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.(ts|tsx)$/,
    exclude: /node_modules/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: [
          '@babel/preset-typescript',
          ['@babel/preset-react', { runtime: 'automatic', development: false }],
        ],
      },
    },
  },
  {
    test: /\.jsx?$/,
    exclude: /node_modules/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: [
          ['@babel/preset-react', { runtime: 'automatic', development: false }],
        ],
      },
    },
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
];

// 渲染器规则：CSS 交给 style-loader；wasm 分两类处理。
// codemirror-lang-typst 的 wasm-pack 产物按 ESM 方式 import wasm 命名导出，
// 需要 webpack 的 asyncWebAssembly；typst.ts 渲染器则要 URL（asset/resource）。
export const rendererRules = [
  ...rules,
  {
    test: /\.css$/,
    use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
  },
  {
    test: /\.wasm$/,
    include: /codemirror-lang-typst/,
    type: 'webassembly/async',
  },
  {
    test: /\.wasm$/,
    exclude: /codemirror-lang-typst/,
    type: 'asset/resource',
  },
];
