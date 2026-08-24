import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
});

beforeEach(() => {
  localStorage.clear();
});

describe('AppGridStorage', () => {
  it('loadCustomApps returns empty array by default', () => {
    expect(AppGridStorage.loadCustomApps()).toEqual([]);
  });

  it('saveCustomApps persists apps', () => {
    const apps = [{ id: '1', name: 'Test', url: 'https://example.com' }];
    expect(AppGridStorage.saveCustomApps(apps)).toBe(true);
    expect(AppGridStorage.loadCustomApps()).toEqual(apps);
  });

  it('loadOrder returns null by default', () => {
    expect(AppGridStorage.loadOrder()).toBeNull();
  });

  it('saveOrder persists order', () => {
    expect(AppGridStorage.saveOrder(['a', 'b', 'c'])).toBe(true);
    expect(AppGridStorage.loadOrder()).toEqual(['a', 'b', 'c']);
  });

  it('saveFolders returns true after persisting folders', () => {
    const folders = [{ id: 'folder-1', name: 'Folder', apps: [] }];
    expect(AppGridStorage.saveFolders(folders)).toBe(true);
    expect(AppGridStorage.loadFolders()).toEqual(folders);
  });

  it('returns false and notifies the user when writes throw', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;

    try {
      expect(AppGridStorage.saveOrder(['a'])).toBe(false);
      expect(AppGridStorage.saveCustomApps([])).toBe(false);
      expect(AppGridStorage.saveFolders([])).toBe(false);
      expect(showToast).toHaveBeenCalledTimes(3);
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save app changes. Your last action was not saved.',
        'error'
      );
      expect(warnSpy).toHaveBeenCalledTimes(3);
    } finally {
      window.showToast = originalShowToast;
      warnSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  it('returns false when app data cannot be serialized', () => {
    const folders = [];
    folders.push(folders);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalShowToast = window.showToast;
    window.showToast = vi.fn();

    try {
      expect(AppGridStorage.saveFolders(folders)).toBe(false);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      window.showToast = originalShowToast;
      warnSpy.mockRestore();
    }
  });

  it('notifies the user when the storage bridge reports a late app-grid failure', () => {
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;

    try {
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
        detail: { key: 'appOrder', message: 'quota exceeded', operation: 'set' }
      }));
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
        detail: { key: 'theme', message: 'quota exceeded', operation: 'set' }
      }));

      expect(showToast).toHaveBeenCalledOnce();
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save app changes. Your last action was not saved.',
        'error'
      );
    } finally {
      window.showToast = originalShowToast;
    }
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('customApps', 'not-json');
    expect(AppGridStorage.loadCustomApps()).toEqual([]);
  });

  it('handles non-array customApps data', () => {
    localStorage.setItem('customApps', '{"foo":"bar"}');
    expect(AppGridStorage.loadCustomApps()).toEqual([]);
  });
});

describe('AppGridState', () => {
  beforeAll(() => {
    // Ensure storage is clean for state tests
  });

  it('getCustomApps returns empty array initially', () => {
    expect(AppGridState.getCustomApps()).toEqual([]);
  });

  it('isValidAppData validates required fields', () => {
    expect(AppGridState.isValidAppData(null)).toBe(false);
    expect(AppGridState.isValidAppData({})).toBe(false);
    expect(AppGridState.isValidAppData({ id: '', url: '', name: '' })).toBe(false);
    expect(AppGridState.isValidAppData({ id: '1', url: 'https://example.com', name: 'Example' })).toBe(true);
  });

  it('addApp adds to custom apps and order', () => {
    const app = { id: 'app1', url: 'https://example.com', name: 'Example' };
    const result = AppGridState.addApp(app);
    expect(result).toBe(true);
    expect(AppGridState.getCustomApps()).toHaveLength(1);
    expect(AppGridState.getOrder()).toEqual(['app1']);
  });

  it('addApp rejects invalid data', () => {
    expect(AppGridState.addApp({})).toBe(false);
    expect(AppGridState.addApp({ id: 'x', url: '', name: 'X' })).toBe(false);
  });

  it('updateCustomApps reloads latest state before saving', () => {
    AppGridStorage.saveCustomApps([
      { id: 'app5', url: 'https://example.com', name: 'Original', meta: { count: 1 } },
      { id: 'app6', url: 'https://example.org', name: 'Kept' }
    ]);

    const staleApps = AppGridState.getCustomApps();
    expect(staleApps).toHaveLength(2);

    const updated = AppGridState.updateCustomApps((apps) => {
      const app = apps.find((item) => item.id === 'app5');
      if (app) {
        app.name = 'Renamed';
        app.meta.count = 2;
      }
      return apps;
    });

    expect(updated).toHaveLength(2);
    expect(AppGridState.getCustomApps()).toEqual([
      {
        id: 'app5',
        url: 'https://example.com',
        name: 'Renamed',
        meta: { count: 2 }
      },
      {
        id: 'app6',
        url: 'https://example.org',
        name: 'Kept'
      }
    ]);
    expect(staleApps[0].meta.count).toBe(1);
  });

  it('updateOrder returns null when order is missing and allowMissing is false', () => {
    expect(AppGridState.updateOrder((order) => order)).toBeNull();
  });

  it('updateOrder initializes order when missing and allowMissing is true', () => {
    const updatedOrder = AppGridState.updateOrder((order) => {
      order.push('app1');
      return order;
    }, { allowMissing: true });

    expect(updatedOrder).toEqual(['app1']);
    expect(AppGridState.getOrder()).toEqual(['app1']);
  });

  it('updateOrder returns null when updater does not return an array', () => {
    AppGridStorage.saveOrder(['a']);

    expect(AppGridState.updateOrder(() => null)).toBeNull();
    expect(AppGridState.getOrder()).toEqual(['a']);
  });

  it('updateOrder returns null when AppGridStorage is unavailable', () => {
    const originalStorage = window.AppGridStorage;
    window.AppGridStorage = null;

    try {
      expect(AppGridState.updateOrder((order) => order, { allowMissing: true })).toBeNull();
    } finally {
      window.AppGridStorage = originalStorage;
    }
  });

  it('returns null from state updates when persistence fails', () => {
    AppGridStorage.saveOrder(['a']);
    AppGridStorage.saveCustomApps([
      { id: 'app-1', url: 'https://example.com', name: 'Original' }
    ]);
    AppGridStorage.saveFolders([
      { id: 'folder-1', name: 'Original', apps: [] }
    ]);

    const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);
    const saveAppsSpy = vi.spyOn(AppGridStorage, 'saveCustomApps').mockReturnValue(false);
    const saveFoldersSpy = vi.spyOn(AppGridStorage, 'saveFolders').mockReturnValue(false);

    try {
      expect(AppGridState.updateOrder((order) => order.concat('b'))).toBeNull();
      expect(AppGridState.updateCustomApps((apps) => apps)).toBeNull();
      expect(AppGridState.updateFolders((folders) => folders)).toBeNull();
      expect(AppGridState.renameApp('app-1', 'Changed')).toBe(false);
      expect(AppGridState.renameFolder('folder-1', 'Changed')).toBe(false);
    } finally {
      saveFoldersSpy.mockRestore();
      saveAppsSpy.mockRestore();
      saveOrderSpy.mockRestore();
    }
  });

  it('renameApp updates name', () => {
    const app = { id: 'app2', url: 'https://example.com', name: 'Old' };
    AppGridState.addApp(app);
    expect(AppGridState.renameApp('app2', 'New')).toBe(true);
    expect(AppGridState.getCustomApps()[0].name).toBe('New');
  });

  it('renameApp returns false for missing id', () => {
    expect(AppGridState.renameApp('nonexistent', 'Name')).toBe(false);
  });

  it('updateThumbnail updates icon and clears cache', () => {
    const app = { id: 'app3', url: 'https://example.com', name: 'Ex', icon: 'old.png', cachedIcon: 'data:old' };
    AppGridState.addApp(app);
    expect(AppGridState.updateThumbnail('app3', 'new.png')).toBe(true);
    const updated = AppGridState.getCustomApps()[0];
    expect(updated.icon).toBe('new.png');
    expect(updated.cachedIcon).toBeUndefined();
  });

  it('deleteApp removes app and order entry', () => {
    const app = { id: 'app4', url: 'https://example.com', name: 'ToDelete' };
    AppGridState.addApp(app);
    expect(AppGridState.deleteApp('app4')).toBe(true);
    expect(AppGridState.getCustomApps()).toHaveLength(0);
    expect(AppGridState.getOrder()).not.toContain('app4');
  });

  it('deleteApp returns false for missing id', () => {
    expect(AppGridState.deleteApp('nonexistent')).toBe(false);
  });

  it('creates a folder ID with getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn(bytes => {
      bytes.fill(0);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    try {
      const folder = AppGridState.createFolder('Group', []);

      expect(getRandomValues).toHaveBeenCalledOnce();
      expect(folder.id).toBe('folder-00000000-0000-4000-8000-000000000000');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rolls back custom apps when adding an app cannot save its order', () => {
    const previousApps = [{ id: 'existing', url: 'https://existing.com', name: 'Existing' }];
    AppGridStorage.saveCustomApps(previousApps);
    const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);

    try {
      expect(AppGridState.addApp({ id: 'new', url: 'https://new.com', name: 'New' })).toBe(false);
      expect(AppGridState.getCustomApps()).toEqual(previousApps);
    } finally {
      saveOrderSpy.mockRestore();
    }
  });

  it('rolls back custom apps when deleting an app cannot save its order', () => {
    const previousApps = [{ id: 'existing', url: 'https://existing.com', name: 'Existing' }];
    AppGridStorage.saveCustomApps(previousApps);
    AppGridStorage.saveOrder(['existing']);
    const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);

    try {
      expect(AppGridState.deleteApp('existing')).toBe(false);
      expect(AppGridState.getCustomApps()).toEqual(previousApps);
    } finally {
      saveOrderSpy.mockRestore();
    }
  });

  it('reorder moves item forward', () => {
    AppGridState.addApp({ id: 'a', url: 'https://a.com', name: 'A' });
    AppGridState.addApp({ id: 'b', url: 'https://b.com', name: 'B' });
    AppGridState.addApp({ id: 'c', url: 'https://c.com', name: 'C' });
    expect(AppGridState.reorder('a', 2)).toBe(true);
    expect(AppGridState.getOrder()).toEqual(['b', 'a', 'c']);
  });

  it('reorder moves item backward', () => {
    AppGridState.addApp({ id: 'd', url: 'https://d.com', name: 'D' });
    AppGridState.addApp({ id: 'e', url: 'https://e.com', name: 'E' });
    AppGridState.addApp({ id: 'f', url: 'https://f.com', name: 'F' });
    expect(AppGridState.reorder('f', 0)).toBe(true);
    expect(AppGridState.getOrder()).toEqual(['f', 'd', 'e']);
  });

  it('reorder appends with -1', () => {
    AppGridState.addApp({ id: 'g', url: 'https://g.com', name: 'G' });
    AppGridState.addApp({ id: 'h', url: 'https://h.com', name: 'H' });
    expect(AppGridState.reorder('g', -1)).toBe(true);
    expect(AppGridState.getOrder()).toEqual(['h', 'g']);
  });

  it('reorder returns false for missing sourceId', () => {
    expect(AppGridState.reorder('missing', 0)).toBe(false);
  });

  it('reorder returns false when order is null', () => {
    // Clear order manually
    AppGridStorage.saveOrder(null);
    expect(AppGridState.reorder('x', 0)).toBe(false);
  });

  describe('sortAlphabetically', () => {
    let originalDefaultApps;
    let originalI18n;

    beforeEach(() => {
      originalDefaultApps = window.defaultApps;
      originalI18n = window.i18n;
    });

    afterEach(() => {
      // Restore rather than delete: window.i18n is installed once by
      // tests/setup.js and later suites in this file rely on it.
      if (originalDefaultApps === undefined) {
        delete window.defaultApps;
      } else {
        window.defaultApps = originalDefaultApps;
      }
      window.i18n = originalI18n;
    });

    const addApps = (specs) => {
      specs.forEach(({ id, url }) => {
        expect(AppGridState.addApp({ id, url, name: id })).toBe(true);
      });
    };

    it('sorts custom apps by name and persists the permutation', () => {
      addApps([
        { id: 'zeta', url: 'https://z.com' },
        { id: 'alpha', url: 'https://a.com' },
        { id: 'mid', url: 'https://m.com' }
      ]);

      expect(AppGridState.sortAlphabetically()).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['alpha', 'mid', 'zeta']);
    });

    it('sorts by display name including default apps via nameKey', () => {
      window.defaultApps = [
        { id: 'weather-app', url: '#', nameKey: 'weather' },
        { id: 'ai-app', url: '#', nameKey: 'ai' }
      ];
      window.i18n = {
        currentLanguage: () => 'en',
        t: (key) => ({ weather: 'Weather', ai: 'AI Chat' }[key] || key)
      };
      AppGridStorage.saveOrder(['weather-app', 'ai-app']);

      expect(AppGridState.sortAlphabetically()).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app']);
    });

    it('collates according to the selected application locale (#650)', () => {
      // Swedish ranks ü/ö after z; German treats them as u/o. Same names,
      // different order — the sort must follow the app language, not the
      // runtime (browser) locale.
      const namesById = { a: 'österreich', b: 'zeta' };
      const buildI18n = (lang) => ({
        currentLanguage: () => lang,
        t: () => ''
      });
      addApps([{ id: 'a', url: 'https://a.com' }, { id: 'b', url: 'https://b.com' }]);
      Object.values(namesById).forEach((name, i) => {
        AppGridState.renameApp(i === 0 ? 'a' : 'b', name);
      });
      const orderFor = (lang) => {
        window.i18n = buildI18n(lang);
        expect(AppGridState.sortAlphabetically()).toBe(true);
        return AppGridState.getOrder();
      };

      expect(orderFor('de')).toEqual(['a', 'b']);
      expect(orderFor('sv')).toEqual(['b', 'a']);
    });

    it('survives a legacy underscore locale tag without throwing', () => {
      // Historic language codes like zh_CN are invalid BCP 47 tags that
      // Intl.Collator rejects; sorting must fall back to the runtime default.
      addApps([{ id: 'b', url: 'https://b.com' }, { id: 'a', url: 'https://a.com' }]);
      window.i18n = { currentLanguage: () => 'zh_CN', t: () => '' };

      expect(AppGridState.sortAlphabetically()).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['a', 'b']);
    });

    it('keeps folder ids anchored at their current indices', () => {
      addApps([{ id: 'b', url: 'https://b.com' }, { id: 'a', url: 'https://a.com' }]);
      AppGridState.createFolder('Group', []);
      // Order is [b, a, folderId]; sorting must leave the folder last and
      // swap only the apps.
      expect(AppGridState.getFolders()).toHaveLength(1);

      expect(AppGridState.sortAlphabetically()).toBe(true);
      const order = AppGridState.getOrder();
      expect(order).toEqual(['a', 'b', AppGridState.getFolders()[0].id]);
    });

    it('uses case-insensitive natural ordering', () => {
      addApps([
        { id: 'banana10', url: 'https://b10.com' },
        { id: 'apple', url: 'https://a.com' },
        { id: 'banana2', url: 'https://b2.com' }
      ]);
      AppGridState.renameApp('banana10', 'Banana 10');
      AppGridState.renameApp('banana2', 'banana 2');

      expect(AppGridState.sortAlphabetically()).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['apple', 'banana2', 'banana10']);
    });

    it('is deterministic for equal names via id tiebreak', () => {
      addApps([{ id: 'x2', url: 'https://x2.com' }, { id: 'x1', url: 'https://x1.com' }]);
      AppGridState.renameApp('x2', 'Same');
      AppGridState.renameApp('x1', 'same');

      expect(AppGridState.sortAlphabetically()).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['x1', 'x2']);
    });

    it('returns false when there is no persisted order', () => {
      expect(AppGridState.sortAlphabetically()).toBe(false);
    });

    it('leaves stale ids in place instead of throwing or dropping them', () => {
      // A foreign id (e.g. mid-repair state) keeps its slot; known apps sort
      // around it. renderAllApps remains responsible for repair.
      AppGridStorage.saveCustomApps([
        { id: 'b', url: 'https://b.com', name: 'Bravo' },
        { id: 'a', url: 'https://a.com', name: 'Alpha' }
      ]);
      AppGridStorage.saveOrder(['b', 'stale-id', 'a']);

      expect(AppGridState.sortAlphabetically()).toBe(true);
      expect(AppGridState.getOrder()).toEqual(['a', 'stale-id', 'b']);
    });
  });

  describe('appIndexToOrderIndex', () => {
    it('maps an index past trailing folders to the full-order end (#599)', () => {
      // Issue #599 repro: dragging app A to the last grid slot computes an
      // app-only index of 3 (after A, B, C) which must land after F1 and F2.
      AppGridStorage.saveOrder(['A', 'B', 'C', 'F1', 'F2']);
      AppGridStorage.saveFolders([
        { id: 'F1', name: 'One', apps: [] },
        { id: 'F2', name: 'Two', apps: [] }
      ]);
      expect(AppGridState.appIndexToOrderIndex(3)).toBe(5);
    });

    it('maps an app-only index to the full-order index of the target app', () => {
      AppGridStorage.saveOrder(['A', 'F1', 'B', 'C', 'F2']);
      AppGridStorage.saveFolders([
        { id: 'F1', name: 'One', apps: [] },
        { id: 'F2', name: 'Two', apps: [] }
      ]);
      // Insert before app-only index 2 (app C), which sits after F2.
      expect(AppGridState.appIndexToOrderIndex(2)).toBe(3);
    });

    it('maps the front of the app-only sequence past a leading folder', () => {
      AppGridStorage.saveOrder(['F0', 'A', 'B', 'F1', 'C']);
      AppGridStorage.saveFolders([
        { id: 'F0', name: 'Zero', apps: [] },
        { id: 'F1', name: 'One', apps: [] }
      ]);
      expect(AppGridState.appIndexToOrderIndex(0)).toBe(1);
    });

    it('is the identity when no folders are present', () => {
      AppGridStorage.saveOrder(['A', 'B', 'C']);
      AppGridStorage.saveFolders([]);
      expect(AppGridState.appIndexToOrderIndex(0)).toBe(0);
      expect(AppGridState.appIndexToOrderIndex(2)).toBe(2);
      expect(AppGridState.appIndexToOrderIndex(3)).toBe(3);
    });

    it('returns the order length for an index at the end of the sequence', () => {
      AppGridStorage.saveOrder(['A', 'F1', 'B']);
      AppGridStorage.saveFolders([{ id: 'F1', name: 'One', apps: [] }]);
      expect(AppGridState.appIndexToOrderIndex(2)).toBe(3);
    });

    it('returns -1 unchanged as the no-position sentinel', () => {
      AppGridStorage.saveOrder(['A', 'F1', 'B']);
      AppGridStorage.saveFolders([{ id: 'F1', name: 'One', apps: [] }]);
      expect(AppGridState.appIndexToOrderIndex(-1)).toBe(-1);
    });

    it('passes the index through when the order is missing', () => {
      AppGridStorage.saveOrder(null);
      expect(AppGridState.appIndexToOrderIndex(3)).toBe(3);
    });
  });

  describe('getCanonicalUrl', () => {
    it('strips www prefix', () => {
      expect(AppGridState.getCanonicalUrl('https://www.example.com'))
        .toBe('https://example.com/');
    });

    it('removes trailing slash', () => {
      expect(AppGridState.getCanonicalUrl('https://example.com/path/'))
        .toBe('https://example.com/path');
    });

    it('lowercases hostname', () => {
      expect(AppGridState.getCanonicalUrl('HTTPS://EXAMPLE.COM/Path'))
        .toBe('https://example.com/Path');
    });

    it('preserves protocol difference', () => {
      expect(AppGridState.getCanonicalUrl('http://example.com'))
        .toBe('http://example.com/');
    });

    it('handles all normalizations together', () => {
      expect(AppGridState.getCanonicalUrl('HTTP://WWW.EXAMPLE.COM/Path/'))
        .toBe('http://example.com/Path');
    });

    it('strips default port 443 for https', () => {
      expect(AppGridState.getCanonicalUrl('https://example.com:443/path'))
        .toBe('https://example.com/path');
    });

    it('strips default port 80 for http', () => {
      expect(AppGridState.getCanonicalUrl('http://example.com:80/path'))
        .toBe('http://example.com/path');
    });

    it('preserves non-default port', () => {
      expect(AppGridState.getCanonicalUrl('https://example.com:8080/path'))
        .toBe('https://example.com:8080/path');
    });

    it('returns input unchanged for invalid URL', () => {
      // The exact behavior for invalid URLs depends on URL constructor
      // but it should not throw
      const result = AppGridState.getCanonicalUrl('not-a-url');
      expect(typeof result).toBe('string');
    });
  });

  describe('hasAppWithUrl', () => {
    beforeAll(() => {
      window.defaultApps = [
        { id: 'feedback-app', url: 'https://github.com/404-PF/New-Tab/issues/new', nameKey: 'feedback', className: 'default-app' },
      ];
    });

    afterAll(() => {
      delete window.defaultApps;
    });

    beforeEach(() => {
      AppGridState.addApp({ id: 'existing', url: 'https://example.com', name: 'Existing' });
    });

    it('returns true for same URL', () => {
      expect(AppGridState.hasAppWithUrl('https://example.com')).toBe(true);
    });

    it('returns true for www variant of same URL', () => {
      expect(AppGridState.hasAppWithUrl('https://www.example.com')).toBe(true);
    });

    it('returns true for URL with trailing slash', () => {
      expect(AppGridState.hasAppWithUrl('https://example.com/')).toBe(true);
    });

    it('returns false for different URL', () => {
      expect(AppGridState.hasAppWithUrl('https://other.com')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(AppGridState.hasAppWithUrl('')).toBe(false);
    });

    it('returns false for null', () => {
      expect(AppGridState.hasAppWithUrl(null)).toBe(false);
    });

    it('returns true when URL matches a default app', () => {
      expect(AppGridState.hasAppWithUrl('https://github.com/404-PF/New-Tab/issues/new')).toBe(true);
    });

    it('returns true when stored URL lacks protocol prefix', () => {
      AppGridState.addApp({ id: 'bare', url: 'example.org', name: 'Bare' });
      expect(AppGridState.hasAppWithUrl('https://example.org')).toBe(true);
    });

    it('addApp rejects a URL matching a default app', () => {
      const result = AppGridState.addApp({ id: 'dup', url: 'https://github.com/404-PF/New-Tab/issues/new', name: 'Dup' });
      expect(result).toBe(false);
      expect(AppGridState.getCustomApps()).toHaveLength(1);
    });

    it('returns true for URL with explicit default port', () => {
      expect(AppGridState.hasAppWithUrl('https://example.com:443')).toBe(true);
    });

    it('returns true when stored URL has explicit default port', () => {
      AppGridState.addApp({ id: 'porty', url: 'https://example.org:443/path', name: 'Porty' });
      expect(AppGridState.hasAppWithUrl('https://example.org/path')).toBe(true);
    });
  });

  it('addApp rejects duplicate URL', () => {
    AppGridState.addApp({ id: 'first', url: 'https://example.com', name: 'First' });
    const result = AppGridState.addApp({ id: 'second', url: 'https://example.com', name: 'Second' });
    expect(result).toBe(false);
    expect(AppGridState.getCustomApps()).toHaveLength(1);
  });

  it('addApp accepts same URL with different protocol', () => {
    AppGridState.addApp({ id: 'https-app', url: 'https://example.com', name: 'HTTPS' });
    const result = AppGridState.addApp({ id: 'http-app', url: 'http://example.com', name: 'HTTP' });
    expect(result).toBe(true);
    expect(AppGridState.getCustomApps()).toHaveLength(2);
  });
});

describe('renderAllApps order validation', () => {
  beforeAll(() => {
    // Set up minimal DOM needed by renderAllApps
    const grid = document.createElement('div');
    grid.id = 'app-grid';
    const newApp = document.createElement('a');
    newApp.id = 'new-app';
    grid.appendChild(newApp);
    document.body.appendChild(grid);

    // Inject dependencies that app-manager.js expects
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/utils.js');
    injectScript('src/ui/app-manager.js');
  });

  beforeEach(() => {
    localStorage.clear();
    window.__appGridState.reset();
  });

  it('rebuilds order when a default app ID is missing', () => {
    // Persist an order that is structurally valid (correct length, all valid
    // IDs, no duplicates) but is missing one built-in default app ID.
    const incompleteOrder = ['ai-app', 'feedback-app'];
    AppGridStorage.saveOrder(incompleteOrder);

    // Add a custom app so that totalExpectedLength matches the incomplete order
    const customApp = { id: 'custom-1', url: 'https://example.com', name: 'Custom' };
    AppGridState.addApp(customApp);

    // Call renderAllApps – it should detect the missing default and rebuild
    window.renderAllApps();

    const rebuiltOrder = AppGridState.getOrder();
    expect(rebuiltOrder).toContain('ai-app');
    expect(rebuiltOrder).toContain('weather-app');
    expect(rebuiltOrder).toContain('games-app');
    expect(rebuiltOrder).toContain('feedback-app');
    expect(rebuiltOrder).toContain('settings-app');
    expect(rebuiltOrder).toContain('custom-1');
  });

  it('accepts a valid order containing all default apps', () => {
    // Set up a complete valid order
    const customApp = { id: 'custom-2', url: 'https://example.com', name: 'Custom 2' };
    AppGridState.addApp(customApp);
    const completeOrder = ['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app', 'custom-2'];
    AppGridStorage.saveOrder(completeOrder);

    window.renderAllApps();

    // Order should be preserved (not rebuilt)
    const order = AppGridState.getOrder();
    expect(order).toEqual(completeOrder);
  });

  it('uses the bundled fallback when an app icon fails to load', () => {
    AppGridState.addApp({
      id: 'broken-icon',
      url: 'https://example.com',
      name: 'Broken icon',
      icon: 'https://example.com/missing.png'
    });

    window.renderAllApps();

    const image = document.querySelector('#broken-icon img');
    image.dispatchEvent(new Event('error'));

    expect(image.getAttribute('src')).toBe('images/icons/globe.svg');
    expect(image.hasAttribute('data-app-icon')).toBe(false);
  });

  it('rebuilds order when order is null (first load)', () => {
    // No order persisted - simulate fresh start
    AppGridStorage.saveOrder(null);

    // Add a custom app that should be included in the rebuilt order
    const customApp = { id: 'custom-3', url: 'https://example.com', name: 'Custom 3' };
    AppGridState.addApp(customApp);

    window.renderAllApps();

    const order = AppGridState.getOrder();
    expect(order).toContain('ai-app');
    expect(order).toContain('weather-app');
    expect(order).toContain('feedback-app');
    expect(order).toContain('settings-app');
    expect(order).toContain('custom-3');
  });

  it('preserves user reorder after deleting a custom app (#257)', () => {
    // Reproduces issue #257: add two custom apps, reorder them, delete one,
    // then render. The remaining custom app's position must be preserved
    // (it should NOT be rewritten back to default insertion order).
    AppGridState.addApp({ id: 'c1', url: 'https://a.com', name: 'C1' });
    AppGridState.addApp({ id: 'c2', url: 'https://b.com', name: 'C2' });
    window.renderAllApps();

    // Move c1 to the end so c2 sits before c1.
    // order was [defaults..., c1, c2]; reorder('c1', 5) gives [defaults..., c2, c1].
    AppGridState.reorder('c1', 5);

    AppGridState.deleteApp('c1');
    window.renderAllApps();

    expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app', 'c2']);
  });

  it('preserves relative order of remaining customs across a delete', () => {
    // Three customs in a non-canonical order; deleting the middle one must
    // keep the other two in their user-defined relative positions.
    AppGridState.addApp({ id: 'c1', url: 'https://a.com', name: 'C1' });
    AppGridState.addApp({ id: 'c2', url: 'https://b.com', name: 'C2' });
    AppGridState.addApp({ id: 'c3', url: 'https://c.com', name: 'C3' });
    window.renderAllApps();

    // Hand-craft a reordered order and persist it (reorder math is exercised
    // elsewhere; this test focuses on delete-preserves-order).
    AppGridStorage.saveOrder(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app', 'c3', 'c1', 'c2']);

    AppGridState.deleteApp('c2');
    window.renderAllApps();

    expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app', 'c3', 'c1']);
  });

  it('does not rewrite order when a custom app lives inside a folder', () => {
    // Regression: totalExpectedLength previously counted every custom app
    // even those in folders, so any folder move made the next render
    // trigger the recovery branch and wipe the user's reorder.
    AppGridState.addApp({ id: 'c1', url: 'https://a.com', name: 'C1' });
    AppGridState.addApp({ id: 'c2', url: 'https://b.com', name: 'C2' });
    window.renderAllApps();

    const folder = AppGridState.createFolder('Group', []);
    // Manually craft the post-folder-create state via the public API path.
    AppGridState.addAppToFolder(folder.id, 'c1');

    // After moving c1 into the folder, the expected order is
    // [defaults..., c2, folder.id] (c1 removed because it now lives in folder).
    const expectedOrder = ['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app', 'c2', folder.id];
    expect(AppGridState.getOrder()).toEqual(expectedOrder);

    // Re-render and confirm the order is unchanged (no spurious recovery).
    window.renderAllApps();
    expect(AppGridState.getOrder()).toEqual(expectedOrder);
    expect(AppGridState.getFolders()[0].apps).toContain('c1');
  });

  it('repairs corrupted order while preserving the user-defined portion', () => {
    // Seed an order that is mostly valid but contains a foreign ID; the
    // repair pass should drop the foreign ID and keep the rest of the
    // user's order (including non-canonical positioning of defaults).
    AppGridState.addApp({ id: 'custom-known', url: 'https://a.com', name: 'Custom' });
    const corrupted = ['feedback-app', 'weather-app', 'ai-app', 'games-app', 'settings-app', 'custom-known', 'foreign-id'];
    AppGridStorage.saveOrder(corrupted);

    window.renderAllApps();

    const order = AppGridState.getOrder();
    expect(order).toEqual(['feedback-app', 'weather-app', 'ai-app', 'games-app', 'settings-app', 'custom-known']);
    expect(order).not.toContain('foreign-id');
  });

  it('recovers cleanly when order is null without throwing (#257 regression)', () => {
    // Previous validator called defaultApps.every(app => order.includes(...))
    // which throws TypeError when order is null. The new ID-set check
    // must handle a null order gracefully and rebuild it from defaults.
    AppGridStorage.saveOrder(null);
    expect(() => window.renderAllApps()).not.toThrow();
    expect(AppGridState.getOrder()).toEqual(['ai-app', 'weather-app', 'games-app', 'feedback-app', 'settings-app']);
  });

  it('prepends only the missing defaults when some are already in user order', () => {
    // Locks in the documented repair behavior: when the order is invalid
    // because some default IDs are absent, the missing ones are unshifted
    // to the front in canonical order. Defaults that the user already had
    // in their order stay in place (preserves user reorders).
    AppGridState.addApp({ id: 'c1', url: 'https://a.com', name: 'C1' });
    // User placed ai-app and c1, but feedback-app and settings-app are missing.
    AppGridStorage.saveOrder(['ai-app', 'c1']);

    window.renderAllApps();

    // Missing defaults are prepended in canonical order; existing user
    // entries (ai-app, c1) keep their relative positions after the
    // prepended defaults.
    expect(AppGridState.getOrder()).toEqual(['weather-app', 'games-app', 'feedback-app', 'settings-app', 'ai-app', 'c1']);
  });

  it('re-applies the games-enabled preference after a grid re-render', () => {
    // Regression: renderAllApps rebuilds the grid from scratch, creating a
    // fresh visible #games-app anchor. When games are disabled, the toggle
    // must be re-applied after every render so the Games app stays hidden
    // (e.g. after a language change or app/folder edit).
    localStorage.setItem('games_enabled', 'false');
    const applyGamesEnabled = vi.fn(() => {
      const gamesApp = document.getElementById('games-app');
      if (gamesApp) gamesApp.style.display = 'none';
    });
    const originalApplyGamesEnabled = window.applyGamesEnabled;
    try {
      window.applyGamesEnabled = applyGamesEnabled;
      window.renderAllApps();

      expect(applyGamesEnabled).toHaveBeenCalled();
      const gamesApp = document.getElementById('games-app');
      expect(gamesApp).not.toBeNull();
      expect(gamesApp.style.display).toBe('none');
    } finally {
      if (originalApplyGamesEnabled === undefined) {
        delete window.applyGamesEnabled;
      } else {
        window.applyGamesEnabled = originalApplyGamesEnabled;
      }
    }
  });
});

describe('__appGridState', () => {
  beforeEach(() => {
    window.__appGridState.reset();
  });

  it('starts in idle phase', () => {
    expect(window.__appGridState.phase).toBe('idle');
  });

  it('transitions from idle to deferred', () => {
    window.__appGridState.setPhase('deferred');
    expect(window.__appGridState.phase).toBe('deferred');
  });

  it('transitions from idle to rendered', () => {
    window.__appGridState.setPhase('rendered');
    expect(window.__appGridState.phase).toBe('rendered');
  });

  it('transitions from deferred to rendered', () => {
    window.__appGridState.setPhase('deferred');
    window.__appGridState.setPhase('rendered');
    expect(window.__appGridState.phase).toBe('rendered');
  });

  it('dispatches appGridReady event on transition to rendered', () => {
    let fired = false;
    window.addEventListener('appGridReady', () => { fired = true; }, { once: true });
    window.__appGridState.setPhase('rendered');
    expect(fired).toBe(true);
  });

  it('does not dispatch appGridReady on non-rendered transitions', () => {
    let fired = false;
    window.addEventListener('appGridReady', () => { fired = true; }, { once: true });
    window.__appGridState.setPhase('deferred');
    expect(fired).toBe(false);
  });

  it('ignores same-phase transition', () => {
    window.__appGridState.setPhase('deferred');
    window.__appGridState.setPhase('deferred');
    expect(window.__appGridState.phase).toBe('deferred');
  });

  it('prevents backward transition from rendered', () => {
    window.__appGridState.setPhase('rendered');
    window.__appGridState.setPhase('idle');
    expect(window.__appGridState.phase).toBe('rendered');
  });

  it('prevents backward transition from deferred to idle', () => {
    window.__appGridState.setPhase('deferred');
    window.__appGridState.setPhase('idle');
    expect(window.__appGridState.phase).toBe('deferred');
  });

  it('appGridReady getter returns false when not rendered', () => {
    expect(window.appGridReady).toBe(false);
  });

  it('appGridReady getter returns true when rendered', () => {
    window.__appGridState.setPhase('rendered');
    expect(window.appGridReady).toBe(true);
  });

  it('reset() returns phase to idle from rendered', () => {
    window.__appGridState.setPhase('rendered');
    window.__appGridState.reset();
    expect(window.__appGridState.phase).toBe('idle');
  });

  it('reset() returns phase to idle from deferred', () => {
    window.__appGridState.setPhase('deferred');
    window.__appGridState.reset();
    expect(window.__appGridState.phase).toBe('idle');
  });

  it('reset() does not leave force flag stuck', () => {
    window.__appGridState.setPhase('deferred');
    window.__appGridState.reset();
    expect(window.__appGridState.phase).toBe('idle');
    window.__appGridState.setPhase('deferred');
    window.__appGridState.setPhase('idle');
    expect(window.__appGridState.phase).toBe('deferred');
  });

  it('ignores invalid phase argument', () => {
    window.__appGridState.setPhase('deferred');
    window.__appGridState.setPhase('bogus');
    expect(window.__appGridState.phase).toBe('deferred');
  });
});
