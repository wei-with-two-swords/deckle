import { setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { CompileDiagnostic } from '../../shared/types';

function baseName(path: string | null | undefined): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

/** 把 Typst 诊断（0-based 行列）映射成 CM6 的诊断范围。 */
export function toCmDiagnostics(
  view: EditorView,
  diagnostics: CompileDiagnostic[],
  filePath: string | null,
): Diagnostic[] {
  const file = baseName(filePath);
  const lines = view.state.doc.lines;
  const result: Diagnostic[] = [];

  for (const item of diagnostics) {
    const diagnosticFile = baseName(item.path);
    // 编译器只报当前主文件时，path 可能为空或是绝对路径，按文件名过滤。
    if (diagnosticFile && file && diagnosticFile !== file) continue;

    const startLine = Math.min(Math.max(item.startLine, 0), lines - 1);
    const start = view.state.doc.line(startLine + 1);
    const from = Math.min(start.from + Math.max(item.startColumn, 0), start.to);

    const endLine = Math.min(Math.max(item.endLine, startLine), lines - 1);
    const end = view.state.doc.line(endLine + 1);
    const to = Math.min(end.from + Math.max(item.endColumn, 0), end.to);

    result.push({
      from,
      to: Math.max(to, from),
      severity: item.severity === 1 ? 'error' : 'warning',
      message: item.message,
      source: 'typst',
    });
  }

  return result;
}

export function applyDiagnostics(
  view: EditorView,
  diagnostics: CompileDiagnostic[],
  filePath: string | null,
): Diagnostic[] {
  const list = toCmDiagnostics(view, diagnostics, filePath);
  view.dispatch(setDiagnostics(view.state, list));
  return list;
}
