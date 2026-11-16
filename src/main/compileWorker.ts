/**
 * Typst 编译子进程。由 utilityProcess 拉起，真实编译发生在这里，
 * 主进程只负责校验路径、转发消息和写 PDF 文件。
 */
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import type {
  CompileDiagnostic,
  CompileResult,
  ErrorCode,
} from '../shared/types';
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
} from '../shared/compileProtocol';
import { translate } from '../shared/i18n';

interface RawDiagnostic {
  message?: string;
  path?: string;
  severity?: number | string;
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  } | null;
}

let compiler: NodeCompiler | null = null;
let compilerRoot: string | null = null;
let compilerFonts = '';

function getCompiler(projectPath: string, fontDirs: string[]): NodeCompiler {
  const fontKey = JSON.stringify(fontDirs);
  if (compiler && compilerRoot === projectPath && compilerFonts === fontKey) {
    return compiler;
  }
  compiler = NodeCompiler.create({
    workspace: projectPath,
    ...(fontDirs.length > 0 ? { fontArgs: [{ fontPaths: fontDirs }] } : {}),
  });
  compilerRoot = projectPath;
  compilerFonts = fontKey;
  return compiler;
}

function toSeverity(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  if (value === 'warning') return 2;
  return 1;
}

function convertDiagnostics(
  raw: unknown,
  locale: CompileWorkerRequest['locale'],
): CompileDiagnostic[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: RawDiagnostic) => ({
    message: String(item.message ?? translate(locale, '未知错误')),
    path: String(item.path ?? ''),
    severity: toSeverity(item.severity),
    startLine: Math.max(0, Number(item.range?.start?.line ?? 0)),
    startColumn: Math.max(0, Number(item.range?.start?.character ?? 0)),
    endLine: Math.max(0, Number(item.range?.end?.line ?? 0)),
    endColumn: Math.max(0, Number(item.range?.end?.character ?? 0)),
  }));
}

/** 每次编译重置 shadow，避免上一次注入的章节内容残留。 */
function applyShadows(instance: NodeCompiler, request: CompileWorkerRequest) {
  instance.resetShadow();
  instance.mapShadow(request.mainPath, Buffer.from(request.content, 'utf8'));
  for (const shadow of request.shadows) {
    if (
      !shadow ||
      typeof shadow.path !== 'string' ||
      typeof shadow.content !== 'string' ||
      shadow.path === request.mainPath
    ) {
      continue;
    }
    instance.mapShadow(shadow.path, Buffer.from(shadow.content, 'utf8'));
  }
}

function fail(
  request: CompileWorkerRequest,
  code: ErrorCode,
  message: string,
): CompileWorkerResponse {
  return { id: request.id, ok: false, kind: request.kind, code, message };
}

function run(request: CompileWorkerRequest): CompileWorkerResponse {
  try {
    const instance = getCompiler(request.projectPath, request.fontDirs);
    applyShadows(instance, request);

    const startedAt = performance.now();
    const compiled = instance.compile({ mainFilePath: request.mainPath });

    const diagnostics: CompileDiagnostic[] = [];
    if (compiled.hasError()) {
      const error = compiled.takeError();
      if (error) {
        diagnostics.push(
          ...convertDiagnostics(
            instance.fetchDiagnostics(error),
            request.locale,
          ),
        );
      }
    }
    const warnings = compiled.takeWarnings();
    if (warnings) {
      diagnostics.push(
        ...convertDiagnostics(
          instance.fetchDiagnostics(warnings),
          request.locale,
        ),
      );
    }

    if (request.kind === 'pdf') {
      if (diagnostics.some((item) => item.severity === 1)) {
        const message =
          diagnostics.find((item) => item.severity === 1)?.message ??
          translate(request.locale, '文档存在编译错误，无法导出 PDF');
        return fail(request, 'EINVAL', message);
      }
      const document = compiled.result;
      if (!document) {
        return fail(
          request,
          'EINVAL',
          translate(request.locale, '文档没有可用页面'),
        );
      }
      return {
        id: request.id,
        ok: true,
        kind: 'pdf',
        pdf: new Uint8Array(instance.pdf(document)),
      };
    }

    const document = compiled.result;
    const result: CompileResult = {
      vector: document
        ? new Uint8Array(instance.vector(document))
        : new Uint8Array(0),
      pageCount: document?.numOfPages ?? 0,
      durationMs: Math.round(performance.now() - startedAt),
      diagnostics,
    };
    return { id: request.id, ok: true, kind: 'compile', result };
  } catch (error) {
    return fail(
      request,
      'EINTERNAL',
      error instanceof Error ? error.message : String(error),
    );
  }
}

const port = process.parentPort;
if (!port) {
  throw new Error('compile worker must run inside utilityProcess');
}

port.on('message', (event) => {
  const request = event.data as CompileWorkerRequest;
  if (!request || typeof request.id !== 'number') return;
  port.postMessage(run(request));
});
