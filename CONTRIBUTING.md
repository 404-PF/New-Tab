# Contributing to New Tab

**Available Languages**:  
[![English](https://img.shields.io/badge/English-blue)](docs/CONTRIBUTING.en.md)
[![简体中文](https://img.shields.io/badge/简体中文-blue)](docs/CONTRIBUTING.zh-CN.md)

## 👥 Contributing

Thank you for your interest in contributing to the New Tab project!

Project is still in developing stage. Contributions are highly welcome!

Whether you want to fix a bug, add a feature, improve the docs, or translate the UI, your help is appreciated. This guide explains how to set up the project, the development workflow, the architecture, and the conventions to follow.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `^20.19.0 || ^22.13.0 || >=24` (an `.nvmrc` pins `22.13`).
- A Chromium-based browser (Chrome, Edge, Brave, etc.) for loading the unpacked extension.

### Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/<your-username>/New-Tab.git
   cd New-Tab
   ```

2. Install dependencies (this also installs the Husky pre-commit hook):

   ```bash
   npm install
   ```

3. Load the extension unpacked:
   - Open `chrome://extensions` (or `edge://extensions`).
   - Enable **Developer mode**.
   - Click **Load unpacked** and select the project root directory (the folder containing `manifest.json`).
   - There is **no build step** — the extension runs directly from source.

## 🔧 Development Workflow

This project uses a vanilla-JS, no-bundler setup. Source files live under `src/` and are loaded dynamically by the bootstrap script.

### Useful commands

| Task | Command |
|---|---|
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Coverage (HTML report in `coverage/`) | `npm run test:coverage` |
| Single test file | `npx vitest run tests/todo.test.js` |
| Lint | `npm run lint` |
| Auto-fix lint | `npm run lint:fix` |

### Before opening a PR

CI runs the following in order, so run them locally first:

```bash
npm ci --ignore-scripts
npm run lint
npm test
```

A Husky pre-commit hook also runs `eslint .` automatically.

### Branching

- Branch off `main`; PRs target `main`.
- Use a descriptive branch name (e.g., `fix/issue-123-tooltip`, `feat/issue-456-weather`).
- Keep changes focused on a single issue or feature.

## 🏗️ Architecture Overview

- **Entry point**: `New-Tab.html` is the `chrome_url_overrides.newtab` page (see `manifest.json`).
- **Script loading**: `New-Tab.html` only contains two `<script>` tags — `src/core/storage.js` in `<head>` and `src/core/bootstrap.js` at the end of `<body>`. All other source files are loaded dynamically by `bootstrap.js`. **To add a new source file, append its path to `scriptSources` in `src/core/bootstrap.js` — do not add `<script>` tags to `New-Tab.html`.**
- **Load order matters**. `bootstrap.js` uses `script.async = false` to preserve order, and `app-manager.js` must execute before `add-app-modal.js`, `context-menu.js`, and `app-folders.js`.
- **Module style**: Browser code is plain scripts that attach functions to `window.*`. There are no ES module imports in `src/` source files (tests are ES modules and use `import`/`export`). A handful of files wrap their top-level code in a strict-mode IIFE. Inside these IIFEs, cross-file globals must be referenced as `window.Foo`, not bare `Foo`.
- **Storage**: `src/core/storage.js` bridges `localStorage` onto `chrome.storage.local`. The bootstrap waits on `window.__storageBridgeReady` before loading the rest of the scripts.
- **Service worker**: `background/service-worker.js` is a separate context.
- **No build artifacts**: nothing is generated from source. `package.json` and `manifest.json` versions are kept in sync manually.

### Directory layout

- `src/core/` - bootstrap, storage, version, utilities, language/runtime, update check, app-grid state/storage
- `src/ui/` - settings, app manager, add-app flow, color/font pickers
- `src/features/` - todo, notes, onboarding, simple mode, drag-drop, app folders, context menu, weather, interactive background
- `src/ai/` - AI assistant, markdown parser, network/offline detection, OpenRouter client
- `src/data/` - built-in backgrounds and mottos
- `background/` - service worker and Node thumbnail/video tooling
- `tests/` - Vitest specs
- `docs/` - localized READMEs and contributing guides
- `_locales/` - extension i18n messages

## 🎨 Code Style

- **Language**: Vanilla JavaScript, single quotes, semicolons, `===` only, no `var`.
- **Naming**: `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants.
- **DOM init guard**: Initialization follows the `readyState` guard:

  ```js
  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  ```

  `src/core/dom-ready.js` exposes `window.onDomReady` for this.
- **Cross-file globals in IIFEs**: reference as `window.Foo`, never bare `Foo` (enforced by ESLint).
- **Storage**: persist with `localStorage` (bridged to `chrome.storage.local`). Wrap reads in `try/catch`, return `[]`/`{}` defaults on parse failure.
- **Intervals**: use `new window.VisibilityInterval(fn, ms)` for intervals that should pause when the tab is hidden; it falls back to `setInterval`.
- **Linting**: ESLint v10 flat config (`eslint.config.js`). Run `npm run lint` before committing.

## 🌐 Adding a New Language

The extension supports multiple interface languages. To add a new one:

1. **Add translation entries** in `src/core/languages.js`:
   - Add a new language object inside the `translations` object. You may translate only the strings you have available — missing keys automatically fall back to English, but the language object and its metadata must still be present.
   - Add a native-name key to the `en` object (e.g., `swahili: 'Swahili'`)
   - Add an entry to the `SUPPORTED_LANGUAGES` array with the language code, flag emoji, native name, and name key

2. **Add Chrome i18n locale** in `_locales/<code>/messages.json`:
   - Create a new folder under `_locales/` named with the locale code
   - Add `name` and `description` fields (used by Chrome Web Store)

3. **Missing keys** fall back to English automatically — no need to translate every string

4. Run tests to verify: `npm test`

## 📝 Submitting Changes

1. Make your changes on a feature/fix branch.
2. Add or update tests for any behavior change.
3. Run `npm run lint` and `npm test` and make sure they pass.
4. Commit using clear, conventional commit messages (e.g., `fix(todo): ...`, `feat(weather): ...`).
5. Open a PR against `main` and describe what changed and why.
6. Link the related issue (e.g., `Closes #123`) in the PR description.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
