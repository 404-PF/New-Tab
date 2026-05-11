# AGENTS.md - Development Guide for New Tab Extension

## Project Overview

This is a Chrome/Edge browser extension (manifest v3) that provides a personalized new tab page. It uses vanilla JavaScript with no build step; browser-loaded scripts live in `New-Tab.html` and the main application code is under `src/`.

## Build & Development Commands

### Running the Extension
- Load unpacked: Go to `chrome://extensions`, enable "Developer mode", click "Load unpacked", and select the project root directory
- No build commands required - this is a vanilla JS project with no bundler

### Testing
- Automated tests are set up with **Vitest** + **jsdom**
- Run tests: `npm test`
- Run with coverage: `npm run test:coverage`
- Watch mode: `npm run test:watch`
- Tests live in `tests/` and use script injection to load vanilla JS source files into jsdom
- Manual testing is still required for browser-specific behavior (e.g., extension APIs, media playback)
- `src/core/storage.js` bridges `localStorage` onto `chrome.storage.local`; `tests/setup.js` mocks the Chrome APIs so tests exercise the same persistence path.

### Linting
- No ESLint or other linter is configured
- Manual code review required before commits

### Code Quality Tools (Recommended)
If you want to add linting, consider:
```bash
npx eslint src/**/*.js
```

## Code Style Guidelines

### General Principles
- This is a vanilla JavaScript project (no frameworks)
- Keep functions small and focused
- Use descriptive naming for functions and variables
- Add comments for complex logic (but avoid obvious comments)

### File Organization
- Main UI code: `src/` directory
- Core/runtime logic: `src/core/`
- Feature modules: `src/features/`
- UI modules: `src/ui/`
- Data modules: `src/data/`
- Background scripts: `background/`
- Entry point: `New-Tab.html`
- Global styles: `style.css`
- Entry script loading order determined by `<script>` tags in HTML

### JavaScript Conventions

**Naming:**
- Functions/variables: `camelCase` (e.g., `loadBg()`, `currentFilters`)
- Constants: `UPPER_SNAKE_CASE` with descriptive names (e.g., `STAGGER_DELAY = 0.05`)
- DOM element references: `elements` object or prefixed (e.g., `elements`, `todoInput`)
- Private functions: Prefix with underscore `_` for internal functions if needed

**Functions:**
- Use function declarations for globally accessible functions
- Use arrow functions for callbacks
- Keep functions under 50 lines when possible

**State Management:**
- Use simple module-level variables for state (see `todo.js` for example)
- Use `localStorage` for persistence with fallbacks (e.g., `localStorage.getItem("todos") || "[]"`)
- Parse JSON with default values: `JSON.parse(localStorage.getItem("key") || "default")`

**Error Handling:**
```javascript
try {
  // code that might fail
} catch (e) {
  console.error("Error description:", e);
}
```
- Always wrap potentially failing code in try-catch
- Use meaningful error messages
- Handle localStorage gracefully (may be disabled in some browsers)

**DOM Manipulation:**
- Cache DOM references when used repeatedly
- Use `document.getElementById()` for single elements, `querySelectorAll()` for collections
- Check element existence before manipulating: `if (element) { ... }`

### HTML Guidelines
- Use semantic HTML5 elements
- Keep IDs descriptive and unique
- Add `data-*` attributes for state tracking
- Example: `<div id="todo-list" data-filter="all">`

### CSS Guidelines
- Use CSS custom properties for theming (see `style.css`)
- Keep styles in `style.css` rather than inline (except for dynamic values)
- Use meaningful class names
- Follow existing color/variable conventions in the stylesheet

### Imports & Dependencies
- No ES6 modules - scripts are loaded via `<script>` tags in HTML
- No npm dependencies in browser code
- External dependencies: Sharp (Node.js for background thumbnail generation only)

### Chrome Extension Specific
- Manifest v3 format in `manifest.json`
- Use `chrome.storage` for extension-specific storage instead of `localStorage` if needed
- Follow Chrome extension best practices for permissions
- Background scripts go in `background/` directory

### Git Conventions
- Branch: `main` for development and stable releases
- Follow existing commit message style
- Test thoroughly before merging to main

### Common Patterns in This Codebase

**Language/i18n:**
```javascript
const currentLang = window.i18n ? window.i18n.currentLanguage() : 'en';
const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
```

**Initialization pattern:**
```javascript
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFunction);
} else {
  initFunction();
}
```

**Visibility-aware intervals (for clock/updates):**
```javascript
if (window.VisibilityInterval) {
  clockInterval = new VisibilityInterval(updateTime, 1000);
} else {
  clockInterval = setInterval(updateTime, 1000);
}
```

**localStorage with safe parsing:**
```javascript
function loadTodos() {
  try {
    const raw = localStorage.getItem("todos");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("Invalid todos data in localStorage: expected array, resetting to empty list");
      return [];
    }
    return parsed;
  } catch (e) {
    console.warn("Failed to parse todos from localStorage, resetting to empty list:", e);
    return [];
  }
}
```

## Adding New Features

1. Create new JS file in `js/` directory
2. Add `<script src="js/your-file.js"></script>` to `New-Tab.html`
3. Use existing patterns for state, DOM, and error handling
4. Test in browser by loading unpacked extension

## File Structure Reference

```
New-Tab/               # Project root
├── New-Tab.html       # Main entry point
├── style.css          # Styles
├── src/                # JavaScript modules
│   ├── core/           # Startup, storage, versioning, utilities
│   ├── data/           # Built-in backgrounds and motto data
│   ├── features/       # Todo, onboarding, simple mode, drag-and-drop
│   ├── ui/             # Settings, app manager, add-app flow, search UI
│   └── ai/             # AI assistant, network detection, offline handling
├── background/        # Chrome extension background scripts
│   └── tools/         # Thumbnail generation (Node.js)
├── docs/              # Documentation
└── manifest.json      # Chrome extension manifest
```

## Reference Docs

Keep deeper guidance in the existing docs instead of duplicating it here:
- [README](README.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)