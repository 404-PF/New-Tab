import { injectScript } from './helpers/inject-script.js';

async function exportDataForTest() {
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
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  try {
    window.DataManager.exportAllData();
    await vi.waitFor(() => expect(capturedJson).not.toBeNull());
    return JSON.parse(capturedJson);
  } finally {
    clickSpy.mockRestore();
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    document.querySelectorAll('.toast-notification').forEach(el => el.remove());
  }
}

beforeAll(() => {
  injectScript('src/features/timezone-clocks.js');
  injectScript('src/ai/conversation-validator.js');
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

  it('requires AIStore-compatible AI conversation fields', () => {
    const validConversation = {
      id: 'conv-1',
      title: 'Test conversation',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'system', content: 'Be concise' }
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000001000
    };

    expect(window.DataManager.validateImportData({
      version: 1,
      data: { ai_conversations: [validConversation] }
    })).toEqual({ valid: true });

    const invalidConversations = [
      ['missing id', { ...validConversation, id: undefined }],
      ['empty id', { ...validConversation, id: '' }],
      ['invalid id', { ...validConversation, id: 123 }],
      ['missing title', { ...validConversation, title: undefined }],
      ['empty title', { ...validConversation, title: '' }],
      ['whitespace title', { ...validConversation, title: '   ' }],
      ['invalid title', { ...validConversation, title: 123 }],
      ['invalid messages collection', { ...validConversation, messages: {} }],
      ['invalid message role type', {
        ...validConversation,
        messages: [{ role: 123, content: 'Hello' }]
      }],
      ['unsupported message role', {
        ...validConversation,
        messages: [{ role: 'tool', content: 'Hello' }]
      }],
      ['invalid message content', {
        ...validConversation,
        messages: [{ role: 'user', content: null }]
      }],
      ['invalid message id', {
        ...validConversation,
        messages: [{ id: 123, role: 'user', content: 'Hello' }]
      }],
      ['missing createdAt', { ...validConversation, createdAt: undefined }],
      ['invalid createdAt', { ...validConversation, createdAt: '1700000000000' }],
      ['missing updatedAt', { ...validConversation, updatedAt: undefined }],
      ['invalid updatedAt', { ...validConversation, updatedAt: '1700000001000' }],
      ['infinite createdAt', { ...validConversation, createdAt: Infinity }],
      ['negative infinite updatedAt', { ...validConversation, updatedAt: -Infinity }]
    ];

    invalidConversations.forEach(([caseName, conversation]) => {
      expect(
        window.DataManager.validateImportData({
          version: 1,
          data: { ai_conversations: [conversation] }
        }).valid,
        caseName
      ).toBe(false);
    });
  });

  it('validates the complete app folder shape', () => {
    const validFolder = { id: 'folder-1', name: 'Test', apps: ['app-1'] };
    expect(window.DataManager.validateImportData({ version: 1, data: {
      appFolders: [validFolder]
    } })).toEqual({ valid: true });

    const invalidFolders = [
      null,
      'folder-1',
      [],
      { id: 'folder-1', name: 'Test' },
      { id: 'folder-1', name: 'Test', apps: null },
      { id: 'folder-1', name: 'Test', apps: {} },
      { id: 'folder-1', name: 'Test', apps: 'not-an-array' },
      { id: 'folder-1', name: 'Test', apps: [123] },
      { id: 'folder-1', name: 'Test', apps: [''] },
      { id: 'folder-1', name: 'Test', apps: ['  ', 'app-1'] },
      { id: 'folder-1', name: 'Test', apps: ['app-1', 'app-1'] },
      { id: '', name: 'Test', apps: [] },
      { id: '   ', name: 'Test', apps: [] },
      { id: 'folder-1', name: '  ', apps: [] },
      { id: 'folder-1', apps: [] }
    ];

    invalidFolders.forEach((folder) => {
      expect(window.DataManager.validateImportData({ version: 1, data: {
        appFolders: [folder]
      } }).valid).toBe(false);
    });

    const invalidFolderCollections = [null, {}, 'not-an-array'];
    invalidFolderCollections.forEach((folders) => {
      expect(window.DataManager.validateImportData({ version: 1, data: {
        appFolders: folders
      } }).valid).toBe(false);
    });
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

  it('sanitizes malformed stored app folders in exports', async () => {
    localStorage.setItem('appFolders', JSON.stringify([
      { id: 'folder-1', name: 'Valid', apps: ['app-1'] },
      { id: 'folder-2', name: 'Missing apps' },
      { id: 'folder-3', name: 'Duplicate apps', apps: ['app-1', 'app-1'] }
    ]));

    const exported = await exportDataForTest();

    expect(exported.data.appFolders).toEqual([
      { id: 'folder-1', name: 'Valid', apps: ['app-1'] }
    ]);
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
  });

  it('preserves scalar strings that begin with JSON container characters during export', async () => {
    localStorage.setItem('theme', '[Home');
    localStorage.setItem('weatherManualCity', '{Home');

    const exported = await exportDataForTest();

    expect(exported.data.theme).toBe('[Home');
    expect(exported.data.weatherManualCity).toBe('{Home');
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
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
      // applyData waits for the storage bridge to confirm every write before
      // it reports the outcome, so wait for the result toast.
      const toast = await vi.waitFor(() => {
        const el = document.querySelector('.toast-notification');
        expect(el).not.toBeNull();
        return el;
      });
      return { type: toast.classList.contains('toast-warning') ? 'warning' : 'success', text: toast.textContent };
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

  function failBridgeWritesFor(key, mode) {
    const area = chrome.storage.local;
    const originalSet = area.set;
    const originalRemove = area.remove;
    const fail = function (keys, callback, original) {
      const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
      if (list.indexOf(key) === -1) return original.call(area, keys, callback);
      if (mode === 'sync') throw new Error('QUOTA_BYTES quota exceeded');
      setTimeout(() => {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        try {
          if (typeof callback === 'function') callback();
        } finally {
          chrome.runtime.lastError = null;
        }
      }, 0);
      return undefined;
    };
    area.set = (items, callback) => fail(items, callback, originalSet);
    area.remove = (keys, callback) => fail(keys, callback, originalRemove);
    return () => {
      area.set = originalSet;
      area.remove = originalRemove;
    };
  }

  it.each([
    ['a restore write fails synchronously', 'theme', 'sync', null, 'theme', null],
    ['a restore write fails asynchronously', 'theme', 'async', 'light', 'theme', 'light'],
    ['a replace-mode removal fails', 'games_enabled', 'async', 'true', 'games_enabled', 'true']
  ])('reports a partial import when %s', async (_label, failKey, mode, seed, checkKey, expected) => {
    if (seed !== null) localStorage.setItem(failKey, seed);
    const restore = failBridgeWritesFor(failKey, mode);
    try {
      const result = await importBackup({ theme: 'dark' }, 'replace');

      expect(localStorage.getItem(checkKey)).toBe(expected);
      expect(result.type).toBe('warning');
    } finally {
      restore();
    }
  });

  it('finishes the import with a warning when a storage callback never fires', async () => {
    const area = chrome.storage.local;
    const originalSet = area.set;
    area.set = (items, callback) => {
      if (Object.prototype.hasOwnProperty.call(items, 'theme')) return undefined; // never calls back
      return originalSet.call(area, items, callback);
    };
    window.DataManager.importWriteTimeoutMs = 20;
    try {
      const result = await importBackup({ theme: 'dark' }, 'replace');
      expect(result.type).toBe('warning');
    } finally {
      area.set = originalSet;
      delete window.DataManager.importWriteTimeoutMs;
    }
  });

  it('keeps write results separate for each import', async () => {
    const restore = failBridgeWritesFor('theme', 'async');
    try {
      expect((await importBackup({ theme: 'dark' }, 'replace')).type).toBe('warning');
    } finally {
      restore();
    }
    // A failure in the previous import must not leak into this one.
    expect((await importBackup({ theme: 'dark' }, 'replace')).type).toBe('success');
  });

  it('reports success when every restore write persists', async () => {
    const result = await importBackup({ theme: 'dark' }, 'replace');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(result.type).toBe('success');
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

describe('DataManager background overlay settings', () => {
  it('exports overlay numbers and bgTint as a string', async () => {
    localStorage.setItem('bgOverlayOpacity', '40');
    localStorage.setItem('bgOverlayBlur', '6');
    localStorage.setItem('bgTint', '#aabbcc');
    localStorage.setItem('bgTintStrength', '25');

    const exported = await exportDataForTest();

    expect(exported.data.bgOverlayOpacity).toBe(40);
    expect(exported.data.bgOverlayBlur).toBe(6);
    expect(exported.data.bgTintStrength).toBe(25);
    expect(exported.data.bgTint).toBe('#aabbcc');
    expect(typeof exported.data.bgOverlayOpacity).toBe('number');
    expect(typeof exported.data.bgOverlayBlur).toBe('number');
    expect(typeof exported.data.bgTintStrength).toBe('number');
    expect(typeof exported.data.bgTint).toBe('string');
  });

  it('keeps a container-looking bgTint as a string on export', async () => {
    localStorage.setItem('bgTint', '["#112233"]');

    const exported = await exportDataForTest();

    expect(exported.data.bgTint).toBe('["#112233"]');
    expect(window.DataManager.validateImportData(exported).valid).toBe(false);
  });

  it('accepts a valid overlay backup and an older backup without overlay keys', () => {
    expect(window.DataManager.validateImportData({
      version: 1,
      data: {
        bgOverlayOpacity: 40,
        bgOverlayBlur: 12,
        bgTint: '#AABBCC',
        bgTintStrength: 0,
      }
    })).toEqual({ valid: true });

    expect(window.DataManager.validateImportData({
      version: 1,
      data: { theme: 'dark', homepageBg: 'Beach', videoAutoplay: true }
    })).toEqual({ valid: true });
  });

  it('rejects out-of-range overlay values and a non-string tint', () => {
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgOverlayOpacity: 81 }
    }).valid).toBe(false);
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgOverlayOpacity: -1 }
    }).valid).toBe(false);
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgOverlayBlur: 13 }
    }).valid).toBe(false);
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgTintStrength: 51 }
    }).valid).toBe(false);
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgOverlayOpacity: '40' }
    }).valid).toBe(false);
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgTint: 112233 }
    }).valid).toBe(false);
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { bgTint: '#fff' }
    }).valid).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.bgTint('#112233')).toBe(true);
    expect(typeof window.DataManager.EXPECTED_SHAPES.bgTint('#112233')).toBe('boolean');
  });
});

describe('DataManager pomodoroStats date keys (issue #764)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  function useTimeZone(zone) {
    process.env.TZ = zone;
  }

  function restoreTimeZone() {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  }

  afterEach(() => {
    restoreTimeZone();
  });

  // Positive UTC offsets report a negative getTimezoneOffset(). Assert the
  // exact offset so a no-op TZ assignment (still UTC) fails the test.
  function expectOffset(zone, instant, expectedOffset) {
    useTimeZone(zone);
    expect(new Date(instant).getTimezoneOffset(), zone).toBe(expectedOffset);
    expect(expectedOffset).toBeLessThan(0);
  }

  function expectValidPomodoroDate(key) {
    expect(window.DataManager.validateImportData({ version: 1, data: {
      pomodoroStats: {
        days: { [key]: { sessions: 1, minutes: 25 } },
        byDateTodos: { [key]: { 'todo-1': 25 } }
      }
    } }).valid, key).toBe(true);
  }

  it('accepts calendar dates in Australia/Melbourne, including its UTC+11 season', () => {
    expectOffset('Australia/Melbourne', '2026-09-22T00:00:00Z', -600);
    // September is AEST (UTC+10). The old local-midnight toISOString()
    // round-trip still moves this key to the previous UTC day.
    expect(new Date('2026-09-22T00:00:00').toISOString().slice(0, 10)).not.toBe('2026-09-22');
    expectValidPomodoroDate('2026-09-22');
    expectValidPomodoroDate('2026-12-31');
    expectValidPomodoroDate('2026-01-01');

    expectOffset('Australia/Melbourne', '2026-01-15T00:00:00Z', -660);
    expect(new Date('2026-01-15T00:00:00').toISOString().slice(0, 10)).not.toBe('2026-01-15');
    expectValidPomodoroDate('2026-01-15');
  });

  it('accepts calendar dates in a fixed UTC+11 zone and a fixed UTC+14 zone', () => {
    expectOffset('Pacific/Guadalcanal', '2026-09-22T00:00:00Z', -660);
    expect(new Date('2026-09-22T00:00:00').toISOString().slice(0, 10)).not.toBe('2026-09-22');
    expectValidPomodoroDate('2026-09-22');
    expectValidPomodoroDate('2024-02-29');
    expectValidPomodoroDate('2000-02-29');

    expectOffset('Pacific/Kiritimati', '2026-09-22T00:00:00Z', -840);
    expect(new Date('2026-09-22T00:00:00').toISOString().slice(0, 10)).not.toBe('2026-09-22');
    expectValidPomodoroDate('2026-09-22');
    expectValidPomodoroDate('0000-02-29');
    expectValidPomodoroDate('0001-01-01');
    expectValidPomodoroDate('0099-12-31');
  });

  it('accepts the civil day Pacific/Apia skipped when it moved to UTC+14', () => {
    useTimeZone('Pacific/Apia');
    expect(new Date().getTimezoneOffset()).toBeLessThan(0);
    const skipped = new Date(2011, 11, 30);
    expect(skipped.getFullYear()).toBe(2011);
    expect(skipped.getMonth()).toBe(11);
    expect(skipped.getDate()).toBe(31);
    expectValidPomodoroDate('2011-12-30');
  });

  it('still rejects impossible and malformed date keys in UTC+14', () => {
    expectOffset('Pacific/Kiritimati', '2026-09-22T00:00:00Z', -840);
    const badKeys = [
      '2026-02-30', '2026-02-29', '2023-02-29', '1900-02-29', '0000-02-30',
      '2026-00-10', '2026-13-01', '2026-9-2', '2026-09-2', ''
    ];
    badKeys.forEach((key) => {
      expect(window.DataManager.validateImportData({ version: 1, data: {
        pomodoroStats: { days: { [key]: { sessions: 1, minutes: 25 } } }
      } }).valid, `days key ${key}`).toBe(false);
      expect(window.DataManager.validateImportData({ version: 1, data: {
        pomodoroStats: { days: {}, byDateTodos: { [key]: { 'todo-1': 25 } } }
      } }).valid, `byDateTodos key ${key}`).toBe(false);
    });
  });

  it('rejects invalid day entry values regardless of key validity', () => {
    expectOffset('Pacific/Guadalcanal', '2026-09-22T00:00:00Z', -660);
    expect(window.DataManager.EXPECTED_SHAPES.pomodoroStats({
      days: { '2026-09-22': -1 }
    })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.pomodoroStats({
      days: { '2026-09-22': { sessions: -1, minutes: 25 } }
    })).toBe(false);
  });
});
