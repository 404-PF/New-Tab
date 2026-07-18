# Contributing to New Tab

Thank you for your interest in contributing to the New Tab project!

## 👥 Contributing

The project is still in active development. Contributions are highly welcome!

## 🚀 Getting Started

This is a Chrome/Edge Manifest V3 new-tab page extension built with **vanilla JS — no bundler and no transpile step**.

1. Install Node `^20.19.0 || ^22.13.0 || >=24` (`.nvmrc` pins `22.13`).
2. Install dependencies: `npm install` (auto-installs Husky).
3. Load unpacked at `chrome://extensions` / `edge://extensions`, selecting the project **root**. There is no build step.

## 🧪 Development Workflow

Run these checks before opening a PR, in this order:

```bash
npm run lint
npm test
```

| Task | Command |
|---|---|
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Coverage report | `npm run test:coverage` |
| Single test file | `npx vitest run tests/foo.test.js` |
| Lint | `npm run lint` |

A pre-commit hook runs `eslint .` automatically.

## 🏗️ Architecture Overview

- **Entry point**: `New-Tab.html` is the `chrome_url_overrides.newtab` page.
- **Script loading**: only `storage.js` and `bootstrap.js` are referenced in `New-Tab.html`. All other files are loaded dynamically by `bootstrap.js` via its `scriptSources` array — to add a file, append its path there.
- **Load order matters**: `app-manager.js` must run before `add-app-modal.js`, `context-menu.js`, and `app-folders.js`.
- **Module style**: browser source files attach to `window.*` (no ES module imports in `src/`). IIFE-wrapped files must reference cross-file globals as `window.Foo`.
- **Storage**: `src/core/storage.js` bridges `localStorage` onto `chrome.storage.local`.

## 🌐 Adding a New Language

The extension supports multiple interface languages. To add a new one:

1. **Add translation entries** in `src/core/languages.js`:
   - Add a new language object inside the `translations` object with all keys from English
   - Add a native-name key to the `en` object (e.g., `swahili: "Swahili"`)
   - Add an entry to the `SUPPORTED_LANGUAGES` array with the language code, flag emoji, native name, and name key

2. **Add Chrome i18n locale** in `_locales/<code>/messages.json`:
   - Create a new folder under `_locales/` named with the locale code
   - Add `name` and `description` fields (used by Chrome Web Store)

3. **Missing keys** fall back to English automatically — no need to translate every string

4. Run tests to verify: `npm test`

## ✅ Code Style

- Single quotes, semicolons, `===` only, no `var`.
- `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants.
- Use the `readyState` guard for DOM initialization, because `bootstrap.js` appends scripts dynamically and `DOMContentLoaded` may have already fired:

  ```js
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  ```

- Intervals that pause when the tab is hidden use `new window.VisibilityInterval(fn, ms)`.

## 🔀 Submitting Changes

- Branch off `main`; PRs target `main`.
- Keep `package.json` and `manifest.json` versions in sync.
- Add a `CHANGELOG.md` entry describing your change.

## 📄 License

This project is licensed under the [MIT License](../LICENSE).
