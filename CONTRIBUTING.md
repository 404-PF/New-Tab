# Contributing to New Tab

**Available Languages**:  
[![English](https://img.shields.io/badge/English-blue)](docs/CONTRIBUTING.en.md)
[![简体中文](https://img.shields.io/badge/简体中文-blue)](docs/CONTRIBUTING.zh-CN.md)

## 👥 Contributing

Thank you for your interest in contributing to the New Tab project!

The project is still in active development. Contributions are highly welcome!

## 🚀 Getting Started

This is a Chrome/Edge Manifest V3 new-tab page extension. It is **vanilla JS with no bundler and no transpile step** — source files are loaded directly by the browser.

1. **Install Node** `^20.19.0 || ^22.13.0 || >=24` (`.nvmrc` pins `22.13`).
2. **Install dependencies**:
   ```bash
   npm install
   ```
   This auto-installs Husky via `npm run prepare`.
3. **Load the extension unpacked**: open `chrome://extensions` (or `edge://extensions`), enable *Developer mode*, and click *Load unpacked*, selecting the project **root** as the extension directory. There is **no build step**.

## 🧪 Development Workflow

Before opening a pull request, run the same checks CI runs, in this order:

```bash
npm ci --ignore-scripts   # or just rely on your existing node_modules
npm run lint
npm test
```

| Task | Command |
|---|---|
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Coverage report (`coverage/`) | `npm run test:coverage` |
| Single test file | `npx vitest run tests/foo.test.js` |
| Lint | `npm run lint` |
| Auto-fix lint | `npm run lint:fix` |

A pre-commit hook (`.husky/pre-commit`) runs `eslint .` automatically.

## 🏗️ Architecture Overview

- **Entry point**: `New-Tab.html` is the `chrome_url_overrides.newtab` page (see `manifest.json`).
- **Script loading**: `New-Tab.html` loads only `src/core/storage.js` (in `<head>`) and `src/core/bootstrap.js` (end of `<body>`). **All other source files are loaded dynamically by `bootstrap.js`.** To add a new source file, append its path to `scriptSources` in `src/core/bootstrap.js` — do **not** add `<script>` tags to `New-Tab.html`.
- **Load order matters**: `bootstrap.js` uses `script.async = false` to preserve order. `app-manager.js` must execute before `add-app-modal.js`, `context-menu.js`, and `app-folders.js`.
- **Module style**: Browser source files are plain scripts that attach functions to `window.*`. There are **no ES module imports** in `src/` source files (tests use `import`/`export`). Files wrapped in strict-mode IIFEs must reference cross-file globals as `window.Foo`, not bare `Foo` (ESLint enforces this via `no-restricted-globals`).
- **Storage**: `src/core/storage.js` bridges `localStorage` onto `chrome.storage.local`. Persist with `localStorage`, wrap reads in `try/catch`, and return `[]`/`{}` defaults on parse failure.
- **App-grid coordination**: `src/core/app-grid-state.js` exposes `window.__appGridState`, a phase-based state machine (`'idle'` → `'deferred'` → `'rendered'`). Call `__appGridState.setPhase('rendered')` when the grid is ready; it dispatches an `appGridReady` CustomEvent.

## 🌐 Adding or Updating Translations (i18n)

The **runtime** translation source is `src/core/languages.js` (the `_locales/*/messages.json` files are used by Chrome's extension platform, not at runtime for these strings). UI strings use `data-i18n="key"` attributes; the i18n runtime (`applyLanguage` in `src/core/languages.js`) overwrites the real `placeholder`/`textContent` at runtime.

When adding a new UI string:

1. Add the key to **every** language object in `src/core/languages.js` (at minimum `en`; ideally translated for all supported locales). If a key is missing even from `en`, `getTranslation` falls through to returning the key itself.
2. If your string depends on tests, add the key to the `window.i18n` mock in `tests/setup.js` as well.

To add a **brand-new language**, see the steps in [docs/CONTRIBUTING.en.md](docs/CONTRIBUTING.en.md).

## ✅ Code Style

- Single quotes, semicolons, `===` only, no `var`.
- `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants.
- `no-unused-vars` ignores `_`-prefixed and unused arguments; `no-console` warns but allows `info`/`log`/`warn`/`error`.
- DOM initialization follows the `readyState` guard:
  ```js
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  ```
  > ⚠️ Because `bootstrap.js` appends scripts dynamically, `DOMContentLoaded` may have **already fired** by the time a module executes. Always use the guard above — never only `addEventListener('DOMContentLoaded', ...)` for startup logic.
- Intervals that should pause when the tab is hidden use `new window.VisibilityInterval(fn, ms)`, falling back to `setInterval`.

## 🔀 Submitting Changes

- Branch off `main`; PRs target `main`.
- Keep `package.json` and `manifest.json` versions in sync (read at runtime via `src/core/version.js`).
- Add a `CHANGELOG.md` entry describing your change.
- For releases, use the `prepare-release` skill.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
