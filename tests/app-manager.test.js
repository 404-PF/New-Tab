import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/core/app-grid-storage.js');
  window.escapeHtml = value => String(value).replace(/</g, '&lt;');
  window.validateIconUrl = value => value;
  window.onDomReady = callback => callback();
  window.i18n.t = key => key;
  window.AppGridState = {
    getOrder: () => JSON.parse(localStorage.getItem('appOrder') || 'null'),
    saveOrder: order => localStorage.setItem('appOrder', JSON.stringify(order)),
    getCustomApps: () => JSON.parse(localStorage.getItem('customApps') || '[]'),
    getFolders: () => [],
    getHiddenDefaultApps: () => JSON.parse(localStorage.getItem('hiddenDefaultApps') || '[]'),
    canHideDefaultApp: id => id !== 'settings-app',
    isDefaultHidden: id => JSON.parse(localStorage.getItem('hiddenDefaultApps') || '[]').includes(id),
    setDefaultAppHidden: (id, hidden) => {
      const list = JSON.parse(localStorage.getItem('hiddenDefaultApps') || '[]');
      const next = hidden ? [...new Set([...list, id])] : list.filter(item => item !== id);
      localStorage.setItem('hiddenDefaultApps', JSON.stringify(next));
      return true;
    },
    getAppDisplayName: app => {
      if (app.nameKey && window.i18n && typeof window.i18n.t === 'function') {
        return window.i18n.t(app.nameKey);
      }
      return app.name || app.nameKey || '';
    }
  };
  window.__appGridState = { phase: 'idle', setPhase: vi.fn() };
  const grid = document.createElement('div');
  grid.id = 'app-grid';
  const add = document.createElement('button');
  add.id = 'new-app';
  grid.appendChild(add);
  document.body.appendChild(grid);
  injectScript('src/ui/app-manager.js');
});

beforeEach(() => {
  localStorage.clear();
  window.defaultApps[0].url = '#';
  document.querySelectorAll('#app-grid .app-icon').forEach(element => element.remove());
});

describe('app manager', () => {
  it('exposes immutable default apps and repairs duplicate custom app IDs while rendering', () => {
    expect(window.defaultApps.map(app => app.id)).toEqual(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app']);
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'custom-1', name: 'One', url: 'https://one.test', icon: 'one.png' },
      { id: 'custom-1', name: 'Duplicate', url: 'https://two.test', icon: 'two.png' }
    ]));

    window.renderAllApps();

    expect(document.querySelectorAll('#app-grid .app-icon')).toHaveLength(6);
    expect(JSON.parse(localStorage.getItem('appOrder'))).toEqual([
      'ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app', 'custom-1'
    ]);
  });

  it('fails closed for unsafe URLs that bypass persisted-app validation at the render sink', () => {
    window.defaultApps[0].url = 'javascript:alert(document.domain)';
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'unsafe-custom', name: 'Unsafe custom', url: 'javascript:alert(document.domain)', icon: 'unsafe.png' }
    ]));
    localStorage.setItem('appOrder', JSON.stringify(['ai-app', 'unsafe-custom']));

    window.renderAllApps();

    expect(document.getElementById('ai-app').getAttribute('href')).toBe('#');
    expect(document.getElementById('unsafe-custom').getAttribute('href')).toBe('#');
  });

  it('filters hidden built-in apps out of the rendered grid and order', () => {
    localStorage.setItem('hiddenDefaultApps', JSON.stringify(['weather-app']));

    window.renderAllApps();

    expect(document.getElementById('weather-app')).toBeNull();
    expect(document.getElementById('ai-app')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('appOrder'))).not.toContain('weather-app');
  });

  it('renders built-in visibility checkboxes and toggles hidden state from Settings > Apps', () => {
    const container = document.createElement('div');
    container.id = 'default-app-visibility-list';
    document.body.appendChild(container);

    try {
      window.renderAllApps();

      const appIds = Array.from(container.querySelectorAll('input[type="checkbox"]'))
        .map(checkbox => checkbox.dataset.appId);
      expect(appIds).toEqual(['ai-app', 'weather-app', 'games-app', 'feedback-app']);

      const weatherCheckbox = container.querySelector('[data-app-id="weather-app"]');
      weatherCheckbox.checked = false;
      weatherCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(JSON.parse(localStorage.getItem('hiddenDefaultApps'))).toEqual(['weather-app']);
      expect(document.getElementById('weather-app')).toBeNull();

      const rebuiltCheckbox = container.querySelector('[data-app-id="weather-app"]');
      expect(rebuiltCheckbox.checked).toBe(false);

      rebuiltCheckbox.checked = true;
      rebuiltCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(JSON.parse(localStorage.getItem('hiddenDefaultApps'))).toEqual([]);
      expect(document.getElementById('weather-app')).not.toBeNull();
    } finally {
      container.remove();
    }
  });

  it('hides and restores the Games tile from Settings > Apps (#897)', () => {
    const container = document.createElement('div');
    container.id = 'default-app-visibility-list';
    document.body.appendChild(container);

    try {
      window.renderAllApps();

      const gamesCheckbox = container.querySelector('[data-app-id="games-app"]');
      expect(gamesCheckbox).not.toBeNull();
      expect(gamesCheckbox.checked).toBe(true);

      gamesCheckbox.checked = false;
      gamesCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(JSON.parse(localStorage.getItem('hiddenDefaultApps'))).toEqual(['games-app']);
      expect(document.getElementById('games-app')).toBeNull();

      const rebuiltCheckbox = container.querySelector('[data-app-id="games-app"]');
      expect(rebuiltCheckbox.checked).toBe(false);

      rebuiltCheckbox.checked = true;
      rebuiltCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(JSON.parse(localStorage.getItem('hiddenDefaultApps'))).toEqual([]);
      expect(document.getElementById('games-app')).not.toBeNull();
      expect(JSON.parse(localStorage.getItem('appOrder'))).toContain('games-app');
    } finally {
      container.remove();
    }
  });

  it('patches only the toggled tile and keeps the visibility list node (#934)', () => {
    const container = document.createElement('div');
    container.id = 'default-app-visibility-list';
    document.body.appendChild(container);

    try {
      window.renderAllApps();

      const checkbox = container.querySelector('[data-app-id="weather-app"]');
      const label = checkbox.closest('label');
      const grid = document.getElementById('app-grid');
      const removeSpy = vi.spyOn(grid, 'removeChild');

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(document.getElementById('weather-app')).toBeNull();
      expect(removeSpy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'weather-app' }));
      expect(container.querySelector('[data-app-id="weather-app"]')).toBe(checkbox);
      expect(checkbox.closest('label')).toBe(label);
      removeSpy.mockRestore();

      const insertSpy = vi.spyOn(grid, 'insertBefore');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(document.getElementById('weather-app')).not.toBeNull();
      expect(insertSpy).toHaveBeenCalledOnce();
      expect(container.querySelector('[data-app-id="weather-app"]')).toBe(checkbox);
      insertSpy.mockRestore();
    } finally {
      container.remove();
    }
  });

  it('restores the visibility checkbox when the change fails to persist (#934)', () => {
    const container = document.createElement('div');
    container.id = 'default-app-visibility-list';
    document.body.appendChild(container);
    const originalSetDefaultAppHidden = window.AppGridState.setDefaultAppHidden;

    try {
      window.renderAllApps();

      const checkbox = container.querySelector('[data-app-id="weather-app"]');
      window.AppGridState.setDefaultAppHidden = () => false;

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(checkbox.checked).toBe(true);
      expect(document.getElementById('weather-app')).not.toBeNull();
      expect(JSON.parse(localStorage.getItem('hiddenDefaultApps') || '[]')).toEqual([]);
    } finally {
      window.AppGridState.setDefaultAppHidden = originalSetDefaultAppHidden;
      container.remove();
    }
  });

  it('refreshes the folder preview when a foldered built-in app is hidden (#934)', () => {
    const container = document.createElement('div');
    container.id = 'default-app-visibility-list';
    document.body.appendChild(container);
    const originalGetFolders = window.AppGridState.getFolders;
    const originalAppFolders = window.AppFolders;
    const refreshFolderUI = vi.fn();

    try {
      window.renderAllApps();

      window.AppGridState.getFolders = () => [{ id: 'folder-1', name: 'Folder', apps: ['weather-app'] }];
      window.AppFolders = { refreshFolderUI };

      const checkbox = container.querySelector('[data-app-id="weather-app"]');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(refreshFolderUI).toHaveBeenCalledExactlyOnceWith('folder-1');
    } finally {
      window.AppGridState.getFolders = originalGetFolders;
      if (originalAppFolders === undefined) {
        delete window.AppFolders;
      } else {
        window.AppFolders = originalAppFolders;
      }
      container.remove();
    }
  });

  it('re-syncs the open-in-new-tab checkbox when the grid rebuilds (#934)', () => {
    const openNewTabCheckbox = document.createElement('input');
    openNewTabCheckbox.type = 'checkbox';
    openNewTabCheckbox.id = 'open-new-tab-setting';
    document.body.appendChild(openNewTabCheckbox);

    try {
      localStorage.setItem('openAppsInNewTab', 'false');
      window.renderAllApps();
      expect(openNewTabCheckbox.checked).toBe(false);

      localStorage.setItem('openAppsInNewTab', 'true');
      window.renderAllApps();
      expect(openNewTabCheckbox.checked).toBe(true);
    } finally {
      openNewTabCheckbox.remove();
    }
  });
});

describe('app grid item-scoped mutators (#934)', () => {
  const buildCustomApps = count => Array.from({ length: count }, (_, index) => ({
    id: 'custom-' + index,
    name: 'App ' + index,
    url: 'https://app' + index + '.test',
    icon: 'icon-' + index + '.png'
  }));

  it('adds one icon to a 50-app grid without touching the existing nodes', () => {
    localStorage.setItem('customApps', JSON.stringify(buildCustomApps(50)));
    window.renderAllApps();

    const grid = document.getElementById('app-grid');
    const before = Array.from(grid.children);
    expect(before).toHaveLength(56);

    const removeSpy = vi.spyOn(grid, 'removeChild');
    const insertSpy = vi.spyOn(grid, 'insertBefore');

    localStorage.setItem('customApps', JSON.stringify([
      ...buildCustomApps(50),
      { id: 'custom-new', name: 'New', url: 'https://new.test', icon: 'new.png' }
    ]));
    const order = JSON.parse(localStorage.getItem('appOrder'));
    order.push('custom-new');
    localStorage.setItem('appOrder', JSON.stringify(order));

    const added = window.addAppIcon('custom-new');

    expect(added).not.toBeNull();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledExactlyOnceWith(added, document.getElementById('new-app'));

    const after = Array.from(grid.children);
    expect(after).toHaveLength(before.length + 1);
    const survivors = after.filter(element => element.id !== 'custom-new');
    expect(survivors).toHaveLength(before.length);
    survivors.forEach((element, index) => expect(element).toBe(before[index]));

    removeSpy.mockRestore();
    insertSpy.mockRestore();
  });

  it('renames only the targeted icon app-name', () => {
    localStorage.setItem('customApps', JSON.stringify(buildCustomApps(2)));
    window.renderAllApps();

    const grid = document.getElementById('app-grid');
    const first = document.getElementById('custom-0');
    const second = document.getElementById('custom-1');
    const secondName = second.querySelector('.app-name');
    const secondHtml = second.innerHTML;
    const removeSpy = vi.spyOn(grid, 'removeChild');
    const insertSpy = vi.spyOn(grid, 'insertBefore');

    expect(window.renameAppIcon('custom-0', 'Renamed')).toBe(true);

    expect(first.querySelector('.app-name').textContent).toBe('Renamed');
    expect(first.title).toBe('Renamed');
    expect(document.getElementById('custom-1')).toBe(second);
    expect(second.querySelector('.app-name')).toBe(secondName);
    expect(secondName.textContent).toBe('App 1');
    expect(second.innerHTML).toBe(secondHtml);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();

    removeSpy.mockRestore();
    insertSpy.mockRestore();
  });

  it('removes exactly one icon', () => {
    localStorage.setItem('customApps', JSON.stringify(buildCustomApps(3)));
    window.renderAllApps();

    const grid = document.getElementById('app-grid');
    const removed = document.getElementById('custom-1');
    const removeSpy = vi.spyOn(grid, 'removeChild');

    expect(window.removeAppIcon('custom-1')).toBe(true);

    expect(removeSpy).toHaveBeenCalledExactlyOnceWith(removed);
    expect(document.getElementById('custom-1')).toBeNull();
    expect(document.getElementById('custom-0')).not.toBeNull();
    expect(document.getElementById('custom-2')).not.toBeNull();

    removeSpy.mockRestore();
  });

  it('swaps one thumbnail in place', () => {
    localStorage.setItem('customApps', JSON.stringify(buildCustomApps(2)));
    window.renderAllApps();

    const first = document.getElementById('custom-0');
    const second = document.getElementById('custom-1');
    const secondImage = second.querySelector('img');

    expect(window.updateAppIcon('custom-0', 'https://cdn.test/new.png')).toBe(true);

    expect(first.querySelector('img').getAttribute('src')).toBe('https://cdn.test/new.png');
    expect(document.getElementById('custom-1')).toBe(second);
    expect(second.querySelector('img')).toBe(secondImage);
    expect(secondImage.getAttribute('src')).toBe('icon-1.png');
  });

  it('re-positions existing icons to match the persisted order', () => {
    localStorage.setItem('customApps', JSON.stringify(buildCustomApps(3)));
    window.renderAllApps();

    const grid = document.getElementById('app-grid');
    const first = document.getElementById('custom-0');
    const second = document.getElementById('custom-1');
    const third = document.getElementById('custom-2');

    const order = JSON.parse(localStorage.getItem('appOrder'));
    const withoutFirst = order.filter(id => id !== 'custom-0');
    withoutFirst.splice(2, 0, 'custom-0');
    localStorage.setItem('appOrder', JSON.stringify(withoutFirst));

    expect(window.syncAppGridOrder()).toBe(true);

    const children = Array.from(grid.children);
    expect(children.map(element => element.id)).toEqual([...withoutFirst, 'new-app']);
    expect(children).toContain(first);
    expect(children).toContain(second);
    expect(children).toContain(third);
  });

  it('rebuilds through a single DocumentFragment insertion', () => {
    localStorage.setItem('customApps', JSON.stringify(buildCustomApps(3)));
    const grid = document.getElementById('app-grid');
    const insertSpy = vi.spyOn(grid, 'insertBefore');

    window.renderAllApps();

    const fragmentInserts = insertSpy.mock.calls.filter(args => args[0] instanceof DocumentFragment);
    expect(fragmentInserts).toHaveLength(1);
    expect(fragmentInserts[0][1]).toBe(document.getElementById('new-app'));

    insertSpy.mockRestore();
  });
});
