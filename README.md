# Deckle

[简体中文](./README.zh-CN.md) · **English**

A local-first, offline desktop editor for [Typst](https://typst.app/) documents. Write `.typ` source on the left, see the typeset pages on the right, and export to PDF — no account, no cloud, and no network required for editing, compiling or exporting.

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![Electron](https://img.shields.io/badge/Electron-45.2.3-2F3241)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

> Deckle is an independent project and is **not affiliated with Typst GmbH**. See [Third-Party Notices](./THIRD_PARTY_NOTICES.md) for bundled open-source components.

---

## Features

### Editing

- **CodeMirror 6** editor with Typst syntax highlighting, bracket matching, autocomplete and search/replace.
- Formatting shortcuts for bold, italic, underline, headings and math.
- Per-file undo history; switching files keeps unsaved buffers intact.
- **Autosave** 300 ms after typing, plus a global `Ctrl/⌘+S` that works from any pane.
- External file changes are watched with `chokidar`: clean files reload automatically, dirty files raise a conflict dialog (reload / keep local / save a copy).
- Word count for the current file and the whole project.

### Compilation and preview

- Fully local compilation through `typst.ts` 0.7 (WASM renderer + native Typst compiler). Multi-file projects and unsaved buffers are supported via a shadow file map.
- Multi-page canvas preview with zoom, fit-to-width, page navigation, eye-care mode and a save-state indicator.
- **Auto-compile** recompiles when a file is saved; autosave and auto-compile are independent switches, so you can save without recompiling.
- Diagnostics panel (Issues) with file/line/column and jump-to-source; a failed compile keeps the last successful preview.
- Optional **synchronized scrolling** from the editor to the preview.
- One-click **PDF export** and project archive export.

### Projects and files

- A project is just a folder (with `.deckle/project.json`); ordinary folders containing `main.typ` can be opened directly.
- Recent projects stored in SQLite, with the ability to remove entries whose folders no longer exist.
- File tree with create / rename / delete / import / reveal-in-explorer, plus `Ctrl/⌘+P` quick open.
- Full-text project search, document outline, and crash-recovery snapshots.
- Four built-in templates (paper, course paper, lab report, blank) and import of custom `.zip` templates.
- Custom font directories for CJK typesetting.

### Interface

- Frameless window with a custom title bar, single-instance launch, and persistent layout (panel widths, split ratio, zoom, last opened file).
- Light / dark themes, adjustable editor typography, and a bilingual UI (简体中文 / English) switchable in Settings.
- All data stays on the machine: no login, no telemetry, no cloud sync and no network access. Editing, compiling and exporting are fully offline — see the [Privacy Policy](./PRIVACY.md).

---

## Install

**Requirements:** Windows 10/11, x64.

Download `Deckle-<version> Setup.exe` from [Releases](https://github.com/wei-with-two-swords/deckle/releases) and double-click it. The NSIS wizard lets you choose the installation directory. Because the installer is per-machine, Windows will show a **UAC prompt** — accept it to continue.

- Desktop and Start Menu shortcuts are created automatically.
- Uninstalling keeps your settings and project records.
- The installer is not code-signed, so SmartScreen may warn about an unknown publisher.

**Free and open source.** Deckle is released under the Apache License 2.0. There is no trial period, licence key or activation step — download it and use it. If you build from source, see [Contributing](./CONTRIBUTING.md); if Deckle is useful to you, a star on the repository helps others find it.

Application data lives in `%APPDATA%\Deckle`:

| File            | Contents                                                 |
| --------------- | -------------------------------------------------------- |
| `settings.json` | Theme, locale, editor/preview preferences, window layout |
| `deckle.db`     | Recent projects and recovery snapshots (`node:sqlite`)   |
| `templates/`    | Imported custom templates                                |

Project files themselves stay wherever you created them. A fresh install on a new machine starts with an empty project list.

---

## Source code and open-core model

Deckle is open source under the [Apache License 2.0](./LICENSE). This repository contains the full application source, build scripts, tests and design notes. To build it, install Node.js 24+ and run:

```bash
npm install
npm start        # development
npm test         # unit tests
npm run dist     # Windows installer
```

The current desktop app is fully covered by Apache-2.0. Like many open-core projects, future optional services (for example hosted collaboration or team administration) may be offered under separate terms; that would not reduce the rights you already have to this repository's code. See [CONTRIBUTING.md](./CONTRIBUTING.md) if you want to help.

---

## Keyboard shortcuts

| Shortcut         | Action                                                         |
| ---------------- | -------------------------------------------------------------- |
| `Ctrl/⌘+S`       | Save current file (and recompile if auto-compile is on)        |
| `Ctrl/⌘+P`       | Quick open by filename                                         |
| `Ctrl/⌘+B`       | Bold                                                           |
| `Ctrl/⌘+I`       | Italic                                                         |
| `Ctrl/⌘+U`       | Underline                                                      |
| `Ctrl/⌘+Shift+1` | Heading                                                        |
| `Ctrl/⌘+Shift+M` | Math                                                           |
| `Ctrl/⌘+Wheel`   | Zoom the preview (the zoom control appears only while zooming) |

---

## Tech stack

| Layer         | Technology                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| Runtime       | Electron 45.2.3                                                              |
| UI            | React 19, TypeScript, MUI 9, Emotion, lucide-react                           |
| State         | Zustand 5                                                                    |
| Editor        | CodeMirror 6, `codemirror-lang-typst`                                        |
| Typesetting   | `@myriaddreamin/typst.ts` 0.7, `typst-ts-node-compiler`, `typst-ts-renderer` |
| Storage       | `node:sqlite` (`DatabaseSync`), `settings.json`                              |
| File watching | chokidar 6                                                                   |
| Build         | webpack 5, electron-builder 26 (NSIS)                                        |
| Quality       | Vitest 5, oxlint, oxfmt, TypeScript                                          |

Security hardening is applied through `electronFuses`: `runAsNode` and Node CLI inspect arguments are disabled, `onlyLoadAppFromAsar` and asar-integrity validation are enabled, and cookies are encrypted.

---

## Current limitations

- **Windows x64 only.** The builder config produces a single NSIS target; macOS and Linux builds are not configured or verified.
- **No in-app auto-update yet.** The `.blockmap` is generated, but no updater is wired in. Upgrading currently means installing a newer `Setup.exe`.
- **No code signing.** Windows SmartScreen may show an "unknown publisher" warning.
- **Synchronized scrolling is approximate.** `typst.ts` exposes `source_span(path)` for page → source lookup only, so editor → preview mapping uses a line-number ratio rather than exact source spans.
- By design there is no account, cloud sync, collaboration, Git integration, AI writing assistance, or web/mobile version.

---

## Feedback

Bug reports, feature requests, documentation fixes and pull requests are welcome in [Issues](https://github.com/wei-with-two-swords/deckle/issues), in either English or 简体中文. Please include your Windows version, Deckle version and steps to reproduce. For security-sensitive reports, email `shuangjian_wei@163.com` instead of opening a public issue.

---

## License & policies

**Deckle is free and open source, licensed under the Apache License 2.0.** Copyright © 2026 Wei.

You may use, modify and redistribute the code, including commercially, provided you keep the copyright and attribution notices and comply with the license. The license does not grant rights to the Deckle name or logo — see the trademark policy.

| Document                                           | Covers                                             |
| -------------------------------------------------- | -------------------------------------------------- |
| [LICENSE](./LICENSE)                               | Apache License 2.0 — full text                     |
| [NOTICE](./NOTICE)                                 | Copyright, attribution and trademark notice        |
| [TRADEMARK.md](./TRADEMARK.md)                     | Use of the Deckle name, wordmark and icon          |
| [CONTRIBUTING.md](./CONTRIBUTING.md)               | Build instructions, PRs and contribution licensing |
| [PRIVACY.md](./PRIVACY.md)                         | Privacy Policy — no accounts, telemetry or network |
| [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) | Bundled open-source components and their licenses  |

Deckle is an independent project and is not affiliated with Typst GmbH. Bundled third-party components keep their own licenses: Typst / typst.ts and `codemirror-lang-typst` are Apache-2.0; React, MUI, CodeMirror, Electron and friends are MIT/ISC; the Inter UI font is OFL-1.1.
