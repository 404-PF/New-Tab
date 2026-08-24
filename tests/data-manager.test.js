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
    const customBackgroundsDescriptor = Object.getOwnPropertyDescriptor(window, '_customBackgrounds');
    window._customBackgrounds = {
      getAll: vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'))
    };
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    try {
      window.DataManager.exportAllData();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clickSpy).not.toHaveBeenCalled();
      expect(document.querySelector('.toast-notification').textContent).toBe('dataExportReadError');
    } finally {
      clickSpy.mockRestore();
      document.querySelectorAll('.toast-notification').forEach(el => el.remove());
      if (customBackgroundsDescriptor) {
        Object.defineProperty(window, '_customBackgrounds', customBackgroundsDescriptor);
      } else {
        delete window._customBackgrounds;
      }
    }
  });
});

describe('DataManager eye-care/games/search-history settings', () => {
  // The three persistent settings fields the backup must carry.
  const EYE_CARE_SETTINGS = { enabled: true, intervalMinutes: 30, browserNotification: true };
  // What localStorage actually holds mid-session: settings plus transient
  // timer bookkeeping owned by src/features/eye-care-reminder.js.
  const EYE_CARE_STORED_STATE = {
    ...EYE_CARE_SETTINGS,
    lastReminder: 1700000000000,
    elapsedVisibleMs: 540000,
    lastVisibleAt: 1700000000000,
    activeReminderAt: null,
    activeElapsedVisibleMs: 0,
    activeLastVisibleAt: null,
    visibilityPaused: false
  };

  it('includes the persisted preference keys in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('eyeCareReminder');
    expect(window.DataManager.EXPORT_KEYS).toContain('games_enabled');
    expect(window.DataManager.EXPORT_KEYS).toContain('searchHistoryEnabled');
  });

  it('validates the shape of the new keys', () => {
    expect(window.DataManager.validateImportData({ version: 1, data: {
      eyeCareReminder: EYE_CARE_SETTINGS, games_enabled: false, searchHistoryEnabled: true
    } })).toEqual({ valid: true });
    // Objects carrying legacy/runtime fields stay importable; applyData
    // strips them at write time.
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder(EYE_CARE_STORED_STATE)).toBe(true);

    expect(window.DataManager.EXPECTED_SHAPES.games_enabled(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.searchHistoryEnabled(false)).toBe(true);

    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder(null)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder([1])).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ enabled: false })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ ...EYE_CARE_SETTINGS, enabled: 'yes' })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ ...EYE_CARE_SETTINGS, intervalMinutes: 25 })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ ...EYE_CARE_SETTINGS, browserNotification: 1 })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_enabled('true')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.searchHistoryEnabled('false')).toBe(false);

    expect(window.DataManager.validateImportData({ version: 1, data: {
      eyeCareReminder: { ...EYE_CARE_SETTINGS, intervalMinutes: 25 }
    } }).valid).toBe(false);
  });

  async function importBackup(data, mode) {
    const fileInput = document.getElementById('data-import-file');
    const descriptor = Object.getOwnPropertyDescriptor(fileInput, 'files');
    Object.defineProperty(fileInput, 'files', {
      value: [new File([JSON.stringify({ version: 1, data })], 'backup.json', { type: 'application/json' })],
      configurable: true
    });

    try {
      fileInput.dispatchEvent(new Event('change'));

      // Re-query inside the wait: showImportDialog clones/replaces the dialog
      // node when the FileReader finishes, so pre-dispatch references go stale.
      await vi.waitFor(() => {
        const dialog = document.getElementById('data-import-dialog');
        expect(dialog.classList.contains('ai-confirm-open')).toBe(true);
        return dialog;
      });
      document.getElementById(mode === 'replace' ? 'data-import-replace-btn' : 'data-import-merge-btn').click();
    } finally {
      if (descriptor) {
        Object.defineProperty(fileInput, 'files', descriptor);
      } else {
        delete fileInput.files;
      }
      document.querySelectorAll('.toast-notification').forEach(el => el.remove());
    }
  }

  it('shallow-merges eye-care settings without touching runtime fields', async () => {
    const existingState = {
      ...EYE_CARE_STORED_STATE,
      intervalMinutes: 20,
      browserNotification: false
    };
    localStorage.setItem('eyeCareReminder', JSON.stringify(existingState));
    localStorage.setItem('games_enabled', 'true');
    localStorage.setItem('searchHistoryEnabled', 'true');

    await importBackup({
      games_enabled: false,
      searchHistoryEnabled: false,
      // Full validated shape, but differing from the stored entry: if the
      // generic object branch ever degraded from Object.assign merge to a
      // plain overwrite, the runtime bookkeeping below would be lost.
      eyeCareReminder: EYE_CARE_SETTINGS
    }, 'merge');

    expect(localStorage.getItem('games_enabled')).toBe(JSON.stringify(false));
    expect(localStorage.getItem('searchHistoryEnabled')).toBe(JSON.stringify(false));

    const merged = JSON.parse(localStorage.getItem('eyeCareReminder'));
    expect(merged.enabled).toBe(true);
    expect(merged.intervalMinutes).toBe(30);
    expect(merged.browserNotification).toBe(true);
    // Runtime bookkeeping survives the merge untouched.
    expect(merged.lastReminder).toBe(existingState.lastReminder);
    expect(merged.elapsedVisibleMs).toBe(existingState.elapsedVisibleMs);
    expect(merged.lastVisibleAt).toBe(existingState.lastVisibleAt);
  });

  it('drops transient runtime fields carried by legacy backups on merge', async () => {
    // No pre-existing entry, so the merged result must be exactly the
    // persistent settings: the backup's runtime fields never reach storage.
    await importBackup({ eyeCareReminder: EYE_CARE_STORED_STATE }, 'merge');

    expect(JSON.parse(localStorage.getItem('eyeCareReminder'))).toEqual(EYE_CARE_SETTINGS);
  });

  it('drops transient runtime fields carried by legacy backups on replace', async () => {
    await importBackup({ eyeCareReminder: EYE_CARE_STORED_STATE }, 'replace');

    expect(JSON.parse(localStorage.getItem('eyeCareReminder'))).toEqual(EYE_CARE_SETTINGS);
  });

  it('clears unlisted settings in replace mode so restores are faithful', async () => {
    localStorage.setItem('games_enabled', 'false');
    localStorage.setItem('searchHistoryEnabled', 'false');
    localStorage.setItem('eyeCareReminder', JSON.stringify(EYE_CARE_STORED_STATE));
    localStorage.setItem('theme', 'light');

    await importBackup({ theme: 'dark' }, 'replace');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('games_enabled')).toBeNull();
    expect(localStorage.getItem('searchHistoryEnabled')).toBeNull();
    expect(localStorage.getItem('eyeCareReminder')).toBeNull();
  });

  it('round-trips the new settings through export and re-validation', async () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('eyeCareReminder', JSON.stringify(EYE_CARE_STORED_STATE));
    localStorage.setItem('games_enabled', 'false');
    localStorage.setItem('searchHistoryEnabled', 'false');

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    let capturedJson = null;
    URL.createObjectURL = (blob) => {
      const reader = new FileReader();
      reader.onload = () => { capturedJson = reader.result; };
      reader.readAsText(blob);
      return 'blob:mock-url';
    };
    URL.revokeObjectURL = () => {};
    // jsdom treats a clicked anchor with a blob: href as navigation; stub it out.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    let exported;
    try {
      window.DataManager.exportAllData();
      await vi.waitFor(() => expect(capturedJson).not.toBeNull());
      expect(clickSpy).toHaveBeenCalled();

      exported = JSON.parse(capturedJson);
      expect(exported.version).toBe(1);
      // Export carries only the persistent settings; timer bookkeeping stays local.
      expect(exported.data.eyeCareReminder).toEqual(EYE_CARE_SETTINGS);
      expect(exported.data.games_enabled).toBe(false);
      expect(exported.data.searchHistoryEnabled).toBe(false);
      expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      document.querySelectorAll('.toast-notification').forEach(el => el.remove());
    }
  });
});
