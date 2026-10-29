// src/features/app-grid-filter.js - Type-to-filter for the app grid (issue #1065)
//
// A small explicit input above the grid (chosen over type-ahead so plain
// typing never collides with the `/` and Ctrl+K web-search shortcuts) hides
// non-matching top-level tiles via a visibility class. Nodes are never
// removed or reordered, so drag-drop order, the #new-app tile, and
// AppGridState persistence stay untouched. Folders remain visible when the
// folder name or any child app's display name matches, and visible folders
// are highlighted.

(function () {
  'use strict';

  const FILTER_INPUT_ID = 'app-grid-filter';
  const HIDDEN_CLASS = 'app-filter-hidden';
  const MATCH_CLASS = 'app-filter-match';

  function getInput() {
    return document.getElementById(FILTER_INPUT_ID);
  }

  function getGrid() {
    return document.getElementById('app-grid');
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  // App tiles match their rendered display name. The tile title is written
  // from AppGridState.getAppDisplayName at render time, so built-ins match
  // by their translated nameKey and custom apps by their stored name.
  function tileMatchesQuery(element, query) {
    return normalize(element.title).includes(query);
  }

  // Folders stay visible when the folder name or any child app's display
  // name contains the query.
  function folderMatchesQuery(folder, query) {
    if (!folder) return false;
    if (normalize(folder.name).includes(query)) return true;
    if (!window.AppFolders || typeof window.AppFolders.getFolderAppData !== 'function') {
      return false;
    }
    return window.AppFolders.getFolderAppData(folder).some(app =>
      normalize(window.AppGridState.getAppDisplayName(app)).includes(query)
    );
  }

  /**
   * Toggles visibility classes on every top-level grid tile for the current
   * filter query. An empty query restores all tiles.
   * @returns {boolean} true when a grid was found and processed.
   */
  function applyAppGridFilter() {
    const grid = getGrid();
    if (!grid) return false;
    const input = getInput();
    const query = normalize(input ? input.value : '');
    const folders = query && window.AppGridState && Array.isArray(window.AppGridState.getFolders())
      ? window.AppGridState.getFolders()
      : [];
    const folderById = Object.fromEntries(folders.map(folder => [folder.id, folder]));

    Array.from(grid.children).forEach(element => {
      if (!element.classList || !element.classList.contains('app-icon')) return;
      // The New tile is a permanent affordance, never filtered out.
      if (element.id === 'new-app') return;
      if (!query) {
        element.classList.remove(HIDDEN_CLASS, MATCH_CLASS);
        return;
      }
      const folder = folderById[element.id] || null;
      const matched = folder
        ? folderMatchesQuery(folder, query)
        : tileMatchesQuery(element, query);
      element.classList.toggle(HIDDEN_CLASS, !matched);
      element.classList.toggle(MATCH_CLASS, Boolean(folder) && matched);
    });
    return true;
  }

  function handleFilterInput() {
    applyAppGridFilter();
  }

  function initAppGridFilter() {
    const input = getInput();
    if (!input) return false;
    input.removeEventListener('input', handleFilterInput);
    input.addEventListener('input', handleFilterInput);
    return true;
  }

  window.AppGridFilter = {
    apply: applyAppGridFilter,
    init: initAppGridFilter,
    getQuery() {
      const input = getInput();
      return input ? input.value : '';
    }
  };

  window.onDomReady(initAppGridFilter);
})();
