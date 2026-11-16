/**
 * 编译入口（主进程侧）：只做路径校验和消息转发。
 * 真正的 Typst 编译在 utilityProcess 的 compileWorker 里执行，
 * 大文档输入时不会再阻塞主进程的 UI 与 IPC。
 */
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import type {
  CompileResult,
  CompileShadow,
  ExportPdfResult,
} from '../shared/types';
import type {
  CompileWorkerKind,
  CompileWorkerRequest,
  CompileWorkerResponse,
} from '../shared/compileProtocol';
import { AppError } from './errors';
import { assertInside } from './projects';
import { readSettings } from './settings';
import { currentLocale, t } from './i18n';

const COMPILE_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (response: CompileWorkerResponse & { ok: true }) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: UtilityProcess | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

function rejectAll(message: string): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new AppError('EINTERNAL', message));
  }
  pending.clear();
}

function killWorker(): void {
  if (!worker) return;
  const process = worker;
  worker = null;
  try {
    process.kill();
  } catch {
    // 进程可能已经退出
  }
}

function ensureWorker(): UtilityProcess {
  if (worker) return worker;

  const modulePath = path.resolve(
    app.getAppPath(),
    '.webpack/utility/compile.cjs',
  );
  const child = utilityProcess.fork(modulePath, [], {
    serviceName: 'typst-compiler',
    stdio: 'ignore',
  });
  worker = child;

  child.on('message', (message: CompileWorkerResponse) => {
    if (!message || typeof message.id !== 'number') return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) {
      entry.resolve(message);
    } else {
      entry.reject(new AppError(message.code, message.message));
    }
  });

  child.on('exit', (code) => {
    worker = null;
    if (pending.size > 0) {
      rejectAll(t('编译进程已退出（退出码 {code}）', { code: String(code) }));
    }
  });

  return child;
}

function resolveMain(projectPath: string, mainFile: string): string {
  assertInside(projectPath);
  const abs = path.resolve(projectPath, mainFile);
  assertInside(abs);
  return abs;
}

/** 路径校验必须留在主进程：子进程没有 allowedRoots 状态。 */
function resolveShadows(
  projectPath: string,
  mainPath: string,
  shadows?: CompileShadow[],
): { path: string; content: string }[] {
  if (!Array.isArray(shadows)) return [];
  const result: { path: string; content: string }[] = [];
  for (const shadow of shadows) {
    if (
      !shadow ||
      typeof shadow.path !== 'string' ||
      typeof shadow.content !== 'string'
    ) {
      continue;
    }
    const abs = path.resolve(projectPath, shadow.path);
    assertInside(abs);
    if (path.normalize(abs) === path.normalize(mainPath)) continue;
    result.push({ path: abs, content: shadow.content });
  }
  return result;
}

function buildRequest(
  kind: CompileWorkerKind,
  projectPath: string,
  mainFile: string,
  content: string,
  shadows?: CompileShadow[],
): CompileWorkerRequest {
  const mainPath = resolveMain(projectPath, mainFile);
  const fontDirs = readSettings().fonts.extraDirs.filter((dir) => {
    try {
      return existsSync(dir);
    } catch {
      return false;
    }
  });
  return {
    id: nextId++,
    kind,
    projectPath,
    mainPath,
    content,
    shadows: resolveShadows(projectPath, mainPath, shadows),
    fontDirs,
    locale: currentLocale(),
  };
}

function send(
  request: CompileWorkerRequest,
): Promise<CompileWorkerResponse & { ok: true }> {
  const child = ensureWorker();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request.id);
      reject(new AppError('EINTERNAL', t('编译超时，正在重启编译进程')));
      killWorker();
    }, COMPILE_TIMEOUT_MS);
    pending.set(request.id, { resolve, reject, timer });
    try {
      child.postMessage(request);
    } catch (error) {
      pending.delete(request.id);
      clearTimeout(timer);
      reject(error);
    }
  });
}

export async function compileProject(
  projectPath: string,
  mainFile: string,
  content: string,
  shadows?: CompileShadow[],
): Promise<CompileResult> {
  const response = await send(
    buildRequest('compile', projectPath, mainFile, content, shadows),
  );
  if (response.kind !== 'compile') {
    throw new AppError('EINTERNAL', t('编译响应类型错误'));
  }
  return response.result;
}

export async function exportProjectPdf(
  projectPath: string,
  mainFile: string,
  content: string,
  targetPath: string,
  shadows?: CompileShadow[],
): Promise<ExportPdfResult> {
  const response = await send(
    buildRequest('pdf', projectPath, mainFile, content, shadows),
  );
  if (response.kind !== 'pdf') {
    throw new AppError('EINTERNAL', t('导出响应类型错误'));
  }
  await fs.writeFile(targetPath, response.pdf);
  return { path: targetPath };
}

/** 退出应用时结束子进程；待处理请求收到明确的失败结果。 */
export function shutdownCompileWorker(): void {
  rejectAll(t('应用正在退出，编译已取消'));
  killWorker();
}
