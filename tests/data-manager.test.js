import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
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

  it('lists only supported persistent keys in exports', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('appOrder');
    expect(window.DataManager.EXPORT_KEYS).toContain('ai_conversations');
    expect(window.DataManager.EXPORT_KEYS).not.toContain('searchHistory');
  });
});
