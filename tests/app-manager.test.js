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
});
