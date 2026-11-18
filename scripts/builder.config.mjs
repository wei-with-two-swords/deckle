/**
 * electron-builder 配置（Windows / NSIS 向导安装包）。
 *
 * 产物目录结构与原 Electron Forge 版本保持一致：
 *   app.asar
 *   ├── .webpack/main/index.cjs
 *   ├── .webpack/main/native_modules/*.node   → asarUnpack
 *   ├── .webpack/utility/compile.cjs          → 编译子进程
 *   ├── .webpack/utility/native_modules/*.node → asarUnpack
 *   ├── .webpack/renderer/**                  → deckle:// scheme 读取
 *   └── package.json
 *
 * webpack 已把所有 JS 依赖打进 bundle，因此 node_modules 不进包。
 */
export const builderConfig = {
  appId: 'com.deckle.app',
  productName: 'Deckle',
  copyright: 'Copyright © 2026 wei',

  directories: {
    output: 'dist',
    buildResources: 'assets',
  },

  // 只打包编译产物；排除 sourcemap 与已被 bundle 的依赖目录。
  files: [
    '.webpack/**/*',
    'package.json',
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.md',
    'THIRD_PARTY_LICENSES.txt',
    '!**/*.map',
    '!node_modules/**/*',
  ],

  // 内置教程以普通文件随安装包分发，首次启动复制到 userData/samples。
  extraResources: [
    {
      from: 'resources/tutorial',
      to: 'tutorial',
    },
  ],

  asar: true,
  asarUnpack: [
    '.webpack/main/native_modules/**/*',
    '.webpack/utility/native_modules/**/*',
  ],
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
    // 与旧 Squirrel 包保持同样的命名习惯：deckle-1.0.0 Setup.exe
    artifactName: '${productName}-${version} Setup.${ext}',
  },

  nsis: {
    // 关键：关闭一键安装，才出现「选择安装位置」等向导页面。
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // 按所有用户安装（向导里的「安装模式」页会消失，默认目录为 Program Files，
    // 仍可通过下面的目录页改到任意位置）。
    // 关键：perMachine:true 才会把安装包 manifest 编译成 requireAdministrator，
    // 双击时由系统弹出 UAC；否则是 asInvoker，普通权限运行，在部分机器上
    // 会因安全策略无法写出 Uninstall deckle.exe 而安装失败。
    perMachine: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Deckle',
    // English installer UI (LCID 1033).
    language: '1033',
    // 覆盖默认的「关闭运行中应用」检测：只处理安装目录内的进程，
    // 避免全局按 deckle.exe 进程名误伤旧 Squirrel 版 / 绿色版后弹「无法关闭」。
    // 文件位于 buildResources（assets/installer.nsh）。
    include: 'installer.nsh',
    // 生成 .blockmap，为以后接 electron-updater 的差分更新留通道。
    differentialPackage: true,
    // 卸载时保留 %APPDATA%\Deckle 里的项目记录与设置。
    deleteAppDataOnUninstall: false,
  },
};
