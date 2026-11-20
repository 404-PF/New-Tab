import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

beforeAll(() => {
  // toast.js provides window.showToast for app-grid-storage's save errors.
  injectScript('src/core/toast.js');
  injectScript('src/core/app-grid-storage.js');
});

describe('AppGridStorage', () => {
  it('persists arrays and uses safe defaults for absent or corrupted values', () => {
    expect(AppGridStorage.loadOrder()).toBeNull();
    expect(AppGridStorage.saveCustomApps([{ id: 'custom-1' }])).toBe(true);
    expect(AppGridStorage.loadCustomApps()).toEqual([{ id: 'custom-1' }]);

    localStorage.setItem('appFolders', '{broken');
    expect(AppGridStorage.loadFolders()).toEqual([]);
  });

  it('shows a save error only for app-grid storage write failures', () => {
    window.dispatchEvent(new CustomEvent('storageBridgeWriteError', { detail: { key: 'theme' } }));
    expect(document.querySelector('.toast-notification')).toBeNull();

    window.dispatchEvent(new CustomEvent('storageBridgeWriteError', { detail: { key: 'appOrder' } }));
    expect(document.querySelector('.toast-notification').textContent).toContain('Failed to save app changes');
  });

  it('repaints only after a macrotask for hiddenDefaultApps and customApps (#1238)', async () => {
    const renderAllApps = vi.fn();
    const renderDefaultAppVisibilityList = vi.fn();
    window.renderAllApps = renderAllApps;
    window.renderDefaultAppVisibilityList = renderDefaultAppVisibilityList;

    try {
      // appOrder owns its folder repair in context-menu.js, so a rejected
      // appOrder write must never trigger the full-grid repaint.
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', { detail: { key: 'appOrder' } }));
      await flushDeferredFailureSync();
      expect(renderAllApps).not.toHaveBeenCalled();
      expect(renderDefaultAppVisibilityList).not.toHaveBeenCalled();

      // The bridge rolls its cache back after dispatching, so the repaint has
      // to wait one macrotask to read the restored store.
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', { detail: { key: 'hiddenDefaultApps' } }));
      expect(renderAllApps).not.toHaveBeenCalled();
      expect(renderDefaultAppVisibilityList).not.toHaveBeenCalled();
      await flushDeferredFailureSync();
      expect(renderAllApps).toHaveBeenCalledOnce();
      expect(renderDefaultAppVisibilityList).toHaveBeenCalledOnce();

      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', { detail: { key: 'customApps' } }));
      await flushDeferredFailureSync();
      expect(renderAllApps).toHaveBeenCalledTimes(2);
      expect(renderDefaultAppVisibilityList).toHaveBeenCalledTimes(2);
    } finally {
      delete window.renderAllApps;
      delete window.renderDefaultAppVisibilityList;
    }
  });

  it('does not let a recovery repaint retry a failing customApps migration (#1238)', async () => {
    // Legacy stored URL: every loadCustomApps() read normalizes it and would
    // normally persist the normalized value, so a recovery repaint that
    // persisted the migration would fail, repaint, and fail forever while the
    // write rejection lasts.
    const legacyApps = [{ id: 'legacy-app', name: 'Legacy', url: 'example.com' }];
    localStorage.setItem('customApps', JSON.stringify(legacyApps));

    const restoreWrites = failStorageWritesFor('customApps', 'async');
    const originals = {
      showToast: window.showToast,
      renderAllApps: window.renderAllApps,
      renderDefaultAppVisibilityList: window.renderDefaultAppVisibilityList
    };
    let renderedApps = null;
    // Mirror the real render path: renderAllApps reads customApps through
    // AppGridStorage.loadCustomApps() during the repaint.
    const renderAllApps = vi.fn(() => {
      renderedApps = window.AppGridStorage.loadCustomApps();
    });
    const renderDefaultAppVisibilityList = vi.fn();
    const showToast = vi.fn();
    window.showToast = showToast;
    window.renderAllApps = renderAllApps;
    window.renderDefaultAppVisibilityList = renderDefaultAppVisibilityList;

    try {
      // Simulate the original rejected customApps write.
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', { detail: { key: 'customApps' } }));
      expect(showToast).toHaveBeenCalledTimes(1);

      // Drive several failure/repaint cycles. Without a non-persisting
      // recovery read, each cycle re-attempts the migration, fails again,
      // and repaints again.
      for (let cycle = 0; cycle < 4; cycle++) {
        await flushDeferredFailureSync();
      }

      // Exactly one repaint and one toast: no endless retry cycle.
      expect(renderAllApps).toHaveBeenCalledTimes(1);
      expect(renderDefaultAppVisibilityList).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledTimes(1);
      // The recovery still renders the normalized URL in memory...
      expect(renderedApps).toEqual([
        { id: 'legacy-app', name: 'Legacy', url: 'https://example.com' }
      ]);
      // ...without persisting it while the write rejection persists.
      expect(JSON.parse(localStorage.getItem('customApps'))).toEqual(legacyApps);
    } finally {
      restoreWrites();
      for (const [name, original] of Object.entries(originals)) {
        if (original === undefined) {
          delete window[name];
        } else {
          window[name] = original;
        }
      }
      // Drain any failure/resync timers this test scheduled so they cannot
      // fire against the next test's state.
      await flushDeferredFailureSync();
      await flushDeferredFailureSync();
    }
  });
});
