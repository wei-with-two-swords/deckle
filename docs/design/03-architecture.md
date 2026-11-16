# Typstor 架构设计（v0.1）

> 目标：在现有 Electron Forge + Webpack + React 仓库上演进，不换框架；编译在独立子进程，渲染在渲染进程，数据本地。

> **实现更新（2026-11-16）**：Typst 编译已迁入 `utilityProcess`（`src/main/compileWorker.ts`），
> 主进程只做路径校验、消息路由与 PDF 落盘；编译请求 30s 超时后重启子进程，渲染层合并
> 飞行中的重复请求。生产构建注入 CSP（放行 `blob:`/`data:` 与 `wasm-unsafe-eval`），
> preload 已恢复 `sandbox:true`。下文 §7.1 / §7.4 / §7.5 中相关的
> `sandbox:false`、CSP 待办与「编译在主进程」描述为 v0.1 设计基线，已被上述实现取代。

## 1. 总览

```
┌──────────────────────────── main (Node 24.22.2, Electron 45) ────────────────────────────┐
│ app lifecycle / single instance                                                          │
│ BrowserWindow (frame:false, sandbox:false*, contextIsolation:true)                         │
│ protocol: typstor://app/*  (html/js/css/wasm/fonts in prod)                               │
│ IPC router (typed channels, sender + path validation)                                     │
│ CompileService: NodeCompiler (napi addon, Typst 0.14.2) + queue + shadow map + cache      │
│ ProjectService: project.json / workspace.json / main-file detection                       │
│ FileService: read/write/rename/delete + chokidar watcher + atomic save                    │
│ Db: node:sqlite (recent_projects, snapshots)                                              │
│ Settings: settings.json (userData)                                                        │
└───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                            │ contextBridge (window.typstor.*)
┌───────────────────────────────────────────┴───────────────────────────────────────────────┐
│ renderer (Chromium)                                                                       │
│ React 19 shell: rail / topbar / files / editor / preview / dialogs                        │
│ CodeMirror 6 + codemirror-lang-typst                                                      │
│ @myriaddreamin/typst-ts-renderer (WASM) ← vector artifact                                  │
│ Zustand stores: project / editor / compile / ui / settings                                │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

设计约束：

- 渲染进程不直接用 Node/fs；所有系统能力经 preload 白名单。
- 编译结果只传 **vector artifact**，不传 PDF/SVG；渲染进程负责画。
- 同一项目同一时刻只有一个编译在跑；新请求覆盖旧请求。
- 所有路径在主进程规范化并校验在项目根内。

## 2. 进程与窗口

### 2.1 main

职责：窗口生命周期、协议、IPC、编译、文件监听、数据库、设置、对话框、导出。

```ts
// src/main/window.ts
const win = new BrowserWindow({
  width: 1400,
  height: 900,
  minWidth: 960,
  minHeight: 600,
  frame: false,
  titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
  trafficLightPosition: { x: 16, y: 14 }, // macOS
  backgroundColor: '#eff0f3',
  show: false,
  webPreferences: {
    preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    // M1 实测：Forge dev 的 preload bundle 含 webpack-dev-server HMR，会
    // require('events')，沙箱 preload 只允许 electron/timers/url，故先禁用
    // sandbox；打包阶段若 preload 不再注入 HMR 客户端，再评估恢复 true。
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
    spellcheck: false,
  },
});
```

- `show: false` → `ready-to-show` 再显示，避免白屏。
- 窗口 bounds 持久化到 settings；启动时校验在可见屏幕内。
- `app.requestSingleInstanceLock()`；第二实例聚焦已有窗口并转发 argv 中的项目路径（P1）。
- `window-all-closed`：非 macOS 退出；macOS 保留应用。
- 关闭握手见 §7.4。

### 2.2 preload

只暴露命名空间方法，**不暴露**通用 `invoke(channel, ...args)`。类型从 `src/shared/api.ts` 取，渲染层 `window.typstor` 有完整类型。

```ts
// src/preload/index.ts（示意）
const api: TypstorApi = {
  window: {
    minimize: () => ipcRenderer.invoke(CH.WIN_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(CH.WIN_TOGGLE_MAXIMIZE),
    close: (force?: boolean) => ipcRenderer.invoke(CH.WIN_CLOSE, { force }),
    isMaximized: () => ipcRenderer.invoke(CH.WIN_IS_MAXIMIZED),
    onMaximized: (cb) => subscribe(CH.WIN_MAXIMIZED_CHANGED, cb),
  },
  project: {
    /* create/open/recent/... */
  },
  fs: {
    /* ... */
  },
  compile: { run: (req) => ipcRenderer.invoke(CH.COMPILE_RUN, req) },
  export: { pdf: (req) => ipcRenderer.invoke(CH.EXPORT_PDF, req) },
  settings: {
    get: () => ipcRenderer.invoke(CH.SETTINGS_GET),
    set: (p) => ipcRenderer.invoke(CH.SETTINGS_SET, p),
  },
  db: { snapshots: { save, list, restore } },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(CH.SHELL_OPEN_EXTERNAL, url),
  },
};
contextBridge.exposeInMainWorld('typstor', api);
```

保留旧的 `window.electronAPI.invoke` 直到 M2 迁移完成，随后删除。

### 2.3 renderer

- `createRoot(document.body)` 改为 `#root` 容器；`index.html` 增加 CSP meta。
- 根组件根据路由状态渲染 Welcome 或 ProjectShell；无 react-router（两态）。
- 编辑器实例只保留一个 `EditorView`，切换文件时 `setState` 恢复每文件 `EditorState`。

## 3. 共享类型与 IPC 契约

`src/shared/types.ts`（所有进程共用，禁止运行时依赖）：

```ts
export type ThemeMode = 'light' | 'dark' | 'system';
export type FileKind = 'file' | 'directory';

export interface FileEntry {
  name: string;
  path: string;
  kind: FileKind;
}

export interface ProjectConfig {
  version: 1;
  name: string;
  mainFile: string; // 相对项目根
  createdAt: string; // ISO
  template: 'blank' | string;
}

export interface WorkspaceState {
  version: 1;
  activeView: 'files' | 'search' | 'outline' | 'issues' | 'settings';
  panelVisible: boolean;
  panelWidth: number; // 200..480
  split: number; // 编辑区占比 0.2..0.8
  zoom: number; // 0.5..4
  openFile: string | null; // 相对路径
  scroll: Record<string, number>;
}

export interface BufferPayload {
  path: string;
  content: string;
} // path 绝对

export interface CompileRequest {
  seq: number;
  projectPath: string;
  mainFile: string; // 相对
  buffers: BufferPayload[]; // 所有脏缓冲区
  inputs?: Record<string, string>;
}

export interface SourceSpan {
  line: number;
  column: number;
}

export interface Diagnostic {
  file: string; // 绝对路径
  from: SourceSpan;
  to: SourceSpan;
  severity: 'error' | 'warning';
  message: string;
  rule?: string;
}

export interface CompileResponse {
  seq: number;
  ok: boolean;
  artifact?: Uint8Array; // vector IR；IPC 结构化克隆为 Uint8Array
  pageCount: number;
  diagnostics: Diagnostic[];
  durationMs: number;
  error?: string; // 非 Typst 诊断类错误（原生/WASM/IO）
}

export interface WorkspaceChange {
  path: string;
  kind: 'add' | 'change' | 'unlink';
}
```

`src/shared/channels.ts`：常量字符串，命名 `domain:action`，如 `fs:readDir`、`compile:run`、`win:toggleMaximize`。

IPC 返回统一包络，避免裸异常：

```ts
type Ok<T> = { ok: true; data: T };
type Err = {
  ok: false;
  code: 'EACCES' | 'ENOENT' | 'ECONFLICT' | 'EINVAL' | 'EINTERNAL';
  message: string;
};
```

渲染层封装 `unwrap()`，失败转 toast/对话框。

### 3.1 通道表

| 通道                                                                     | 入参                                         | 返回                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| `win:minimize`                                                           | —                                            | `Ok<void>`                                                         |
| `win:toggleMaximize`                                                     | —                                            | `Ok<boolean>`（是否最大化）                                        |
| `win:isMaximized`                                                        | —                                            | `Ok<boolean>`                                                      |
| `win:close`                                                              | `{force:boolean}`                            | `Ok<void>`                                                         |
| `win:maximized-changed`（事件）                                          | `boolean`                                    | —                                                                  |
| `project:create`                                                         | `{name,parentDir}`                           | `Ok<{path, config}>`                                               |
| `project:open`                                                           | `{path}`                                     | `Ok<{path, config, tree}>`                                         |
| `project:recent`                                                         | —                                            | `Ok<RecentProject[]>`                                              |
| `project:removeRecent`                                                   | `{path}`                                     | `Ok<void>`                                                         |
| `project:thumbnail`                                                      | `{path}`                                     | `Ok<{vector: Uint8Array} \| null>`（编译首页 vector，失败为 null） |
| `project:exportPdf`                                                      | `{path}`                                     | `Ok<{path: string} \| null>`（保存对话框取消为 null）              |
| `project:exportArchive`                                                  | `{path}`                                     | `Ok<{path: string} \| null>`（zip，排除依赖/构建目录）             |
| `project:delete`                                                         | `{path}`                                     | `Ok<void>`（`shell.trashItem` + 移除最近记录）                     |
| `project:saveWorkspace`                                                  | `{path, workspace}`                          | `Ok<void>`                                                         |
| `project:updateConfig`                                                   | `{path, patch:{name?,mainFile?}}`            | `Ok<ProjectConfig>`                                                |
| `project:search`                                                         | `{path, query, caseSensitive?}`              | `Ok<SearchHit[]>`                                                  |
| `project:stopWatch`                                                      | `{path}`                                     | `Ok<void>`                                                         |
| `project:watch-event`（事件）                                            | `{kind:'tree'\|'file', event, path}`         | —（主进程 → 渲染进程）                                             |
| `fs:readDir`                                                             | `{path}`                                     | `Ok<FileEntry[]>`                                                  |
| `fs:readFile`                                                            | `{path}`                                     | `Ok<{content, mtimeMs}>`                                           |
| `fs:writeFile`                                                           | `{path, content, expectedMtimeMs?, force?}`  | `Ok<{mtimeMs}>` 或 `ECONFLICT`                                     |
| `fs:createEntry`                                                         | `{projectPath,parentDir,name,kind,content?}` | `Ok<FileEntry>`                                                    |
| `fs:renameEntry`                                                         | `{projectPath,path,name}`                    | `Ok<FileEntry>`                                                    |
| `fs:deleteEntry`                                                         | `{projectPath,path}`（移入回收站）           | `Ok<void>`                                                         |
| `snapshot:save` / `snapshot:list` / `snapshot:delete` / `snapshot:clear` | 见 §6                                        | `Ok<...>`                                                          |
| `compile:document`                                                       | `{projectPath,mainFile,content}`             | `Ok<{vector,pageCount,durationMs,diagnostics}>`                    |
| `export:pdf`                                                             | `{projectPath,mainFile,content,targetPath?}` | `Ok<{path}> \| null`（取消）                                       |
| `settings:get` / `settings:set`                                          | — / `Partial<Settings>`                      | `Ok<Settings>`                                                     |
| `fonts:list`                                                             | —                                            | `Ok<FontFamily[]>`（系统 + 内置）                                  |
| `templates:list`                                                         | —                                            | `Ok<TemplateInfo[]>`（userData/templates）                         |
| `templates:import`                                                       | —（主进程弹选择框）                          | `Ok<TemplateInfo \| null>`（取消为 null）                          |
| `templates:delete`                                                       | `id: string`                                 | `Ok<void>`                                                         |
| `app:info`                                                               | —                                            | `Ok<{version,electron,node,chrome}>`                               |
| `app:openExternal`                                                       | `{url}`                                      | `Ok<void>`（仅 typst.app https）                                   |
| `app:showItem`                                                           | `{path}`                                     | `Ok<void>`（在资源管理器中显示）                                   |

## 4. 编译服务

### 4.1 引擎事实（0.7.0）

- `NodeCompiler.create({ workspace?, inputs?, fontArgs? })`。
- `addSource(path, source)`：内存源；`mapShadow(path, Buffer)` / `unmapShadow(path)` / `resetShadow()`：虚拟文件。
- `compile({ mainFileContent?, mainFilePath?, inputs?, resetRead? })`；两者互斥。
- `vector(compiled)` → `Buffer`；`pdf(compiled, { pdfStandard?, pdfTags?, creationTimestamp? })` → `Buffer`。
- 诊断：`compile()` 后先取 `hasError()`（**一次性**，见下），再 `takeError(): NodeError | null`，最后 `fetchDiagnostics(error): RawDiagnostic[]`。0.7.0 的 `takeDiagnostics()` 恒为 `null`，不要用。
  - `RawDiagnostic = { message, package, path, severity, range: { start: {line, character}, end: {line, character} } }`。
  - `line`、`character` 都是 **0-based**；`character` 是 **UTF-16 code unit**（与 JS 字符串下标一致，中文可直接用）。
  - `severity`：`1` = error；warning 未实测（按 `2` 处理，M1 验证）。
  - `path` 是正斜杠绝对路径（Windows 亦如此），比较前统一 `path.normalize`。
- **`hasError()` 会被 `takeError()` 消耗**：调用 `takeError()` 后再调 `hasError()` 返回 false。实现里只读一次并缓存，或直接以 `takeError() !== null` 判断。
- `evictCache(maxAgeSec)`：全局缓存清理；watch 场景建议 30s。
- 内置 Typst 0.14.2（来自 typst.ts v0.7.0 release notes）。

### 4.2 生命周期

```ts
class CompileService {
  private compiler: NodeCompiler | null = null;
  private projectPath: string | null = null;
  private queue = new CompileQueue();

  async ensure(projectPath: string): Promise<NodeCompiler> {
    if (this.compiler && this.projectPath === projectPath) return this.compiler;
    this.dispose();
    this.compiler = NodeCompiler.create({ workspace: projectPath });
    this.projectPath = projectPath;
    return this.compiler;
  }

  async compile(req: CompileRequest): Promise<CompileResponse> {
    return this.queue.runLatest(req, async (job) => {
      const compiler = await this.ensure(job.projectPath);
      const t0 = performance.now();
      const shadowed: string[] = [];
      for (const buf of job.buffers) {
        compiler.mapShadow(buf.path, Buffer.from(buf.content, 'utf8'));
        shadowed.push(buf.path);
      }
      try {
        const res = compiler.compile({
          mainFilePath: path.join(job.projectPath, job.mainFile),
        });
        const hasError = res.hasError(); // 读一次；takeError() 会清掉状态
        const error = hasError ? res.takeError() : null;
        const diagnostics = error
          ? parseDiagnostics(compiler.fetchDiagnostics(error), job.projectPath)
          : [];
        if (hasError || !res.result) {
          return {
            seq: job.seq,
            ok: false,
            pageCount: 0,
            diagnostics,
            durationMs: performance.now() - t0,
          };
        }
        const artifact = new Uint8Array(compiler.vector(res.result));
        return {
          seq: job.seq,
          ok: true,
          artifact,
          pageCount: res.result.numOfPages,
          diagnostics,
          durationMs: performance.now() - t0,
        };
      } finally {
        for (const p of shadowed) compiler.unmapShadow(p);
        this.maybeEvict();
      }
    });
  }
}
```

要点：

- `mapShadow` 的路径必须是编译时 `mainFilePath` 同一工作区内的**绝对路径**；大小写按 Windows 规范化。
- 每次编译后 `unmapShadow`，避免残留脏内容；也可保留到下次编译（更快），但关闭文件必须清理。
- 队列策略：`seq` 单调递增；若新任务在跑，旧任务结果仍返回但渲染层丢弃；若新任务排队，旧任务可被标记取消（编译不可中断，只能丢弃结果）。
- 原生编译同步执行，会阻塞主进程事件循环；M1 先接受（通常 <100ms），M6 按阈值迁 `utilityProcess`。
- `evictCache(30)` 用 `setInterval` 每 30s；退出/切项目时 `dispose()`（置空 + 清理定时器 + `resetShadow`）。

### 4.3 诊断解析

```ts
interface RawDiagnostic {
  message: string;
  package: string;
  path: string;
  severity: number; // 1 = error；warning 未实测
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

function parseDiagnostics(
  raw: RawDiagnostic[],
  projectPath: string,
): Diagnostic[] {
  const root = normalizeRoot(projectPath);
  return raw
    .map((d) => ({
      file: path.normalize(d.path), // path 用正斜杠，先 normalize
      from: { line: d.range.start.line, column: d.range.start.character },
      to: { line: d.range.end.line, column: d.range.end.character },
      severity: d.severity === 1 ? 'error' : 'warning',
      message: d.message,
    }))
    .filter((d) => isInside(root, d.file)); // 包内诊断不进编辑器
}
```

- `line`/`character` 0-based，`character` 按 UTF-16 code unit 计——与 `state.doc.line(line + 1).from + character` 直接相加即可，中文无需字节换算（M0 实测：`中文啊` 起点 13、终点 16）。
- `path` 可能是包路径（如 `cetz:0.2.0@lib.typ`）或项目外路径；只有落在项目根内的才映射到编辑器，其余显示在 Issues 里并标注“包内”。
- 同一位置去重；error 优先于 warning。
- 行内标记：`@codemirror/lint` 的 `Diagnostic`，`from/to` 用 `state.doc.line(n + 1).from + column`，越界夹紧。
- **只保留编译器诊断**：`codemirror-lang-typst` 的 `typst_lezer()` 自带一个 Lezer linter，会在文档变化后异步 `setDiagnostics`，覆盖编译诊断（M3 实测：标记先出现、约 300ms 后消失）。`createTypstExtensions` 用 `support.filter(ext => ext !== typstLezerLinter)` 移除它，只让 `applyDiagnostics` 写诊断。
- **Language 不能丢**：`LanguageSupport.support` 只包含 support 扩展，不含 Language 本身。过滤 linter 后必须显式加入 `typstSupport.language`，否则语法树为空——诊断、折叠服务仍可能工作，但**语法高亮会整体消失**（M3 实测）。
- 标题折叠：语言包只折叠代码块/列表/数学等节点，`setup.ts` 额外提供 `headingFolding`（折叠到下一个同级或更高级标题），并用 `foldGutter({ markerDOM })` 把默认 `⌄/›` 换成圆角 chevron SVG。
- 编译失败时 `pageCount` 返回上次成功值（渲染层保留旧 artifact，仅更新诊断）。
- `hasError()` 读一次就缓存；`takeError()` 之后再读会得到 false。

### 4.4 字体

- 默认：`NodeCompiler.create({ workspace })` **会**扫描系统字体（M0 实测：中文 PDF 嵌入 `yyb-Regular` 子集，无需显式 `fontArgs`）。
- 显式目录：`fontArgs: [{ fontPaths: ['C:/Windows/Fonts'] }]` 同样可用（M0 实测 50ms 创建、34ms 编译、无警告）；macOS `/System/Library/Fonts` 与 `/Library/Fonts`、Linux `/usr/share/fonts`。
- 设置里提供“额外字体目录”，追加到 `fontPaths`；变更后重建 compiler。
- 不在 v0.1 打包中文字体（体积/许可）；PDF 依赖系统字体嵌入。
- UI 的 Inter 只用于界面，不参与 Typst 编译。

## 5. 渲染服务

### 5.1 初始化

```ts
// src/renderer/preview/renderer.ts
import { createTypstRenderer } from '@myriaddreamin/typst.ts';
import wasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';

let rendererPromise: Promise<TypstRenderer> | null = null;

export function getRenderer() {
  rendererPromise ??= (async () => {
    const r = createTypstRenderer();
    await r.init({
      getModule: () => WebAssembly.instantiateStreaming(fetch(wasmUrl)),
    });
    return r;
  })();
  return rendererPromise;
}
```

- `init` 的具体参数以实际 d.ts 为准；若 `getModule` 不匹配，回退到 `init()` + 全局 `fetch` 拦截。
- WASM 只加载一次；失败进入预览不可用态，提供“重试”。

### 5.2 渲染一次编译结果

```ts
await renderer.runWithSession(
  { format: 'vector', artifactContent: artifact },
  async (session) => {
    const pages = session.retrievePagesInfo(); // PageInfo { pageOffset, width, height }，单位 pt
    for (const page of visiblePages) {
      await session.renderCanvas({
        canvas: ctx, // 注意：CanvasRenderingContext2D，不是 <canvas>
        pageOffset: index, // 页索引，不是 PageInfo.pageOffset
        pixelPerPt: 1.28 * zoom * dpr, // 背板像素/pt
        backgroundColor: '#ffffff',
      });
    }
  },
);
```

- 实测（2026-11-10）：`renderCanvas` 的 `canvas` 参数必须是 `CanvasRenderingContext2D`；传 `<canvas>` 或 `pageOffset` 用 `pageOffset` 会触发 Rust panic/空指针。`pixelPerPt` 含 DPR，纸面 t=52% 时 595.28pt → 792×1120 背板，正文像素采样通过。
- 纸面 CSS 宽 = `page.width * 1.28 * zoom`；canvas 背板 = CSS 宽 × min(dpr, 2)。
- 只渲染视口内页 ±1；`IntersectionObserver` 触发；缩放结束后重渲染可见页。
- 每次新 artifact 创建新 session，旧 session 立即 `reset()`/释放；同一时刻只有一个 session（队列串行）。
- 渲染失败（WASM OOM/异常）：保留旧页，显示错误 toast；`renderer` 重建一次。

### 5.3 预览交互

- 滚轮滚动容器；Ctrl+滚轮以指针为中心缩放（P1 精细锚点，v0.1 以顶部为锚）。
- 缩放 50–400，步进 10；适应宽度 = `(previewWidth - 2*gap) / (pageWidth * 1.28)`。
- 双击纸面在“适应宽度/100%”间切换。
- 页面上下文菜单（P1）：导出该页 PNG、复制页码。

## 6. 项目、文件与监听

### 6.1 打开项目

1. `dialog.showOpenDialog({ properties: ['openDirectory'] })`。
2. 若 `<dir>/.typstor/project.json` 存在：读取并校验；否则扫描顶层 `*.typ`：
   - 有 `main.typ` → 生成默认 config（不写盘，首次保存时写）；
   - 只有一个 `.typ` → 作为主文件；
   - 多个且无 main → 弹出选择主文件。
3. 读取 `workspace.json`（不存在则默认）；恢复上次文件；写入 `recent_projects`。
4. 启动 watcher（忽略 `.typstor/**`、`.git/**`、`node_modules/**`）。

### 6.2 原子保存

```ts
async function writeAtomic(
  file: string,
  content: string,
  expectedMtimeMs?: number,
) {
  const st = await fs.stat(file).catch(() => null);
  if (
    expectedMtimeMs != null &&
    st &&
    Math.abs(st.mtimeMs - expectedMtimeMs) > 1
  ) {
    throw new ConflictError(file, st.mtimeMs);
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
  return (await fs.stat(file)).mtimeMs;
}
```

- Windows 上 rename 覆盖已存在文件是原子替换（同卷）。
- 保存失败清理 tmp；不吞异常。
- 目录不存在时先 `mkdir -p`（新建文件）。

### 6.3 外部修改

- 当前实现（M2 第三片）：保存时以 `expectedMtimeMs` 做乐观并发校验；主进程发现磁盘 mtime 偏差 >2ms 返回 `ECONFLICT`，不做静默覆盖。
- 渲染层收到 `ECONFLICT` 后弹出冲突对话框，提供三种动作：
  - 取消：保留本地脏内容，不写盘；
  - 重新载入磁盘版本：丢弃本地修改，`revision + 1` 重建编辑器；
  - 覆盖保存：调用 `fs:writeFile` 的 `force: true`，跳过 mtime 校验并写回本地内容。
- `fs:writeFile` 参数为 `{path, content, expectedMtimeMs?, force?}`；`force` 仅由冲突对话框的“覆盖保存”传入。
- 后续（M4）：watcher 100ms 去抖、合并同路径事件、干净时自动重载、删除事件处理；另存副本作为冲突对话框第四项。
- 编辑器状态按文件缓存（最多 30 个）：切换回来时若内容未变，复用 `EditorState`，保留撤销历史与光标；磁盘重载后内容变化则丢弃缓存。
- 外部监听（M4 已落地）：`chokidar` 监听项目根（`ignoreInitial`、`awaitWriteFinish` 120ms、忽略 `.typstor/.git/node_modules/out/.webpack/tmp` 与 `.swp`），事件以 `{kind:'tree', event, path}` 经 `project:watch-event` 发到渲染层；打开/新建项目时启动，关闭项目时 `project:stopWatch`。渲染层对活动文件读盘比对：内容相同只更新 mtime（抑制自身保存回声）；不同且干净则重建编辑器（`revision+1`），脏则复用冲突对话框。文件树事件只重载受影响父目录，删除时清理对应子树展开状态。

### 6.4 新建项目模板

```
<parent>/<name>/
  .typstor/project.json
  main.typ
```

`main.typ` 含标题、作者、日期、一级标题、段落、公式示例；中文注释。

## 7. 窗口、协议与安全

### 7.1 自定义协议（生产）

- 原因：`file://` 下 `fetch()` 不能读 `.wasm`，WASM 渲染器会失败。
- 启动前：

```ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'typstor',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
```

- `app.whenReady()` 后 `protocol.handle('typstor', handler)`：

```ts
const ROOT = path.join(app.getAppPath(), '.webpack/renderer/main_window');
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
async function handler(req: Request) {
  const url = new URL(req.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep))
    return new Response('forbidden', { status: 403 });
  const body = await fs.readFile(file);
  return new Response(body, {
    headers: {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    },
  });
}
```

- 生产 `loadURL('typstor://app/index.html')`；开发用 `MAIN_WINDOW_WEBPACK_ENTRY`（http://localhost:…）。
- webpack `output.publicPath: 'auto'`，保证相对 chunk 在自定义协议下可解析；M1 验证。
- CSP 允许 `typstor:`；开发额外允许 `ws:`。

### 7.2 路径校验

```ts
function assertInside(root: string, target: string) {
  const r = normalizeRoot(root);
  const t = normalizeRoot(path.resolve(target));
  if (t !== r && !t.startsWith(r + path.sep)) throw new Error('EINVAL');
}
```

- `normalizeRoot`：`path.resolve` + Windows 小写 + 去尾分隔符。
- 读取跟随符号链接前 `realpath`，再校验；写入拒绝指向根外的符号链接。
- 允许根：当前项目根；打开文件夹对话框产生的根；`userData`（仅内部）；导出路径由保存对话框返回。
- 删除：仅文件/空目录；非空目录需 `recursive: true` 且二次确认。

### 7.3 IPC 校验

- 每个 handler 首行 `assertSender(event)`：`event.senderFrame === mainWindow.webContents.mainFrame`。
- 参数用 zod 校验（新增依赖）或手写守卫；v0.1 手写，避免额外依赖。
- 未知通道不注册；错误统一 `{ok:false, code, message}`。
- 不向渲染层暴露 `fs` 原始 API、`child_process`、`shell` 任意命令。

### 7.4 关闭握手

```
main: close event → preventDefault → send('app:close-request')
renderer: flush autosave + 记录 workspace → invoke('win:close', {force:true}) 或 send('app:close-cancel')
main: 2s 超时 → 直接走 askCloseAction 对话框
```

- `closeAction` 保留 `ask | app | window`；Shift 强制重问。
- 退出前：关闭 watcher、`db.close()`、`compiler.dispose()`。

### 7.5 CSP

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self' typstor:; script-src 'self' typstor:; style-src 'self' 'unsafe-inline' typstor:; img-src 'self' data: blob: typstor:; font-src 'self' typstor:; connect-src 'self' typstor: http://localhost:* ws://localhost:*;"
/>
```

生产移除非必要的 localhost；`unsafe-inline` 仅样式（MUI/Emotion 需要），脚本不允许 inline。

开发环境由 Forge WebpackPlugin 的 `devContentSecurityPolicy` 注入 CSP。**必须放行 `blob:`（default-src / img-src / connect-src）**：typst.ts 渲染器把图片解码为 blob URL 再 fetch，`connect-src` 缺 `blob:` 时图片会被拦截，WASM 在 `vec2canvas` 内 panic，含图页永久空白（2026-11-10 实测，500 页文档第 250 页）。当前值为：

```text
default-src 'self' 'unsafe-inline' data: blob:;
script-src 'self' 'unsafe-eval' 'unsafe-inline' data: blob:;
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
connect-src 'self' ws: http: https: blob: data:
```

生产 CSP metafile 同样要包含 `blob:` 与 `data:`（图片/字体），否则打包后图片预览会失败。

## 8. 状态管理

```ts
// 项目与文件
interface ProjectStore {
  path: string | null;
  config: ProjectConfig | null;
  tree: FileEntry[];
  expanded: Set<string>;
  activeFile: string | null; // 相对路径
  workspace: WorkspaceState;
  openProject(path: string): Promise<void>;
  closeProject(): void;
  toggleDir(path: string): void;
  openFile(path: string): Promise<void>;
}

// 编辑器
interface EditorStore {
  buffers: Record<
    string,
    { content: string; dirty: boolean; mtimeMs: number; cursor?: number }
  >;
  states: Map<string, EditorState>; // 非序列化，单独模块保存
  setContent(path: string, content: string): void;
  markSaved(path: string, mtimeMs: number): void;
}

// 编译/预览
interface CompileStore {
  seq: number;
  status: 'idle' | 'compiling' | 'ok' | 'error' | 'unavailable';
  artifact: Uint8Array | null;
  pageCount: number;
  diagnostics: Diagnostic[];
  durationMs: number;
  zoom: number;
  fitWidth: boolean;
  request(): Promise<void>;
  setZoom(z: number): void;
}
```

- 编辑器 `EditorState` 不放 Zustand（不可序列化、体积大），由 `editor/states.ts` 的 Map 管理，切换文件时 `view.setState()`。
- 自动保存由 `editor` store 的 dirty 变化触发，800ms 去抖；保存中又有输入则排队下一次。
- 编译请求只依赖 `buffers` 与 `seq`，与 React 渲染解耦。

## 9. 数据库

```ts
// src/main/db/index.ts
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(path.join(app.getPath('userData'), 'typstor.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
migrate(db); // PRAGMA user_version
```

```sql
-- v1
CREATE TABLE IF NOT EXISTS recent_projects (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  main_file TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_file ON snapshots(file_path, created_at DESC);
PRAGMA user_version = 1;
```

- `recent_projects` upsert：`INSERT ... ON CONFLICT(path) DO UPDATE SET opened_at=excluded.opened_at, name=..., main_file=...`。
- 上限 50 条，超出删除最旧且非 pinned。
- 快照保留：每文件 20 条；插入后删除更旧。
- 迁移函数逐版本执行，事务包裹；失败回滚并保留旧库（先备份 `typstor.db.bak`）。
- `node:sqlite` 仍是实验 API：若未来 Electron 移除，抽象 `Db` 接口，替换 better-sqlite3（ADR-5）。

## 10. 设置

`src/main/settings.ts` 扩展现有 DEFAULTS：

```ts
interface Settings {
  version: 1;
  theme: ThemeMode;
  closeAction: 'ask' | 'app' | 'window';
  lastFolder: string | null;
  lastProject: string | null;
  editor: {
    fontSize: number;
    tabSize: 2 | 4;
    lineHeight: number;
    wordWrap: boolean;
    autosave: boolean;
  };
  preview: { zoom: number; fitWidth: boolean; gap: number };
  window: { width: number; height: number; maximized: boolean };
  fonts: { extraDirs: string[] };
}
```

- 读取时合并默认值；写盘用临时文件 + rename；BOM 清理保留。
- 变更后广播 `settings:changed`（P1 多窗口）。

## 11. 构建与打包

### 11.1 webpack 改动（M1）

- `webpack.rules.mjs`：`.ts/.tsx` 与 `.js/.jsx` 各一条 babel-loader 规则；`@babel/preset-react` 统一 `runtime: 'automatic'`、`development: false`（生产构建生成 `jsx` 而不是 `jsxDEV`，否则打包后白屏）。Babel 8 移除了 `allExtensions`/`isTSX`，TSX 由扩展名自动识别。
- `webpack.renderer.config.mjs`：`output.publicPath: 'auto'`；`codemirror-lang-typst` 的 `.wasm` 走 `webassembly/async`，其余 `.wasm` 走 asset/resource；`experiments.asyncWebAssembly: true`。
- `webpack.main.config.mjs`：`externalsPresets: { node: true }`；将 `@myriaddreamin/typst-ts-node-compiler` 标记 external，运行时从 node_modules 解析；`ignoreWarnings` 过滤其它平台 optional addon 的 “Can't resolve” 警告。
- `forge.config.mjs`：`packagerConfig.asar: true`、`icon: './assets/icon'`；AutoUnpackNativesPlugin 负责 `.node`；`out/typstor-win32-x64/typstor.exe` 约 250MB，解包后的 `typst-ts-node-compiler.win32-x64-msvc.node` 约 52MB。

### 11.2 TypeScript

`tsconfig.json`：`strict`、`noEmit`、`target ES2022`、`module ESNext`、`moduleResolution bundler`、`jsx react-jsx`、`allowJs`、`checkJs false`、`skipLibCheck`、`types ["node"]`、paths `@shared/*`、`@renderer/*`。

脚本：

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"spike": "node scripts/spike-compile.mjs"
```

### 11.3 安装包

- Makers：Squirrel（Windows）、ZIP（macOS）、Deb/RPM（Linux）。
- `productName: Typstor`、`appId: com.typstor.app`；安装包图标由 `assets/icon.ico` 提供（`scripts/make-icon.py` 生成）。
- `THIRD_PARTY_NOTICES.md` 随包；关于页展示版本、Electron/Node/Typst 版本。
- 不启用自动更新（P1）。
- 打包冒烟：`TYPSTOR_SMOKE=1`、`TYPSTOR_SMOKE_PARENT=<out/smoke>`、`TYPSTOR_SMOKE_LOG=<log>`，直接启动 `out/typstor-win32-x64/typstor.exe`；日志写入文件，避免中文控制台乱码。

## 12. 性能

| 阶段     | 预算        | 措施                                                   |
| -------- | ----------- | ------------------------------------------------------ |
| 启动     | < 2s        | 窗口先显示骨架；编译/WASM 懒加载；最近项目同步查询很快 |
| 首次编译 | < 800ms     | 编译器单例；字体扫描缓存                               |
| 增量编译 | < 300ms p95 | 防抖 200ms；只 map 脏文件；不做全量 `resetRead`        |
| 渲染     | < 100ms/页  | 只渲染可见页；DPR 上限 2；缩放结束再重绘               |
| 输入     | < 16ms      | 编译不阻塞渲染；canvas 绘制在 rAF 外                   |

阈值与降级：

- 主进程单次编译 > 60ms 持续出现 → M6 迁 `utilityProcess`：worker 里 `NodeCompiler`，通过 `MessagePort` 收发，主进程只做路由；接口不变。
- 页面 > 100 页：预览默认 50%，只保留视口 ±2 页的 canvas，离屏页替换为占位。
- 诊断 > 500 条：Issues 虚拟列表。

## 13. 失败矩阵

| 场景                     | 检测                  | 行为                                              | 恢复                    |
| ------------------------ | --------------------- | ------------------------------------------------- | ----------------------- |
| 原生 addon 缺失/ABI 错误 | `require` 抛错        | 预览禁用，顶部 banner；编辑/保存可用              | 重装/换架构包；日志路径 |
| WASM 加载失败            | `init` reject         | 预览错误态 + 重试                                 | 检查协议/CSP            |
| Typst 编译错误           | `hasError()`          | 保留旧 artifact；诊断更新                         | 修复源码                |
| 编译超时（>10s）         | 计时器                | 标记 stale，允许继续输入；提示                    | 下次编译覆盖            |
| 主文件缺失               | `compile` 抛 ENOENT   | 对话框选择主文件                                  | 写回 config             |
| 项目目录丢失             | `stat` 失败           | 最近项目置灰                                      | 重新定位                |
| 磁盘写失败               | 异常                  | 保留 dirty；toast 含路径                          | 重试/另存               |
| watcher 溢出             | `error` 事件          | 提示并降级为手动刷新                              | 重启 watcher            |
| 快照写失败               | SQLite 异常           | 静默记录日志，不影响编辑                          | 下个周期重试            |
| 渲染器崩溃               | `render-process-gone` | 重载窗口；恢复 workspace 与未保存缓冲（内存快照） | 自动重载一次            |

## 14. 测试策略

- **单元**（Vitest，node 环境）：`parseDiagnostics`、`parseRange`、`assertInside`、`writeAtomic`（临时目录）、`compileQueue`（latest-wins）、`zoom` 换算、`flattenTree`。
- **组件**（Vitest + jsdom + RTL）：工具栏命令的文本变换、文件树键盘、菜单键盘、设置表单校验。
- **集成**（Vitest，node）：真实 `NodeCompiler` 编译 fixture，断言 `pageCount`、`ok`、诊断结构、耗时上限。
- **e2e**（Playwright Electron）：启动打包产物 → 新建项目 → 输入 → canvas 非空 → 导出 PDF → 主题切换 → 关闭。
- **视觉**（P1）：关键界面截图对比，容差 2px/3 色阶。

## 15. M1 实施顺序（文件级）

1. `src/main/protocol.ts` + `src/main/window.ts`：自定义协议、无边框窗口、窗口控制 IPC；空白页验证 WASM 可 fetch。
2. `src/shared/{types,channels,api}.ts` + `src/preload/index.ts`：类型化 API 骨架。
3. `src/renderer/theme/tokens.css` + `tokens.ts` + `mui.ts`：变量与 MUI 映射。
4. `layout/{AppShell,TopBar,Rail,Splitter}.tsx`：外壳与布局。
5. `views/{Welcome,FilesPanel}.tsx` + `project` IPC + 最近项目：打开项目闭环。
6. `editor/{TypstEditor,Toolbar}` + CM6 主题/命令：编辑闭环。
7. `preview/{Preview,PageCanvas,renderer}` + `compile` IPC：预览闭环。
8. `IssuesPanel` + 诊断映射 + 状态 pill。
9. 自动保存、workspace 持久化、导出 PDF。
10. 清理旧组件与 `electronAPI.invoke`。

## 16. 待验证问题（M1 首周关闭）

| #   | 问题                                         | 状态    | 结论 / 验证方式                                                    |
| --- | -------------------------------------------- | ------- | ------------------------------------------------------------------ |
| Q1  | `pixelPerPt` 是 CSS px/pt 还是设备 px/pt     | ✅ 已答 | 设备像素/pt。canvas 背板 = pt × 1.28 × zoom × DPR；52% 时 792×1120 |
| Q2  | `NodeCompiler.create` 是否默认扫描系统字体   | ✅ 已答 | 是。中文 PDF 嵌入 `yyb-Regular` 子集；显式 `fontPaths` 非必需      |
| Q3  | 诊断列是字节还是字符、几基                   | ✅ 已答 | 0-based 行与 UTF-16 code unit 列；中文样例 `中文啊` 13→16          |
| Q4  | `takeDiagnostics` 的行为                     | ✅ 已答 | 0.7.0 恒 `null`；用 `takeError()` + `fetchDiagnostics(error)`      |
| Q5  | `renderer.init` 的 `getModule` 签名          | ✅ 已答 | `init({ getModule: () => wasmUrl })` 可用；开发态有旧参数弃用警告  |
| Q6  | `query({selector:'heading'})` 是否带源码位置 | ✅ 已答 | 返回 body/level/depth，**无 location**；大纲改用 CM6 语法树        |
| Q7  | 自定义协议下 webpack chunk 路径              | 待验证  | 打包后冒烟；M1                                                     |
| Q8  | MUI v9 主题映射兼容性                        | 待验证  | 最小页面；M1                                                       |
| Q9  | 主线程阻塞时长                               | ✅ 已答 | 冷 28ms/3 页；14 页 113ms；>300ms 需迁 utilityProcess              |
| Q10 | asar + external 原生包解析                   | 待验证  | M5 干净机                                                          |
| Q11 | warning 的 `severity` 值与获取方式           | 待验证  | 构造 overflow/字体警告样例；M1                                     |
| Q12 | PDF/A、PDF/UA 的 `pdfStandard` 取值          | 待验证  | 读 d.ts + 实测；M4                                                 |
