import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
});

beforeEach(() => {
  // Tear the registry down first: destroying the running game re-persists its
  // snapshot, so storage must be cleared afterwards.
  window.GameRegistry._reset && window.GameRegistry._reset();
  localStorage.clear();
  document.querySelectorAll('#games-game-container').forEach(el => el.remove());
});

// A minimal game that records how it was initialized and can report a
// serializable snapshot.
function registerSaveableGame(id, state) {
  let initArgs = null;
  window.GameRegistry.register({
    id: id,
    name: id,
    init: (container, savedState) => {
      initArgs = { container: container, savedState: savedState };
      if (state && state.onInit) state.onInit();
    },
    destroy: () => {
      if (state && state.onDestroy) state.onDestroy();
    },
    // Serialize-hook contract: an object persists; null/undefined reports
    // "nothing right now". Games clear their own save via clearSave().
    serialize: () => (state ? state.snapshot : undefined)
  });
  return {
    initArgs: () => initArgs,
    setSnapshot: (value) => { state.snapshot = value; }
  };
}

function ensureContainer() {
  let container = document.getElementById('games-game-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'games-game-container';
    document.body.appendChild(container);
  }
  return container;
}

describe('GameRegistry saves (#646)', () => {
  it('exposes the save API', () => {
    expect(typeof window.GameRegistry.hasSave).toBe('function');
    expect(typeof window.GameRegistry.getSave).toBe('function');
    expect(typeof window.GameRegistry.clearSave).toBe('function');
  });

  it('does not persist anything for games without serialize', () => {
    window.GameRegistry.register({ id: 'plain-game', name: 'Plain', init: () => {}, destroy: () => {} });
    ensureContainer();
    window.GameRegistry.launch('plain-game');
    expect(window.GameRegistry.hasSave('plain-game')).toBe(false);
    window.GameRegistry.destroyCurrent();
    expect(localStorage.getItem('games_saves')).toBeNull();
  });

  it('persists a snapshot on destroyCurrent and passes it to the next launch', async () => {
    const game = registerSaveableGame('save-game', { snapshot: { level: 3 } });
    ensureContainer();
    window.GameRegistry.launch('save-game');
    game.setSnapshot({ level: 7 });
    await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(true);

    expect(window.GameRegistry.hasSave('save-game')).toBe(true);
    const raw = JSON.parse(localStorage.getItem('games_saves'));
    expect(raw['save-game'].state).toEqual({ level: 7 });
    expect(typeof raw['save-game'].savedAt).toBe('number');

    // Relaunch hands the persisted state to init as the second argument.
    window.GameRegistry.launch('save-game');
    expect(game.initArgs().savedState).toEqual({ level: 7 });

    // The save stays until the game reaches a terminal state or is cleared.
    expect(window.GameRegistry.hasSave('save-game')).toBe(true);

    // Destroy again first: launch() is a no-op for a running game. Awaiting
    // keeps the clear below behind the serialized save write.
    await window.GameRegistry.destroyCurrent();
    await window.GameRegistry.clearSave('save-game');
    expect(window.GameRegistry.hasSave('save-game')).toBe(false);
    expect(JSON.parse(localStorage.getItem('games_saves'))['save-game']).toBeUndefined();

    // A launch after clearing starts fresh.
    window.GameRegistry.launch('save-game');
    expect(game.initArgs().savedState).toBeUndefined();
  });

  it('reports failed persistence when the saves storage write throws', async () => {
    registerSaveableGame('failed-save-game', { snapshot: { checkpoint: true } });
    ensureContainer();
    window.GameRegistry.launch('failed-save-game');

    const setAsyncSpy = vi.spyOn(localStorage, 'setItemAsync').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    try {
      await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(false);
      expect(setAsyncSpy).toHaveBeenCalledWith('games_saves', expect.any(String));
    } finally {
      setAsyncSpy.mockRestore();
    }

    expect(window.GameRegistry.hasSave('failed-save-game')).toBe(false);
    expect(window.GameRegistry.getSave('failed-save-game')).toBeNull();
  });

  it('keeps separate snapshots per game', async () => {
    registerSaveableGame('save-a', { snapshot: { n: 1 } });
    registerSaveableGame('save-b', { snapshot: { n: 2 } });
    ensureContainer();
    window.GameRegistry.launch('save-a');
    window.GameRegistry.launch('save-b'); // destroys save-a first, serializing its snapshot
    // Saves writes are serialized, so wait for save-b's write to land before
    // reading the stored snapshot.
    await window.GameRegistry.destroyCurrent(); // serializes save-b

    const raw = JSON.parse(localStorage.getItem('games_saves'));
    expect(raw['save-a'].state).toEqual({ n: 1 });
    expect(raw['save-b'].state).toEqual({ n: 2 });
  });

  it('keeps the stored save when a launched save reports null (pre-start)', () => {
    const game = registerSaveableGame('prestart-game', { snapshot: null });
    ensureContainer();
    localStorage.setItem('games_saves', JSON.stringify({
      'prestart-game': { state: { waiting: true }, savedAt: 1 }
    }));

    window.GameRegistry.launch('prestart-game');
    expect(window.GameRegistry.hasSave('prestart-game')).toBe(true);
    // Teardown (close modal) without starting must not delete the save.
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.hasSave('prestart-game')).toBe(true);

    // And a relaunch restores it; once the game reports live state, the
    // snapshot it returns supersedes the stored one.
    game.setSnapshot({ live: 1 });
    window.GameRegistry.launch('prestart-game');
    expect(game.initArgs().savedState).toEqual({ waiting: true });
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.getSave('prestart-game').state).toEqual({ live: 1 });
  });

  it('treats a malformed envelope as no save and clears it on teardown', () => {
    registerSaveableGame('envelope-game', { snapshot: { n: 1 } });
    ensureContainer();
    localStorage.setItem('games_saves', JSON.stringify({
      'envelope-game': {}
    }));
    // No Continue is offered for a malformed entry.
    expect(window.GameRegistry.hasSave('envelope-game')).toBe(false);

    window.GameRegistry.launch('envelope-game');
    window.GameRegistry.destroyCurrent();
    // The live snapshot replaces the malformed entry.
    expect(window.GameRegistry.getSave('envelope-game').state).toEqual({ n: 1 });
  });

  it('survives corrupt games_saves payloads', () => {
    localStorage.setItem('games_saves', 'not json');
    expect(window.GameRegistry.hasSave('x')).toBe(false);
    expect(window.GameRegistry.getSave('x')).toBeNull();
    expect(() => window.GameRegistry.clearSave('x')).not.toThrow();

    localStorage.setItem('games_saves', '[1,2]');
    expect(window.GameRegistry.getSave('y')).toBeNull();
  });

  it('serializes when the page is hidden (new tab opened)', () => {
    const game = registerSaveableGame('hidden-game', { snapshot: { mid: 'run' } });
    ensureContainer();
    window.GameRegistry.launch('hidden-game');

    // Shadow document.hidden with an own property, then restore whatever was
    // there before so later tests observe the real accessor.
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    const originalHidden = document.hidden;
    try {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'hidden', originalDescriptor);
      } else {
        delete document.hidden;
      }
    }
    expect(document.hidden).toBe(originalHidden);

    expect(window.GameRegistry.hasSave('hidden-game')).toBe(true);
    expect(window.GameRegistry.getSave('hidden-game').state).toEqual({ mid: 'run' });

    // Relaunch restores (destroy first — launch() is a no-op while running).
    window.GameRegistry.destroyCurrent();
    window.GameRegistry.launch('hidden-game');
    expect(game.initArgs().savedState).toEqual({ mid: 'run' });
  });

  it('serializes on pagehide (page unload / browser close)', () => {
    const game = registerSaveableGame('unload-game', { snapshot: { late: true } });
    ensureContainer();
    window.GameRegistry.launch('unload-game');

    window.dispatchEvent(new Event('pagehide'));

    expect(window.GameRegistry.hasSave('unload-game')).toBe(true);
    expect(window.GameRegistry.getSave('unload-game').state).toEqual({ late: true });

    window.GameRegistry.destroyCurrent();
    window.GameRegistry.launch('unload-game');
    expect(game.initArgs().savedState).toEqual({ late: true });
  });

  it('swallows errors thrown from serialize', () => {
    window.GameRegistry.register({
      id: 'throwing-game',
      name: 'Throwing',
      init: () => {},
      destroy: () => {},
      serialize: () => { throw new Error('boom'); }
    });
    ensureContainer();
    window.GameRegistry.launch('throwing-game');
    expect(() => window.GameRegistry.destroyCurrent()).not.toThrow();
    expect(window.GameRegistry.getCurrentGame()).toBeNull();
  });

  it('does not serialize a game whose init threw', () => {
    let serializeCalls = 0;
    localStorage.setItem('games_saves', JSON.stringify({
      'broken-init-game': { state: { prior: true }, savedAt: 1 }
    }));
    window.GameRegistry.register({
      id: 'broken-init-game',
      name: 'Broken Init',
      init: () => { throw new Error('mount failed'); },
      destroy: () => {},
      serialize: () => { serializeCalls++; return { partial: true }; }
    });
    ensureContainer();

    expect(window.GameRegistry.launch('broken-init-game')).toBe(false);
    // A half-mounted game cannot report trustworthy state; its save is left
    // exactly as it was.
    expect(serializeCalls).toBe(0);
    expect(window.GameRegistry.getSave('broken-init-game').state).toEqual({ prior: true });
    expect(window.GameRegistry.getCurrentGame()).toBeNull();
  });
});

describe('Save envelope hardening (review #654 round 2)', () => {
  it('does not offer Continue for a non-object snapshot', () => {
    registerSaveableGame('primitive-state-game', { snapshot: { n: 1 } });
    localStorage.setItem('games_saves', JSON.stringify({
      'primitive-state-game': { state: false, savedAt: 1 },
      'also-primitive': { state: 'nope', savedAt: 2 }
    }));
    expect(window.GameRegistry.hasSave('primitive-state-game')).toBe(false);
    expect(window.GameRegistry.getSave('primitive-state-game')).toBeNull();

    // A live run still overwrites the malformed entry normally.
    ensureContainer();
    window.GameRegistry.launch('primitive-state-game');
    window.GameRegistry.destroyCurrent();
    expect(window.GameRegistry.getSave('primitive-state-game').state).toEqual({ n: 1 });
  });
});

describe('GameRegistry stats persistence (#783)', () => {
  let originalShowToast;
  let showToast;

  beforeEach(() => {
    originalShowToast = window.showToast;
    showToast = vi.fn();
    window.showToast = showToast;
  });

  afterEach(() => {
    if (originalShowToast === undefined) {
      delete window.showToast;
    } else {
      window.showToast = originalShowToast;
    }
  });

  // Real bridge path: chrome.storage.local.set reports failure via lastError,
  // so setItemAsync() rejects after the bridge rolls its cache back.
  function failChromeSet() {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      if (callback) callback();
      chrome.runtime.lastError = null;
      return Promise.resolve();
    };
    return () => {
      chrome.storage.local.set = originalSet;
    };
  }

  it('rolls back and toasts once when the async chrome.storage write fails', async () => {
    await expect(window.GameRegistry.updateStats('stats-fail-game', { highScore: 10, gamesPlayed: 1 })).resolves.toBe(true);

    const restore = failChromeSet();
    try {
      await expect(window.GameRegistry.updateStats('stats-fail-game', { highScore: 999, gamesPlayed: 2 })).resolves.toBe(false);
    } finally {
      restore();
    }

    expect(window.GameRegistry.getStats('stats-fail-game')).toEqual({ highScore: 10, gamesPlayed: 1 });
    expect(JSON.parse(localStorage.getItem('games_stats'))['stats-fail-game']).toEqual({ highScore: 10, gamesPlayed: 1 });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Failed to save game statistics. Your latest score was not saved.', 'error');

    // A later successful write still lands.
    await expect(window.GameRegistry.updateStats('stats-fail-game', { highScore: 20 })).resolves.toBe(true);
    expect(window.GameRegistry.getStats('stats-fail-game').highScore).toBe(20);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect a rejected score when two overlapping writes both fail', async () => {
    await window.GameRegistry.updateStats('race-game', { highScore: 1 });

    const restore = failChromeSet();
    try {
      const first = window.GameRegistry.updateStats('race-game', { highScore: 100 });
      const second = window.GameRegistry.updateStats('race-game', { gamesPlayed: 7 });
      // Callers still see their optimistic updates while writes are pending.
      expect(window.GameRegistry.getStats('race-game')).toEqual({ highScore: 100, gamesPlayed: 7 });

      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
    } finally {
      restore();
    }

    expect(window.GameRegistry.getStats('race-game')).toEqual({ highScore: 1 });
    expect(JSON.parse(localStorage.getItem('games_stats'))['race-game']).toEqual({ highScore: 1 });
    // Both failures happen in one burst, so the toast is coalesced.
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('keeps a later write that succeeds after an earlier queued write fails', async () => {
    await window.GameRegistry.updateStats('race-ok-game', { highScore: 1 });

    const originalSet = chrome.storage.local.set;
    let calls = 0;
    chrome.storage.local.set = (items, callback) => {
      calls += 1;
      if (calls === 1) {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        if (callback) callback();
        chrome.runtime.lastError = null;
        return Promise.resolve();
      }
      return originalSet.call(chrome.storage.local, items, callback);
    };
    try {
      const first = window.GameRegistry.updateStats('race-ok-game', { highScore: 100 });
      const second = window.GameRegistry.updateStats('race-ok-game', { gamesPlayed: 2 });
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(true);
    } finally {
      chrome.storage.local.set = originalSet;
    }

    // The rejected high score is not carried into the later successful write.
    expect(window.GameRegistry.getStats('race-ok-game')).toEqual({ highScore: 1, gamesPlayed: 2 });
    expect(JSON.parse(localStorage.getItem('games_stats'))['race-ok-game']).toEqual({ highScore: 1, gamesPlayed: 2 });
  });

  function failFirstChromeSet() {
    const originalSet = chrome.storage.local.set;
    let calls = 0;
    chrome.storage.local.set = (items, callback) => {
      calls += 1;
      if (calls === 1) {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        if (callback) callback();
        chrome.runtime.lastError = null;
        return Promise.resolve();
      }
      return originalSet.call(chrome.storage.local, items, callback);
    };
    return () => {
      chrome.storage.local.set = originalSet;
    };
  }

  it('never persists a rejected score through a later updateStatsWith write on the same key', async () => {
    await window.GameRegistry.updateStats('same-key-game', { highScore: 1, gamesPlayed: 1 });

    const updater = (score) => (stats) => ({
      highScore: Math.max(stats.highScore || 0, score),
      gamesPlayed: (stats.gamesPlayed || 0) + 1
    });

    const restore = failFirstChromeSet();
    try {
      window.gamesHelpers.updateStatsWith('same-key-game', updater(100));
      window.gamesHelpers.updateStatsWith('same-key-game', updater(5));
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      restore();
    }

    // Write 1 (highScore 100) was rejected; write 2 applies only its own
    // updater to the stored stats.
    const stored = JSON.parse(localStorage.getItem('games_stats'))['same-key-game'];
    expect(stored).toEqual({ highScore: 5, gamesPlayed: 2 });
    expect(window.GameRegistry.getStats('same-key-game')).toEqual({ highScore: 5, gamesPlayed: 2 });
  });

  it('cleans up after a synchronous updater throw and keeps later queued writes running', async () => {
    await window.GameRegistry.updateStats('throw-queue-game', { highScore: 1 });

    const inFlight = window.GameRegistry.updateStats('throw-queue-game', { gamesPlayed: 1 });
    const throwing = window.GameRegistry.updateStats('throw-queue-game', () => {
      throw new Error('updater exploded');
    });
    const later = window.GameRegistry.updateStats('throw-queue-game', { highScore: 9 });

    await expect(inFlight).resolves.toBe(true);
    await expect(throwing).resolves.toBe(false);
    await expect(later).resolves.toBe(true);

    expect(window.GameRegistry.getStats('throw-queue-game')).toEqual({ highScore: 9, gamesPlayed: 1 });
    expect(JSON.parse(localStorage.getItem('games_stats'))['throw-queue-game']).toEqual({ highScore: 9, gamesPlayed: 1 });
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of failed stats writes into a single toast', async () => {
    const restore = failChromeSet();
    try {
      const writes = [1, 2, 3].map((n) => window.GameRegistry.updateStats('burst-game', { highScore: n }));
      await expect(Promise.all(writes)).resolves.toEqual([false, false, false]);
    } finally {
      restore();
    }
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(window.GameRegistry.getStats('burst-game')).toEqual({});
  });

  it('treats a setItemAsync result of false as a failed save', async () => {
    await window.GameRegistry.updateStats('stats-false-game', { highScore: 3 });
    const spy = vi.spyOn(localStorage, 'setItemAsync').mockResolvedValue(false);
    try {
      await expect(window.GameRegistry.updateStats('stats-false-game', { highScore: 50 })).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(window.GameRegistry.getStats('stats-false-game').highScore).toBe(3);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('reports failed persistence when the stats storage write throws', async () => {
    await window.GameRegistry.updateStats('stats-throw-game', { highScore: 5 });
    const spy = vi.spyOn(localStorage, 'setItemAsync').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    try {
      await expect(window.GameRegistry.updateStats('stats-throw-game', { highScore: 42 })).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(window.GameRegistry.getStats('stats-throw-game').highScore).toBe(5);
    expect(JSON.parse(localStorage.getItem('games_stats'))['stats-throw-game'].highScore).toBe(5);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('gamesHelpers.updateStatsWith surfaces a failed async stats write', async () => {
    await window.GameRegistry.updateStats('helper-game', { highScore: 1 });

    const restore = failChromeSet();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      window.gamesHelpers.updateStatsWith('helper-game', function (stats) {
        return { highScore: (stats.highScore || 0) + 1 };
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const warnings = warnSpy.mock.calls.map((call) => call.join(' '));
      expect(warnings.some((message) => message.includes('updateStatsWith'))).toBe(true);
    } finally {
      restore();
      warnSpy.mockRestore();
    }

    expect(window.GameRegistry.getStats('helper-game').highScore).toBe(1);
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe('GameRegistry saves bridge rejection (#1039)', () => {
  const SAVES_ERROR_MESSAGE = 'Failed to save game progress. Your latest run was not saved.';
  let originalShowToast;
  let showToast;
  let originalSetItemAsync;

  beforeEach(() => {
    originalShowToast = window.showToast;
    showToast = vi.fn();
    window.showToast = showToast;
    originalSetItemAsync = localStorage.setItemAsync;
  });

  afterEach(() => {
    if (originalShowToast === undefined) {
      delete window.showToast;
    } else {
      window.showToast = originalShowToast;
    }
    if (originalSetItemAsync) {
      localStorage.setItemAsync = originalSetItemAsync;
    } else {
      delete localStorage.setItemAsync;
    }
  });

  // Real bridge path: chrome.storage.local.set reports failure via lastError,
  // so setItemAsync() settles false after the bridge rolls its cache back.
  function failChromeSet() {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      if (callback) callback();
      chrome.runtime.lastError = null;
      return Promise.resolve();
    };
    return () => {
      chrome.storage.local.set = originalSet;
    };
  }

  function launchSaveable(id, state) {
    const game = registerSaveableGame(id, state);
    ensureContainer();
    window.GameRegistry.launch(id);
    return game;
  }

  it('treats a setItemAsync result of false as a failed save', async () => {
    launchSaveable('saves-false-game', { snapshot: { n: 1 } });

    const spy = vi.spyOn(localStorage, 'setItemAsync').mockResolvedValue(false);
    try {
      await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }

    // The rejected value must not stay cached: the store never took it.
    expect(window.GameRegistry.hasSave('saves-false-game')).toBe(false);
    expect(window.GameRegistry.getSave('saves-false-game')).toBeNull();
    expect(window.GameRegistry.getAllSaves()).toEqual({});
    expect(localStorage.getItem('games_saves')).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(SAVES_ERROR_MESSAGE, 'error');
  });

  it('drops the rejected snapshot after an async chrome.storage write failure', async () => {
    const game = launchSaveable('saves-async-game', { snapshot: { mid: 'run' } });

    const restore = failChromeSet();
    try {
      await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(false);
    } finally {
      restore();
    }

    // The bridge rolled its optimistic cache back; the registry must not
    // serve the rejected snapshot from its own cache either.
    expect(localStorage.getItem('games_saves')).toBeNull();
    expect(window.GameRegistry.hasSave('saves-async-game')).toBe(false);
    expect(window.GameRegistry.getAllSaves()).toEqual({});
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(SAVES_ERROR_MESSAGE, 'error');

    // A later successful write still lands without a second toast.
    window.GameRegistry.launch('saves-async-game');
    game.setSnapshot({ mid: 'run-2' });
    await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(true);
    expect(window.GameRegistry.getSave('saves-async-game').state).toEqual({ mid: 'run-2' });
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('checks the sync setItem return when setItemAsync is unavailable', async () => {
    launchSaveable('saves-sync-game', { snapshot: { n: 2 } });

    delete localStorage.setItemAsync;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => false);
    try {
      await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(false);
      expect(spy).toHaveBeenCalledWith('games_saves', expect.any(String));
    } finally {
      spy.mockRestore();
    }

    expect(window.GameRegistry.hasSave('saves-sync-game')).toBe(false);
    expect(window.GameRegistry.getSave('saves-sync-game')).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(SAVES_ERROR_MESSAGE, 'error');
  });

  it('drops the rejected snapshot when pagehide serialization is refused', async () => {
    launchSaveable('saves-pagehide-game', { snapshot: { late: true } });

    const spy = vi.spyOn(localStorage, 'setItemAsync').mockResolvedValue(false);
    try {
      window.dispatchEvent(new Event('pagehide'));
      // pagehide cannot consume the async result; wait for the failure side
      // effects (cache drop + toast) instead of a synchronous return value.
      await vi.waitFor(() => {
        expect(showToast).toHaveBeenCalledTimes(1);
      });
    } finally {
      spy.mockRestore();
    }

    expect(window.GameRegistry.hasSave('saves-pagehide-game')).toBe(false);
    expect(localStorage.getItem('games_saves')).toBeNull();
    expect(showToast).toHaveBeenCalledWith(SAVES_ERROR_MESSAGE, 'error');
  });

  it('coalesces a burst of failed saves writes into a single toast', async () => {
    launchSaveable('saves-burst-game', { snapshot: { n: 1 } });

    const restore = failChromeSet();
    try {
      await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(false);
      window.GameRegistry.launch('saves-burst-game');
      await expect(window.GameRegistry.destroyCurrent()).resolves.toBe(false);
    } finally {
      restore();
    }

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(window.GameRegistry.hasSave('saves-burst-game')).toBe(false);
  });

  it('does not resurrect a rejected snapshot when two overlapping saves both fail', async () => {
    const game = launchSaveable('saves-race-game', { snapshot: { n: 1 } });

    const restore = failChromeSet();
    try {
      // Two writes without awaiting the first: saves writes are serialized,
      // so the second setItemAsync() starts only after the first settles and
      // cannot use the first rejected snapshot as its rollback target.
      const first = window.GameRegistry.destroyCurrent();
      window.GameRegistry.launch('saves-race-game');
      game.setSnapshot({ n: 2 });
      const second = window.GameRegistry.destroyCurrent();
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
    } finally {
      restore();
    }

    expect(window.GameRegistry.hasSave('saves-race-game')).toBe(false);
    expect(window.GameRegistry.getSave('saves-race-game')).toBeNull();
    expect(window.GameRegistry.getAllSaves()).toEqual({});
    expect(localStorage.getItem('games_saves')).toBeNull();
    // Both failures happen in one burst, so the toast is coalesced.
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe('GameRegistry MRU bridge rejection (#1069)', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // Real bridge path: chrome.storage.local.set reports failure via lastError,
  // so setItemAsync() settles false after the bridge rolls its cache back.
  // Only the MRU key is failed so unrelated writes still land.
  function failMRUChromeSet() {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (Object.prototype.hasOwnProperty.call(items, 'games_recently_played')) {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        if (callback) callback();
        chrome.runtime.lastError = null;
        return Promise.resolve();
      }
      return originalSet.call(chrome.storage.local, items, callback);
    };
    return () => {
      chrome.storage.local.set = originalSet;
    };
  }

  function registerPlainGame(id) {
    window.GameRegistry.register({ id: id, name: id, init: () => {}, destroy: () => {} });
  }

  it('drops the rejected MRU list so the next read re-serves rolled-back state', async () => {
    registerPlainGame('mru-game-a');
    ensureContainer();
    window.GameRegistry.launch('mru-game-a');
    expect(window.GameRegistry.getMRU()).toEqual(['mru-game-a']);

    const restore = failMRUChromeSet();
    try {
      registerPlainGame('mru-game-b');
      window.GameRegistry.launch('mru-game-b');
      // saveMRU is fire-and-forget; wait for the async rejection handler to
      // log the warning (the last step of the failure path) before asserting.
      await vi.waitFor(() => {
        expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('games_recently_played'))).toBe(true);
      });
    } finally {
      restore();
    }

    // The rejected touch must not stay cached: reads serve the list the
    // bridge rolled back to, not the one it refused.
    expect(window.GameRegistry.getMRU()).toEqual(['mru-game-a']);
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(['mru-game-a']);
  });

  it('lands a later MRU write after a rejected one', async () => {
    registerPlainGame('mru-game-c');
    ensureContainer();
    window.GameRegistry.launch('mru-game-c');
    expect(window.GameRegistry.getMRU()).toEqual(['mru-game-c']);

    const restore = failMRUChromeSet();
    try {
      registerPlainGame('mru-game-d');
      window.GameRegistry.launch('mru-game-d');
      await vi.waitFor(() => {
        expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('games_recently_played'))).toBe(true);
      });
    } finally {
      restore();
    }
    expect(window.GameRegistry.getMRU()).toEqual(['mru-game-c']);

    registerPlainGame('mru-game-e');
    window.GameRegistry.launch('mru-game-e');
    expect(window.GameRegistry.getMRU()).toEqual(['mru-game-e', 'mru-game-c']);
  });

  it('treats a setItemAsync result of false as a failed MRU write', async () => {
    registerPlainGame('mru-false-a');
    ensureContainer();
    window.GameRegistry.launch('mru-false-a');
    expect(window.GameRegistry.getMRU()).toEqual(['mru-false-a']);

    const spy = vi.spyOn(localStorage, 'setItemAsync').mockResolvedValue(false);
    try {
      registerPlainGame('mru-false-b');
      window.GameRegistry.launch('mru-false-b');
      await vi.waitFor(() => {
        expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('games_recently_played'))).toBe(true);
      });
    } finally {
      spy.mockRestore();
    }

    expect(window.GameRegistry.getMRU()).toEqual(['mru-false-a']);
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(['mru-false-a']);
  });

  it('checks the sync setItem return when setItemAsync is unavailable', () => {
    registerPlainGame('mru-sync-a');
    ensureContainer();
    window.GameRegistry.launch('mru-sync-a');
    expect(window.GameRegistry.getMRU()).toEqual(['mru-sync-a']);

    const originalSetItemAsync = localStorage.setItemAsync;
    delete localStorage.setItemAsync;
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'games_recently_played') return false;
      return originalSetItem(key, value);
    });
    try {
      registerPlainGame('mru-sync-b');
      window.GameRegistry.launch('mru-sync-b');
    } finally {
      spy.mockRestore();
      if (originalSetItemAsync) {
        localStorage.setItemAsync = originalSetItemAsync;
      }
    }

    expect(window.GameRegistry.getMRU()).toEqual(['mru-sync-a']);
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(['mru-sync-a']);
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('games_recently_played'))).toBe(true);
  });

  it('drops the MRU cache when the storage write throws', () => {
    registerPlainGame('mru-throw-a');
    ensureContainer();
    window.GameRegistry.launch('mru-throw-a');
    expect(window.GameRegistry.getMRU()).toEqual(['mru-throw-a']);

    const spy = vi.spyOn(localStorage, 'setItemAsync').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    try {
      registerPlainGame('mru-throw-b');
      expect(() => window.GameRegistry.launch('mru-throw-b')).not.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect(window.GameRegistry.getMRU()).toEqual(['mru-throw-a']);
    expect(JSON.parse(localStorage.getItem('games_recently_played'))).toEqual(['mru-throw-a']);
  });
});
