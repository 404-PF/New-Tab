import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { withWindowOverride } from './helpers/window-override.js';

const createElement = (tag, id) => {
  const element = document.createElement(tag);
  element.id = id;
  document.body.appendChild(element);
  return element;
};

// Shared DOM stubs for the rename / change-thumbnail / delete modals that
// src/features/context-menu.js binds to on load.
const MODAL_STUBS = [
  ['div', 'rename-app-modal'],
  ['input', 'rename-app-input'],
  ['button', 'rename-app-cancel'],
  ['button', 'rename-app-confirm'],
  ['div', 'thumbnail-app-modal'],
  ['input', 'thumbnail-app-input'],
  ['button', 'thumbnail-app-cancel'],
  ['button', 'thumbnail-app-confirm'],
  ['div', 'thumbnail-preview-icon'],
  ['span', 'thumbnail-preview-name'],
  ['div', 'delete-app-modal'],
  ['button', 'delete-app-cancel'],
  ['button', 'delete-app-confirm'],
  ['div', 'delete-preview-icon'],
  ['span', 'delete-preview-name']
];

const createModalStubs = (create) => {
  MODAL_STUBS.forEach(([tag, id]) => create(tag, id));
};

// The rename and change-thumbnail handlers focus their input on a 100ms
// delay (src/features/context-menu.js). Fake timers so those delays are fake
// timers that afterEach clears, instead of real ones firing 100ms after
// teardown — by then the environment is gone, `document` is undefined, and
// the callback throws "document is not defined" as an unhandled error that
// fails the whole run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

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

    createModalStubs(createElement);

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

  it('keeps the delayed modal focus on a fake timer that does not outlive the test', () => {
    const appIcon = document.getElementById('app-1');
    appIcon.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));

    const thumbnailInput = document.getElementById('thumbnail-app-input');
    document.getElementById('change-thumbnail').click();

    // The thumbnail handler defers focusing its input by 100ms. That delay
    // must be a fake timer: a real one would still be pending when the test
    // file's environment is torn down, and it would then read `document`
    // from a destroyed environment and throw "document is not defined" as an
    // unhandled error that fails the whole run.
    expect(vi.getTimerCount()).toBe(1);
    expect(document.activeElement).not.toBe(thumbnailInput);

    vi.advanceTimersByTime(200);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.activeElement).toBe(thumbnailInput);
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
    const syncAppGridOrder = vi.fn();
    const renderAllApps = vi.fn();
    const originalRenderAllApps = window.renderAllApps;
    const originalSyncAppGridOrder = window.syncAppGridOrder;
    const originalSort = window.AppGridState.sortAlphabetically;
    window.AppGridState.sortAlphabetically = sortAlphabetically;
    window.renderAllApps = renderAllApps;
    window.syncAppGridOrder = syncAppGridOrder;

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
      // Sorting only re-positions existing icons; it must not rebuild them.
      expect(syncAppGridOrder).toHaveBeenCalledOnce();
      expect(renderAllApps).not.toHaveBeenCalled();
      // The menu closes after the action.
      expect(document.getElementById('app-context-menu').style.display).toBe('none');
    } finally {
      window.AppGridState.sortAlphabetically = originalSort;
      if (originalRenderAllApps === undefined) {
        delete window.renderAllApps;
      } else {
        window.renderAllApps = originalRenderAllApps;
      }
      if (originalSyncAppGridOrder === undefined) {
        delete window.syncAppGridOrder;
      } else {
        window.syncAppGridOrder = originalSyncAppGridOrder;
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
    const syncAppGridOrder = vi.fn();
    const renderAllApps = vi.fn();
    const originalRenderAllApps = window.renderAllApps;
    const originalSyncAppGridOrder = window.syncAppGridOrder;
    const originalSort = window.AppGridState.sortAlphabetically;
    window.AppGridState.sortAlphabetically = sortAlphabetically;
    window.renderAllApps = renderAllApps;
    window.syncAppGridOrder = syncAppGridOrder;

    try {
      document.getElementById('sort-alphabetically').click();

      expect(sortAlphabetically).toHaveBeenCalledOnce();
      expect(syncAppGridOrder).not.toHaveBeenCalled();
      expect(renderAllApps).not.toHaveBeenCalled();
    } finally {
      window.AppGridState.sortAlphabetically = originalSort;
      if (originalRenderAllApps === undefined) {
        delete window.renderAllApps;
      } else {
        window.renderAllApps = originalRenderAllApps;
      }
      if (originalSyncAppGridOrder === undefined) {
        delete window.syncAppGridOrder;
      } else {
        window.syncAppGridOrder = originalSyncAppGridOrder;
      }
    }
  });
});

describe('context menu i18n labels', () => {
  const MENU_ITEM_I18N_KEYS = {
    'rename-app': 'renameApp',
    'edit-app': 'editApp',
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

  beforeAll(async () => {
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/languages.js');
    removeExistingMenu();

    // Mirror the startup order under lazy loading (issue #927): settings.js
    // starts the async de load, context-menu.js then builds the menu while
    // that load is still pending (labels fall back to English), and only the
    // sweep after registration translates the data-i18n labels.
    const pendingLanguage = window.i18n.applyLanguage('de');
    expect(window.i18n.getTranslations('de')).toEqual({});

    injectScript('src/features/context-menu.js');
    expect(document.getElementById('rename-app').textContent).toBe('Rename');

    injectScript('src/core/locales/de.js');
    await pendingLanguage;
  });

  afterAll(() => {
    try {
      window.i18n.applyLanguage('en');
    } catch (e) {
      void e;
    }
  });

  it('translates menu labels after the pending locale load finishes', () => {
    // t() silently falls back to English when a locale omits a key, and the
    // post-registration sweep reads the same table — so assert the German
    // entry itself, which a missing translation would leave undefined.
    const englishLabels = window.i18n.getTranslations('en');
    const germanLabels = window.i18n.getTranslations('de');

    Object.entries(MENU_ITEM_I18N_KEYS).forEach(([id, key]) => {
      const germanLabel = germanLabels[key];
      expect(germanLabel, id).toBeTypeOf('string');
      expect(germanLabel.trim(), id).not.toBe('');
      expect(germanLabel, id).not.toBe(englishLabels[key]);
      expect(document.getElementById(id).textContent, id).toBe(germanLabel);
    });
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

describe('built-in apps in folders (#1010)', () => {
  const createElementIfMissing = (tag, id) => {
    const existing = document.getElementById(id);
    if (existing) return existing;
    return createElement(tag, id);
  };

  const removeExistingMenu = () => {
    const existingMenu = document.getElementById('app-context-menu');
    if (existingMenu) existingMenu.remove();
  };

  const openContextMenu = (element) => {
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));
  };

  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    removeExistingMenu();

    createModalStubs(createElementIfMissing);

    window.AppGridState = {
      getCustomApps: () => [],
      canHideDefaultApp: (id) => id !== 'settings-app',
      hideDefaultApp: vi.fn(() => true),
      getFolders: () => [],
      removeAppFromFolder: vi.fn(() => true),
      renameApp: vi.fn(),
      updateThumbnail: vi.fn(),
      deleteApp: vi.fn()
    };

    createElement('a', 'ai-app').className = 'app-icon default-app';
    createElement('a', 'settings-app').className = 'app-icon default-app';

    injectScript('src/features/context-menu.js');
  });

  it('offers Move to Folder alongside Hide for hideable built-ins', () => {
    const showMoveToFolderSelector = vi.fn();

    withWindowOverride('AppFolders', { showMoveToFolderSelector }, () => {
      openContextMenu(document.getElementById('ai-app'));

      expect(document.getElementById('hide-default-app').style.display).toBe('block');
      expect(document.getElementById('move-to-folder').style.display).toBe('block');

      document.getElementById('move-to-folder').click();

      expect(showMoveToFolderSelector).toHaveBeenCalledExactlyOnceWith('ai-app');
      expect(document.getElementById('app-context-menu').style.display).toBe('none');
    });
  });

  it('keeps Settings free of hide and folder actions', () => {
    const menu = document.getElementById('app-context-menu');
    menu.style.display = 'none';
    document.getElementById('hide-default-app').style.display = 'none';
    document.getElementById('move-to-folder').style.display = 'none';

    openContextMenu(document.getElementById('settings-app'));

    expect(menu.style.display).toBe('none');
    expect(document.getElementById('hide-default-app').style.display).toBe('none');
    expect(document.getElementById('move-to-folder').style.display).toBe('none');
  });

  it('offers Remove from Folder for a foldered built-in in the popup', () => {
    const popupApps = createElement('div', 'folder-popup-apps');
    const popupTile = document.createElement('a');
    popupTile.id = 'popup-weather-app';
    popupTile.className = 'app-icon default-app';
    popupApps.appendChild(popupTile);

    const renderFolderAppsInPopup = vi.fn();
    const refreshFolderUI = vi.fn();
    const addAppIcon = vi.fn();

    try {
      withWindowOverride('AppFolders', {
        currentFolderId: 'folder-1',
        renderFolderAppsInPopup,
        refreshFolderUI
      }, () => {
        withWindowOverride('addAppIcon', addAppIcon, () => {
          openContextMenu(popupTile);

          expect(document.getElementById('remove-from-folder').style.display).toBe('block');
          expect(document.getElementById('move-to-folder').style.display).toBe('none');
          expect(document.getElementById('rename-app').style.display).toBe('none');

          document.getElementById('remove-from-folder').click();

          // The popup- prefix is stripped so the real app id reaches the state layer.
          expect(window.AppGridState.removeAppFromFolder)
            .toHaveBeenCalledExactlyOnceWith('folder-1', 'weather-app');
          expect(renderFolderAppsInPopup).toHaveBeenCalledOnce();
          expect(refreshFolderUI).toHaveBeenCalledExactlyOnceWith('folder-1');
          expect(addAppIcon).toHaveBeenCalledExactlyOnceWith('weather-app');
          expect(document.getElementById('app-context-menu').style.display).toBe('none');
        });
      });
    } finally {
      popupApps.remove();
    }
  });

  it('ignores Move to Folder when the menu was opened from the grid background', () => {
    const showMoveToFolderSelector = vi.fn();

    withWindowOverride('AppFolders', { showMoveToFolderSelector }, () => {
      let grid = document.getElementById('app-grid');
      if (!grid) grid = createElement('div', 'app-grid');

      openContextMenu(grid);
      expect(document.getElementById('create-folder').style.display).toBe('block');
      expect(document.getElementById('move-to-folder').style.display).toBe('none');

      document.getElementById('move-to-folder').click();

      expect(showMoveToFolderSelector).not.toHaveBeenCalled();
    });
  });
});

describe('edit app action (#1082)', () => {
  const removeExistingMenu = () => {
    const existingMenu = document.getElementById('app-context-menu');
    if (existingMenu) existingMenu.remove();
  };

  const openContextMenu = (element) => {
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));
  };

  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    removeExistingMenu();

    createModalStubs(createElement);

    window.AppGridState = {
      getCustomApps: () => [
        { id: 'app-1', name: 'Example App', url: 'https://example.com' },
        { id: 'app-2', name: 'Other App', url: 'https://other.example' }
      ],
      canHideDefaultApp: (id) => id !== 'settings-app',
      renameApp: vi.fn(),
      updateThumbnail: vi.fn(),
      deleteApp: vi.fn()
    };

    createElement('a', 'app-1').className = 'app-icon custom-app';
    createElement('a', 'ai-app').className = 'app-icon default-app';

    injectScript('src/features/context-menu.js');
  });

  it('offers Edit for a custom app and opens the modal prefilled with that app', () => {
    const openAddAppModal = vi.fn();

    withWindowOverride('openAddAppModal', openAddAppModal, () => {
      openContextMenu(document.getElementById('app-1'));

      expect(document.getElementById('edit-app').style.display).toBe('block');

      document.getElementById('edit-app').click();

      expect(openAddAppModal).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: 'app-1', url: 'https://example.com' })
      );
      expect(document.getElementById('app-context-menu').style.display).toBe('none');
    });
  });

  it('does not offer Edit for built-in apps on the grid', () => {
    openContextMenu(document.getElementById('ai-app'));

    expect(document.getElementById('hide-default-app').style.display).toBe('block');
    expect(document.getElementById('edit-app').style.display).toBe('none');
  });

  it('offers Edit for a custom app inside the folder popup', () => {
    const popupApps = createElement('div', 'folder-popup-apps');
    const popupTile = document.createElement('a');
    popupTile.id = 'popup-app-2';
    popupTile.className = 'app-icon custom-app';
    popupApps.appendChild(popupTile);
    const openAddAppModal = vi.fn();

    try {
      withWindowOverride('AppFolders', { currentFolderId: 'folder-1' }, () => {
        withWindowOverride('openAddAppModal', openAddAppModal, () => {
          openContextMenu(popupTile);

          expect(document.getElementById('edit-app').style.display).toBe('block');
          expect(document.getElementById('remove-from-folder').style.display).toBe('block');

          // The popup- prefix is stripped so the real app id reaches the modal.
          document.getElementById('edit-app').click();
          expect(openAddAppModal).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ id: 'app-2', url: 'https://other.example' })
          );
        });
      });
    } finally {
      popupApps.remove();
    }
  });

  it('keeps Edit hidden for a built-in app inside the folder popup', () => {
    const popupApps = createElement('div', 'folder-popup-apps');
    const popupTile = document.createElement('a');
    popupTile.id = 'popup-weather-app';
    popupTile.className = 'app-icon default-app';
    popupApps.appendChild(popupTile);

    try {
      withWindowOverride('AppFolders', { currentFolderId: 'folder-1' }, () => {
        openContextMenu(popupTile);

        expect(document.getElementById('remove-from-folder').style.display).toBe('block');
        expect(document.getElementById('edit-app').style.display).toBe('none');
      });
    } finally {
      popupApps.remove();
    }
  });
});
