/** Pure file-name validation shared by the main process and tests. */

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Returns a user-facing error message, or null when the name is valid. */
export function entryNameError(raw: string): string | null {
  const name = raw.trim();

  if (!name) return '名称不能为空';
  if (name === '.' || name === '..') return '名称不能是 . 或 ..';
  if (/[\\/:*?"<>|]/.test(name)) return '名称不能包含 \\ / : * ? " < > |';
  if (/[. ]$/.test(name)) return '名称不能以空格或句点结尾';
  if (RESERVED_WINDOWS_NAMES.test(name))
    return '这是 Windows 保留名称，请换一个';
  if (Buffer.byteLength(name, 'utf8') > 200) return '名称过长';
  return null;
}

/** Trimmed name, or the original string when it only contains whitespace. */
export function sanitizeEntryName(raw: string): string {
  return raw.trim();
}

/**
 * 为导入文件生成不冲突的名称：同名时在扩展名前追加 -1/-2…，保留扩展名。
 * usedNames 中的名称须已转为小写（Windows 文件名不区分大小写）。
 */
export function uniqueEntryName(
  raw: string,
  usedNames: ReadonlySet<string>,
): string {
  const name = sanitizeEntryName(raw);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const taken = (candidate: string) => usedNames.has(candidate.toLowerCase());

  if (!taken(name)) return name;
  for (let index = 1; ; index += 1) {
    const candidate = `${stem}-${index}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}
