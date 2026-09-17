import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
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
});
