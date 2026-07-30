import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/timezone-clocks.js');
  injectScript('src/features/data-manager.js');
});

describe('DataManager backup validation', () => {
  it('accepts supported settings and rejects disallowed or malformed data', () => {
    expect(window.DataManager.validateImportData({ version: 1, data: {
      theme: 'dark', todos: [{ id: 'todo-1' }], customApps: [{ id: 'app-1' }]
    } })).toEqual({ valid: true });
    expect(window.DataManager.validateImportData({ version: 1, data: { dangerous: true } }).valid).toBe(false);
    expect(window.DataManager.validateImportData({ version: 1, data: { todos: [{}] } }).valid).toBe(false);
    expect(window.DataManager.validateImportData({ version: 2, data: {} }).valid).toBe(false);
  });

  it('rejects unsupported, duplicate, and over-capacity time zones', () => {
    const supported = window.POPULAR_ZONES.slice(0, 6).map(zone => zone.id);
    expect(window.DataManager.validateImportData({ version: 1, data: {
      extraTimeZones: supported.slice(0, 5)
    } })).toEqual({ valid: true });
    expect(window.DataManager.validateImportData({ version: 1, data: {
      extraTimeZones: ['Not/A/TimeZone']
    } }).valid).toBe(false);
    expect(window.DataManager.validateImportData({ version: 1, data: {
      extraTimeZones: [supported[0], supported[0]]
    } }).valid).toBe(false);
    expect(window.DataManager.validateImportData({ version: 1, data: {
      extraTimeZones: supported
    } }).valid).toBe(false);
  });
  it('lists only supported persistent keys in exports', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('appOrder');
    expect(window.DataManager.EXPORT_KEYS).toContain('ai_conversations');
    expect(window.DataManager.EXPORT_KEYS).not.toContain('searchHistory');
  });

  it('shows an error instead of exporting when custom background metadata fails to load', async () => {
    window._customBackgrounds = {
      getAll: vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'))
    };
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    window.DataManager.exportAllData();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.toast-notification').textContent).toBe('dataExportReadError');
  });
});
