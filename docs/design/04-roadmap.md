# Deckle 路线图与风险（v0.1）

## 1. 里程碑总览

| 阶段 | 主题                | 预计      | 退出标准                                                                       |
| ---- | ------------------- | --------- | ------------------------------------------------------------------------------ |
| M0   | 设计基线 + 引擎验证 | ✅ 已完成 | 4 份文档 + spike 通过 + typecheck 基线                                         |
| M1   | 应用外壳 + 项目打开 | ✅ 已完成 | 无边框窗口、rail/topbar/面板/分隔条、主题、欢迎页、文件树、最近项目、WASM 冒烟 |
| M2   | 编辑器              | 1–2 周    | CM6 + Typst 高亮/补全/查找、格式化工具栏、保存/自动保存、每文件状态            |
| M3   | 编译 + 预览         | 2 周      | 编译队列、vector→canvas、缩放、spinner、诊断/Issues、错误保留旧预览            |
| M4   | 项目能力            | 1–2 周    | 大纲、快速打开、文件 CRUD、导出 PDF、外部监听/冲突、快照落库、欢迎页完善       |
| M5   | 测试 + 打包         | 1 周      | 单测/组件/e2e、图标、Squirrel 安装包、干净机验证、NOTICE                       |
| M6   | 加固                | 1 周      | 性能达标、utilityProcess（如需）、崩溃恢复、a11y、文件关联                     |
| M7   | P1                  | 按需      | 标签页、项目搜索、快照 UI、模板、文献导入等（不做评论/协作）                   |

依赖链：M1 → M2/M3（可并行，M2 不依赖引擎）→ M4 → M5 → M6。

## 2. M0（本轮）

### 任务

1. 写 `docs/design/01-product.md`、`02-ui.md`、`03-architecture.md`、`04-roadmap.md`。
2. `tsconfig.json` + `typecheck` 脚本；不改产品 UI 代码。
3. `scripts/spike-compile.mjs`：
   - 生成临时项目（含中文标题/段落/公式/列表，3 页；另 14 页性能样本）。
   - `NodeCompiler.create` → `compile` → 记录冷/热耗时、页数、诊断。
   - `vector()` 字节数、`pdf()` 字节数与耗时；写 `tmp/spike/out.pdf`。
   - 故意制造语法错误，记录 `hasError()` → `takeError()` → `fetchDiagnostics()` 的 `range` 形态。
   - 中文缺字检测：记录 PDF `BaseFonts` 中的 CJK 回退字体；视觉验证留 M1。
   - 输出 JSON 摘要 + 退出码。
   - 输出 JSON 摘要 + 退出码。
4. `package.json`：仅加 `@myriaddreamin/typst-ts-node-compiler@0.7.0`（依赖）、`typescript`、`@types/node`（开发）。
5. 跑通 spike，写 `docs/design/m0-spike.md`（版本、命令、耗时、诊断样例、结论、遗留问题）。
6. `npx oxlint` 与 `npx oxfmt --check` 通过；`npm run typecheck` 通过。

### 退出标准

- `node scripts/spike-compile.mjs` 退出码 0，`pageCount ≥ 1`，PDF > 0 字节，vector > 0 字节。
- 记录冷编译、热编译各 3 次的 p50/p95。
- 文档中的 Q 表至少 Q2/Q3/Q4/Q6/Q9 得到答案；其余标记 M1。
- 不引入 UI 行为变更；`npm start` 仍可打开空壳窗口（可选冒烟）。

### M0 实测结果（详见 `m0-spike.md`）

- 首次 `create` 180.8 ms，后续进程 52.5 ms；冷编译 27.3 ms/3 页；14 页 112.4 ms。
- vector 7.1 ms/237,176 B；PDF 4.5 ms/68,911 B；中文回退字体 `yyb-Regular` 已嵌入。
- 诊断：`hasError` 有副作用，`takeError()` + `fetchDiagnostics()`；0-based、UTF-16 列。
- `npm run typecheck`、`npm run lint`（0 error）通过。

### M0 spike 记录模板

```md
## 环境

- Windows 11 / Node / Electron / typst.ts / Typst 版本

## 样本

- 页数、字符数、中文占比、字体参数

## 结果

| 指标 | 冷 | 热 p50 | 热 p95 |

## 诊断

- 错误样例 range 原文、解析结果、行/列基准

## 中文

- 是否缺字、使用的 fontArgs

## 结论与后续
```

## 3. M1 应用外壳 + 项目打开

### 范围

- 自定义协议 + 无边框窗口 + 窗口控制（最小化/最大化/关闭、双击标题栏）。
- 主题变量、MUI 映射、Inter 字体。
- AppShell：rail 64、topbar 40、splitter 12、files 260、editor/preview 占位；Dashboard 与项目页两套 rail/面包屑。
- 文件树（40px 行、键盘、展开/折叠、右键菜单骨架）。
- 欢迎页 + 新建项目 + 打开项目 + 最近项目（SQLite）。
- 设置弹窗分域：Dashboard = 应用设置；项目页 = 项目设置（名称/主文件）。
- workspace 持久化（面板宽度、split、zoom、打开文件）。

### 任务拆解

1. **协议冒烟**：`deckle://app/index.html` 能加载；页内 `fetch(wasmUrl)` 返回 200/`application/wasm`。
2. **窗口**：`frame:false`、`titleBarStyle`、`trafficLightPosition`；`win:*` IPC；拖拽区/双击最大化；任务栏图标。
3. **类型层**：`src/shared/{types,channels,api}.ts`；preload 新 API；旧 `electronAPI` 过渡。
4. **主题**：`tokens.css` + `tokens.ts` + `mui.ts`；`data-theme` 切换；系统主题监听（P1）。
5. **布局**：`AppShell/TopBar/Rail/Splitter`；用 pointer events 实现 splitter（不用第三方，保证 12px 精确）。
6. **文件面板**：复用 `flattenTree` 逻辑，重写样式为 40px；`fs:readDir` + 缓存 + 展开状态；图标组件。
7. **项目服务**：`project:create/open/recent`；`project.json` 读写；主文件识别；最近项目表。
8. **欢迎页**：项目卡、空态、打开/新建对话框。
9. **设置**：扩展 settings schema；应用设置弹窗（外观/文件/关于）与项目设置弹窗（名称/主文件）；`project:updateConfig`。
10. **清理**：删除/替换旧 `AppHeader/LeftPanel/RightPanel/AppFooter/BottomPanel`；`App.jsx` → `App.tsx`。

### 退出标准

- 新建项目 → 文件树出现 `main.typ` → 点击打开（编辑器仍是占位则允许）→ 关闭重开恢复布局。
- 拖分隔条 200–480px 流畅；双击复位。
- 明暗主题切换无闪烁；rail/topbar 与文档一致。
- 关闭窗口时未保存内容触发握手（可先模拟）。
- e2e 冒烟：启动、新建临时项目、截图。

### M1 实测结果（2026-11-10）

- 启动：`DECKLE_SMOKE=1 npm start` 自动在 `tmp/smoke-*` 建项目并打开；主进程 73 KiB、preload 348 KiB、renderer dev bundle 8.29 MiB、WASM 950 KiB。
- 布局（1400×900，内容区 1399×852）：rail 64×852；topbar 1335×40；文件面板 260×792（y=60）；编辑器 603×804；预览 448×804；三者底部对齐 852。
- 文件树只有 `main.typ`；点击后 `aria-selected` 正确、编辑器占位切换；`workspace.json` 的 `openFile=main.typ` 防抖后落盘。
- 两页模型：Dashboard 的 rail 只剩“应用设置”+字标，面包屑 `Dashboard`；项目页 rail 为文件/搜索/大纲/问题/项目设置，面包屑 `Dashboard › 项目名 › 文件`，返回箭头或点 `Dashboard` 回到首页并保存 workspace。
- 设置分域：Dashboard 打开应用设置（外观/文件/关于）；项目页打开项目设置（项目名称、主文件、路径），通过 `project:updateConfig` 写回 `.deckle/project.json` 并刷新标题/面包屑；实测改名成功。
- 主题经 View 菜单切换 light→dark，`--layer-2` 变 `#2a2934`，无白闪；设置弹窗可开/关；`window.deckle` 存在；WASM 渲染器状态 `ready`。
- Dashboard 按 typst.app 保存页对齐（2026-11-10 追加）：搜索框 400×48、空白项目/打开文件夹瓦片、网格/列表切换、排序菜单、160×230 渐变卡与折角；rail 增加“帮助”；右侧快捷链接仅用系统浏览器打开 typst.app 官方页（`app:openExternal` 校验 https + 域名白名单）。截图：`docs/design/dashboard.png`。
- 偏差：`webPreferences.sandbox` 由 `true` 改为 `false`——Forge dev 的 preload bundle 注入 webpack-dev-server/HMR，会 `require('events')`，沙箱 preload 不允许；保留 `contextIsolation:true` 与 `nodeIntegration:false`。打包阶段若 preload 不再含 HMR 客户端，再评估恢复 `sandbox:true`。
- 冒烟代码收在 `src/main/smoke.ts`（`prepareSmokeProject`/`attachSmoke`），只在 `DECKLE_SMOKE=1` 时启用；M5 再迁移为 Playwright + `@electron/remote` 或 CDP。
- 遗留非致命警告：dev 无 CSP（打包前补）、typst-ts-renderer WASM `init` 旧参数警告（上游 0.7.0 行为，M3 接渲染时复核）。

## 4. M2 编辑器

> 状态：第一、二、三片已落地（2026-11-10）。CM6 + `typst_lezer` 高亮/补全/查找/折叠、打开文件、自动保存、脏标记、顶栏保存状态、格式化命令、快捷键、快速打开、File/Edit/Project 菜单、新建/重命名/删除文件、冲突对话框、每文件撤销/光标状态均已可用。

### 第三片实现（已完成）

- 冲突处理：`fs:writeFile` 增加 `force?`；主进程 mtime 偏差 >2ms 返回 `ECONFLICT`；store 保存失败时置 `conflict`，`ConflictDialog` 提供取消 / 重新载入磁盘版本 / 覆盖保存；覆盖走 `force: true`。
- 自动保存遇到冲突时暂停，避免反复弹窗。
- 编辑器状态按文件缓存（`TypstEditor.tsx` 的 `stateCache`，最多 30 个）：切换文件再切回时若内容未变，复用 `EditorState`，保留撤销历史与光标；磁盘重载后内容变化则丢弃缓存。
- 冒烟：`[smoke:conflict]` = `{appeared:true, buttons:["取消","重新载入磁盘版本","覆盖保存"], openAfter:false, hasLocal:true, hasExternal:false}`；其余断言全部通过。

### 第二片实现（已完成）

- `src/renderer/editor/commands.ts`：`makeBold/Italic/Underline`、`makeHeading/BulletList/OrderedList`、`makeMath`、`makeCode`、`insertReference`、`wrapTextSize`、`wrapEmph`、`findInEditor`；选区包裹/解包，多行命令按行去重。
- `editor/setup.ts`：`Mod-b`/`Mod-i`/`Mod-u`/`Mod-Shift-1`/`Mod-Shift-m` 快捷键；工具栏十个按钮全部接线，“Ag”打开字体菜单（系统字体 + 内置字体，选择后写入 `#set text(font: …)`）。
- 字体：`src/main/fonts.ts` 解析 TTF/OTF/TTC 的 name 表枚举 family（含 TTC 多 face、Windows/macOS/Linux 默认目录与设置里的额外目录），IPC `fonts:list`；`setDocumentFont` 优先替换已有 `#set text(font: …)`，否则插入文档开头。
- `components/QuickOpen.tsx` + `AppShell`：`Ctrl/Cmd+P` 快速打开，递归过滤文件树，↑↓/Enter/Esc。
- `layout/TopBar.tsx`：菜单顺序 Deckle / Project(Dashboard) / File / Edit / View / Help；File 含新建/打开/关闭/快速打开/设置，Edit 含撤销/重做/查找替换。
- 文件操作：`fs:createEntry`、`fs:renameEntry`、`fs:deleteEntry`（删除走系统回收站）；面板头部新建文件/新建文件夹、右键菜单、F2 重命名、Delete 删除；重命名文件时若省略扩展名则保留原扩展名。
- 冒烟：`[smoke:toolbar]` 粗体包裹、`[smoke:quickopen]` 1 个文件、`[smoke:fileops]` 创建/重命名均通过；typecheck/lint 通过。

### 第一片实现（已完成）

- `src/renderer/editor/theme.ts`：`HighlightStyle` 映射 `typstHighlightTag`（含 `typ-*` 自定义标签）到 `--syntax-*`；`EditorView.theme` 映射行号、活动行、选区、折叠、搜索面板、补全弹窗到设计变量。
- `src/renderer/editor/setup.ts`：行号/历史/折叠/括号匹配/自动补全/搜索/lint 键位；`Mod-s` 保存；`updateListener` 把文档变更交给 store。
- `src/renderer/editor/TypstEditor.tsx`：非受控 CM 实例，父组件用 `key=${path}:${revision}` 重建；卸载时 `destroy()`。
- `src/renderer/views/EditorPane.tsx`：有 `doc` 渲染编辑器，加载中 spinner，无文件空态。
- 数据：`openFile` 读入 `FileContent`，`updateDoc` 标 dirty 并 800ms 自动保存，`saveDoc` 带 `expectedMtimeMs` 写入；`ECONFLICT` 置 `error` 并 toast（冲突对话框 P2）。
- 构建：`codemirror-lang-typst` 的 wasm-pack 产物走 webpack `webassembly/async`（`webpack.renderer.config.mjs`），typst.ts 渲染器 wasm 仍走 `asset/resource`。
- 冒烟：冒烟脚本通过 `window.__deckleEditor` 追加一行，验证 pill 从“未保存”→“已保存”，并读盘确认内容落盘。

### 界面校准（2026-11-10，按用户 typst.app 项目页截图）

- 顶栏去掉 Typst 版本/页数 pill 与 `Dashboard` 面包屑段；面包屑改为 `项目名 › 文件路径`，保存状态仅在 saving/dirty/error 时以 11px 文本出现。
- 文件面板标题改 `Files/Search/Outline/Issues`，头部 40px；操作图标改为 file+/folder+/更多/导入（M4 前禁用）；行尾加 eye 图标；选中 `--action-secondary-shaded` + 600。
- 编辑工具栏去边框、扁平化，`Ag` + B/I/U/H1/列表/有序/Σ/代码/@ 十个按钮（第二片接命令）；不设评论。
- 预览工具栏去边框，缩放组 + 适应宽度；`PX_PER_PT=1.28`，`ResizeObserver` + rAF 自动适应宽度，避免观察器循环；打开项目自动打开 `main.typ`。
- 已用 `DECKLE_SMOKE=1` 复测：light 主题、zoom 52%、自动选中 main.typ、输入保存、项目设置改名、Dashboard 两页导航均通过；`docs/design/project-alignment.png` 为对齐后截图。

### 范围

- CM6 初始化：`EditorState`/`EditorView`、Typst 语言、主题、键位、搜索、补全、lint。
- 每文件状态 Map；切换文件恢复撤销/光标/滚动。
- 格式化工具栏命令（包裹/切换/插入）。
- 保存、自动保存、脏标记、外部修改冲突处理。
- 快速打开（Ctrl+P）与文件切换。
- 状态 pill：保存中/已保存/未保存。

### 任务拆解

1. 安装 `@codemirror/{state,view,commands,search,language,autocomplete,lint}` + `codemirror-lang-typst@0.6.0`。
2. `cm/setup.ts`（扩展组合）、`cm/theme.ts`（语法变量映射）、`cm/keymap.ts`。
3. `TypstEditor.tsx`：受控/非受控边界（CM 自己管文档，React 只喂初始值）。
4. `commands.ts`：bold `*…*`、italic `_…_`、underline `#underline[…]`、heading `= `、list `- `、enum `+ `、math `$…$`、code `` `…` ``、quote `> `；有选区包裹，无选区插入并落光标。
5. 自动保存队列：800ms 去抖、保存中再变更排队、失败重试 1 次。
6. 冲突处理：`fs:writeFile` 的 `ECONFLICT` → 对话框三选一。
7. 快速打开面板：文件名模糊匹配、↑↓/Enter、Esc。
8. 统计：字数/字符（状态栏 P1；topbar tooltip 可显示）。

### 退出标准

- 中文输入法组合输入不丢字；撤销/重做跨文件独立。
- 工具栏命令对选区/空选区均正确，且有单测。
- 保存往返内容字节一致（UTF-8，保留换行风格）。
- 外部修改：干净自动重载；脏弹冲突；三种选择均不丢数据。

## 5. M3 编译 + 预览

### 范围

- `CompileService`、队列、shadow 映射、诊断解析。
- 预览 canvas、页面虚拟化、缩放、适应宽度、spinner、耗时。
- Issues 面板、行内 lint、点击跳转、错误保留旧预览。
- 状态 pill（错误/警告/页数/保存）。
- 导出 PDF 初版。

### 任务拆解

1. 安装引擎/渲染器；主进程 external + `asarUnpack` 配置。
2. `compiler/{nodeCompiler,queue,diagnostics}.ts`；IPC `compile:run/cancel`。
3. `renderer.ts`：单例 init、`runWithSession`、`renderCanvas`、错误处理。
4. `Preview.tsx`：滚动容器、页面尺寸计算、IntersectionObserver。
5. `PageCanvas.tsx`：canvas 挂载、DPR、zoom 变化重绘、取消过期渲染。
6. `zoom.ts`：百分比、适应宽度、步进、持久化。
7. Issues：列表虚拟化（>200 条）、severity 图标、文件分组、跳转。
8. lint：CM6 `setDiagnostics`；行列换算单测（含中文）。
9. 导出：`pdf()` → 对话框 → 写文件 → toast。
10. 错误态：addon 缺失、WASM 失败、超时。

### 退出标准

- 10 页中文文档：输入到预览 p95 < 300ms（热）；首次 < 800ms。
- 错误样例：旧预览保留、诊断位置准确、点击跳转行列正确。
- 缩放 50–400% 清晰（DPR 2）、拖动流畅；页面懒渲染生效。
- 导出 PDF 可被 Acrobat/Edge 打开，中文嵌入。

### 已落地（2026-11-10）

- 主进程 `src/main/compile.ts`：`NodeCompiler` 按项目缓存、系统字体 + 设置字体目录、`mapShadow` 覆盖未保存内容、`hasError → takeError → fetchDiagnostics`、`vector()`；`compile:document` / `export:pdf`（保存对话框）。
- 渲染进程：`runWithSession` + 逐页 `session.renderCanvas({ canvas: ctx, pageOffset: index, pixelPerPt: 1.28*zoom*dpr })`，模块级 `renderQueue` 串行；空 artifact 不再进入渲染（编译失败显示占位而不是崩溃）。
- 预览：52% 适应宽度、缩放 50–400%、编译 spinner、错误计数、导出按钮；Issues 列表按 severity 着色，点击后打开文件并派发 `deckle:goto-line` 跳转行列。
- 实测：1 页中文模板，canvas 792×1120（52%、DPR 2），全页采样 `painted:1`；工具栏/保存/文件操作/两页导航等回归通过。

### 遗留

- ✅ 页面虚拟化：`PreviewPane` 用 `IntersectionObserver`（rootMargin 800px）逐页懒渲染，页面容器先占位，滚到附近才创建 canvas。
- ✅ 编译失败保留旧预览：store 空 vector 分支不再清 artifact，工具栏显示“N 个错误 · 显示上次成功预览”。
- ✅ CM6 行内 lint 与诊断下划线：已移除 `codemirror-lang-typst` 自带的 `typstLezerLinter`（它会异步覆盖编译诊断），`applyDiagnostics` 写入的下划线、gutter 标记和提示可稳定显示。
- 仍待人工验证：PDF 导出在 Acrobat/预览中的字体与分页效果。
- webpack 主进程的 41 条其它平台 optional addon “Can't resolve” 警告已由 `webpack.main.config.mjs` 的 `ignoreWarnings` 忽略，构建输出恢复干净。

## 6. M4 项目能力

> 状态：首片（大纲 + 项目搜索 + 快照恢复）与外部监听/导出增强已落地（2026-11-10）：大纲支持标题层级与“图 N / 表 N”分组；自动快照 3s 去抖、每文件保留 20 条；打开项目时对比磁盘内容，有差异弹“发现未保存的快照”对话框；chokidar 监听项目目录，干净自动重载、脏走冲突对话框、文件树随增删刷新；PDF 导出支持“在资源管理器中显示”。模板库已落地（2026-11-11）：`userData/templates` 磁盘存储、首次播种 4 个内置模板、导入 `.typ`/文件夹、从模板开始复制、更改模板、删除模板；Dashboard 改为 4×3 网格（搜索、导入模板、新建/打开、排序/视图、最近项目、模板清单）。最近项目卡显示主文件首页缩略图（vector → canvas，`path:modifiedAt` 缓存，失败回退渐变），hover 提供打开编辑、导出 PDF、导出压缩包、删除（回收站 + 二次确认）。待做：拖拽移动（P1）、欢迎页固定/丢失定位、导出标准选项（P1）。

- 大纲：从当前文档解析 `= 标题` 层级（跳过代码围栏），面板点击跳转到对应行；`#figure(...)` 的图/表按 `caption` 分组（解析支持嵌套方括号、字符串、`kind: table`），行前显示 `Image`/`Table2` 图标与“图 1/表 1”编号。
- 项目搜索：`project:search` 在主进程递归扫描 `.typ`（≤1MB、跳过 `.deckle/node_modules/.git/out/.webpack/tmp`，上限 200 条），返回相对路径与 0-based 行列；面板支持区分大小写、250ms 去抖，点击打开文件并跳转。
- 快照：编辑停止 3s 后写 SQLite（每文件保留 20 条）；打开项目时对比磁盘内容，存在差异则弹恢复对话框（恢复后标记 dirty，由自动保存落盘）。
- 文件 CRUD 完整：新建/重命名/删除/在资源管理器显示（已落地）；刷新（Ctrl+R 待做）；拖拽移动（P1）。
- 项目设置：主文件切换、项目名重命名。
- 快照：3s 去抖、每文件 20 条、启动检测恢复入口（已落地）。
- 外部监听：忽略规则、回声抑制、删除/重命名（已落地）。
- 导出：PDF 导出 + 在资源管理器中显示（已落地）；PDF 标准选项（P1）。
- 欢迎页：Dashboard 4×3 网格（搜索、导入模板、新建空白/打开文件夹、排序与视图切换、最近项目、模板清单）；模板存于 `userData/templates`，支持从模板开始（复制）、更改模板、删除模板；Project 菜单的“从模板开始”二级菜单随模板目录动态变化（已落地 2026-11-11）。

### 退出标准

- 大纲 20 个标题顺序正确、跳转准确。
- 删除当前打开文件 → 编辑器关闭、无崩溃。
- 快照恢复能还原 5 分钟前的未保存内容。
- e2e 覆盖：新建、编辑、预览、导出、主题、关闭。

## 7. M5 测试 + 打包

> 状态：单测、图标、打包、安装包、打包冒烟已落地（2026-11-10）。Vitest 12 个用例（路径/名称校验）；`npm run package` 产物可启动并通过打包冒烟；`npm run make` 产出 Squirrel 安装包；图标由 `scripts/make-icon.py` 生成并写入 `packagerConfig.icon`；`THIRD_PARTY_NOTICES.md` 已加。待做：组件/集成测试、Playwright e2e、jsdom 配置、CI、干净机验证。

- Vitest 配置（node + jsdom 两个 project）。
- 组件测试：工具栏、树、菜单、设置。
- 集成测试：真实编译 fixture（3 个：正常/错误/中文）。
- Playwright Electron：`pnpm package` 后启动 `out/.../deckle.exe`。
- 图标资源（16/20/32/64/128/256/512）+ 安装包图标。
- Squirrel 安装/卸载；`asarUnpack` 验证；干净 Windows 11 测试。
- `THIRD_PARTY_NOTICES.md`、关于页版本信息。
- CI（GitHub Actions，可选）：Windows typecheck/lint/unit；e2e 手动。

### 退出标准

- `npm run package` 产物可启动；安装后 `%LOCALAPPDATA%` 数据正常。
- `npm run typecheck`、`oxlint`、`oxfmt --check`、`vitest run` 全绿。
- 安装包体积记录；首启动 < 3s。

## 8. M6 加固

- 性能剖析：编译阻塞、渲染耗时、内存；必要时迁 `utilityProcess`。
  - 500 页基准已跑（2026-11-10，502 页 / 1.55MB / 含 50 张图表）：冷编译 334ms、首屏 157ms、编辑→重编译 710ms（含 400ms 防抖）、滚到文档中部 275ms、DOM 2,223、堆 84MB；过程中发现并修复 dev CSP 未放行 `blob:` 导致含图页渲染崩溃；详见 `perf-500.md`。
- 崩溃恢复：`render-process-gone` 自动重载；未保存缓冲内存快照。
- 可访问性：键盘全流程、焦点陷阱、对比度、`aria-live`。
- 大文档：100 页、20MB 项目；虚拟化与缓存。
- 文件关联 `.typ`（Windows 注册表/Squirrel 事件）。
- 错误上报：本地日志文件（`userData/logs`），不上传。

## 9. M7 P1

按产品文档 §4.2 优先级：标签页 → 项目搜索 → 快照 UI → 模板 → 本地文献导入 → 导出增强 → 自动更新 → 平台适配。评论、协作、账号、分享、Git 集成不做。

## 10. 依赖与版本

| 包                                      | 版本             | 用途                       | 引入阶段 |
| --------------------------------------- | ---------------- | -------------------------- | -------- |
| `@myriaddreamin/typst-ts-node-compiler` | 0.7.0            | 主进程编译（Typst 0.14.2） | M0       |
| `@myriaddreamin/typst.ts`               | 0.7.0            | 渲染器门面                 | M1       |
| `@myriaddreamin/typst-ts-renderer`      | 0.7.0            | WASM 渲染                  | M1       |
| `@codemirror/*`                         | 6.x              | 编辑器                     | M2       |
| `codemirror-lang-typst`                 | 0.6.0            | Typst 语言                 | M2       |
| `zustand`                               | 5.x              | 状态                       | M1       |
| `chokidar`                              | 4.x              | 文件监听                   | M1       |
| `lucide-react`                          | 最新             | 通用图标                   | M1       |
| `typescript` / `@types/node`            | ^7.0.2 / ^26.6.6 | 类型                       | M0       |
| `vitest`                                | ^5.1.0           | 单元测试                   | M5       |
| `@playwright/test`                      | 最新             | e2e                        | M5       |

版本策略：typst.ts 三件套锁同一 minor（0.7.x）；升级 0.8 需重跑 M0 spike 并核对版式差异。

## 11. 测试矩阵

| 层        | 工具                | 覆盖                     | 阶段     |
| --------- | ------------------- | ------------------------ | -------- |
| 类型      | `tsc --noEmit`      | 全部 TS/TSX              | M0 起    |
| Lint/格式 | oxlint / oxfmt      | 全部源码                 | M0 起    |
| 单元      | Vitest (node)       | 路径、名称校验、诊断     | M5 ✅    |
| 组件      | Vitest + RTL        | 工具栏、树、菜单、设置   | M5       |
| 集成      | Vitest (node)       | 真实编译 fixture         | M5       |
| e2e       | Playwright Electron | 主流程 + 导出            | M5       |
| 性能      | 自写 bench          | 10 页 / 500 页 p95、内存 | M3/M6 ✅ |
| 视觉      | 截图对比（P1）      | 关键界面                 | M6       |

## 12. 风险登记

| #   | 风险                                | 概率 | 影响          | 缓解                                    | 触发信号            |
| --- | ----------------------------------- | ---- | ------------- | --------------------------------------- | ------------------- |
| R1  | typst.ts 0.7 内置 Typst 0.14.2 落后 | 高   | 新语法不可用  | 单引擎；文档标注；跟踪 0.8              | 用户报“语法不支持”  |
| R2  | napi 原生包在 asar/安装包中加载失败 | 中   | 预览不可用    | asarUnpack + external + M5 干净机       | 启动日志 addon 错误 |
| R3  | WASM 在自定义协议/CSP 下失败        | 中   | 预览不可用    | M1 首项冒烟；本地回退数据 URI（仅调试） | fetch 404/MIME 错误 |
| R4  | 中文字体缺失/豆腐                   | 中   | 中文不可用    | spike 验证 fontArgs；设置字体目录       | 预览方块            |
| R5  | 渲染 session 泄漏                   | 中   | 内存涨/崩溃   | 单 session、reset、压力测试             | 内存曲线            |
| R6  | 编译阻塞主进程                      | 中   | 输入卡顿      | 防抖/队列；utilityProcess               | 编译 > 60ms         |
| R7  | 视觉偏差                            | 高   | “不像”        | 变量层 + 截图校准                       | 评审反馈            |
| R8  | 复制 typst 资产/商标                | 低   | 法律          | 自绘图标、自有 logo、NOTICE             | 代码审查            |
| R9  | typst.app 改版                      | 高   | 参考失效      | 变量集中；不追新                        | 设计评审            |
| R10 | CM6 Typst 语言包不成熟              | 中   | 高亮/补全缺失 | 语法树兜底；可替换 Lezer 语法           | 解析错误            |
| R11 | MUI v9 API 变化                     | 低   | 样式返工      | 只用少量组件；CSS 变量为主              | 编译错误            |
| R12 | `node:sqlite` 实验性                | 低   | 未来不可用    | Db 接口抽象                             | Electron 更新       |

## 13. 发布检查清单（M5）

- [ ] `npm run typecheck` / `lint` / `vitest run` 通过
- [ ] e2e 冒烟通过
- [ ] 安装包在干净 Windows 11 启动
- [ ] 新建/打开/保存/导出/主题/关闭手测
- [ ] 中文文档 PDF 正常
- [ ] 崩溃恢复手测（杀进程）
- [ ] 卸载后残留仅 userData（可手动清理）
- [ ] 版本号、关于页、NOTICE 更新
- [ ] 安装包 SHA256 记录

## 14. 开放问题

| #   | 问题                         | 负责人 | 截止  |
| --- | ---------------------------- | ------ | ----- |
| O1  | 是否需要在 v0.1 支持多标签页 | 产品   | M4 前 |
| O2  | 模板库首批清单               | 产品   | M4    |
| O3  | 是否内置中文字体（体积权衡） | 技术   | M3    |
| O4  | 自动更新渠道（GitHub/S3）    | 运维   | M7    |
| O5  | macOS/Linux 是否首版发布     | 产品   | M5    |
| O6  | 崩溃日志是否可选上传         | 产品   | M6    |
