/**
 * 保存 / 文件监听的协调逻辑。
 * 单独成模块是为了能在 node 环境里对时序判定做回归测试。
 */

export type WatchClassification =
  | 'identical' // 磁盘内容就是编辑器当前内容
  | 'own-write' // 磁盘内容是本应用刚写入/正在写入的内容
  | 'external-clean' // 外部修改，本地没有未保存编辑
  | 'external-conflict'; // 外部修改，且本地有未保存编辑

export interface WatchClassificationInput {
  diskContent: string;
  editorContent: string;
  savedContent: string;
  /** 本应用正在写入的内容；无进行中的写入时为 null。 */
  pendingContent: string | null;
}

/**
 * 关键：保存请求发出后、savedContent 更新前，磁盘上出现的「新内容」
 * 很可能是我们自己的写入回声。此时编辑器里又打了字，旧逻辑会误判为冲突。
 */
export function classifyWatchEvent(
  input: WatchClassificationInput,
): WatchClassification {
  if (input.diskContent === input.editorContent) return 'identical';
  if (
    input.pendingContent !== null &&
    input.diskContent === input.pendingContent
  ) {
    return 'own-write';
  }
  if (input.diskContent === input.savedContent) return 'own-write';
  return input.editorContent === input.savedContent
    ? 'external-clean'
    : 'external-conflict';
}

/** 按路径记录「正在写入的内容」，用于识别自己的写入回声。 */
export class PendingWrites {
  private writes = new Map<string, string>();

  private static key(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  add(path: string, content: string): void {
    this.writes.set(PendingWrites.key(path), content);
  }

  contentFor(path: string): string | null {
    return this.writes.get(PendingWrites.key(path)) ?? null;
  }

  remove(path: string): void {
    this.writes.delete(PendingWrites.key(path));
  }

  clear(): void {
    this.writes.clear();
  }
}
