import { t } from '../lib/i18n';
export interface OutlineHeading {
  line: number;
  level: number;
  text: string;
}

export interface OutlineFloat {
  line: number;
  caption: string;
  kind: 'figure' | 'table';
}

export interface OutlineModel {
  headings: OutlineHeading[];
  figures: OutlineFloat[];
  tables: OutlineFloat[];
}

function lineStartsOf(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

function fenceMask(content: string): boolean[] {
  const lines = content.split(/\r\n|\n|\r/);
  const mask: boolean[] = [];
  let inFence = false;
  for (const line of lines) {
    mask.push(inFence || /^\s*```/.test(line));
    if (/^\s*```/.test(line)) inFence = !inFence;
  }
  return mask;
}

/** 从 `open` 处的括号开始，返回与之配对的右括号位置；支持字符串、原始文本与注释。 */
function matchParen(content: string, open: number): number {
  let depth = 0;
  for (let index = open; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      index += 1;
      while (index < content.length && content[index] !== '"') {
        if (content[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (char === '`') {
      index += 1;
      while (index < content.length && content[index] !== '`') index += 1;
      continue;
    }
    if (char === '/' && content[index + 1] === '/') {
      while (index < content.length && content[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && content[index + 1] === '*') {
      const end = content.indexOf('*/', index + 2);
      index = end < 0 ? content.length : end + 1;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** figure 的 `caption: [...]` 可能是嵌套方括号，按深度匹配。 */
function matchBracket(content: string, open: number): number {
  let depth = 0;
  for (let index = open; index < content.length; index += 1) {
    const char = content[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function captionOf(body: string): string {
  const match = /caption\s*:\s*\[/.exec(body);
  if (!match) return '';
  const open = match.index + match[0].length - 1;
  const close = matchBracket(body, open);
  if (close < 0) return '';
  return body
    .slice(open + 1, close)
    .replace(/\s+/g, ' ')
    .replace(/\\[[\]]/g, (escaped) => escaped[1])
    .trim();
}

function isTableBody(body: string): boolean {
  return /\bkind\s*:\s*table\b/.test(body) || /\btable\s*\(/.test(body);
}

export function parseOutline(content: string): OutlineModel {
  const headings: OutlineHeading[] = [];
  const figures: OutlineFloat[] = [];
  const tables: OutlineFloat[] = [];
  const starts = lineStartsOf(content);
  const fenced = fenceMask(content);

  const lines = content.split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index += 1) {
    if (fenced[index]) continue;
    const match = /^(=+)[ \t]+(.+?)[ \t]*$/.exec(lines[index]);
    if (!match) continue;
    headings.push({
      line: index,
      level: Math.min(match[1].length, 6),
      text: match[2],
    });
  }

  let cursor = 0;
  while (true) {
    const open = content.indexOf('#figure(', cursor);
    if (open < 0) break;
    const line = lineAt(starts, open);
    if (fenced[line]) {
      cursor = open + 1;
      continue;
    }
    const close = matchParen(content, open + '#figure'.length);
    if (close < 0) break;
    const body = content.slice(open, close + 1);
    const caption = captionOf(body);
    const kind: OutlineFloat['kind'] = isTableBody(body) ? 'table' : 'figure';
    (kind === 'table' ? tables : figures).push({
      line,
      kind,
      caption:
        caption || (kind === 'table' ? t('（无表注）') : t('（无图注）')),
    });
    cursor = close + 1;
  }

  return { headings, figures, tables };
}
