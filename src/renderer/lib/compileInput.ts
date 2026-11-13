import { joinRelative, samePath } from '../../shared/paths';
import type { CompileShadow } from '../../shared/types';

export interface CompileInput {
  /** 主文件内容，编译器会把它映射到 mainFile 自身的路径 */
  content: string;
  /** 其它编辑中文件的实时内容，按各自真实路径注入 */
  shadows: CompileShadow[];
}

/**
 * 构造「以整个项目为根」的编译输入。
 *
 * 旧实现把当前打开文件的 content 直接当作主文件内容传给编译器，
 * 于是打开 ch5.typ 时整篇文档被当成 main.typ 编译——预览和诊断都随
 * 当前文件变化。这里保证：
 * - 打开主文件：直接用编辑中的实时内容，无需额外注入。
 * - 打开章节文件：从磁盘读主文件，把章节的实时内容按其自身路径注入，
 *   编译器仍按 main.typ 的 #include 关系编译全文，诊断覆盖所有文件。
 *
 * readFile 由调用方注入（走 preload 的 fs.readFile），便于单测。
 */
export async function buildCompileInput(opts: {
  projectPath: string;
  mainFile: string;
  activePath: string;
  activeContent: string;
  readFile: (path: string) => Promise<string>;
}): Promise<CompileInput> {
  const mainPath = joinRelative(opts.projectPath, opts.mainFile);
  if (samePath(opts.activePath, mainPath)) {
    return { content: opts.activeContent, shadows: [] };
  }
  const content = await opts.readFile(mainPath);
  return {
    content,
    shadows: [{ path: opts.activePath, content: opts.activeContent }],
  };
}
