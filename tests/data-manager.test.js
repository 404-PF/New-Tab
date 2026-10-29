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
  injectScript('src/core/toast.js');
  injectScript('src/features/timezone-clocks.js');
  injectScript('src/ai/conversation-validator.js');
  injectScript('src/features/data-manager.js');
  injectScript('src/features/simple-mode.js');
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

describe('DataManager backup validation', () => {

  it('accepts supported settings and rejects disallowed or malformed data', () => {
    expect(window.DataManager.validateImportData({ version: 1, data: {
      theme: 'dark', todos: [{ id: 'todo-1' }], customApps: [{ id: 'app-1' }]
    } })).toEqual({ valid: true });
    // A stored 'system' theme is a first-class value after issue #1011.
    expect(window.DataManager.validateImportData({ version: 1, data: {
      theme: 'system'
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
    expect(window.DataManager.EXPORT_KEYS).toContain('hiddenDefaultApps');
    expect(window.DataManager.EXPORT_KEYS).toContain('ai_conversations');
    expect(window.DataManager.EXPORT_KEYS).not.toContain('searchHistory');
    expect(window.DataManager.EXPECTED_SHAPES.hiddenDefaultApps(['weather-app'])).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.hiddenDefaultApps([{ id: 'weather-app' }])).toBe(false);
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
    expect(window.DataManager.EXPORT_KEYS).toContain('games_keymap');
    expect(window.DataManager.EXPORT_KEYS).toContain('games_fps_enabled');
    expect(window.DataManager.EXPORT_KEYS).toContain('games_saves');
    expect(window.DataManager.EXPORT_KEYS).toContain('games_stats');
    expect(window.DataManager.EXPORT_KEYS).toContain('games_recently_played');
    expect(window.DataManager.EXPORT_KEYS).toContain('searchHistoryEnabled');
  });

  it('validates the shape of the new keys', () => {
    expect(window.DataManager.validateImportData({ version: 1, data: {
      eyeCareReminder: EYE_CARE_SETTINGS, games_enabled: false, games_keymap: 'ijkl', games_fps_enabled: true, searchHistoryEnabled: true
    } })).toEqual({ valid: true });
    // Objects carrying legacy/runtime fields stay importable; applyData
    // strips them at write time.
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder(EYE_CARE_STORED_STATE)).toBe(true);

    expect(window.DataManager.EXPECTED_SHAPES.games_enabled(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_keymap('wasd')).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_fps_enabled(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.searchHistoryEnabled(false)).toBe(true);

    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder(null)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder([1])).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ enabled: false })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ ...EYE_CARE_SETTINGS, enabled: 'yes' })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ ...EYE_CARE_SETTINGS, intervalMinutes: 25 })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.eyeCareReminder({ ...EYE_CARE_SETTINGS, browserNotification: 1 })).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_enabled('true')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_fps_enabled('true')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_fps_enabled(null)).toBe(false);
    // The games helpers normalize an unknown keymap id at read time, so any
    // string stays importable — only non-strings are rejected.
    expect(window.DataManager.EXPECTED_SHAPES.games_keymap(true)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_keymap(null)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.searchHistoryEnabled('false')).toBe(false);

    expect(window.DataManager.validateImportData({ version: 1, data: {
      eyeCareReminder: { ...EYE_CARE_SETTINGS, intervalMinutes: 25 }
    } }).valid).toBe(false);
  });

  it('round-trips game saves, stats, and the MRU list through export and import (issue #1068)', async () => {
    // A snapshot Snake's validateSavedState accepts (mirrors the fixture in
    // tests/games/snake.test.js), so the round trip is verified against
    // playable progress rather than storage shape only.
    const saves = {
      snake: {
        state: {
          snake: [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 }
          ],
          food: { x: 5, y: 5 },
          direction: 'right',
          nextDirection: 'up',
          score: 40
        },
        savedAt: 1700000000000
      }
    };
    const stats = { snake: { highScore: 100, gamesPlayed: 3 }, '2048': { highScore: 4096, gamesPlayed: 7 } };
    const recentlyPlayed = ['snake', '2048'];
    localStorage.setItem('games_saves', JSON.stringify(saves));
    localStorage.setItem('games_stats', JSON.stringify(stats));
    localStorage.setItem('games_recently_played', JSON.stringify(recentlyPlayed));

    const exported = await exportDataForTest();

    expect(exported.data.games_saves).toEqual(saves);
    expect(exported.data.games_stats).toEqual(stats);
    expect(exported.data.games_recently_played).toEqual(recentlyPlayed);
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });

    // Restore into a profile with no game data at all.
    localStorage.removeItem('games_saves');
    localStorage.removeItem('games_stats');
    localStorage.removeItem('games_recently_played');

    const result = await importBackup(exported.data, 'replace');

    expect(result.type).toBe('success');
    expect(JSON.parse(localStorage.getItem('games_saves'))).toEqual(saves);
    expect(JSON.parse(localStorage.getItem('games_stats'))).toEqual(stats);
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(recentlyPlayed);
  });

  it('merges the MRU list with recency order and the 20-entry cap (issue #1068)', async () => {
    // Imported ordering wins; local-only ids follow, deduped.
    localStorage.setItem('games_recently_played', JSON.stringify(['local-1', 'local-2']));
    await importBackup({ games_recently_played: ['imported-1', 'local-2', 'imported-2'] }, 'merge');
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(
      ['imported-1', 'local-2', 'imported-2', 'local-1']
    );

    // The combined list never exceeds the registry's 20-entry cap.
    const importedFull = Array.from({ length: 20 }, (_, i) => 'imported-' + i);
    localStorage.setItem('games_recently_played', JSON.stringify(['local-only-1', 'local-only-2']));
    await importBackup({ games_recently_played: importedFull }, 'merge');
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(importedFull);

    // Malformed local entries are dropped so the merged list stays
    // exportable (the MRU validator requires strings).
    localStorage.setItem('games_recently_played', JSON.stringify(['local-1', 42, null]));
    await importBackup({ games_recently_played: ['imported-1'] }, 'merge');
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(['imported-1', 'local-1']);
  });

  it('merges per-game stats keeping the higher score, and replaces shared saves (issue #1068)', async () => {
    localStorage.setItem('games_stats', JSON.stringify({
      snake: { highScore: 500, gamesPlayed: 10 },
      '2048': { highScore: 4096, gamesPlayed: 7 },
      memory: { bestMoves: 12, bestTime: 30000, gamesPlayed: 4 },
      pacman: { highScore: 900, gamesPlayed: 2 }
    }));
    localStorage.setItem('games_saves', JSON.stringify({
      snake: { state: { score: 10 }, savedAt: 1700000000000 },
      pacman: { state: { score: 1200 }, savedAt: 1700000000500 }
    }));

    await importBackup({
      games_stats: {
        snake: { highScore: 100, gamesPlayed: 15 },
        tetris: { highScore: 300, gamesPlayed: 2 },
        memory: { bestMoves: 20, bestTime: 25000, gamesPlayed: 1 },
        pacman: 'bogus'
      },
      games_saves: {
        snake: { state: { score: 40 }, savedAt: 1700000001000 },
        tetris: { state: { score: 5 }, savedAt: 1700000002000 }
      }
    }, 'merge');

    // A backup with a lower best score cannot drop a local high score;
    // gamesPlayed takes the larger count. Local-only ids are untouched.
    // Memory's bestMoves/bestTime keep the lower value per field, and a
    // malformed imported entry cannot erase valid local stats.
    expect(JSON.parse(localStorage.getItem('games_stats'))).toEqual({
      snake: { highScore: 500, gamesPlayed: 15 },
      '2048': { highScore: 4096, gamesPlayed: 7 },
      memory: { bestMoves: 12, bestTime: 25000, gamesPlayed: 4 },
      pacman: { highScore: 900, gamesPlayed: 2 },
      tetris: { highScore: 300, gamesPlayed: 2 }
    });
    // Saves have no cumulative fields: the imported snapshot replaces the
    // local entry for a shared id, and local-only ids survive the merge.
    expect(JSON.parse(localStorage.getItem('games_saves'))).toEqual({
      snake: { state: { score: 40 }, savedAt: 1700000001000 },
      pacman: { state: { score: 1200 }, savedAt: 1700000000500 },
      tetris: { state: { score: 5 }, savedAt: 1700000002000 }
    });
  });

  it('validates the shape of the game data keys (issue #1068)', () => {
    expect(window.DataManager.EXPECTED_SHAPES.games_saves({ snake: { state: { score: 42 }, savedAt: 1700000000000 } })).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_saves({})).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_stats({ snake: { highScore: 100, gamesPlayed: 3 } })).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played(['snake', '2048'])).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played([])).toBe(true);
    // The registry caps MRU at 20 entries; that cap holds on import too.
    const twentyIds = Array.from({ length: 20 }, (_, i) => 'game-' + i);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played(twentyIds)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played(twentyIds.concat('one-too-many'))).toBe(false);

    expect(window.DataManager.EXPECTED_SHAPES.games_saves(null)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_saves([])).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_saves('snake')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_stats(null)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_stats([])).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_stats('snake')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played({})).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played('snake')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.games_recently_played([1, 2])).toBe(false);

    expect(window.DataManager.validateImportData({ version: 1, data: {
      games_saves: { snake: { state: { score: 42 }, savedAt: 1700000000000 } },
      games_stats: { snake: { highScore: 100, gamesPlayed: 3 } },
      games_recently_played: ['snake']
    } })).toEqual({ valid: true });
    expect(window.DataManager.validateImportData({ version: 1, data: {
      games_saves: []
    } }).valid).toBe(false);
    expect(window.DataManager.validateImportData({ version: 1, data: {
      games_recently_played: { 0: 'snake' }
    } }).valid).toBe(false);
  });

  it('shallow-merges eye-care settings without touching runtime fields', async () => {
    const existingState = {
      ...EYE_CARE_STORED_STATE,
      intervalMinutes: 20,
      browserNotification: false
    };
    localStorage.setItem('eyeCareReminder', JSON.stringify(existingState));
    localStorage.setItem('games_enabled', 'true');
    localStorage.setItem('games_keymap', 'wasd');
    localStorage.setItem('searchHistoryEnabled', 'true');

    await importBackup({
      games_enabled: false,
      games_keymap: 'ijkl',
      searchHistoryEnabled: false,
      // Full validated shape, but differing from the stored entry: if the
      // generic object branch ever degraded from Object.assign merge to a
      // plain overwrite, the runtime bookkeeping below would be lost.
      eyeCareReminder: EYE_CARE_SETTINGS
    }, 'merge');

    expect(localStorage.getItem('games_enabled')).toBe(JSON.stringify(false));
    // String settings are stored raw, not JSON-encoded.
    expect(localStorage.getItem('games_keymap')).toBe('ijkl');
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
    localStorage.setItem('games_keymap', 'numpad');
    localStorage.setItem('searchHistoryEnabled', 'false');
    localStorage.setItem('eyeCareReminder', JSON.stringify(EYE_CARE_STORED_STATE));
    localStorage.setItem('theme', 'light');

    await importBackup({ theme: 'dark' }, 'replace');

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('games_enabled')).toBeNull();
    expect(localStorage.getItem('games_keymap')).toBeNull();
    expect(localStorage.getItem('searchHistoryEnabled')).toBeNull();
    expect(localStorage.getItem('eyeCareReminder')).toBeNull();
  });

  it('round-trips theme: system through a replace import without validation errors (issue #1011)', async () => {
    localStorage.setItem('theme', 'light');

    const result = await importBackup({ theme: 'system' }, 'replace');

    expect(result.type).toBe('success');
    expect(localStorage.getItem('theme')).toBe('system');
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

  it('warns again when a write fails after the import timed out and reported', async () => {
    const area = chrome.storage.local;
    const originalSet = area.set;
    area.set = (items, callback) => {
      if (!Object.prototype.hasOwnProperty.call(items, 'theme')) return originalSet.call(area, items, callback);
      setTimeout(() => {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        try {
          callback();
        } finally {
          chrome.runtime.lastError = null;
        }
      }, 100);
      return undefined;
    };
    window.DataManager.importWriteTimeoutMs = 20;
    const warnSpy = vi.spyOn(console, 'warn');
    try {
      const result = await importBackup({ theme: 'dark' }, 'replace');
      expect(result.type).toBe('warning');

      const lateToast = await vi.waitFor(() => {
        expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('failed after the import had already reported'))).toBe(true);
        const el = document.querySelector('.toast-notification.toast-warning');
        expect(el?.textContent).toBe('Some imported data failed to save after the import finished.');
        return el;
      });
      expect(lateToast.textContent).toBe('Some imported data failed to save after the import finished.');
    } finally {
      area.set = originalSet;
      delete window.DataManager.importWriteTimeoutMs;
      warnSpy.mockRestore();
      document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
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
    localStorage.setItem('games_keymap', 'ijkl');
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
      expect(exported.data.games_keymap).toBe('ijkl');
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

describe('DataManager focus-mode and auto-theme settings (issue #838)', () => {
  it('includes focus mode and auto-theme keys in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('focusMode');
    expect(window.DataManager.EXPORT_KEYS).toContain('autoTheme');
    expect(window.DataManager.EXPORT_KEYS).toContain('autoThemeLightTime');
    expect(window.DataManager.EXPORT_KEYS).toContain('autoThemeDarkTime');
  });

  it('validates the shape of the new keys', () => {
    expect(window.DataManager.validateImportData({ version: 1, data: {
      focusMode: true, autoTheme: false, autoThemeLightTime: '07:00', autoThemeDarkTime: '19:30'
    } })).toEqual({ valid: true });

    expect(window.DataManager.EXPECTED_SHAPES.focusMode(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.autoTheme(false)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeLightTime('08:15')).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeDarkTime('23:59')).toBe(true);

    expect(window.DataManager.EXPECTED_SHAPES.focusMode('true')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.autoTheme('false')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeLightTime('')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeLightTime('noon')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeLightTime('24:00')).toBe(false);
    // type="time" inputs require a two-digit hour; 7:00 would be cleared.
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeLightTime('7:00')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeDarkTime('9:30')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.autoThemeDarkTime('19:60')).toBe(false);

    expect(window.DataManager.validateImportData({ version: 1, data: {
      focusMode: 'true'
    } }).valid).toBe(false);
    expect(window.DataManager.validateImportData({ version: 1, data: {
      autoThemeLightTime: 'noon'
    } }).valid).toBe(false);
  });

  it('exports focus-mode and auto-theme settings as booleans and time strings', async () => {
    localStorage.setItem('focusMode', 'true');
    localStorage.setItem('autoTheme', 'false');
    localStorage.setItem('autoThemeLightTime', '08:15');
    localStorage.setItem('autoThemeDarkTime', '21:45');

    const exported = await exportDataForTest();

    expect(exported.data.focusMode).toBe(true);
    expect(exported.data.autoTheme).toBe(false);
    expect(exported.data.autoThemeLightTime).toBe('08:15');
    expect(exported.data.autoThemeDarkTime).toBe('21:45');
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
  });

  it('omits auto-theme time keys whose stored value is empty', async () => {
    localStorage.setItem('autoThemeLightTime', '');
    localStorage.setItem('autoThemeDarkTime', '');

    const exported = await exportDataForTest();

    expect(exported.data.autoThemeLightTime).toBeUndefined();
    expect(exported.data.autoThemeDarkTime).toBeUndefined();
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
  });

  it('imports the new keys into storage in merge mode', async () => {
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '06:00');

    const result = await importBackup({
      focusMode: true,
      autoTheme: false,
      autoThemeLightTime: '09:00',
      autoThemeDarkTime: '20:00'
    }, 'merge');

    expect(result.type).toBe('success');
    expect(localStorage.getItem('focusMode')).toBe('true');
    expect(localStorage.getItem('autoTheme')).toBe('false');
    expect(localStorage.getItem('autoThemeLightTime')).toBe('09:00');
    expect(localStorage.getItem('autoThemeDarkTime')).toBe('20:00');
  });

  it('clears the keys in replace mode when the backup omits them', async () => {
    localStorage.setItem('focusMode', 'true');
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '06:00');
    localStorage.setItem('autoThemeDarkTime', '22:00');

    await importBackup({ theme: 'dark' }, 'replace');

    expect(localStorage.getItem('focusMode')).toBeNull();
    expect(localStorage.getItem('autoTheme')).toBeNull();
    expect(localStorage.getItem('autoThemeLightTime')).toBeNull();
    expect(localStorage.getItem('autoThemeDarkTime')).toBeNull();
  });

  it('invokes the live-apply hooks for focus mode and auto-theme after import', async () => {
    const originalApplyFocusMode = window.applyFocusMode;
    const originalRefreshAutoTheme = window.refreshAutoTheme;
    const applyFocusMode = vi.fn();
    const refreshAutoTheme = vi.fn();
    window.applyFocusMode = applyFocusMode;
    window.refreshAutoTheme = refreshAutoTheme;
    try {
      const result = await importBackup({ focusMode: true, autoTheme: false }, 'merge');

      expect(result.type).toBe('success');
      expect(applyFocusMode).toHaveBeenCalledTimes(1);
      expect(refreshAutoTheme).toHaveBeenCalledTimes(1);
    } finally {
      if (originalApplyFocusMode === undefined) delete window.applyFocusMode;
      else window.applyFocusMode = originalApplyFocusMode;
      if (originalRefreshAutoTheme === undefined) delete window.refreshAutoTheme;
      else window.refreshAutoTheme = originalRefreshAutoTheme;
    }
  });
});

describe('DataManager custom background media backups (issue #996)', () => {
  const mediaEntry = {
    id: 'custom_image_1',
    title: 'Sunset photo',
    type: 'image',
    timestamp: 1700000000000,
    thumb: 'data:image/jpeg;base64,dGh1bWI=',
    media: 'data:image/jpeg;base64,aGVsbG8='
  };

  function stubCustomBackgrounds(api) {
    const descriptor = Object.getOwnPropertyDescriptor(window, '_customBackgrounds');
    window._customBackgrounds = api;
    return function restore() {
      if (descriptor) {
        Object.defineProperty(window, '_customBackgrounds', descriptor);
      } else {
        delete window._customBackgrounds;
      }
    };
  }

  function readBlobText(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
  }

  it('embeds base64 media and thumbnails for every custom background on export', async () => {
    const restoreStub = stubCustomBackgrounds({
      getAll: vi.fn().mockResolvedValue([{
        id: 'custom_image_1',
        title: 'Sunset photo',
        type: 'image',
        timestamp: 1700000000000,
        thumb: 'data:image/jpeg;base64,dGh1bWI=',
        data: new Blob(['hello'], { type: 'image/jpeg' })
      }])
    });

    try {
      const exported = await exportDataForTest();

      expect(exported.data._customBackgroundsMetadata).toEqual([mediaEntry]);
      expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
    } finally {
      restoreStub();
    }
  });

  it('skips oversized media with a warning instead of failing the export', async () => {
    const restoreStub = stubCustomBackgrounds({
      getAll: vi.fn().mockResolvedValue([{
        id: 'custom_image_1',
        title: 'Sunset photo',
        type: 'image',
        timestamp: 1700000000000,
        thumb: 'data:image/jpeg;base64,dGh1bWI=',
        data: new Blob(['hello'], { type: 'image/jpeg' })
      }])
    });
    const showToastSpy = vi.spyOn(window, 'showToast');
    window.DataManager.maxMediaBytesPerRecord = 2;

    try {
      const exported = await exportDataForTest();

      // The record survives without its media, so the backup stays importable.
      expect(exported.data._customBackgroundsMetadata).toEqual([{
        id: 'custom_image_1',
        title: 'Sunset photo',
        type: 'image',
        timestamp: 1700000000000,
        thumb: 'data:image/jpeg;base64,dGh1bWI='
      }]);
      expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });
      expect(showToastSpy).toHaveBeenCalledWith(
        'Backup created, but some custom background media could not be included.',
        'warning'
      );
    } finally {
      delete window.DataManager.maxMediaBytesPerRecord;
      showToastSpy.mockRestore();
      restoreStub();
    }
  });

  it('validates the shape and size of the metadata record', () => {
    const validate = (metadata) => window.DataManager.validateImportData({
      version: 1,
      data: { _customBackgroundsMetadata: metadata }
    });

    expect(validate([mediaEntry])).toEqual({ valid: true });
    // Legacy v1 backups carry metadata without media and keep importing.
    expect(validate([{ id: 'custom_image_1', title: 'Sunset photo', type: 'image', timestamp: 1 }]))
      .toEqual({ valid: true });

    expect(validate('nope')).toEqual({
      valid: false,
      error: 'The backup contains invalid custom background data.'
    });
    expect(validate([null]).valid).toBe(false);
    expect(validate([{ ...mediaEntry, id: '' }]).valid).toBe(false);
    expect(validate([{ ...mediaEntry, id: 42 }]).valid).toBe(false);
    expect(validate([{ ...mediaEntry, type: 42 }])).toEqual({
      valid: false,
      error: 'The backup contains invalid custom background data.'
    });
    expect(validate([{ ...mediaEntry, media: 'not-a-data-url' }])).toEqual({
      valid: false,
      error: 'A custom background in this backup has invalid media data.'
    });
    expect(validate([{ ...mediaEntry, media: 'data:image/jpeg;base64,@@@' }]).valid).toBe(false);
    // Payloads the pattern accepts but atob rejects (bad length or misplaced
    // padding) must fail validation instead of throwing during the restore.
    expect(validate([{ ...mediaEntry, media: 'data:image/jpeg;base64,abcde' }])).toEqual({
      valid: false,
      error: 'A custom background in this backup has invalid media data.'
    });
    expect(validate([{ ...mediaEntry, media: 'data:image/jpeg;base64,abcd==' }]).valid).toBe(false);
    // Only `custom_` ids are recognized as custom backgrounds; anything else
    // would be stored but never applied.
    expect(validate([{ ...mediaEntry, id: 'background_1' }])).toEqual({
      valid: false,
      error: 'The backup contains invalid custom background data.'
    });

    window.DataManager.maxMediaBytesPerRecord = 2;
    try {
      expect(validate([mediaEntry])).toEqual({
        valid: false,
        error: 'A custom background in this backup exceeds the size limit.'
      });
    } finally {
      delete window.DataManager.maxMediaBytesPerRecord;
    }
  });

  it('restores background blobs into IndexedDB before applying the settings keys', async () => {
    localStorage.setItem('homepageBg', 'Water Beside Forest');
    const saved = [];
    const save = vi.fn().mockImplementation((bg) => {
      saved.push({ bg, homepageBgDuringSave: localStorage.getItem('homepageBg') });
      return Promise.resolve();
    });
    const render = vi.fn();
    const applyBg = vi.fn();
    const restoreStub = stubCustomBackgrounds({
      save,
      render,
      getAll: vi.fn().mockResolvedValue([])
    });
    const originalApplyBg = window.applyBg;
    window.applyBg = applyBg;

    try {
      const result = await importBackup({
        homepageBg: 'custom_image_1',
        _customBackgroundsMetadata: [mediaEntry]
      }, 'replace');

      expect(result.type).toBe('success');
      expect(save).toHaveBeenCalledTimes(1);
      // Media must be written while homepageBg still holds the old value:
      // the settings keys are applied only after every blob is stored.
      expect(saved[0].homepageBgDuringSave).toBe('Water Beside Forest');
      expect(saved[0].bg.id).toBe('custom_image_1');
      expect(saved[0].bg.title).toBe('Sunset photo');
      expect(saved[0].bg.type).toBe('image');
      expect(saved[0].bg.thumb).toBe('data:image/jpeg;base64,dGh1bWI=');
      expect(saved[0].bg.data).toBeInstanceOf(Blob);
      expect(saved[0].bg.data.type).toBe('image/jpeg');
      expect(await readBlobText(saved[0].bg.data)).toBe('hello');

      expect(localStorage.getItem('homepageBg')).toBe('custom_image_1');
      // The `_`-prefixed record itself never reaches localStorage.
      expect(localStorage.getItem('_customBackgroundsMetadata')).toBeNull();
      // The background list and the active background refresh after import.
      expect(render).toHaveBeenCalledTimes(1);
      expect(applyBg).toHaveBeenCalledTimes(1);
    } finally {
      if (originalApplyBg === undefined) delete window.applyBg;
      else window.applyBg = originalApplyBg;
      restoreStub();
    }
  });

  it('imports legacy backups without media and never restores empty records', async () => {
    const save = vi.fn();
    const restoreStub = stubCustomBackgrounds({
      save,
      getAll: vi.fn().mockResolvedValue([])
    });

    try {
      const result = await importBackup({
        homepageBg: 'custom_image_1',
        _customBackgroundsMetadata: [{
          id: 'custom_image_1',
          title: 'Sunset photo',
          type: 'image',
          timestamp: 1700000000000
        }]
      }, 'merge');

      expect(result.type).toBe('success');
      expect(save).not.toHaveBeenCalled();
      expect(localStorage.getItem('homepageBg')).toBe('custom_image_1');
      expect(localStorage.getItem('_customBackgroundsMetadata')).toBeNull();
    } finally {
      restoreStub();
    }
  });

  it('reports a partial import when restoring background media fails', async () => {
    localStorage.setItem('homepageBg', 'Water Beside Forest');
    const restoreStub = stubCustomBackgrounds({
      save: vi.fn().mockRejectedValue(new Error('IndexedDB unavailable')),
      getAll: vi.fn().mockResolvedValue([])
    });

    try {
      const result = await importBackup({
        homepageBg: 'custom_image_1',
        _customBackgroundsMetadata: [mediaEntry]
      }, 'merge');

      expect(result.type).toBe('warning');
      // The imported custom homepageBg is skipped while its media is missing,
      // so the current background keeps pointing at real media.
      expect(localStorage.getItem('homepageBg')).toBe('Water Beside Forest');
    } finally {
      restoreStub();
    }
  });

  it('reports a partial import when no IndexedDB write API is available', async () => {
    const restoreStub = stubCustomBackgrounds({
      getAll: vi.fn().mockResolvedValue([])
    });

    try {
      const result = await importBackup({
        homepageBg: 'custom_image_1',
        _customBackgroundsMetadata: [mediaEntry]
      }, 'merge');

      expect(result.type).toBe('warning');
    } finally {
      restoreStub();
    }
  });
});

describe('DataManager import refresh (issue #824)', () => {
  function withSpiedRefreshHooks(names) {
    const spies = {};
    const originals = {};
    names.forEach((name) => {
      originals[name] = window[name];
      spies[name] = vi.fn();
      window[name] = spies[name];
    });
    return {
      spies,
      restore() {
        names.forEach((name) => {
          if (originals[name] === undefined) delete window[name];
          else window[name] = originals[name];
        });
      }
    };
  }

  it('reloads todos, notes, and the app grid after import, before reminder scheduling', async () => {
    const hooks = withSpiedRefreshHooks([
      'reloadTodosState',
      'initNotes',
      'renderAllApps',
      'applySimpleMode',
      'scheduleTodoReminderCheck'
    ]);
    try {
      const importedTodos = [
        { id: 'todo-imported', text: 'Imported todo', completed: false, createdAt: '2026-01-01T00:00:00.000Z' }
      ];
      const result = await importBackup({
        todos: importedTodos,
        notes: [{ id: 'note-1', text: 'Imported note', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
        customApps: [{ id: 'app-1', name: 'Imported', url: 'https://example.com' }]
      }, 'merge');

      expect(result.type).toBe('success');
      // The backup really reached storage.
      expect(JSON.parse(localStorage.getItem('todos'))).toEqual(importedTodos);

      // Post-import refresh hooks all ran exactly once.
      expect(hooks.spies.reloadTodosState).toHaveBeenCalledTimes(1);
      expect(hooks.spies.initNotes).toHaveBeenCalledTimes(1);
      expect(hooks.spies.renderAllApps).toHaveBeenCalledTimes(1);
      expect(hooks.spies.applySimpleMode).toHaveBeenCalledTimes(1);
      expect(hooks.spies.scheduleTodoReminderCheck).toHaveBeenCalledTimes(1);

      // Todo state must be reloaded before the reminder payload is built,
      // otherwise the service worker receives the stale pre-import array.
      expect(hooks.spies.reloadTodosState.mock.invocationCallOrder[0])
        .toBeLessThan(hooks.spies.scheduleTodoReminderCheck.mock.invocationCallOrder[0]);
    } finally {
      hooks.restore();
    }
  });

  it('cancels pending note saves before writing the backup', async () => {
    const hooks = withSpiedRefreshHooks(['cancelPendingNoteSaves', 'reloadTodosState']);
    try {
      const result = await importBackup({ theme: 'dark' }, 'replace');

      expect(result.type).toBe('success');
      expect(hooks.spies.cancelPendingNoteSaves).toHaveBeenCalledTimes(1);
      // applyData cancels pending saves before its writes; finishImport runs
      // after them, so the cancel must be ordered first.
      expect(hooks.spies.cancelPendingNoteSaves.mock.invocationCallOrder[0])
        .toBeLessThan(hooks.spies.reloadTodosState.mock.invocationCallOrder[0]);
    } finally {
      hooks.restore();
    }
  });

  it('applies the imported simpleMode flag to the live UI without a reload (issue #837)', async () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'simple-mode-checkbox';
    document.body.appendChild(checkbox);
    try {
      // Start from simple mode off.
      localStorage.setItem('simpleMode', 'false');
      window.applySimpleMode();
      expect(document.body.classList.contains('simple-mode')).toBe(false);
      expect(checkbox.checked).toBe(false);

      const enable = await importBackup({ simpleMode: true }, 'replace');
      expect(enable.type).toBe('success');
      expect(localStorage.getItem('simpleMode')).toBe('true');
      // The body class and header checkbox reflect the import immediately.
      expect(document.body.classList.contains('simple-mode')).toBe(true);
      expect(checkbox.checked).toBe(true);

      document.body.setAttribute('data-focus-mode', 'true');
      const focusEnable = await importBackup({ simpleMode: true }, 'replace');
      expect(focusEnable.type).toBe('success');
      expect(document.body.classList.contains('simple-mode')).toBe(false);
      expect(checkbox.checked).toBe(true);

      // Reverse direction: importing simpleMode false turns the UI back off.
      const disable = await importBackup({ simpleMode: false }, 'replace');
      expect(disable.type).toBe('success');
      expect(localStorage.getItem('simpleMode')).toBe('false');
      expect(document.body.classList.contains('simple-mode')).toBe(false);
      expect(checkbox.checked).toBe(false);
    } finally {
      checkbox.remove();
      document.body.classList.remove('simple-mode');
      document.body.removeAttribute('data-focus-mode');
      localStorage.removeItem('simpleMode');
    }
  });
});

describe('DataManager AI grounding preference (issue #1003)', () => {
  beforeAll(() => {
    injectScript('src/ai/openrouter.js');
    injectScript('src/ai/ai-renderer.js');
  });

  it('includes aiGroundWithWeb in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('aiGroundWithWeb');
  });

  it('validates aiGroundWithWeb as a boolean', () => {
    expect(window.DataManager.EXPECTED_SHAPES.aiGroundWithWeb(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.aiGroundWithWeb(false)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.aiGroundWithWeb('true')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.aiGroundWithWeb(1)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.aiGroundWithWeb(null)).toBe(false);

    expect(window.DataManager.validateImportData({ version: 1, data: {
      aiGroundWithWeb: false
    } })).toEqual({ valid: true });

    const stringBackup = window.DataManager.validateImportData({ version: 1, data: {
      aiGroundWithWeb: 'false'
    } });
    expect(stringBackup.valid).toBe(false);
    expect(stringBackup.error).toContain('dataImportInvalidShape');

    expect(window.DataManager.validateImportData({ version: 1, data: {
      aiGroundWithWeb: 1
    } }).valid).toBe(false);
  });

  it('round-trips aiGroundWithWeb through export and import', async () => {
    localStorage.setItem('aiGroundWithWeb', 'true');

    const exported = await exportDataForTest();

    expect(exported.data.aiGroundWithWeb).toBe(true);
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });

    localStorage.removeItem('aiGroundWithWeb');
    const result = await importBackup(exported.data, 'replace');

    expect(result.type).toBe('success');
    expect(localStorage.getItem('aiGroundWithWeb')).toBe('true');
  });

  it('applies aiGroundWithWeb in merge mode', async () => {
    localStorage.setItem('aiGroundWithWeb', 'true');

    const result = await importBackup({ aiGroundWithWeb: false }, 'merge');

    expect(result.type).toBe('success');
    expect(localStorage.getItem('aiGroundWithWeb')).toBe('false');
  });

  it('clears aiGroundWithWeb in replace mode when the backup omits it', async () => {
    localStorage.setItem('aiGroundWithWeb', 'true');

    await importBackup({ theme: 'dark' }, 'replace');

    expect(localStorage.getItem('aiGroundWithWeb')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('re-syncs the visible grounding checkbox after a live import', async () => {
    expect(typeof window.refreshWebGroundingControl).toBe('function');

    const container = document.createElement('div');
    const input = document.createElement('textarea');
    input.id = 'ai-chat-input';
    container.appendChild(input);
    document.body.appendChild(container);

    try {
      localStorage.setItem('aiGroundWithWeb', 'true');
      window.AIRenderer.cacheElements();
      window.AIRenderer.updateWebGroundingControl(false);

      const checkbox = container.querySelector('.ai-grounding-toggle input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      expect(checkbox.checked).toBe(true);

      const result = await importBackup({ aiGroundWithWeb: false }, 'merge');

      expect(result.type).toBe('success');
      expect(localStorage.getItem('aiGroundWithWeb')).toBe('false');
      // The visible toggle flips without a tab reload.
      expect(checkbox.checked).toBe(false);
    } finally {
      container.remove();
      const rendererElements = window.AIRenderer.getElements();
      rendererElements.webGroundingControl = null;
      rendererElements.input = null;
    }
  });
});

describe('DataManager todo sort preference (issue #1056)', () => {
  it('includes todoSortOrder in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('todoSortOrder');
  });

  it('validates todoSortOrder as one of the known sort modes', () => {
    const shape = window.DataManager.EXPECTED_SHAPES.todoSortOrder;
    ['manual', 'due', 'priority', 'created', 'az'].forEach((value) => {
      expect(shape(value)).toBe(true);
    });
    expect(shape('bogus')).toBe(false);
    expect(shape('')).toBe(false);
    expect(shape(1)).toBe(false);
    expect(shape(null)).toBe(false);

    expect(window.DataManager.validateImportData({ version: 1, data: {
      todoSortOrder: 'priority'
    } })).toEqual({ valid: true });

    const bogusBackup = window.DataManager.validateImportData({ version: 1, data: {
      todoSortOrder: 'bogus'
    } });
    expect(bogusBackup.valid).toBe(false);
    expect(bogusBackup.error).toContain('dataImportInvalidShape');

    expect(window.DataManager.validateImportData({ version: 1, data: {
      todoSortOrder: 1
    } }).valid).toBe(false);
  });

  it('validates todoSortOrder against window.TODO_SORT_MODES when todo.js is loaded', () => {
    const original = window.TODO_SORT_MODES;
    window.TODO_SORT_MODES = ['manual', 'az'];
    try {
      const shape = window.DataManager.EXPECTED_SHAPES.todoSortOrder;
      expect(shape('manual')).toBe(true);
      expect(shape('az')).toBe(true);
      expect(shape('priority')).toBe(false);
    } finally {
      if (original === undefined) delete window.TODO_SORT_MODES;
      else window.TODO_SORT_MODES = original;
    }
  });

  it('round-trips todoSortOrder through export and import', async () => {
    localStorage.setItem('todoSortOrder', 'priority');

    const exported = await exportDataForTest();

    expect(exported.data.todoSortOrder).toBe('priority');
    expect(window.DataManager.validateImportData(exported)).toEqual({ valid: true });

    localStorage.removeItem('todoSortOrder');
    const result = await importBackup(exported.data, 'replace');

    expect(result.type).toBe('success');
    expect(localStorage.getItem('todoSortOrder')).toBe('priority');
  });

  it('applies todoSortOrder in merge mode', async () => {
    localStorage.setItem('todoSortOrder', 'due');

    const result = await importBackup({ todoSortOrder: 'az' }, 'merge');

    expect(result.type).toBe('success');
    expect(localStorage.getItem('todoSortOrder')).toBe('az');
  });

  it('clears todoSortOrder in replace mode when the backup omits it', async () => {
    localStorage.setItem('todoSortOrder', 'priority');

    await importBackup({ theme: 'dark' }, 'replace');

    expect(localStorage.getItem('todoSortOrder')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
