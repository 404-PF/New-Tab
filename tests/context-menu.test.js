import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const createElement = (tag, id) => {
  const element = document.createElement(tag);
  element.id = id;
  document.body.appendChild(element);
  return element;
};

describe('context menu previews', () => {
  beforeAll(() => {
    injectScript('src/core/dom-ready.js');

    window.AppGridState = {
      getCustomApps: () => [{
        id: 'app-1',
        name: 'Example App',
        icon: 'https://example.com/icon.png"><svg data-test="evil"></svg>'
      }],
      renameApp: vi.fn(),
      updateThumbnail: vi.fn(),
      deleteApp: vi.fn()
    };

    createElement('div', 'rename-app-modal');
    createElement('input', 'rename-app-input');
    createElement('button', 'rename-app-cancel');
    createElement('button', 'rename-app-confirm');

    createElement('div', 'thumbnail-app-modal');
    createElement('input', 'thumbnail-app-input');
    createElement('button', 'thumbnail-app-cancel');
    createElement('button', 'thumbnail-app-confirm');
    createElement('div', 'thumbnail-preview-icon');
    createElement('span', 'thumbnail-preview-name');

    createElement('div', 'delete-app-modal');
    createElement('button', 'delete-app-cancel');
    createElement('button', 'delete-app-confirm');
    createElement('div', 'delete-preview-icon');
    createElement('span', 'delete-preview-name');

    const appIcon = createElement('a', 'app-1');
    appIcon.className = 'app-icon custom-app';

    injectScript('src/features/context-menu.js');
  });

  it('renders preview icons without parsing raw HTML', () => {
    const appIcon = document.getElementById('app-1');
    appIcon.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));

    document.getElementById('change-thumbnail').click();

    const thumbnailPreview = document.getElementById('thumbnail-preview-icon');
    expect(thumbnailPreview.querySelector('img')).not.toBeNull();
    expect(thumbnailPreview.querySelector('svg')).toBeNull();
    expect(thumbnailPreview.querySelector('[data-test="evil"]')).toBeNull();

    document.getElementById('delete-app').click();

    const deletePreview = document.getElementById('delete-preview-icon');
    expect(deletePreview.querySelector('img')).not.toBeNull();
    expect(deletePreview.querySelector('svg')).toBeNull();
    expect(deletePreview.querySelector('[data-test="evil"]')).toBeNull();
  });

  it('skips delayed focus when modal inputs disappear', () => {
    const appIcon = document.getElementById('app-1');
    const openContextMenu = () => {
      appIcon.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        pageX: 32,
        pageY: 32
      }));
    };
    const errors = [];
    const onError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    vi.useFakeTimers();

    try {
      window.renameAppId = null;
      openContextMenu();
      document.getElementById('rename-app').click();
      document.getElementById('rename-app-input').remove();
      vi.advanceTimersByTime(100);
      createElement('input', 'rename-app-input');

      window.thumbnailAppId = null;
      openContextMenu();
      document.getElementById('change-thumbnail').click();
      document.getElementById('thumbnail-app-input').remove();
      vi.advanceTimersByTime(100);
      createElement('input', 'thumbnail-app-input');

      expect(errors).toEqual([]);
    } finally {
      vi.useRealTimers();
      window.removeEventListener('error', onError);
    }
  });

  it('handles missing modal and preview elements without errors', () => {
    const appIcon = document.getElementById('app-1');
    const openContextMenu = () => {
      appIcon.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        pageX: 32,
        pageY: 32
      }));
    };
    const errors = [];
    const onError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.addEventListener('error', onError);

    try {
      window.renameAppId = null;
      document.getElementById('rename-app-input').remove();
      document.getElementById('rename-app-modal').remove();
      openContextMenu();
      document.getElementById('rename-app').click();
      expect(window.renameAppId).toBeNull();

      document.getElementById('thumbnail-preview-icon').remove();
      document.getElementById('thumbnail-preview-name').remove();
      openContextMenu();
      document.getElementById('change-thumbnail').click();
      expect(window.thumbnailAppId).toBe('app-1');
      expect(document.getElementById('thumbnail-app-modal').classList).toContain('modal-open');

      window.thumbnailAppId = null;
      document.getElementById('thumbnail-app-input').remove();
      document.getElementById('thumbnail-app-modal').remove();
      openContextMenu();
      document.getElementById('change-thumbnail').click();
      expect(window.thumbnailAppId).toBeNull();

      document.getElementById('delete-preview-icon').remove();
      document.getElementById('delete-preview-name').remove();
      openContextMenu();
      document.getElementById('delete-app').click();
      expect(window.deleteAppId).toBe('app-1');
      expect(document.getElementById('delete-app-modal').classList).toContain('modal-open');

      window.deleteAppId = null;
      document.getElementById('delete-app-modal').remove();
      openContextMenu();
      document.getElementById('delete-app').click();
      expect(window.deleteAppId).toBeNull();

      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
      warnSpy.mockRestore();
    }
  });

  it('sorts the grid alphabetically from the grid context menu', () => {
    const grid = document.getElementById('app-grid');
    if (!grid) {
      createElement('div', 'app-grid');
    }

    const sortAlphabetically = vi.fn(() => true);
    const renderAllApps = vi.fn();
    const originalRenderAllApps = window.renderAllApps;
    const originalSort = window.AppGridState.sortAlphabetically;
    window.AppGridState.sortAlphabetically = sortAlphabetically;
    window.renderAllApps = renderAllApps;

    try {
      // Right-click empty grid space to open the grid section of the menu.
      document.getElementById('app-grid').dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        pageX: 32,
        pageY: 32
      }));
      expect(document.getElementById('sort-alphabetically').style.display).toBe('block');

      document.getElementById('sort-alphabetically').click();

      expect(sortAlphabetically).toHaveBeenCalledOnce();
      expect(renderAllApps).toHaveBeenCalledOnce();
      // The menu closes after the action.
      expect(document.getElementById('app-context-menu').style.display).toBe('none');
    } finally {
      window.AppGridState.sortAlphabetically = originalSort;
      if (originalRenderAllApps === undefined) {
        delete window.renderAllApps;
      } else {
        window.renderAllApps = originalRenderAllApps;
      }
    }
  });

  it('does not re-render when sorting fails to persist', () => {
    document.getElementById('app-grid').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));

    const sortAlphabetically = vi.fn(() => false);
    const renderAllApps = vi.fn();
    const originalRenderAllApps = window.renderAllApps;
    const originalSort = window.AppGridState.sortAlphabetically;
    window.AppGridState.sortAlphabetically = sortAlphabetically;
    window.renderAllApps = renderAllApps;

    try {
      document.getElementById('sort-alphabetically').click();

      expect(sortAlphabetically).toHaveBeenCalledOnce();
      expect(renderAllApps).not.toHaveBeenCalled();
    } finally {
      window.AppGridState.sortAlphabetically = originalSort;
      if (originalRenderAllApps === undefined) {
        delete window.renderAllApps;
      } else {
        window.renderAllApps = originalRenderAllApps;
      }
    }
  });
});

describe('context menu i18n labels', () => {
  const MENU_ITEM_I18N_KEYS = {
    'rename-app': 'renameApp',
    'move-to-folder': 'moveToFolder',
    'remove-from-folder': 'removeFromFolder',
    'change-thumbnail': 'changeThumbnail',
    'delete-app': 'deleteApp',
    'hide-default-app': 'hideDefaultApp',
    'rename-folder': 'renameFolder',
    'delete-folder': 'deleteFolder',
    'create-folder': 'createFolder',
    'sort-alphabetically': 'sortAlphabetically'
  };

  const removeExistingMenu = () => {
    const existingMenu = document.getElementById('app-context-menu');
    if (existingMenu) existingMenu.remove();
  };

  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/languages.js');

    // Mirror the startup order: settings.js applies the saved language while
    // it is evaluated, before context-menu.js creates its menu items.
    window.i18n.applyLanguage('de');

    removeExistingMenu();
    injectScript('src/features/context-menu.js');
  });

  afterAll(() => {
    try {
      window.i18n.applyLanguage('en');
    } catch (e) {
      void e;
    }
  });

  it('translates menu labels at creation under a startup-like language', () => {
    Object.entries(MENU_ITEM_I18N_KEYS).forEach(([id, key]) => {
      expect(document.getElementById(id).textContent, id).toBe(window.i18n.t(key));
    });
    expect(document.getElementById('rename-app').textContent).not.toBe('Rename');
    expect(document.getElementById('rename-app').textContent).toBe('Umbenennen');
  });

  it('falls back to English when window.i18n is unavailable', () => {
    removeExistingMenu();

    const originalI18n = window.i18n;
    try {
      window.i18n = undefined;
      injectScript('src/features/context-menu.js');
      expect(document.getElementById('rename-app').textContent).toBe('Rename');
      expect(document.getElementById('move-to-folder').textContent).toBe('Move to Folder');
      expect(document.getElementById('sort-alphabetically').textContent).toBe('Sort Alphabetically');
    } finally {
      window.i18n = originalI18n;
    }
  });
});
