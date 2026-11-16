/**
 * 文本文件的原子写入。
 *
 * 直接 `fs.writeFile(target)` 在写入过程中崩溃会留下半截文件；对论文编辑器
 * 来说这是不可接受的。这里改为「同目录临时文件 → fsync → rename 覆盖」：
 * rename 是同一文件系统内的原子操作，读者只会看到旧版或新版，不会看到半截。
 *
 * mtime 校验也放进 per-path 串行队列里、紧挨 rename 执行，避免同一进程内
 * 两次保存交错造成的假冲突。跨进程修改仍由 mtime 比对拦截。
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** .currentTimeMillis 的毫秒差容差，与原有 writeProjectFile 保持一致。 */
export const DEFAULT_MTIME_TOLERANCE_MS = 2;

export class WriteConflictError extends Error {
  readonly code = 'ECONFLICT';

  constructor(message = 'file changed on disk') {
    super(message);
    this.name = 'WriteConflictError';
  }
}

export interface AtomicWriteOptions {
  /** 期望的磁盘 mtime；与当前 mtime 差超过容差时拒绝写入。 */
  expectedMtimeMs?: number;
  /** true 时跳过 mtime 校验（冲突对话框的「覆盖保存」）。 */
  force?: boolean;
  mtimeToleranceMs?: number;
}

export interface AtomicWriteResult {
  path: string;
  mtimeMs: number;
}

/** 同一路径的写入串行化，避免本进程内的两次保存互相踩踏。 */
const locks = new Map<string, Promise<void>>();

function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  locks.set(key, chained);

  return previous.then(task).finally(() => {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  });
}

/**
 * 原子写入文本文件，返回写入后磁盘上的 mtime。
 * 目标文件必须已存在（与 readProjectFile / writeProjectFile 的契约一致）。
 */
export function atomicWriteText(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<AtomicWriteResult> {
  return withLock(filePath, async () => {
    const before = await fs.stat(filePath);
    const tolerance = options.mtimeToleranceMs ?? DEFAULT_MTIME_TOLERANCE_MS;
    if (
      !options.force &&
      typeof options.expectedMtimeMs === 'number' &&
      Number.isFinite(options.expectedMtimeMs) &&
      Math.abs(before.mtimeMs - options.expectedMtimeMs) > tolerance
    ) {
      throw new WriteConflictError();
    }

    const temp = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      const handle = await fs.open(temp, 'wx', 0o600);
      try {
        await handle.writeFile(content, 'utf8');
        // 先落盘再 rename：断电后即使 rename 丢了，也不会留下半截目标文件。
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, filePath);
    } catch (error) {
      await fs.unlink(temp).catch(() => undefined);
      throw error;
    }

    const after = await fs.stat(filePath);
    return { path: filePath, mtimeMs: after.mtimeMs };
  });
}
