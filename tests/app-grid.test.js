import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
    AppGridStorage.saveCustomApps(apps);
    expect(AppGridStorage.loadCustomApps()).toEqual(apps);
  });

  it('loadOrder returns null by default', () => {
    expect(AppGridStorage.loadOrder()).toBeNull();
  });

  it('saveOrder persists order', () => {
    AppGridStorage.saveOrder(['a', 'b', 'c']);
    expect(AppGridStorage.loadOrder()).toEqual(['a', 'b', 'c']);
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
});
