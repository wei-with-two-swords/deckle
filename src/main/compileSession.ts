/**
 * 编译子进程会话管理：请求分派、超时重启、退出时失败所有在途请求。
 *
 * 从 compile.ts 抽出这一层，是为了让这些时序逻辑可以在没有 Electron
 * 运行时的情况下单测：依赖（fork / 模块路径 / 文案 / 超时）全部注入。
 */
import type {
  CompileWorkerRequest,
  CompileWorkerResponse,
} from '../shared/compileProtocol';
import type { ErrorCode } from '../shared/types';
import { AppError } from './errors';

export type Translate = (
  source: string,
  params?: Record<string, string | number>,
) => string;

/** Electron UtilityProcess 中实际用到的最小接口。 */
export interface CompileChild {
  postMessage(message: CompileWorkerRequest): void;
  kill(): void;
  on(
    event: 'message',
    listener: (message: CompileWorkerResponse) => void,
  ): void;
  on(event: 'exit', listener: (code: number) => void): void;
}

export interface CompileSessionDeps {
  fork(modulePath: string): CompileChild;
  modulePath(): string;
  translate: Translate;
  /** 默认 30 秒；测试可注入短超时。 */
  timeoutMs?: number;
}

interface PendingRequest {
  resolve: (response: CompileWorkerResponse & { ok: true }) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const DEFAULT_COMPILE_TIMEOUT_MS = 30_000;

export class CompileSession {
  private child: CompileChild | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly timeoutMs: number;

  constructor(private readonly deps: CompileSessionDeps) {
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;
  }

  private rejectAll(message: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new AppError('EINTERNAL' as ErrorCode, message));
    }
    this.pending.clear();
  }

  private kill(): void {
    const child = this.child;
    if (!child) return;
    this.child = null;
    try {
      child.kill();
    } catch {
      // 子进程可能已经退出。
    }
  }

  private ensureChild(): CompileChild {
    if (this.child) return this.child;
    const child = this.deps.fork(this.deps.modulePath());
    this.child = child;

    child.on('message', (message) => {
      if (!message || typeof message.id !== 'number') return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) {
        entry.resolve(message);
      } else {
        entry.reject(new AppError(message.code, message.message));
      }
    });

    child.on('exit', (code) => {
      this.child = null;
      if (this.pending.size > 0) {
        this.rejectAll(
          this.deps.translate('编译进程已退出（退出码 {code}）', {
            code: String(code),
          }),
        );
      }
    });

    return child;
  }

  send(
    request: Omit<CompileWorkerRequest, 'id'>,
  ): Promise<CompileWorkerResponse & { ok: true }> {
    const child = this.ensureChild();
    const full: CompileWorkerRequest = { ...request, id: this.nextId++ };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(full.id);
        reject(
          new AppError(
            'EINTERNAL',
            this.deps.translate('编译超时，正在重启编译进程'),
          ),
        );
        // 可能有其它在途请求；它们会随子进程退出一起失败，由下一次 send 重启。
        this.kill();
      }, this.timeoutMs);
      this.pending.set(full.id, { resolve, reject, timer });
      try {
        child.postMessage(full);
      } catch (error) {
        this.pending.delete(full.id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /** 退出应用时结束子进程；待处理请求收到明确的失败结果。 */
  shutdown(): void {
    this.rejectAll(this.deps.translate('应用正在退出，编译已取消'));
    this.kill();
  }
}
