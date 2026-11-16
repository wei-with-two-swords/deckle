import { describe, expect, it } from 'vitest';

import {
  classifyWatchEvent,
  PendingWrites,
} from '../src/renderer/lib/saveReconcile';

describe('classifyWatchEvent（保存与文件监听的时序判定）', () => {
  it('磁盘内容等于编辑器内容时视为同一版本', () => {
    expect(
      classifyWatchEvent({
        diskContent: '相同内容',
        editorContent: '相同内容',
        savedContent: '旧版本',
        pendingContent: '另一个写入',
      }),
    ).toBe('identical');
  });

  it('保存中继续打字，磁盘上是本次写入的内容时不能判定为冲突', () => {
    // 回归：保存请求已写出新内容，savedContent 仍是旧值，用户又打了字。
    // 旧逻辑会发现 disk ≠ editor 且 disk ≠ savedContent，从而误弹冲突框。
    expect(
      classifyWatchEvent({
        diskContent: '保存时的内容',
        editorContent: '保存后又打的字',
        savedContent: '上次保存的旧内容',
        pendingContent: '保存时的内容',
      }),
    ).toBe('own-write');
  });

  it('迟到的写入回声（已写入的内容正好等于 savedContent）也不算冲突', () => {
    expect(
      classifyWatchEvent({
        diskContent: '刚保存的内容',
        editorContent: '刚保存的内容\n新输入',
        savedContent: '刚保存的内容',
        pendingContent: null,
      }),
    ).toBe('own-write');
  });

  it('本地没有未保存编辑时，外部修改直接重载', () => {
    expect(
      classifyWatchEvent({
        diskContent: '外部版本',
        editorContent: '磁盘旧版',
        savedContent: '磁盘旧版',
        pendingContent: null,
      }),
    ).toBe('external-clean');
  });

  it('本地有未保存编辑且磁盘是第三方版本时才是真冲突', () => {
    expect(
      classifyWatchEvent({
        diskContent: '外部版本',
        editorContent: '本地未保存编辑',
        savedContent: '共同祖先',
        pendingContent: '上一次写入的内容',
      }),
    ).toBe('external-conflict');
  });
});

describe('PendingWrites', () => {
  it('按大小写与斜杠归一化路径，写入完成后清除记录', () => {
    const pending = new PendingWrites();
    pending.add('C:\\Proj\\Main.Typ', '保存中的内容');
    expect(pending.contentFor('c:/proj/main.typ')).toBe('保存中的内容');
    pending.remove('c:/proj/main.typ');
    expect(pending.contentFor('C:\\Proj\\Main.Typ')).toBeNull();
  });

  it('不同路径的写入互不干扰', () => {
    const pending = new PendingWrites();
    pending.add('/proj/a.typ', 'A');
    pending.add('/proj/b.typ', 'B');
    expect(pending.contentFor('/proj/a.typ')).toBe('A');
    pending.remove('/proj/b.typ');
    expect(pending.contentFor('/proj/a.typ')).toBe('A');
    expect(pending.contentFor('/proj/b.typ')).toBeNull();
  });
});
