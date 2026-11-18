# Contributing to Deckle

Thanks for helping make Deckle better. Bug reports, feature requests,
documentation fixes and pull requests are all welcome.

## Development setup

Requirements: Windows 10/11 x64, Node.js 24+, npm.

```bash
npm install
npm start        # webpack watch + Electron, reloads on change
npm run typecheck
npm test
npm run lint
```

`npm run dist` builds the Windows NSIS installer; `npm run package` produces an
unpacked build under `dist/win-unpacked`. Native dependencies are used by the
compiler, so stop any running Electron instance before packaging.

## Pull requests

- Keep changes focused and describe the user-visible effect.
- Add or update tests for behaviour changes. `npm test` must pass, and
  `npm run typecheck` / `npm run lint` must be clean.
- Match the existing TypeScript style and component structure. Do not add a new
  dependency without explaining why in the pull request.
- Do not commit secrets, signing certificates, build output, or user data.
- For UI changes, include a screenshot or a short screen recording.
- For changes to the name, icon or installer identity, open an issue first:
  those are governed by [TRADEMARK.md](./TRADEMARK.md).

## Licensing of contributions

Deckle is licensed under the [Apache License 2.0](./LICENSE). By submitting a
pull request you agree that your contribution is licensed under the same
terms (inbound = outbound), and you certify that you have the right to submit
it. There is no separate CLA.

Please use the [Developer Certificate of Origin 1.1](https://developercertificate.org/)
by adding a `Signed-off-by: Your Name <you@example.com>` line to each commit
(`git commit -s`). This is a lightweight statement that you wrote the change or
otherwise have the right to contribute it.

## Conduct

Be respectful and constructive. Technical disagreement is fine; personal
attacks, harassment and discriminatory language are not.
