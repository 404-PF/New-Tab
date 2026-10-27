import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { DEFAULT_APPS } from './helpers/default-apps.js';

beforeAll(() => {
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
  window.defaultApps = Object.freeze(DEFAULT_APPS.map(app => ({ ...app })));
});

beforeEach(() => {
  localStorage.clear();
});

describe('hidden default app storage', () => {
  it('loadHiddenDefaultApps returns empty array by default', () => {
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
  });

  it('saveHiddenDefaultApps persists ids', () => {
    expect(AppGridStorage.saveHiddenDefaultApps(['weather-app'])).toBe(true);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual(['weather-app']);
  });

  it('handles corrupted hiddenDefaultApps data gracefully', () => {
    localStorage.setItem('hiddenDefaultApps', 'not-json');
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
  });

  it('surfaces the save-error toast for hiddenDefaultApps write failures', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;

    try {
      expect(AppGridStorage.saveHiddenDefaultApps(['ai-app'])).toBe(false);
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save app changes. Your last action was not saved.',
        'error',
        { duration: 3000 }
      );
    } finally {
      window.showToast = originalShowToast;
      warnSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});

describe('AppGridState default app visibility', () => {
  it('hides a default app by adding it to the hidden list and removing it from the order', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'feedback-app', 'settings-app']);

    expect(AppGridState.hideDefaultApp('weather-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('weather-app')).toBe(true);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual(['weather-app']);
    expect(AppGridState.getOrder()).toEqual(['ai-app', 'feedback-app', 'settings-app']);
  });

  it('showDefaultApp restores the app and re-inserts it into the order', () => {
    AppGridStorage.saveOrder(['ai-app', 'feedback-app', 'settings-app']);
    AppGridStorage.saveHiddenDefaultApps(['weather-app']);

    expect(AppGridState.showDefaultApp('weather-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('weather-app')).toBe(false);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
    expect(AppGridState.getOrder()).toEqual(['ai-app', 'feedback-app', 'settings-app', 'weather-app']);
  });

  it('is idempotent for repeated hide and show calls', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'settings-app']);

    expect(AppGridState.hideDefaultApp('weather-app')).toBe(true);
    expect(AppGridState.hideDefaultApp('weather-app')).toBe(true);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual(['weather-app']);

    expect(AppGridState.showDefaultApp('weather-app')).toBe(true);
    expect(AppGridState.showDefaultApp('weather-app')).toBe(true);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
  });

  it('rejects unknown ids and non-hideable defaults', () => {
    expect(AppGridState.hideDefaultApp('not-an-app')).toBe(false);
    expect(AppGridState.hideDefaultApp('settings-app')).toBe(false);
    expect(AppGridState.canHideDefaultApp('ai-app')).toBe(true);
    expect(AppGridState.canHideDefaultApp('settings-app')).toBe(false);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
  });

  it('hides and restores Games through the generic mechanism (#897)', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app']);

    expect(AppGridState.canHideDefaultApp('games-app')).toBe(true);
    expect(AppGridState.hideDefaultApp('games-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('games-app')).toBe(true);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual(['games-app']);
    expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'feedback-app', 'settings-app']);
    // Round-trips through the localStorage -> chrome.storage.local bridge.
    expect(JSON.parse(localStorage.getItem('hiddenDefaultApps'))).toEqual(['games-app']);
    expect(JSON.parse(localStorage.getItem('appOrder'))).not.toContain('games-app');

    expect(AppGridState.showDefaultApp('games-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('games-app')).toBe(false);
    expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
    expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'feedback-app', 'settings-app', 'games-app']);
    expect(JSON.parse(localStorage.getItem('hiddenDefaultApps'))).toEqual([]);
    expect(JSON.parse(localStorage.getItem('appOrder'))).toContain('games-app');
  });

  it('closes the Games hub when Games is hidden from the grid (#897)', () => {
    const close = vi.fn();
    const originalGamesApp = window.GamesApp;
    window.GamesApp = { close };

    try {
      AppGridStorage.saveOrder(['ai-app', 'weather-app', 'games-app', 'settings-app']);

      expect(AppGridState.hideDefaultApp('games-app')).toBe(true);
      expect(close).toHaveBeenCalledTimes(1);

      close.mockClear();
      expect(AppGridState.hideDefaultApp('weather-app')).toBe(true);
      expect(close).not.toHaveBeenCalled();
    } finally {
      if (originalGamesApp === undefined) {
        delete window.GamesApp;
      } else {
        window.GamesApp = originalGamesApp;
      }
    }
  });

  it('setDefaultAppHidden toggles visibility', () => {
    AppGridStorage.saveOrder(['ai-app', 'feedback-app', 'settings-app']);

    expect(AppGridState.setDefaultAppHidden('ai-app', true)).toBe(true);
    expect(AppGridState.isDefaultHidden('ai-app')).toBe(true);

    expect(AppGridState.setDefaultAppHidden('ai-app', false)).toBe(true);
    expect(AppGridState.isDefaultHidden('ai-app')).toBe(false);
    expect(AppGridState.getOrder()).toContain('ai-app');
  });

  it('hides safely when the order has not been persisted yet', () => {
    expect(AppGridState.getOrder()).toBeNull();

    expect(AppGridState.hideDefaultApp('ai-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('ai-app')).toBe(true);
    expect(AppGridState.getOrder()).toBeNull();
  });

  it('rolls back the hidden list when the order write fails', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'settings-app']);
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'appOrder') throw new Error('Storage unavailable');
      return originalSetItem(key, value);
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalShowToast = window.showToast;
    window.showToast = vi.fn();

    try {
      expect(AppGridState.hideDefaultApp('weather-app')).toBe(false);
      expect(AppGridState.isDefaultHidden('weather-app')).toBe(false);
      expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'settings-app']);
    } finally {
      window.showToast = originalShowToast;
      warnSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  it('keeps the frozen defaultApps definitions untouched when hiding', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'settings-app']);

    AppGridState.hideDefaultApp('weather-app');

    expect(window.defaultApps.map(app => app.id)).toEqual([
      'ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app'
    ]);
  });
});

describe('default app context menu hide action', () => {
  const createElement = (tag, id) => {
    const element = document.createElement(tag);
    element.id = id;
    document.body.appendChild(element);
    return element;
  };

  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    createElement('div', 'app-grid');

    const aiIcon = createElement('a', 'ai-app');
    aiIcon.className = 'app-icon default-app';
    const gamesIcon = createElement('a', 'games-app');
    gamesIcon.className = 'app-icon default-app';
    const settingsIcon = createElement('a', 'settings-app');
    settingsIcon.className = 'app-icon default-app';

    injectScript('src/features/context-menu.js');
  });

  const openContextMenu = (element) => {
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));
  };

  it('offers Hide for hideable default apps and applies it', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'feedback-app', 'settings-app']);
    const renderAllApps = vi.fn();
    const removeAppIcon = vi.fn();
    const renderDefaultAppVisibilityList = vi.fn();
    const originalRenderAllApps = window.renderAllApps;
    const originalRemoveAppIcon = window.removeAppIcon;
    const originalRenderDefaultAppVisibilityList = window.renderDefaultAppVisibilityList;
    window.renderAllApps = renderAllApps;
    window.removeAppIcon = removeAppIcon;
    window.renderDefaultAppVisibilityList = renderDefaultAppVisibilityList;

    try {
      openContextMenu(document.getElementById('ai-app'));

      const hideItem = document.getElementById('hide-default-app');
      expect(hideItem.style.display).toBe('block');

      hideItem.click();

      expect(AppGridState.isDefaultHidden('ai-app')).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['weather-app', 'feedback-app', 'settings-app']);
      // Single-item patch: only the hidden tile is removed, no full rebuild.
      expect(removeAppIcon).toHaveBeenCalledExactlyOnceWith('ai-app');
      expect(renderDefaultAppVisibilityList).toHaveBeenCalledOnce();
      expect(renderAllApps).not.toHaveBeenCalled();
      expect(document.getElementById('app-context-menu').style.display).toBe('none');
    } finally {
      if (originalRenderAllApps === undefined) {
        delete window.renderAllApps;
      } else {
        window.renderAllApps = originalRenderAllApps;
      }
      if (originalRemoveAppIcon === undefined) {
        delete window.removeAppIcon;
      } else {
        window.removeAppIcon = originalRemoveAppIcon;
      }
      if (originalRenderDefaultAppVisibilityList === undefined) {
        delete window.renderDefaultAppVisibilityList;
      } else {
        window.renderDefaultAppVisibilityList = originalRenderDefaultAppVisibilityList;
      }
    }
  });

  it('does not open the hide menu for the Settings app', () => {
    const menu = document.getElementById('app-context-menu');
    const hideItem = document.getElementById('hide-default-app');
    menu.style.display = 'none';
    hideItem.style.display = 'none';

    openContextMenu(document.getElementById('settings-app'));

    expect(AppGridState.isDefaultHidden('settings-app')).toBe(false);
    expect(hideItem.style.display).toBe('none');
    expect(menu.style.display).toBe('none');
  });

  it('offers Hide for the Games tile and applies it (#897)', () => {
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app']);
    const renderAllApps = vi.fn();
    const removeAppIcon = vi.fn();
    const originalRenderAllApps = window.renderAllApps;
    const originalRemoveAppIcon = window.removeAppIcon;
    window.renderAllApps = renderAllApps;
    window.removeAppIcon = removeAppIcon;

    try {
      openContextMenu(document.getElementById('games-app'));

      const hideItem = document.getElementById('hide-default-app');
      expect(hideItem.style.display).toBe('block');

      hideItem.click();

      expect(AppGridState.isDefaultHidden('games-app')).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'feedback-app', 'settings-app']);
      expect(removeAppIcon).toHaveBeenCalledExactlyOnceWith('games-app');
      expect(renderAllApps).not.toHaveBeenCalled();
      expect(document.getElementById('app-context-menu').style.display).toBe('none');
    } finally {
      if (originalRenderAllApps === undefined) {
        delete window.renderAllApps;
      } else {
        window.renderAllApps = originalRenderAllApps;
      }
      if (originalRemoveAppIcon === undefined) {
        delete window.removeAppIcon;
      } else {
        window.removeAppIcon = originalRemoveAppIcon;
      }
    }
  });
});

describe('default app visibility review fixes', () => {
  it('ignores protected or unknown ids in stored or imported hidden lists', () => {
    localStorage.setItem('hiddenDefaultApps', JSON.stringify(['settings-app', 'not-an-app', 'weather-app']));

    expect(AppGridState.getHiddenDefaultApps()).toEqual(['weather-app']);
    expect(AppGridState.isDefaultHidden('settings-app')).toBe(false);
    expect(AppGridState.isDefaultHidden('not-an-app')).toBe(false);
  });

  it('honours Games in stored or imported hidden lists (#897)', () => {
    localStorage.setItem('hiddenDefaultApps', JSON.stringify(['settings-app', 'games-app', 'not-an-app', 'weather-app']));

    expect(AppGridState.getHiddenDefaultApps()).toEqual(['games-app', 'weather-app']);
    expect(AppGridState.isDefaultHidden('games-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('weather-app')).toBe(true);
    expect(AppGridState.isDefaultHidden('settings-app')).toBe(false);
  });

  it('restores a foldered app into its folder without duplicating it in the grid order', () => {
    localStorage.setItem('appOrder', JSON.stringify(['ai-app', 'folder-1', 'settings-app']));
    localStorage.setItem('appFolders', JSON.stringify([{ id: 'folder-1', name: 'F', apps: ['weather-app', 'feedback-app'] }]));

    expect(AppGridState.hideDefaultApp('weather-app')).toBe(true);
    expect(AppGridState.showDefaultApp('weather-app')).toBe(true);

    expect(AppGridState.getOrder()).toEqual(['ai-app', 'folder-1', 'settings-app']);
    expect(AppGridState.getFolders()[0].apps).toEqual(['weather-app', 'feedback-app']);
  });

  it('does not show a hidden built-in app inside its folder', () => {
    window.escapeHtml = window.escapeHtml || ((s) => String(s));
    injectScript('src/features/app-folders.js');
    const folder = { id: 'folder-2', name: 'F', apps: ['weather-app', 'feedback-app'] };
    localStorage.setItem('appFolders', JSON.stringify([folder]));

    const before = window.AppFolders.createFolderIconElement(folder);
    expect(before.querySelectorAll('.folder-preview-icon').length).toBe(2);

    expect(AppGridState.hideDefaultApp('weather-app')).toBe(true);

    const after = window.AppFolders.createFolderIconElement(folder);
    expect(after.querySelectorAll('.folder-preview-icon').length).toBe(1);
  });
});
