import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Issue #1065: type-to-filter for the app grid. The filter is a pure
// DOM-visibility pass: nodes are toggled with a class, never removed or
// reordered, so drag-drop order and persisted state stay untouched.

const FILTER_INPUT_ID = 'app-grid-filter';

function setFilter(value) {
  const input = document.getElementById(FILTER_INPUT_ID);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function gridChildren() {
  return Array.from(document.getElementById('app-grid').children);
}

function visibleIds() {
  return gridChildren()
    .filter(element => !element.classList.contains('app-filter-hidden'))
    .map(element => element.id);
}

function addTile(id, title, extraClass) {
  const anchor = document.createElement('a');
  anchor.className = extraClass ? 'app-icon ' + extraClass : 'app-icon';
  anchor.id = id;
  anchor.title = title;
  document.getElementById('app-grid')
    .insertBefore(anchor, document.getElementById('new-app'));
  return anchor;
}

function stubAppState() {
  window.escapeHtml = value => String(value).replace(/</g, '&lt;');
  window.validateIconUrl = value => value;
  window.onDomReady = callback => callback();
  window.i18n.t = key => key;
  window.AppGridState = {
    getOrder: () => JSON.parse(localStorage.getItem('appOrder') || 'null'),
    saveOrder: order => localStorage.setItem('appOrder', JSON.stringify(order)),
    getCustomApps: () => JSON.parse(localStorage.getItem('customApps') || '[]'),
    getFolders: () => JSON.parse(localStorage.getItem('folders') || '[]'),
    getHiddenDefaultApps: () => JSON.parse(localStorage.getItem('hiddenDefaultApps') || '[]'),
    canHideDefaultApp: () => true,
    isDefaultHidden: () => false,
    setDefaultAppHidden: () => true,
    getAppDisplayName: app => {
      if (app.nameKey && window.i18n && typeof window.i18n.t === 'function') {
        return window.i18n.t(app.nameKey);
      }
      return app.name || app.nameKey || '';
    }
  };
  window.__appGridState = { phase: 'idle', setPhase: vi.fn() };
  window.AppFolders = {
    getFolderAppData(folder) {
      if (!folder || !Array.isArray(folder.apps)) return [];
      const customApps = JSON.parse(localStorage.getItem('customApps') || '[]');
      const defaultApps = window.defaultApps || [];
      const appMap = Object.fromEntries([...defaultApps, ...customApps].map(app => [app.id, app]));
      return folder.apps.map(id => appMap[id]).filter(Boolean);
    }
  };
}

function resetGrid() {
  // Keep the #new-app tile; it is permanent grid chrome, not a filterable app.
  gridChildren().forEach(element => {
    if (element.id !== 'new-app') element.remove();
  });
  const input = document.getElementById(FILTER_INPUT_ID);
  if (input) input.value = '';
}

describe('app grid type-to-filter (#1065)', () => {
  beforeAll(() => {
    stubAppState();
    const grid = document.createElement('div');
    grid.id = 'app-grid';
    const add = document.createElement('button');
    add.id = 'new-app';
    grid.appendChild(add);
    document.body.appendChild(grid);

    const input = document.createElement('input');
    input.id = FILTER_INPUT_ID;
    input.type = 'search';
    document.body.appendChild(input);

    injectScript('src/features/app-grid-filter.js');
  });

  beforeEach(() => {
    localStorage.clear();
    resetGrid();
  });

  it('exposes the AppGridFilter API and wires the input on init', () => {
    expect(window.AppGridFilter).toBeTruthy();
    expect(typeof window.AppGridFilter.apply).toBe('function');
    expect(typeof window.AppGridFilter.init).toBe('function');

    addTile('custom-1', 'GitHub');
    expect(window.AppGridFilter.init()).toBe(true);
    setFilter('git');

    expect(window.AppGridFilter.getQuery()).toBe('git');
    expect(visibleIds()).toEqual(['custom-1', 'new-app']);
  });

  it('hides non-matching tiles on a partial, case-insensitive name match', () => {
    addTile('custom-1', 'GitHub');
    addTile('custom-2', 'Gmail');
    addTile('custom-3', 'Notion');

    setFilter('GIT');

    const hidden = id => document.getElementById(id).classList.contains('app-filter-hidden');
    expect(hidden('custom-1')).toBe(false);
    expect(hidden('custom-2')).toBe(true);
    expect(hidden('custom-3')).toBe(true);
    expect(document.getElementById('new-app').classList.contains('app-filter-hidden')).toBe(false);
  });

  it('keeps only the New tile when nothing matches', () => {
    addTile('custom-1', 'GitHub');

    setFilter('zzz-no-such-app');

    expect(visibleIds()).toEqual(['new-app']);
  });

  it('keeps a folder visible and highlighted when a child app matches', () => {
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'custom-1', name: 'GitHub', url: 'https://github.test', icon: 'gh.png' }
    ]));
    localStorage.setItem('folders', JSON.stringify([
      { id: 'folder-1', name: 'Dev Tools', apps: ['custom-1'] }
    ]));
    addTile('folder-1', 'Dev Tools', 'folder-icon');
    addTile('custom-2', 'Notion');

    setFilter('git');

    const folder = document.getElementById('folder-1');
    expect(folder.classList.contains('app-filter-hidden')).toBe(false);
    expect(folder.classList.contains('app-filter-match')).toBe(true);
    expect(document.getElementById('custom-2').classList.contains('app-filter-hidden')).toBe(true);
  });

  it('keeps a folder visible and highlighted when the folder name matches', () => {
    localStorage.setItem('folders', JSON.stringify([
      { id: 'folder-1', name: 'Dev Tools', apps: [] }
    ]));
    addTile('folder-1', 'Dev Tools', 'folder-icon');
    addTile('custom-1', 'GitHub');

    setFilter('dev tool');

    const folder = document.getElementById('folder-1');
    expect(folder.classList.contains('app-filter-hidden')).toBe(false);
    expect(folder.classList.contains('app-filter-match')).toBe(true);
  });

  it('hides folders with no matching name or child', () => {
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'custom-1', name: 'GitHub', url: 'https://github.test', icon: 'gh.png' }
    ]));
    localStorage.setItem('folders', JSON.stringify([
      { id: 'folder-1', name: 'Dev Tools', apps: ['custom-1'] }
    ]));
    addTile('folder-1', 'Dev Tools', 'folder-icon');

    setFilter('mail');

    const folder = document.getElementById('folder-1');
    expect(folder.classList.contains('app-filter-hidden')).toBe(true);
    expect(folder.classList.contains('app-filter-match')).toBe(false);
  });

  it('re-applies the active filter when tiles are added outside a re-render', async () => {
    setFilter('git');
    addTile('custom-1', 'GitHub');
    addTile('custom-2', 'Notion');
    // The #app-grid MutationObserver re-applies the query on childList changes.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.getElementById('custom-1').classList.contains('app-filter-hidden')).toBe(false);
    expect(document.getElementById('custom-2').classList.contains('app-filter-hidden')).toBe(true);
  });

  it('clearing the filter restores the complete grid in the same order', () => {
    addTile('custom-1', 'GitHub');
    addTile('folder-1', 'Dev Tools', 'folder-icon');
    addTile('custom-2', 'Notion');
    const before = gridChildren();

    setFilter('git');
    expect(visibleIds()).toEqual(['custom-1', 'new-app']);

    setFilter('');

    const after = gridChildren();
    expect(after).toEqual(before);
    after.forEach(element => {
      expect(element.classList.contains('app-filter-hidden')).toBe(false);
      expect(element.classList.contains('app-filter-match')).toBe(false);
    });
  });

  it('ignores stray non-app children of the grid', () => {
    const stray = document.createElement('div');
    stray.id = 'stray';
    document.getElementById('app-grid').appendChild(stray);
    addTile('custom-1', 'GitHub');

    setFilter('git');

    expect(stray.classList.contains('app-filter-hidden')).toBe(false);
    expect(visibleIds()).toContain('stray');
  });
});

describe('app grid filter re-applied on re-render (#1065)', () => {
  beforeAll(() => {
    // Replace the first suite's grid so ids stay unique within this file.
    const oldGrid = document.getElementById('app-grid');
    if (oldGrid) oldGrid.remove();
    const oldInput = document.getElementById(FILTER_INPUT_ID);
    if (oldInput) oldInput.remove();

    stubAppState();
    const grid = document.createElement('div');
    grid.id = 'app-grid';
    const add = document.createElement('button');
    add.id = 'new-app';
    grid.appendChild(add);
    document.body.appendChild(grid);

    const input = document.createElement('input');
    input.id = FILTER_INPUT_ID;
    input.type = 'search';
    document.body.appendChild(input);

    injectScript('src/features/app-grid-filter.js');
    injectScript('src/ui/app-manager.js');
  });

  beforeEach(() => {
    localStorage.clear();
    resetGrid();
  });

  it('re-applies the active filter when renderAllApps rebuilds the grid', () => {
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'custom-1', name: 'GitHub', url: 'https://github.test', icon: 'gh.png' },
      { id: 'custom-2', name: 'Notion', url: 'https://notion.test', icon: 'no.png' }
    ]));

    setFilter('git');
    window.renderAllApps();

    expect(document.getElementById('custom-1').classList.contains('app-filter-hidden')).toBe(false);
    expect(document.getElementById('custom-2').classList.contains('app-filter-hidden')).toBe(true);
    expect(document.getElementById('new-app').classList.contains('app-filter-hidden')).toBe(false);
  });

  it('matches built-in tiles by their translated display name', () => {
    const originalT = window.i18n.t;
    try {
      window.i18n.t = key => (key === 'settings' ? 'Einstellungen' : key);
      // Real render path: renderAllApps -> createAppIconElement writes the
      // translated display name into the tile title the filter matches on.
      window.renderAllApps();
      const settingsTile = document.getElementById('settings-app');
      expect(settingsTile).toBeTruthy();

      setFilter('einstel');

      expect(settingsTile.classList.contains('app-filter-hidden')).toBe(false);
      expect(document.getElementById('ai-app').classList.contains('app-filter-hidden')).toBe(true);
    } finally {
      window.i18n.t = originalT;
    }
  });

  it('restores the full ordered grid when the filter is cleared before a re-render', () => {
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'custom-1', name: 'GitHub', url: 'https://github.test', icon: 'gh.png' },
      { id: 'custom-2', name: 'Notion', url: 'https://notion.test', icon: 'no.png' }
    ]));
    // Non-canonical but valid order: proves filtering never rewrites appOrder.
    const seededOrder = [
      'settings-app', 'custom-2', 'ai-app', 'custom-1',
      'weather-app', 'games-app', 'todo-app', 'feedback-app'
    ];
    localStorage.setItem('appOrder', JSON.stringify(seededOrder));
    const orderBefore = JSON.parse(localStorage.getItem('appOrder'));

    setFilter('git');
    window.renderAllApps();
    setFilter('');
    window.renderAllApps();

    const children = gridChildren().map(element => element.id);
    expect(children).toEqual([...seededOrder, 'new-app']);
    children.forEach(id => {
      expect(document.getElementById(id).classList.contains('app-filter-hidden')).toBe(false);
    });
    // No data mutation: persisted order and apps are untouched by filtering.
    expect(JSON.parse(localStorage.getItem('appOrder'))).toEqual(orderBefore);
    expect(JSON.parse(localStorage.getItem('customApps'))).toHaveLength(2);
  });
});
