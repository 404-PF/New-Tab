# Changelog

## v0.4.6 (unreleased)

### Bug Fixes
- Fix(storage): add 3-second timeout fallback in `src/core/storage.js` so the New Tab
  renders even when `chrome.storage.local.get()` stalls — the bridge resolves using a
  captured native `localStorage` snapshot and logs a warning.
- Fix(bootstrap): add 8-second `Promise.race` safeguard around `__storageBridgeReady` in
  `src/core/bootstrap.js` so script loading proceeds if the storage bridge hangs; a
  warning is logged when the fallback path is taken.

### Accessibility

- A11y(motion): respect `prefers-reduced-motion` across the new tab UI (#196)
  - New `src/core/motion.js` helper exposes `prefersReducedMotion()` /
    `onReducedMotionChange()` and toggles a `reduce-motion` class on
    `<html>` so future CSS can opt out with simple selectors.
  - JS-driven animation paths (motto fade, todo FLIP reorder, todo date
    highlight, background crossfade timers) now resolve instantly when
    the user prefers reduced motion.
  - Autoplaying background video is paused; the static thumbnail
    remains visible.
  - The existing CSS `*` override gains `scroll-behavior: auto` for
    completeness. The reduced-motion work is split across two media-query
    blocks: `features.css` keeps the global near-zero-duration override
    (which handles `forwards`/`both` fill-mode animations like
    `.app-icon.drag-drop-landed` and `.note-item` via the
    `animation-fill-mode: forwards` final-keyframe state), and
    `core.css` keeps the targeted `animation: none; opacity: 1` block
    for entrance/glow animations that use `backwards`/no-fill-mode plus
    `animation-delay`. No defensive overrides were added for the
    `forwards`-fill selectors — the global override already collapses
    them and adding redundant rules risked shadowing future
    opacity-based hiding of those elements.

## v0.4.5 (2026-06-04)

### Features
- Feat(app): add app folders for organizing apps in the grid (#277)
- Feat(notes): add quick notes scratchpad feature (#268)
- Feat(todo): add browser notifications for reminders (#270)
- Feat(background): add playback controls for live backgrounds (#291)
- Feat(background): add smooth crossfade transitions between wallpapers (#294)
- Feat(app): add interactive hover and press animations for app tiles (#293)
- Feat(add-app): add URL-based duplicate prevention in Add App modal (#302)
- Feat(search): add search history with suggestions and clear option (#252)
- Feat(i18n): enhance getDisplayLocale to support multiple languages with fallback (#253)
- Feat(onboarding): add resumable onboarding progress (#224)
- Feat(todo): add export and import with XSS hardening (#221)
- Feat(app): add fallback icon SVG and refactor context menu preview icons (#240)
- Feat(ui): add smooth page-load entrance animations for key widgets (#320)
- Feat(ui): animate settings panel and modal open-close transitions (#299)

### Bug Fixes
- Fix(add-app-modal): resolve function name collision that broke URL validation and submit flow (#330)
- Fix(search): prevent search history suggestions from intercepting app grid clicks (#327)
- Fix(search-bar): adjust z-index to ensure visibility over search history panel (#325)
- Fix(settings): integrate weather settings application in the settings menu (#324)
- Fix(quick-add): fix filtering and guard video APIs (#317)
- Fix(notes): call renderNotes on rollback in addNote/deleteNote and add missing test coverage (#310)
- Fix(app): ensure built-in default apps always appear in app grid order validation (#305)
- Fix(app): exclude internal app tiles from open-in-new-tab preference (#301)
- Fix(motto): show copy notification only after clipboard operation completes (#300)
- Fix(todo): drag-drop no longer corrupts order when a filter is active (#298)
- Fix(search): improve dark theme contrast for search history items (#297)
- Fix(background): remove nonstandard video resize event listener (#296)
- Fix(todo): add missing placeholders to todoReminderMessage i18n entries (#295)
- Fix(onboarding): dispatch themeChanged event during theme selection (#292)
- Fix(todo): preserve hidden todo order when drag-and-drop under a filter (#278)
- Fix(weather): localize weather widget for all supported languages (#279)
- Fix(pickers): remove duplicate event triggers for color and font pickers (#276)
- Fix(background): fix startup background loading for custom images (#266)
- Fix(app): fix stale app icon caching and state updates (#233)
- Fix(storage): fix storage hydration fallback for chrome.storage failures (#239)
- Fix(todo): update renderTodos for safe text display (#232)
- Fix(todo): enhance saveTodos with error handling and rollback (#241)
- Fix(add-app): fix empty quick-add suggestions (#267)

### Documentation
- Docs: add Chrome Web Store badge and install link to READMEs (#307)

### Maintenance
- CI: add GitHub Actions workflow for packaging CRX on release (#331)
- Chore: add ESLint v10 with flat config for code quality enforcement (#265)

## v0.4.4 (2026-05-14)

### Bug Fixes
- Fix(app): validate saved appOrder content, not just length, to prevent hidden apps (#112)

## v0.4.3 (2026-04-28)

### Bug Fixes
- Fix(todo): localize inline date picker and action tooltips (#133)
- Fix(storage): harden localStorage JSON parsing for todo and app-grid state (#132, #134)
- Fix(app): keep the Add App preview favicon in sync with the selected site (#123)
- Fix(urls): update GitHub repository URLs after the repository transfer (#128)

### UI Improvements
- Localize update notification banner and manual check messages (#129)

### Refactoring
- Refactor(i18n): decouple language switching from window globals (#131)
- Refactor(url): split validateUrl helpers (#124)

### Documentation
- Docs: align release workflow docs with the protected main-branch flow (#135, #137)
- Docs: update stale file headers from js/ to src/ paths (#102)

### Maintenance
- Chore(version): centralize extension version management (#126)
- Chore(repo): add CODEOWNERS file to define repository ownership (#130)

### Contributors
- 404-Page-Found
- LWWZH
- Copilot

## v0.4.2 (2026-04-23)

### Features
- Feat(app): introduce AppGridState to consolidate app grid state management (#93)

### Bug Fixes
- Fix(app): prevent stale cached icons after thumbnail changes (#87)
- Fix(search): re-init the search engine dropdown correctly after rebuilds (#72)

### UI Improvements
- Style(ui): refine icon, clock, and date size controls
- Style(ui): improve color picker sizing and padding
- Style(ui): update clock and date structure and styles
- Style(background): consolidate background video media queries and button styles
- Style(theme): align and improve light theme toggle contrast
- Style(todo): simplify todo counter and toggle styles
- Style(app): re-apply open-in-new-tab preference after rebuilding links

### Documentation
- Docs: update installation instructions in the README files for clarity
- Docs: add Microsoft Edge Add-ons and Download CRX badges to the README files
- Docs: enhance the README and installation details

## v0.4.1 (2026-04-10)

### Bug Fixes
- Fix: ensure icon size controls are initialized after DOM content is loaded (#57)
- Fix: restore icon size on page reload (#57)

### Refactoring
- Refactor: reorganize JS files into src/ directory by feature (#56)
- Refactor(i18n): rename extension name/description keys (#56)
- Refactor(todo): unify date format and update due-date styling (#56)

### Features
- Feat(i18n): add i18n for extension title and description (#56)

### UI Improvements
- Style(ui): center modal placeholder and reposition settings modal
- Style(ui): remove hover transform on todo items
- Style(settings): improve background video handling

### Documentation
- Docs(screenshots): add new screenshots for the new tab interface
- Docs(skills): update gh-pr-review skill documentation
- Docs(skills): update gh-issue and gh-pr skill documentation

### Maintenance
- Chore(icons): update app icons to new resolution
- Feat(ai): add 2-second delay before showing delete-button tooltip
- Feat(app): cache app icons and escape HTML
- Feat(skills): add gh-issue and gh-pr skill modules
