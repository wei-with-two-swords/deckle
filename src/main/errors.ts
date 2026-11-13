import type { ErrorCode } from '../shared/types';

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function toErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code);
    if (
      code === 'EACCES' ||
      code === 'ENOENT' ||
      code === 'EEXIST' ||
      code === 'EINVAL' ||
      code === 'ECONFLICT' ||
      code === 'EINTERNAL'
    ) {
      return code;
    }
  }
  return 'EINTERNAL';
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
