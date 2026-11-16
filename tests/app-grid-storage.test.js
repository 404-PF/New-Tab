import { injectScript } from './helpers/inject-script.js';
import { flushDeferredFailureSync } from './helpers/storage-write-failures.js';

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
});
