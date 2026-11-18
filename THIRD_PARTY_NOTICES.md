# Third-Party Notices

Deckle is open-source software licensed under the Apache License 2.0. It
bundles or links the third-party open-source components below, together with
their transitive dependencies. Versions are the ones locked in
`package-lock.json` at build time. The licenses of these components are
independent of Deckle's own license.

| Component                               | License    | Project                                                 |
| --------------------------------------- | ---------- | ------------------------------------------------------- |
| Electron                                | MIT        | https://github.com/electron/electron                    |
| React / React DOM                       | MIT        | https://github.com/facebook/react                       |
| MUI Material / Icons                    | MIT        | https://github.com/mui/material-ui                      |
| Base UI (`@base-ui/react`)              | MIT        | https://github.com/mui/base-ui                          |
| Emotion                                 | MIT        | https://github.com/emotion-js/emotion                   |
| CodeMirror 6 (`@codemirror/*`)          | MIT        | https://github.com/codemirror/dev                       |
| Lezer (`@lezer/*`)                      | MIT        | https://github.com/lezer-parser                         |
| `codemirror-lang-typst`                 | Apache-2.0 | https://github.com/Myriad-Dreamin/codemirror-lang-typst |
| `@myriaddreamin/typst.ts`               | Apache-2.0 | https://github.com/Myriad-Dreamin/typst.ts              |
| `@myriaddreamin/typst-ts-renderer`      | Apache-2.0 | https://github.com/Myriad-Dreamin/typst.ts              |
| `@myriaddreamin/typst-ts-node-compiler` | Apache-2.0 | https://github.com/Myriad-Dreamin/typst.ts              |
| Typst compiler                          | Apache-2.0 | https://github.com/typst/typst                          |
| Chokidar                                | MIT        | https://github.com/paulmillr/chokidar                   |
| Zustand                                 | MIT        | https://github.com/pmndrs/zustand                       |
| Lucide icons                            | ISC        | https://github.com/lucide-icons/lucide                  |
| adm-zip                                 | MIT        | https://github.com/cthackers/adm-zip                    |

## Typst and typst.ts

Deckle is an independent desktop editor. It is not affiliated with, endorsed
by, or sponsored by Typst GmbH. The Typst compiler is used under the Apache
License 2.0. The typst.app web interface and its icons are separately licensed;
Deckle reimplements the layout and visual language independently and does not
include or redistribute the typst.app logo, icon assets, or source code.

## License texts

- Generated bundle for production dependencies: [THIRD_PARTY_LICENSES.txt](./THIRD_PARTY_LICENSES.txt)
- MIT: https://opensource.org/license/mit
- ISC: https://opensource.org/license/isc
- Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0

`THIRD_PARTY_LICENSES.txt` is generated from `package-lock.json` by
`scripts/collect-licenses.mjs` and is included in the installer. It contains
the full license texts of the production dependencies; packages without a
standalone license file use the standard text for their declared license.

## About this notice

This notice credits the open-source components included in Deckle. Deckle
itself is open source under the [Apache License 2.0](./LICENSE); these
third-party components keep their own licences. The generated
[THIRD_PARTY_LICENSES.txt](./THIRD_PARTY_LICENSES.txt) bundles their license
texts; keep it with the app when redistributing. The Deckle name and icon are
trademarks — see [TRADEMARK.md](./TRADEMARK.md).
