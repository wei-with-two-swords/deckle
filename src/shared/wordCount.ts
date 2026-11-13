/**
 * 字数统计口径：中文（含日文假名、韩文）逐字计 1，
 * 连续的拉丁字母/数字串（含连字符、撇号）计 1 词，
 * Typst 标记符号、空白与注释不计入。
 *
 * 纯函数，主进程与渲染进程共用，保证「当前文件」与「项目总字数」口径一致。
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const cjk =
    stripped.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g)
      ?.length ?? 0;
  const latin =
    stripped.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + latin;
}
