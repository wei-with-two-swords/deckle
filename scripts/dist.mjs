import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'electron-builder';
import { builderConfig } from './builder.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirOnly = process.argv.includes('--dir');

// NSIS / 7za / winCodeSign 等二进制默认从 GitHub 下载，国内改走镜像。
process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??=
  'https://npmmirror.com/mirrors/electron-builder-binaries/';
process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/';

console.log(`[builder] ${dirOnly ? '仅打包目录' : '生成 NSIS 安装包'} → dist/`);

build({
  projectDir: root,
  config: builderConfig,
  win: ['nsis'],
  x64: true,
  dir: dirOnly,
})
  .then((artifacts) => {
    console.log('[builder] 完成：');
    for (const file of artifacts) console.log('  ' + file);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
