# Deckle

**简体中文** · [English](./README.md)

一款本地优先、完全离线的 [Typst](https://typst.app/) 桌面编辑器：左侧写 `.typ` 源码，右侧看排版结果，一键导出 PDF。不需要账号、不上传云端，编辑、编译、导出全程不需要联网。

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![Electron](https://img.shields.io/badge/Electron-45.2.3-2F3241)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

> Deckle 是独立项目，**与 Typst GmbH 无关联**。打包的开源组件清单见 [第三方声明](./THIRD_PARTY_NOTICES.md)。

---

## 功能

### 编辑

- 基于 **CodeMirror 6**：Typst 语法高亮、括号匹配、自动补全、查找替换。
- 格式化快捷键：粗体、斜体、下划线、标题、数学。
- 每个文件独立撤销栈，切换文件不丢未保存内容。
- **自动保存**：停止输入 300 ms 后保存；`Ctrl/⌘+S` 为全局快捷键，在编辑器、预览区、文件面板都能触发。
- `chokidar` 监听外部修改：干净文件自动重载，有改动的文件弹出冲突对话框（重新加载 / 保留本地 / 另存副本）。
- 当前文件字数与项目总字数统计。

### 编译与预览

- 通过 `typst.ts` 0.7（WASM 渲染器 + 原生 Typst 编译器）**在本地完成编译**，支持多文件工程；未保存的缓冲区通过 shadow 文件映射参与编译。
- 多页 canvas 预览：缩放、适应宽度、页码跳转、护眼模式、保存状态提示。
- **自动编译**在文件保存时触发；自动保存与自动编译是两个独立开关，可以只保存不编译。
- 诊断面板（Issues）显示文件 / 行 / 列并可跳转；编译失败时保留上一次成功的预览。
- 可选的编辑器 → 预览**同步滚动**。
- 一键导出 PDF、导出项目压缩包。

### 项目与文件

- 项目就是一个普通文件夹（含 `.deckle/project.json`）；含 `main.typ` 的普通文件夹也可直接打开。
- 最近项目存于 SQLite；文件夹在磁盘上被删掉后，仍可从列表移除该记录。
- 文件树支持新建 / 重命名 / 删除 / 导入 / 在资源管理器中显示，`Ctrl/⌘+P` 按文件名快速打开。
- 项目全文搜索、文档大纲、崩溃恢复快照。
- 内置四种模板（论文模板、课程论文、实验报告、空白项目），支持导入自定义 `.zip` 模板。
- 可添加自定义字体目录，解决中文排版缺字问题。

### 界面

- 无边框窗口 + 自定义标题栏，单实例启动；布局（面板宽度、分栏比例、缩放、上次打开的文件）自动保存。
- 明 / 暗主题、编辑器字号与行高可调；界面**中英双语**，在设置里切换。
- 所有数据只留在本机：无登录、无遥测、无云同步，也不发起任何网络请求。编辑、编译、导出完全离线，详见 [隐私政策](./PRIVACY.md)。

---

## 安装

**运行要求：** Windows 10/11，x64。

从 [Releases](https://github.com/wei-with-two-swords/deckle/releases) 下载 `Deckle-<版本> Setup.exe`，双击运行。NSIS 向导会让你**自主选择安装目录**。安装包按所有用户安装，因此 Windows 会弹出 **UAC 提权提示**，点「是」继续。

- 自动创建桌面与开始菜单快捷方式。
- 卸载时保留设置与项目记录。
- 安装包未做代码签名，SmartScreen 可能提示「未知发布者」。

**免费开源。** Deckle 以 Apache License 2.0 发布，没有试用期、激活码或授权步骤，下载即可使用。想从源码构建请看 [贡献指南](./CONTRIBUTING.md)；如果 Deckle 对你有帮助，欢迎给仓库点一个 Star，让更多人发现它。

应用数据位于 `%APPDATA%\Deckle`：

| 文件            | 内容                                   |
| --------------- | -------------------------------------- |
| `settings.json` | 主题、语言、编辑器与预览偏好、窗口布局 |
| `deckle.db`     | 最近项目与恢复快照（`node:sqlite`）    |
| `templates/`    | 导入的自定义模板                       |

项目文件本体始终留在你创建它的位置。在一台全新电脑上安装，最近项目列表是空的。

---

## 源码与 open-core

Deckle 以 [Apache License 2.0](./LICENSE) 开源。本仓库包含完整应用源码、构建脚本、测试与设计文档。构建需要 Node.js 24+：

```bash
npm install
npm start        # 开发
npm test         # 单元测试
npm run dist     # Windows 安装包
```

当前桌面应用的全部代码均适用 Apache-2.0。与许多 open-core 项目一样，未来可选的在线服务（例如托管协作、团队管理）可能采用单独条款提供；这不会削减你已经获得的、对本仓库代码的权利。想参与贡献请看 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 快捷键

| 快捷键           | 功能                                     |
| ---------------- | ---------------------------------------- |
| `Ctrl/⌘+S`       | 保存当前文件（自动编译开启时同时重编译） |
| `Ctrl/⌘+P`       | 按文件名快速打开                         |
| `Ctrl/⌘+B`       | 粗体                                     |
| `Ctrl/⌘+I`       | 斜体                                     |
| `Ctrl/⌘+U`       | 下划线                                   |
| `Ctrl/⌘+Shift+1` | 标题                                     |
| `Ctrl/⌘+Shift+M` | 数学                                     |
| `Ctrl/⌘+滚轮`    | 缩放预览（缩放控件只在缩放时显现）       |

---

## 技术栈

| 层       | 技术                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| 运行时   | Electron 45.2.3                                                              |
| 界面     | React 19、TypeScript、MUI 9、Emotion、lucide-react                           |
| 状态     | Zustand 5                                                                    |
| 编辑器   | CodeMirror 6、`codemirror-lang-typst`                                        |
| 排版     | `@myriaddreamin/typst.ts` 0.7、`typst-ts-node-compiler`、`typst-ts-renderer` |
| 存储     | `node:sqlite`（`DatabaseSync`）、`settings.json`                             |
| 文件监听 | chokidar 6                                                                   |
| 构建     | webpack 5、electron-builder 26（NSIS）                                       |
| 质量     | Vitest 5、oxlint、oxfmt、TypeScript                                          |

安全加固通过 `electronFuses` 完成：禁用 `runAsNode` 与 Node CLI 调试参数，启用 `onlyLoadAppFromAsar`、asar 完整性校验与 cookie 加密。

---

## 当前限制

- **仅 Windows x64**：构建配置只有一个 NSIS target，macOS / Linux 未配置、未验证。
- **暂无应用内自动更新**：已生成 `.blockmap`，但没有接入更新器；升级目前是安装新版 `Setup.exe`。
- **未做代码签名**：SmartScreen 可能提示「未知发布者」。
- **同步滚动是近似映射**：`typst.ts` 只提供页面 → 源码的 `source_span(path)`，因此编辑器 → 预览采用行号比例估算，不是精确的源码位置。
- 按设计取舍，不做账号、云同步、协作、Git 集成、AI 写作、Web 版与移动端。

---

## 反馈

欢迎通过 [Issues](https://github.com/wei-with-two-swords/deckle/issues) 提交问题报告、功能建议、文档修正与 Pull Request，中文或英文都可以，请附上 Windows 版本、Deckle 版本与复现步骤。安全相关问题请发邮件至 `shuangjian_wei@163.com`，不要公开提交 Issue。

---

## 许可证与政策

**Deckle 是免费开源软件，采用 Apache License 2.0。** Copyright © 2026 Wei。

你可以使用、修改与再分发代码，包括商业用途，但须保留版权与署名声明并遵守许可证条款。许可证不授予 Deckle 名称与图标的使用权，详见商标政策。

| 文档                                               | 内容                                 |
| -------------------------------------------------- | ------------------------------------ |
| [LICENSE](./LICENSE)                               | Apache License 2.0 全文              |
| [NOTICE](./NOTICE)                                 | 版权、署名与商标声明                 |
| [TRADEMARK.md](./TRADEMARK.md)                     | Deckle 名称、字标与图标的使用规则    |
| [CONTRIBUTING.md](./CONTRIBUTING.md)               | 构建方式、PR 要求与贡献许可          |
| [PRIVACY.md](./PRIVACY.md)                         | 隐私政策：无账号、无遥测、无网络请求 |
| [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) | 打包的开源组件及其许可证             |

打包的第三方组件仍适用各自许可证：Typst / typst.ts、`codemirror-lang-typst` 为 Apache-2.0；React、MUI、CodeMirror、Electron 等为 MIT / ISC；Inter 界面字体为 OFL-1.1。
