import path from 'node:path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { watchAll } from './build.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let child = null;
let ready = false;
let restarting = false;

function start() {
  if (child && !child.killed) child.kill();
  const env = { ...process.env, NODE_ENV: 'development' };
  // 某些终端/工具链会全局设置该变量；带上它 Electron 会以纯 Node 运行，
  // require('electron').app 为 undefined，应用起不来。
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.warn(`[electron] 退出码 ${code}`);
  });
}

function scheduleRestart() {
  if (!ready || restarting) return;
  restarting = true;
  setTimeout(() => {
    restarting = false;
    console.log('[dev] 产物已更新，重启 Electron…');
    start();
  }, 350);
}

async function main() {
  // 清掉 Forge 时代可能残留的 .webpack/x64 目录。
  await fs.rm(path.resolve(root, '.webpack'), { recursive: true, force: true });

  const watcher = watchAll({ mode: 'development', onChange: scheduleRestart });
  await watcher.firstBuild;

  ready = true;
  console.log('[dev] 首次编译完成，启动 Electron（改动后自动重启）');
  start();

  const shutdown = async () => {
    ready = false;
    if (child && !child.killed) child.kill();
    await watcher.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
