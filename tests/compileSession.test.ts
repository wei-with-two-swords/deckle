import { describe, expect, it } from 'vitest';
import type { CompileWorkerResponse } from '../src/shared/compileProtocol';
import {
  CompileSession,
  type CompileChild,
  type CompileSessionDeps,
} from '../src/main/compileSession';
import { AppError } from '../src/main/errors';

class FakeChild implements CompileChild {
  readonly posted: unknown[] = [];
  killed = false;
  private readonly messageHandlers: ((m: CompileWorkerResponse) => void)[] = [];
  private readonly exitHandlers: ((code: number) => void)[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  kill(): void {
    this.killed = true;
  }

  on(event: 'message', listener: (m: CompileWorkerResponse) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  on(
    event: string,
    listener: ((m: CompileWorkerResponse) => void) | ((code: number) => void),
  ): void {
    if (event === 'message') {
      this.messageHandlers.push(listener as (m: CompileWorkerResponse) => void);
    } else if (event === 'exit') {
      this.exitHandlers.push(listener as (code: number) => void);
    }
  }

  emitMessage(message: CompileWorkerResponse): void {
    for (const handler of this.messageHandlers) handler(message);
  }

  emitExit(code: number): void {
    for (const handler of this.exitHandlers) handler(code);
  }
}

function makeSession(
  children: FakeChild[],
  overrides: Partial<CompileSessionDeps> = {},
): CompileSession {
  return new CompileSession({
    fork: () => {
      const child = new FakeChild();
      children.push(child);
      return child;
    },
    modulePath: () => '/app/compile.cjs',
    translate: (source) => source,
    ...overrides,
  });
}

const request = {
  kind: 'compile' as const,
  projectPath: '/p',
  mainPath: '/p/main.typ',
  content: '= hi',
  shadows: [],
  fontDirs: [],
  locale: 'zh-CN' as const,
};

function expectCompile(
  response: Awaited<ReturnType<CompileSession['send']>>,
): void {
  if (response.kind !== 'compile') throw new Error('expected compile response');
  expect(response.result.pageCount).toBe(1);
}

const okResponse = (id: number): CompileWorkerResponse => ({
  id,
  ok: true,
  kind: 'compile',
  result: {
    vector: new Uint8Array([1, 2, 3]),
    pageCount: 1,
    durationMs: 5,
    diagnostics: [],
  },
});

describe('CompileSession', () => {
  it('fork 一次并复用子进程，按 id 分发响应', async () => {
    const children: FakeChild[] = [];
    const session = makeSession(children);
    const first = session.send(request);
    const second = session.send(request);
    expect(children).toHaveLength(1);

    const posted = children[0].posted as { id: number }[];
    expect(posted[1].id).toBe(posted[0].id + 1);
    children[0].emitMessage(okResponse(posted[1].id));
    children[0].emitMessage(okResponse(posted[0].id));
    expectCompile(await first);
    expectCompile(await second);
  });

  it('错误响应转成带 code 的 AppError', async () => {
    const children: FakeChild[] = [];
    const session = makeSession(children);
    const pending = session.send(request);
    const id = (children[0].posted[0] as { id: number }).id;
    children[0].emitMessage({
      id,
      ok: false,
      kind: 'compile',
      code: 'EINVAL',
      message: 'bad document',
    });
    await expect(pending).rejects.toMatchObject({
      code: 'EINVAL',
      message: 'bad document',
    });
  });

  it('超时 rejecting 当前请求并杀掉子进程', async () => {
    const children: FakeChild[] = [];
    const session = makeSession(children, { timeoutMs: 5 });
    const pending = session.send(request);
    await expect(pending).rejects.toBeInstanceOf(AppError);
    expect(children[0].killed).toBe(true);

    void session.send(request).catch(() => undefined);
    expect(children).toHaveLength(2);
  });

  it('子进程退出时失败所有在途请求，下次 send 重启', async () => {
    const children: FakeChild[] = [];
    const session = makeSession(children);
    const first = session.send(request);
    const second = session.send(request);
    children[0].emitExit(7);
    await expect(first).rejects.toMatchObject({ message: /退出码 7/ });
    await expect(second).rejects.toMatchObject({ message: /退出码 7/ });

    const recreated = session.send(request);
    expect(children).toHaveLength(2);
    const id = (children[1].posted[0] as { id: number }).id;
    children[1].emitMessage(okResponse(id));
    expectCompile(await recreated);
  });

  it('shutdown 失败所有在途请求并杀掉子进程', async () => {
    const children: FakeChild[] = [];
    const session = makeSession(children);
    const pending = session.send(request);
    session.shutdown();
    await expect(pending).rejects.toMatchObject({ message: /编译已取消/ });
    expect(children[0].killed).toBe(true);
  });

  it('未知 id 的响应被忽略', async () => {
    const children: FakeChild[] = [];
    const session = makeSession(children);
    const pending = session.send(request);
    children[0].emitMessage(okResponse(9999));
    const id = (children[0].posted[0] as { id: number }).id;
    children[0].emitMessage(okResponse(id));
    expectCompile(await pending);
  });
});

describe('compile request coalescing', () => {
  it('飞行中只补一次编译：连续 enter 只标记 pending，leave 只放行一次', () => {
    let inFlight = false;
    let pending = false;
    const enter = () => {
      if (inFlight) {
        pending = true;
        return false;
      }
      inFlight = true;
      return true;
    };
    const leave = () => {
      inFlight = false;
      if (pending) {
        pending = false;
        return true;
      }
      return false;
    };

    expect(enter()).toBe(true);
    expect(enter()).toBe(false);
    expect(enter()).toBe(false);
    expect(leave()).toBe(true);
    expect(leave()).toBe(false);
  });
});
