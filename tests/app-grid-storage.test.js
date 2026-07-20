import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
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
});
