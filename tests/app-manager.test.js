import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  window.escapeHtml = value => String(value).replace(/</g, '&lt;');
  window.validateIconUrl = value => value;
  window.onDomReady = callback => callback();
  window.i18n.t = key => key;
  window.AppGridState = {
    getOrder: () => JSON.parse(localStorage.getItem('appOrder') || 'null'),
    saveOrder: order => localStorage.setItem('appOrder', JSON.stringify(order)),
    getCustomApps: () => JSON.parse(localStorage.getItem('customApps') || '[]'),
    getFolders: () => []
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

describe('app manager', () => {
  it('exposes immutable default apps and repairs duplicate custom app IDs while rendering', () => {
    expect(window.defaultApps.map(app => app.id)).toEqual(['ai-app', 'weather-app', 'feedback-app', 'settings-app']);
    localStorage.setItem('customApps', JSON.stringify([
      { id: 'custom-1', name: 'One', url: 'https://one.test', icon: 'one.png' },
      { id: 'custom-1', name: 'Duplicate', url: 'https://two.test', icon: 'two.png' }
    ]));

    window.renderAllApps();

    expect(document.querySelectorAll('#app-grid .app-icon')).toHaveLength(5);
    expect(JSON.parse(localStorage.getItem('appOrder'))).toEqual([
      'ai-app', 'weather-app', 'feedback-app', 'settings-app', 'custom-1'
    ]);
  });
});
