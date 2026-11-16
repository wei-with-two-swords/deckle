/** 主进程与编译子进程之间的消息契约。 */
import type { CompileResult, ErrorCode, Locale } from './types';

export type CompileWorkerKind = 'compile' | 'pdf';

export interface CompileWorkerRequest {
  id: number;
  kind: CompileWorkerKind;
  /** 项目根目录（编译器 workspace） */
  projectPath: string;
  /** 已由主进程校验过的绝对路径 */
  mainPath: string;
  content: string;
  /** 已由主进程校验过的绝对路径 */
  shadows: { path: string; content: string }[];
  fontDirs: string[];
  locale: Locale;
}

export type CompileWorkerResponse =
  | {
      id: number;
      ok: true;
      kind: 'compile';
      result: CompileResult;
    }
  | {
      id: number;
      ok: true;
      kind: 'pdf';
      pdf: Uint8Array;
    }
  | {
      id: number;
      ok: false;
      kind: CompileWorkerKind;
      code: ErrorCode;
      message: string;
    };
