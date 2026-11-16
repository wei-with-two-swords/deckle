/**
 * electron-builder 配置（Windows / NSIS 向导安装包）。
 *
 * 产物目录结构与原 Electron Forge 版本保持一致：
 *   app.asar
 *   ├── .webpack/main/index.cjs
 *   ├── .webpack/main/native_modules/*.node   → asarUnpack
 *   ├── .webpack/renderer/**                  → typstor:// scheme 读取
 *   └── package.json
 *
 * webpack 已把所有 JS 依赖打进 bundle，因此 node_modules 不进包。
 */
export const builderConfig = {
  appId: 'com.typstor.app',
  productName: 'typstor',
  copyright: 'Copyright © 2026 wei',

  directories: {
    output: 'dist',
    buildResources: 'assets',
  },

  // 只打包编译产物；排除 sourcemap 与已被 bundle 的依赖目录。
  files: ['.webpack/**/*', 'package.json', '!**/*.map', '!node_modules/**/*'],

  asar: true,
  asarUnpack: ['.webpack/main/native_modules/**/*'],
  npmRebuild: false,

  // Electron 二进制走国内镜像；NSIS 工具包镜像由 scripts/dist.mjs 设置。
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },

  // 与 Forge FusesPlugin 完全相同的加固项，由 builder 内置实现。
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },

  win: {
    icon: 'assets/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    // 与旧 Squirrel 包保持同样的命名习惯：typstor-1.0.0 Setup.exe
    artifactName: '${productName}-${version} Setup.${ext}',
  },

  nsis: {
    // 关键：关闭一键安装，才出现「选择安装位置」等向导页面。
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // 按当前用户安装，不写 Program Files；允许写入受限时请求 UAC 提权。
    perMachine: false,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Typstor',
    // 简体中文安装界面（LCID 2052）。
    language: '2052',
    // 覆盖默认的「关闭运行中应用」检测：只处理安装目录内的进程，
    // 避免全局按 typstor.exe 进程名误伤旧 Squirrel 版 / 绿色版后弹「无法关闭」。
    // 文件位于 buildResources（assets/installer.nsh）。
    include: 'installer.nsh',
    // 生成 .blockmap，为以后接 electron-updater 的差分更新留通道。
    differentialPackage: true,
    // 卸载时保留 %APPDATA%\typstor 里的项目记录与设置。
    deleteAppDataOnUninstall: false,
  },
};
