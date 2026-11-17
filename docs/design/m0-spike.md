# M0 引擎 Spike 记录

> 日期：2026-11-09 · 环境：Windows（x64）· 脚本：`scripts/spike-compile.mjs` · 原始数据：`tmp/spike/summary.json`（gitignore）

## 1. 环境

| 项                                      | 值                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------- |
| OS                                      | Windows（win32 x64）                                                    |
| Node（脚本）                            | 24.16.0                                                                 |
| Electron                                | 45.2.3（对应 Node 24.22.2，`ELECTRON_RUN_AS_NODE` 实测）                |
| N-API                                   | 10                                                                      |
| SQLite（内置）                          | 3.53.0                                                                  |
| `@myriaddreamin/typst-ts-node-compiler` | 0.7.0（win32-x64-msvc optional dep）                                    |
| 内置 Typst                              | 0.14.2（typst.ts v0.7.0 release notes）                                 |
| 样本                                    | A4、3 页、中文标题/正文/公式/表格；另 14 页性能样本                     |
| 字体                                    | `#set text(font: "New Computer Modern", lang: "zh")`；未指定 `fontArgs` |

## 2. 命令

```powershell
npm install -D typescript @types/node --cache .npm-cache
npm install @myriaddreamin/typst-ts-node-compiler@0.7.0 --cache .npm-cache
node scripts/spike-compile.mjs
```

## 3. 结果（最新一次运行）

| 指标                                  | 值                                                  |
| ------------------------------------- | --------------------------------------------------- |
| `NodeCompiler.create`（首次加载模块） | 180.8 ms                                            |
| `NodeCompiler.create`（后续进程）     | 50.3–56.5 ms                                        |
| 冷编译（3 页，首次 compile）          | 26.8–27.3 ms                                        |
| 增量编辑 1（追加段落）                | 14.4–14.7 ms                                        |
| 增量编辑 2                            | 1.5 ms                                              |
| 增量编辑 3                            | 1.2–1.4 ms                                          |
| 14 页文档首次编译                     | 112.4–113.2 ms                                      |
| 14 页文档重复编译（内容不变）         | 0.3 ms（缓存命中）                                  |
| `vector()`（3 页）                    | 7.1–8.1 ms / 237,168–237,176 B                      |
| `pdf()`（3 页）                       | 3.1–4.5 ms / 68,911 B                               |
| `svg()`（3 页 rich SVG）              | 344,310 字符                                        |
| 显式 `fontArgs` 编译                  | 创建 52.5–56.5 ms + 编译 31.6–39.1 ms，3 页，无错误 |

结论：**冷启动预算 = 创建 ~180ms + 首编译 ~30ms ≈ 210ms**，满足“打开项目 2s 内出首页”（A1）。3 页增量 < 30ms；14 页 112ms，仍在 300ms 目标内。

## 4. 中文与字体

- 默认 `NodeCompiler.create({ workspace })` **会**扫描系统字体：PDF 中出现 `yyb-Regular` 子集（中文回退字体）与 `NewCM10-Regular/Bold`、`NewCMMath-Book`。
- 无需显式 `fontArgs` 即可嵌入中文；显式 `fontPaths: ['C:/Windows/Fonts']` 也可行，耗时相近，作为“自定义字体目录”设置的后备路径。
- `compiler.svg(doc)` 包含中文原文（`引擎验证样例`、`离线、桌面优先`），说明文本进入布局；PDF 视觉仍待 M1 渲染核对。
- 未知字体族不产生 warning（`#set text(font: "Definitely Missing Font")` 编译成功、无诊断），**不能**用警告检测缺字；需在 M1 用渲染/PDF 视觉检查。

## 5. 诊断 API（与文档/旧 d.ts 不一致，已修正设计文档）

`compile()` 返回 `NodeTypstCompileResult`：

```ts
const hasError = res.hasError(); // 必须先读；takeError() 会清掉状态
const err = hasError ? res.takeError() : null; // NodeError | null
const diagnostics = err ? compiler.fetchDiagnostics(err) : [];
```

- `takeDiagnostics()` 在 0.7.0 **恒返回 `null`**，不是诊断数组。
- `fetchDiagnostics(err)` 返回：

```json
{
  "message": "expected expression",
  "package": "",
  "path": "D:/Code/Deckle/tmp/spike/bad.typ",
  "severity": 1,
  "range": {
    "start": { "line": 4, "character": 18 },
    "end": { "line": 4, "character": 18 }
  }
}
```

- `line`、`character` **0-based**；`character` 是 **UTF-16 code unit**（中文样例 `#let x = 1 + 中文啊`：13→16，与 JS `indexOf` 一致），可直接映射 CodeMirror。
- `path` 使用正斜杠（Windows 也是），比较前 `path.normalize`。
- `severity === 1` 为 error；warning 未构造成功（`#warning` 不是 Typst 函数），M1 再验。
- `NodeError` 还有 `kind`（本例 `"diagnostics"`）、`compilationStatus`（`"error"`）、`shortDiagnostics`（`range: null` 的简版）。

## 6. 渲染器与后续

M0 **未**验证 WASM 渲染器（`@myriaddreamin/typst.ts` + `typst-ts-renderer`），属于 M1 首项：

1. 自定义协议下 `fetch(wasm)` 的 MIME/路径。
2. `createTypstRenderer().init()` 的 `getModule` 签名。
3. `pixelPerPt` 语义与 DPR。
4. `runWithSession` 生命周期与多页 `renderCanvas`。
5. `query` 大纲：返回 `body/level/depth`，**无源码位置** → 大纲改由 CM6 语法树/行扫描实现。

## 7. 与设计文档的偏差

| 项         | 文档原假设                               | 实测                                              | 处理                               |
| ---------- | ---------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| 诊断获取   | `takeDiagnostics('full')` + range 字符串 | `takeError()` + `fetchDiagnostics()` + range 对象 | 已改 `03-architecture.md` §4.1/4.3 |
| 行/列基准  | 待验证                                   | 0-based、UTF-16                                   | 已写入文档                         |
| 系统字体   | 未知                                     | 默认可用                                          | 已改 §4.4                          |
| 大纲 query | 带位置                                   | 无位置                                            | 已改 Q6                            |
| `hasError` | 可重复读                                 | 被 `takeError()` 消耗                             | 已写入注意事项                     |

## 8. 结论

- 引擎链路（原生编译 → vector → PDF）可行，中文可嵌入，性能满足 v0.1 预算。
- 不需要在 M1 就迁 `utilityProcess`；以“单次 > 300ms 或连续输入卡顿”为触发条件（14 页 112ms 未触发）。
- vector 体积约 79 KB/页（3 页样本）；100 页约 8 MB，IPC 结构化克隆可接受，但 M6 需压测。
- 风险保持：Typst 0.14.2 落后官方 0.15.1；WASM 渲染未验证；窗口/协议未验证。

## 9. 待办（进入 M1）

- [ ] 渲染器最小页面：空白文档 → canvas 非空。
- [ ] 自定义协议 + WASM fetch 冒烟。
- [ ] `pixelPerPt` 标定（目标：100% 下 A4 宽 762 CSS px）。
- [ ] 中文错误样例的 lint 跳转 e2e。
- [ ] PDF 视觉检查（中文、公式、表格）。
- [ ] 打包后原生 addon 加载（M5 前置）。
