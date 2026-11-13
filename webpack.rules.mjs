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
