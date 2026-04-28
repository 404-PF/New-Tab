# Changelog

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