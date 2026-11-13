/** Path helpers shared by the renderer and tests. */

/** Join a project root with a project-relative path, keeping the root's separator style. */
export function joinRelative(base: string, relative: string): string {
  const separator = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${separator}${relative.replace(
    /[\\/]+/g,
    separator,
  )}`;
}

/** Parent directory of a path, handling both separators. */
export function dirOf(target: string): string {
  const index = Math.max(target.lastIndexOf('\\'), target.lastIndexOf('/'));
  return index > 0 ? target.slice(0, index) : target;
}

/** Compare two absolute paths ignoring separators and case (Windows-friendly). */
export function samePath(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}
