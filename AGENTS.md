# AGENTS.md - Development Guide for New Tab Extension

Chrome/Edge manifest v3 new-tab page. Vanilla JS, no bundler, no transpile step.

## Setup

- **Node**: `^20.19.0 || ^22.13.0 || >=24` (`.nvmrc` pins `22.13`).
- Install: `npm install` (auto-installs Husky via `npm run prepare`).
- Load unpacked at `chrome://extensions` / `edge://extensions` with the project root as the extension directory. No build step.

## Commands

| Task | Command |
|---|---|
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Coverage (HTML report in `coverage/`) | `npm run test:coverage` |
| Lint | `npm run lint` |
| Auto-fix lint | `npm run lint:fix` |

CI (`.github/workflows/release.yml`) runs `npm ci --ignore-scripts` → `npm run lint` → `npm test` in that order. Do the same locally before opening a PR.

Pre-commit hook (`.husky/pre-commit`) runs `eslint .` automatically.

## Architecture

- **Entry point**: `New-Tab.html` is the `chrome_url_overrides.newtab` page (see `manifest.json`).
- **Script loading**: `New-Tab.html` only contains two `<script>` tags in `<head>` (`src/core/storage.js`) and at the end of `<body>` (`src/core/bootstrap.js`). All other source files are loaded dynamically by `bootstrap.js`. **To add a new source file, append its path to `scriptSources` in `src/core/bootstrap.js` — do not add `<script>` tags to `New-Tab.html`.**
- **Load order matters**. `bootstrap.js` uses `script.async = false` to preserve order, and `app-manager.js` must execute before `add-app-modal.js`, `context-menu.js`, and `app-folders.js` (see the comment in `bootstrap.js`).
- **Module style**: Browser code is plain scripts that attach functions to `window.*`. There are no ES module imports in `src/`. A handful of files (`utils.js`, `app-manager.js`, `add-app-modal.js`, `app-folders.js`, `drag-drop.js`, `context-menu.js`) wrap their top-level code in a strict-mode IIFE. Inside these IIFEs, cross-file globals must be referenced as `window.Foo`, not bare `Foo` — ESLint enforces this via `no-restricted-globals` in `eslint.config.js`.
- **Storage**: `src/core/storage.js` is a shim that bridges `localStorage` onto `chrome.storage.local` and exposes `window.__storageBridgeReady`. The bootstrap waits on that promise before loading the rest of the scripts.
- **Service worker**: `background/service-worker.js` is a separate context; ESLint treats it with browser globals only.
- **No build artifacts**: nothing is generated from source. `package.json` and `manifest.json` versions are kept in sync manually (see `.agents/skills/prepare-release/SKILL.md`).

## Directory Layout

- `src/core/` - bootstrap, storage, version, utilities, language/runtime, update check, app-grid state/storage
- `src/ui/` - settings, app manager, add-app flow, color/font pickers
- `src/features/` - todo, notes, onboarding, simple mode, drag-drop, app folders, context menu, weather, interactive background
- `src/ai/` - AI assistant, markdown parser, network/offline detection, OpenRouter client
- `src/data/` - built-in backgrounds and mottos
- `background/` - service worker and Node thumbnail/video tooling (excluded from coverage)
- `tests/` - Vitest specs; `tests/setup.js` mocks `chrome.*` and `window.i18n`
- `docs/` - localized READMEs, contributing guide, store listing copy, privacy policy
- `_locales/` - extension i18n messages

## Testing

- **Framework**: Vitest 3 in `jsdom` (`vitest.config.js`). Globals are enabled; no need to import `describe`/`it`/`expect` in test files.
- **How tests load source**: `tests/setup.js` calls `injectScript('src/core/storage.js')` which `eval`s the real file into the jsdom globals so the chrome storage shim works. Individual tests load other modules the same way (see `tests/helpers/inject-script.js`). Do not refactor the chrome mock or storage bridge without re-running the full suite — many tests depend on the bridge.
- **Single test file**: `npx vitest run tests/todo.test.js`.
- **DOM stubs**: `tests/setup.js` pre-creates a long list of element stubs (`clock-time`, `date`, `todo-list`, `notes-list`, `bg-*`, settings inputs, dialogs). If a new test fails with "cannot read property of null", add a stub there.
- **Reset between tests**: `beforeAll` and `beforeEach` clear `localStorage`; `beforeEach` also removes transient toast/notification/validation DOM nodes.
- **Manual testing still required** for extension APIs, `chrome.*` behaviors the mock does not cover, video playback, and the AI chat.
- **Coverage** (`src/**/*.js`, excludes `background/tools/**`) is generated locally only; not committed.

## Linting

- ESLint v10 flat config (`eslint.config.js`).
- Per-file `globals` blocks: source files, test files, IIFE-wrapped source files, `background/tools/*` (Node), and `background/service-worker.js` each have their own globals. When you expose a new `window.*` symbol used by tests, add it to both the `srcGlobals` and `testGlobals` objects in `eslint.config.js`.
- Source style: single quotes, semicolons, `===` only, no `var`, `no-unused-vars` ignores `_`-prefixed and arguments, `no-console` warns but allows `info`/`log`/`warn`/`error`.
- `background/tools/**` is the only place `no-console` is off and Node globals are enabled.

## Conventions

- Use `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants.
- DOM initialization follows `if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();` — `src/core/dom-ready.js` exposes `window.onDomReady` for this.
- Intervals that should pause when the tab is hidden use `new window.VisibilityInterval(fn, ms)` (defined in `src/core/utils.js`), falling back to `setInterval`.
- Persist with `localStorage` (which is bridged to `chrome.storage.local`). Wrap reads in `try/catch`, return `[]` / `{}` defaults on parse failure; log via `console.warn`.
- i18n text uses `data-i18n="key"` attributes; placeholder values like `{{searchPlaceholder}}` in `New-Tab.html` are replaced by the i18n runtime. New UI strings need entries in `_locales/*/messages.json` and the `window.i18n` mock in `tests/setup.js` if tests depend on them.
- Branch off `main`; PRs target `main`. Follow existing commit message style (see `CHANGELOG.md`).

## Release / Packaging

- `package.json` and `manifest.json` versions must stay in sync. `CURRENT_VERSION` is read from the manifest at runtime (`src/core/version.js`) — do not hardcode it elsewhere.
- The release workflow builds a CRX with `crx3` from a stripped source tree (removes `.github`, `.husky`, `.agents`, `tests`, `docs/ISSUES`, `screenshots`, all config and lockfiles). It signs with the `CRX_PRIVATE_KEY` secret (base64-encoded PEM preferred) or, if `ALLOW_EPHEMERAL_KEY=true`, generates an ephemeral key (extension ID will change).
- Triggers: `release: published` and `workflow_dispatch`.
- Use the `.agents/skills/prepare-release` skill for full release workflow.

## Skills

Local skills under `.agents/skills/` (loaded via the `skill` tool):
- `prepare-release` - version bump, changelog, manifest sync
- `create-pr` - branch prep and PR description
- `review-pr` - prioritize review findings
- `resolve-issue` - narrow evidence-first bug fix loop
- `create-issue` - draft well-scoped issues

## Reference Docs

- [README](README.md) - user-facing features and install
- [Contributing](CONTRIBUTING.md) (en: `docs/CONTRIBUTING.en.md`)
- [Changelog](CHANGELOG.md) - release history and per-PR attribution
- Localized READMEs in `docs/README.<lang>.md`
