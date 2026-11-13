import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import type {
  CompileDiagnostic,
  CompileResult,
  CompileShadow,
  ExportPdfResult,
} from '../shared/types';
import { AppError } from './errors';
import { assertInside } from './projects';
import { readSettings } from './settings';
import { t } from './i18n';

interface RawDiagnostic {
  message?: string;
  package?: string;
  path?: string;
  severity?: number | string;
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  } | null;
}

let compiler: NodeCompiler | null = null;
let compilerRoot: string | null = null;

function buildCompiler(projectPath: string): NodeCompiler {
  const fontDirs = readSettings().fonts.extraDirs.filter((dir) => {
    try {
      return existsSync(dir);
    } catch {
      return false;
    }
  });

  return NodeCompiler.create({
    workspace: projectPath,
    ...(fontDirs.length > 0 ? { fontArgs: [{ fontPaths: fontDirs }] } : {}),
  });
}

function getCompiler(projectPath: string): NodeCompiler {
  if (compiler && compilerRoot === projectPath) return compiler;
  compiler = buildCompiler(projectPath);
  compilerRoot = projectPath;
  return compiler;
}

function toSeverity(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  if (value === 'warning') return 2;
  if (value === 'error') return 1;
  return 1;
}

function convertDiagnostics(raw: unknown): CompileDiagnostic[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: RawDiagnostic) => ({
    message: String(item.message ?? t('未知错误')),
    path: String(item.path ?? ''),
    severity: toSeverity(item.severity),
    startLine: Math.max(0, Number(item.range?.start?.line ?? 0)),
    startColumn: Math.max(0, Number(item.range?.start?.character ?? 0)),
    endLine: Math.max(0, Number(item.range?.end?.line ?? 0)),
    endColumn: Math.max(0, Number(item.range?.end?.character ?? 0)),
  }));
}

function resolveMain(projectPath: string, mainFile: string): string {
  assertInside(projectPath);
  const abs = path.resolve(projectPath, mainFile);
  assertInside(abs);
  return abs;
}

/**
 * 每次编译前重置 shadow：编译器实例是按项目缓存复用的，若不清空，
 * 上一次注入的章节实时内容会一直残留，导致外部文件变更/自动保存读不到新内容。
 * 主文件始终映射到它自己的路径，其余编辑中的章节按各自真实路径注入，
 * 这样编译与诊断都以整个项目为根，不随「当前打开哪个文件」而变。
 */
function applyShadows(
  instance: NodeCompiler,
  projectPath: string,
  mainPath: string,
  content: string,
  shadows?: CompileShadow[],
): void {
  instance.resetShadow();
  instance.mapShadow(mainPath, Buffer.from(content, 'utf8'));
  if (!Array.isArray(shadows)) return;
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
    instance.mapShadow(abs, Buffer.from(shadow.content, 'utf8'));
  }
}

export function compileProject(
  projectPath: string,
  mainFile: string,
  content: string,
  shadows?: CompileShadow[],
): CompileResult {
  const mainPath = resolveMain(projectPath, mainFile);
  const instance = getCompiler(projectPath);

  applyShadows(instance, projectPath, mainPath, content, shadows);

  const startedAt = performance.now();
  const compiled = instance.compile({ mainFilePath: mainPath });
  const durationMs = Math.round(performance.now() - startedAt);

  const diagnostics: CompileDiagnostic[] = [];

  if (compiled.hasError()) {
    const error = compiled.takeError();
    if (error)
      diagnostics.push(...convertDiagnostics(instance.fetchDiagnostics(error)));
  }

  const warnings = compiled.takeWarnings();
  if (warnings) {
    diagnostics.push(
      ...convertDiagnostics(instance.fetchDiagnostics(warnings)),
    );
  }

  const document = compiled.result;
  const vector = document
    ? new Uint8Array(instance.vector(document))
    : new Uint8Array(0);

  return {
    vector,
    pageCount: document?.numOfPages ?? 0,
    durationMs,
    diagnostics,
  };
}

export async function exportProjectPdf(
  projectPath: string,
  mainFile: string,
  content: string,
  targetPath: string,
  shadows?: CompileShadow[],
): Promise<ExportPdfResult> {
  const mainPath = resolveMain(projectPath, mainFile);
  const instance = getCompiler(projectPath);
  applyShadows(instance, projectPath, mainPath, content, shadows);

  const compiled = instance.compile({ mainFilePath: mainPath });
  if (compiled.hasError()) {
    const error = compiled.takeError();
    const diagnostics = error
      ? convertDiagnostics(instance.fetchDiagnostics(error))
      : [];
    const message =
      diagnostics[0]?.message ?? t('文档存在编译错误，无法导出 PDF');
    throw new AppError('EINVAL', message);
  }

  const document = compiled.result;
  if (!document) {
    throw new AppError('EINVAL', t('文档没有可用页面'));
  }

  const buffer = instance.pdf(document);
  await fs.writeFile(targetPath, buffer);
  return { path: targetPath };
}
