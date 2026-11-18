/**
 * napi-rs 的 index-napi.js 通过 `__webpack_require__.ab` 定位被
 * @vercel/webpack-asset-relocator-loader 输出的原生二进制。某些 webpack
 * 版本不再自动注入这个运行时变量，导致代码退化成
 * `require("undefined" + "xxx.node")`，utilityProcess 启动即退出。
 *
 * 这个 loader 只包住 index-napi.js，在模块执行前补上 asset base。
 */
module.exports = function nativeAssetBaseLoader(source) {
  return `__webpack_require__.ab = __dirname + "/native_modules/";\n${source}`;
};
