/**
 * 复刻 Electron Forge WebpackPlugin 的 AssetRelocatorPatch。
 *
 * @vercel/webpack-asset-relocator-loader 会在 bundle 里注入
 *   `__webpack_require__.ab = __dirname + "/"`
 * 用来定位它发射出来的资源。渲染器 / preload 跑在 web target 且
 * nodeIntegration=false，运行时没有 __dirname；Forge 在生产构建里把
 * 它替换成空串，资源 URL 相对应用根解析（deckle://app/...）。
 *
 * 迁移到自建 webpack 链后必须保留这个补丁，否则 asset/resource 的
 * wasm 与 native_modules 里的资源会取到错误路径。
 */
export default class AssetRelocatorPatch {
  apply(compiler) {
    compiler.hooks.compilation.tap('asset-relocator-patch', (compilation) => {
      compilation.mainTemplate.hooks.requireExtensions.intercept({
        register: (tapInfo) => {
          if (tapInfo.name !== 'asset-relocator-loader') return tapInfo;

          const originalFn = tapInfo.fn;
          tapInfo.fn = (source, chunk) => {
            const injected = originalFn(source, chunk);
            if (!injected.includes('__webpack_require__.ab = __dirname + ')) {
              throw new Error(
                '当前 @vercel/webpack-asset-relocator-loader 版本与 AssetRelocatorPatch 不兼容',
              );
            }
            return injected.replace('__dirname', '""');
          };
          return tapInfo;
        },
      });
    });
  }
}
