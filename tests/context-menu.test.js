import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { withWindowOverride } from './helpers/window-override.js';
import { failStorageWritesFor } from './helpers/storage-write-failures.js';

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
  ['button', 'thumbnail-app-upload'],
  ['input', 'thumbnail-app-file-input'],
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

  it('skips the folder and grid patches when removeAppFromFolder fails (#1137)', () => {
    const popupApps = createElement('div', 'folder-popup-apps');
    const popupTile = document.createElement('a');
    popupTile.id = 'popup-weather-app';
    popupTile.className = 'app-icon default-app';
    popupApps.appendChild(popupTile);

    const renderFolderAppsInPopup = vi.fn();
    const refreshFolderUI = vi.fn();
    const addAppIcon = vi.fn();
    const originalRemoveAppFromFolder = window.AppGridState.removeAppFromFolder;
    window.AppGridState.removeAppFromFolder = vi.fn(() => false);

    try {
      withWindowOverride('AppFolders', {
        currentFolderId: 'folder-1',
        renderFolderAppsInPopup,
        refreshFolderUI
      }, () => {
        withWindowOverride('addAppIcon', addAppIcon, () => {
          openContextMenu(popupTile);
          document.getElementById('remove-from-folder').click();

          expect(window.AppGridState.removeAppFromFolder)
            .toHaveBeenCalledExactlyOnceWith('folder-1', 'weather-app');
          expect(renderFolderAppsInPopup).not.toHaveBeenCalled();
          expect(refreshFolderUI).not.toHaveBeenCalled();
          expect(addAppIcon).not.toHaveBeenCalled();
          expect(document.getElementById('app-context-menu').style.display).toBe('none');
        });
      });
    } finally {
      window.AppGridState.removeAppFromFolder = originalRemoveAppFromFolder;
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

  it('closes the folder popup before opening the Edit modal', () => {
    const popupApps = createElement('div', 'folder-popup-apps');
    const popupTile = document.createElement('a');
    popupTile.id = 'popup-app-1';
    popupTile.className = 'app-icon custom-app';
    popupApps.appendChild(popupTile);
    const openAddAppModal = vi.fn();
    const closeFolderPopup = vi.fn();

    try {
      withWindowOverride('AppFolders', { currentFolderId: 'folder-1', closeFolderPopup }, () => {
        withWindowOverride('openAddAppModal', openAddAppModal, () => {
          openContextMenu(popupTile);
          document.getElementById('edit-app').click();

          // The popup (z-index 9000) must close before the modal (1001) opens.
          expect(closeFolderPopup).toHaveBeenCalledTimes(1);
          expect(openAddAppModal).toHaveBeenCalledTimes(1);
          expect(closeFolderPopup.mock.invocationCallOrder[0])
            .toBeLessThan(openAddAppModal.mock.invocationCallOrder[0]);
        });
      });
    } finally {
      popupApps.remove();
    }
  });
});

describe('change thumbnail local upload (#1139)', () => {
  const THUMBNAIL_STUB_IDS = [
    'thumbnail-app-modal',
    'thumbnail-app-input',
    'thumbnail-app-cancel',
    'thumbnail-app-confirm',
    'thumbnail-app-upload',
    'thumbnail-app-file-input',
    'thumbnail-preview-icon',
    'thumbnail-preview-name'
  ];

  const removeExistingMenu = () => {
    const existingMenu = document.getElementById('app-context-menu');
    if (existingMenu) existingMenu.remove();
  };

  // Earlier describes accumulated listeners on their own copies of these
  // stubs; drop every copy so this describe's fresh elements are the only
  // ones the re-injected handlers bind to.
  const resetThumbnailStubs = () => {
    THUMBNAIL_STUB_IDS.forEach((id) => {
      document.querySelectorAll('#' + id).forEach((el) => el.remove());
    });
    createModalStubs(createElement);
  };

  const setFileSelection = (input, file) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
  };

  // jsdom's FileReader finishes on two setImmediate hops, and this file only
  // fakes setTimeout/clearTimeout — so yielding real immediates drains it.
  const flushFileReader = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  let originalShowToast;

  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/languages.js');
    injectScript('src/core/utils.js');
    removeExistingMenu();
    resetThumbnailStubs();

    window.AppGridState = {
      getCustomApps: () => [{ id: 'app-1', name: 'Example App', icon: 'https://example.com/icon.png' }],
      renameApp: vi.fn(),
      updateThumbnail: vi.fn(),
      deleteApp: vi.fn()
    };

    injectScript('src/features/context-menu.js');
  });

  beforeEach(() => {
    originalShowToast = window.showToast;
    window.showToast = vi.fn();
  });

  afterEach(() => {
    if (originalShowToast === undefined) {
      delete window.showToast;
    } else {
      window.showToast = originalShowToast;
    }
    document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
  });

  it('opens a local file picker from the Upload image button', () => {
    const fileInput = document.getElementById('thumbnail-app-file-input');
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

    try {
      document.getElementById('thumbnail-app-upload').click();
      expect(clickSpy).toHaveBeenCalledOnce();
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('previews a selected image and saves it through the existing confirm path', async () => {
    const thumbnailInput = document.getElementById('thumbnail-app-input');
    const fileInput = document.getElementById('thumbnail-app-file-input');
    const previewIcon = document.getElementById('thumbnail-preview-icon');
    window.thumbnailAppId = 'app-1';

    setFileSelection(fileInput, new File(['icon-bytes'], 'logo.png', { type: 'image/png' }));
    fileInput.dispatchEvent(new Event('change'));
    await flushFileReader();

    const expectedDataUrl = 'data:image/png;base64,' + btoa('icon-bytes');
    expect(thumbnailInput.value).toBe(expectedDataUrl);

    const previewImage = previewIcon.querySelector('img');
    expect(previewImage).not.toBeNull();
    expect(previewImage.getAttribute('src')).toBe(expectedDataUrl);

    document.getElementById('thumbnail-app-confirm').click();

    expect(window.AppGridState.updateThumbnail)
      .toHaveBeenCalledExactlyOnceWith('app-1', expectedDataUrl);
    expect(window.thumbnailAppId).toBeNull();
  });

  it('rejects non-image files with a localized toast', () => {
    const thumbnailInput = document.getElementById('thumbnail-app-input');
    const fileInput = document.getElementById('thumbnail-app-file-input');
    thumbnailInput.value = 'https://example.com/existing.png';

    setFileSelection(fileInput, new File(['plain text'], 'notes.txt', { type: 'text/plain' }));
    fileInput.dispatchEvent(new Event('change'));

    expect(window.showToast)
      .toHaveBeenCalledExactlyOnceWith('Please select an image file.', 'error');
    expect(thumbnailInput.value).toBe('https://example.com/existing.png');
  });

  it('rejects oversized image files with a localized toast', () => {
    const thumbnailInput = document.getElementById('thumbnail-app-input');
    const fileInput = document.getElementById('thumbnail-app-file-input');
    thumbnailInput.value = 'https://example.com/existing.png';

    const oversized = new File(
      [new Uint8Array(1024 * 1024 + 1)],
      'huge.png',
      { type: 'image/png' }
    );
    setFileSelection(fileInput, oversized);
    fileInput.dispatchEvent(new Event('change'));

    expect(window.showToast).toHaveBeenCalledExactlyOnceWith(
      'This image is too large. Please choose an image smaller than 1 MB.',
      'error'
    );
    expect(thumbnailInput.value).toBe('https://example.com/existing.png');
  });
});

describe('remove from folder storage failures (#1137)', () => {
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

  const seedFolderWithWeatherApp = () => {
    localStorage.setItem('appOrder', JSON.stringify(['folder-1']));
    localStorage.setItem('appFolders', JSON.stringify([
      { id: 'folder-1', name: 'Folder', apps: ['weather-app'] }
    ]));
  };

  const createPopupTile = () => {
    const existing = document.getElementById('folder-popup-apps');
    if (existing) existing.remove();
    const popupApps = createElement('div', 'folder-popup-apps');
    const popupTile = document.createElement('a');
    popupTile.id = 'popup-weather-app';
    popupTile.className = 'app-icon default-app';
    popupApps.appendChild(popupTile);
    return { popupApps, popupTile };
  };

  let restoreWrites = null;

  beforeAll(() => {
    injectScript('src/core/dom-ready.js');
    removeExistingMenu();
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/app-grid-state.js');
    injectScript('src/features/context-menu.js');
  });

  afterEach(() => {
    if (restoreWrites) {
      restoreWrites();
      restoreWrites = null;
    }
    const strayIcon = document.getElementById('weather-app');
    if (strayIcon) strayIcon.remove();
  });

  it('shows one save-error toast and skips the UI patches on a synchronous write failure', () => {
    seedFolderWithWeatherApp();
    restoreWrites = failStorageWritesFor('appFolders', 'sync');

    const { popupApps, popupTile } = createPopupTile();
    const renderFolderAppsInPopup = vi.fn();
    const refreshFolderUI = vi.fn();
    const addAppIcon = vi.fn();
    const removeAppIcon = vi.fn();
    const showToast = vi.fn();

    try {
      withWindowOverride('showToast', showToast, () => {
        withWindowOverride('AppFolders', {
          currentFolderId: 'folder-1',
          renderFolderAppsInPopup,
          refreshFolderUI
        }, () => {
          withWindowOverride('addAppIcon', addAppIcon, () => {
            withWindowOverride('removeAppIcon', removeAppIcon, () => {
              openContextMenu(popupTile);
              document.getElementById('remove-from-folder').click();

              // The synchronous rejection rolled the cache back and raised
              // the shared appGridSaveError toast exactly once; the handler
              // must not have patched the folder popup or the grid.
              expect(renderFolderAppsInPopup).not.toHaveBeenCalled();
              expect(addAppIcon).not.toHaveBeenCalled();
              expect(showToast).toHaveBeenCalledTimes(1);
              expect(showToast).toHaveBeenCalledWith(
                'Failed to save app changes. Your last action was not saved.',
                'error',
                { duration: 3000 }
              );
              expect(JSON.parse(localStorage.getItem('appFolders'))[0].apps)
                .toContain('weather-app');

              // The deferred resync re-renders the (unchanged) popup but must
              // not touch the grid: the app never left the folder.
              vi.advanceTimersByTime(0);
              expect(renderFolderAppsInPopup).toHaveBeenCalled();
              expect(removeAppIcon).not.toHaveBeenCalled();
            });
          });
        });
      });
    } finally {
      popupApps.remove();
    }
  });

  it('re-syncs the folder popup and drops the duplicate grid tile after an async rejected write', () => {
    seedFolderWithWeatherApp();
    restoreWrites = failStorageWritesFor('appFolders', 'async');

    const { popupApps, popupTile } = createPopupTile();
    const renderFolderAppsInPopup = vi.fn();
    const refreshFolderUI = vi.fn();
    const addAppIcon = vi.fn((id) => {
      const icon = document.createElement('a');
      icon.id = id;
      icon.className = 'app-icon default-app';
      document.body.appendChild(icon);
    });
    const removeAppIcon = vi.fn((id) => {
      const icon = document.getElementById(id);
      if (!icon) return false;
      icon.remove();
      return true;
    });
    const showToast = vi.fn();

    try {
      withWindowOverride('showToast', showToast, () => {
        withWindowOverride('AppFolders', {
          currentFolderId: 'folder-1',
          renderFolderAppsInPopup,
          refreshFolderUI
        }, () => {
          withWindowOverride('addAppIcon', addAppIcon, () => {
            withWindowOverride('removeAppIcon', removeAppIcon, () => {
              openContextMenu(popupTile);
              document.getElementById('remove-from-folder').click();

              // persistSet accepts the write optimistically, so the success
              // path already put the tile back on the grid...
              expect(window.AppGridState.getFolders()[0].apps)
                .not.toContain('weather-app');
              expect(addAppIcon).toHaveBeenCalledWith('weather-app');
              expect(document.getElementById('weather-app')).not.toBeNull();

              const rendersAfterClick = renderFolderAppsInPopup.mock.calls.length;
              const refreshesAfterClick = refreshFolderUI.mock.calls.length;

              // ...then chrome.storage reports runtime.lastError: the bridge
              // rolls its cache back (the app is foldered again)...
              // Advance by 1ms, not 0: the resync is scheduled from inside
              // the failure timer's callback, and a delay-0 timer scheduled
              // during a tick only becomes due on the next 1ms boundary.
              vi.advanceTimersByTime(1);
              expect(JSON.parse(localStorage.getItem('appFolders'))[0].apps)
                .toContain('weather-app');

              // ...and the deferred resync makes grid and folder agree again
              // without a reload, with only the single existing error toast.
              vi.advanceTimersByTime(1);
              expect(renderFolderAppsInPopup.mock.calls.length)
                .toBeGreaterThan(rendersAfterClick);
              expect(refreshFolderUI.mock.calls.length)
                .toBeGreaterThan(refreshesAfterClick);
              // The affected folder is refreshed by id, not only through the
              // popup's currentFolderId, so a closed or switched popup cannot
              // leave the original folder tile stale.
              expect(refreshFolderUI.mock.calls.slice(refreshesAfterClick))
                .toContainEqual(['folder-1']);
              expect(removeAppIcon).toHaveBeenCalledWith('weather-app');
              expect(document.getElementById('weather-app')).toBeNull();
              expect(showToast).toHaveBeenCalledTimes(1);
            });
          });
        });
      });
    } finally {
      popupApps.remove();
      const strayIcon = document.getElementById('weather-app');
      if (strayIcon) strayIcon.remove();
    }
  });

  it('drops the orphaned folder icon when a create-folder write fails (#1137)', () => {
    seedFolderWithWeatherApp();
    restoreWrites = failStorageWritesFor('appFolders', 'async');

    const grid = createElement('div', 'app-grid');
    const refreshAppShortcutBadges = vi.fn();
    try {
      withWindowOverride('Shortcuts', { refreshAppShortcutBadges }, () => {
        // promptCreateFolder(): persist the folder optimistically, then insert
        // its tile — chrome.storage rejects the write a macrotask later.
        const folder = window.AppGridState.createFolder('New Folder', []);
        expect(folder).not.toBeNull();
        // The appFolders write fails but the paired appOrder write succeeds,
        // so the ghost id is persisted until the rollback drops it.
        expect(JSON.parse(localStorage.getItem('appOrder'))).toContain(folder.id);

        const orphan = document.createElement('a');
        orphan.id = folder.id;
        orphan.className = 'app-icon folder-icon';
        grid.appendChild(orphan);
        const survivor = document.createElement('a');
        survivor.id = 'folder-1';
        survivor.className = 'app-icon folder-icon';
        grid.appendChild(survivor);

        // Advance by 1ms, not 0: the resync is scheduled from inside the
        // failure timer's callback, and a delay-0 timer scheduled during a tick
        // only becomes due on the next 1ms boundary.
        vi.advanceTimersByTime(1);
        expect(window.AppGridState.getFolders().some((f) => f.id === folder.id)).toBe(false);
        vi.advanceTimersByTime(1);

        // The rolled-back folder's tile is gone; folders storage still knows
        // about keep their tiles.
        expect(document.getElementById(folder.id)).toBeNull();
        expect(document.getElementById('folder-1')).not.toBeNull();
        // The ghost id no longer sits in appOrder (it would consume an Alt+N
        // slot), and the on-tile shortcut badges were resynced to match.
        const order = JSON.parse(localStorage.getItem('appOrder'));
        expect(order).not.toContain(folder.id);
        expect(order).toContain('folder-1');
        expect(refreshAppShortcutBadges).toHaveBeenCalledTimes(1);
      });
    } finally {
      grid.remove();
    }
  });

  it('restores the folder tile after a failed folder deletion rollback (#1137)', () => {
    seedFolderWithWeatherApp();
    restoreWrites = failStorageWritesFor('appFolders', 'async');

    // Exercise the real addFolderIconToGrid rendering path. escapeHtml is
    // captured from window at app-folders load time; utils.js (loaded by an
    // earlier describe) provides it, so only inject it when missing.
    if (typeof window.escapeHtml !== 'function') {
      injectScript('src/core/utils.js');
    }
    injectScript('src/features/app-folders.js');

    // Earlier describes may have left an #app-grid behind; start clean so
    // getElementById resolves to the grid this test owns.
    const staleGrid = document.getElementById('app-grid');
    if (staleGrid) staleGrid.remove();
    const staleNewApp = document.getElementById('new-app');
    if (staleNewApp) staleNewApp.remove();

    const grid = createElement('div', 'app-grid');
    const newApp = createElement('a', 'new-app');
    grid.appendChild(newApp);
    const folderTile = document.createElement('a');
    folderTile.id = 'folder-1';
    folderTile.className = 'app-icon folder-icon';
    grid.appendChild(folderTile);
    const appTile = document.createElement('a');
    appTile.id = 'weather-app';
    appTile.className = 'app-icon default-app';
    grid.appendChild(appTile);

    const showToast = vi.fn();
    const removeAppIcon = vi.fn((id) => {
      const icon = document.getElementById(id);
      if (!icon) return false;
      icon.remove();
      return true;
    });

    try {
      withWindowOverride('showToast', showToast, () => {
        withWindowOverride('removeAppIcon', removeAppIcon, () => {
          // promptDeleteFolder's success path: deleteFolder accepts the
          // optimistic appFolders write, the UI drops the folder tile, and
          // the released apps get their grid tiles back.
          expect(window.AppGridState.deleteFolder('folder-1')).toBe(true);
          folderTile.remove();

          // chrome.storage rejects the appFolders write a macrotask later and
          // rolls storage back to the pre-delete state (folder + apps).
          // Advance by 1ms, not 0: the resync is scheduled from inside the
          // failure timer's callback, and a delay-0 timer scheduled during a
          // tick only becomes due on the next 1ms boundary.
          vi.advanceTimersByTime(1);
          expect(JSON.parse(localStorage.getItem('appFolders')).some(
            (folder) => folder.id === 'folder-1'
          )).toBe(true);

          // The deferred resync drops the released app tile again (storage
          // says the app is foldered) and recreates the folder tile the
          // delete removed, so the folder and its apps stay reachable.
          vi.advanceTimersByTime(1);
          expect(removeAppIcon).toHaveBeenCalledWith('weather-app');
          expect(document.getElementById('weather-app')).toBeNull();
          const restored = document.getElementById('folder-1');
          expect(restored).not.toBeNull();
          expect(restored.classList.contains('folder-icon')).toBe(true);
          expect(restored.parentElement).toBe(grid);
          expect(showToast).toHaveBeenCalledTimes(1);
        });
      });
    } finally {
      grid.remove();
      const strayIcon = document.getElementById('weather-app');
      if (strayIcon) strayIcon.remove();
    }
  });
});
