// src/features/games/game-registry.js - Game Registry & Lifecycle Manager

(function () {
  'use strict';

  const STATS_KEY = 'games_stats';
  const STATS_SAVE_ERROR_FALLBACK = 'Failed to save game statistics. Your latest score was not saved.';
  const MRU_KEY = 'games_recently_played';
  const SAVES_KEY = 'games_saves';
  const SAVES_SAVE_ERROR_FALLBACK = 'Failed to save game progress. Your latest run was not saved.';
  const MAX_MRU = 20;
  const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
  const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

  let registeredGames = Object.create(null);
  let launchOrder = [];
  let currentGame = null;
  // True while the running game was launched with a restored snapshot that it
  // has not yet superseded (see serializeCurrent).
  let currentLaunchHadSave = false;
  let initialized = false;

  let mruCache = null;
  let mruCacheRaw;

  // ===================== Storage Helpers =====================

  // Coalesce bursts: several failed writes in quick succession show one toast.
  const TOAST_COALESCE_MS = 2000;

  // A localStorage key holding a plain JSON object, with a private read cache
  // and its own toast coalescing.
  function createJSONObjectStore({ key, errorI18nKey, fallback }) {
    let cache = null;
    let cacheRaw;
    let lastToastAt = -Infinity;

    // Keep an unparseable value under a backup key so the next write, which
    // starts from an empty object, cannot silently destroy it.
    function backupCorrupt(raw) {
      let backupKey = `${key}_corrupt_backup`;
      if (localStorage.getItem(backupKey) !== null) backupKey = `${backupKey}_${Date.now()}`;
      localStorage.setItem(backupKey, raw);
      console.warn(`Preserved corrupt ${key} as ${backupKey}`);
    }

    function load() {
      let raw;
      try {
        raw = localStorage.getItem(key);
        if (raw === cacheRaw && cache !== null) return cache;
        cacheRaw = raw;
        if (!raw) {
          cache = {};
          return cache;
        }
        const parsed = JSON.parse(raw);
        cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        return cache;
      } catch (e) {
        console.warn(`Failed to load ${key}:`, e);
        cache = {};
        // Remember the bad raw value so it is backed up once, not on every read.
        cacheRaw = raw;
        if (raw) {
          try {
            backupCorrupt(raw);
          } catch (backupError) {
            console.warn(`Failed to back up corrupt ${key}:`, backupError);
          }
          showError();
        }
        return cache;
      }
    }

    function showError() {
      const now = Date.now();
      if (now - lastToastAt < TOAST_COALESCE_MS) return;
      lastToastAt = now;
      let message = fallback;
      if (window.i18n && typeof window.i18n.t === 'function') {
        const translated = window.i18n.t(errorI18nKey);
        if (translated && translated !== errorI18nKey) message = translated;
      }
      if (typeof window.showToast === 'function') {
        window.showToast(message, 'error');
        return;
      }
      console.warn(message);
    }

    function fail(error) {
      console.warn(`Failed to save ${key}:`, error || 'storage rejected the write');
      // Drop the cache so the next read re-serves the value the storage bridge
      // rolled back to, not the rejected object.
      invalidate();
      showError();
      return false;
    }

    function save(value) {
      return writeTrackedJSON(key, value, (cached, raw) => {
        cache = cached;
        cacheRaw = raw;
      }, fail);
    }

    function invalidate() {
      cache = null;
      cacheRaw = undefined;
    }

    function resetToast() {
      lastToastAt = -Infinity;
    }

    return { load, save, fail, showError, invalidate, resetToast };
  }

  const statsStore = createJSONObjectStore({
    key: STATS_KEY,
    errorI18nKey: 'gameStatsSaveError',
    fallback: STATS_SAVE_ERROR_FALLBACK
  });
  const savesStore = createJSONObjectStore({
    key: SAVES_KEY,
    errorI18nKey: 'gameSavesSaveError',
    fallback: SAVES_SAVE_ERROR_FALLBACK
  });

  // Shared write path for the tracked JSON stores (stats, saves, MRU).
  // Resolves to whether the value persisted. The storage bridge's sync
  // setItem() accepts chrome.storage writes optimistically and reports
  // failures later, so prefer setItemAsync() and treat a settled-false or
  // rejected write as a failure. `commit` mirrors the bridge's optimistic
  // cache update; `fail` rolls this module's cache back to the value the
  // bridge restored.
  function writeTrackedJSON(key, value, commit, fail) {
    let serialized;
    try {
      serialized = JSON.stringify(value);
    } catch (e) {
      return Promise.resolve(fail(e));
    }

    if (typeof localStorage.setItemAsync === 'function') {
      let pending;
      try {
        pending = localStorage.setItemAsync(key, serialized);
      } catch (e) {
        return Promise.resolve(fail(e));
      }
      // The bridge updated its cache synchronously; mirror that until the
      // write settles.
      commit(value, serialized);
      return Promise.resolve(pending).then(
        (persisted) => (persisted === true ? true : fail()),
        fail
      );
    }

    let accepted;
    try {
      // Native Storage#setItem returns void and throws on failure.
      accepted = localStorage.setItem(key, serialized) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      return Promise.resolve(fail(e));
    }
    if (!accepted) {
      return Promise.resolve(fail());
    }
    commit(value, serialized);
    return Promise.resolve(true);
  }

  function loadMRU() {
    try {
      const raw = localStorage.getItem(MRU_KEY);
      if (raw === mruCacheRaw && mruCache !== null) return mruCache;
      mruCacheRaw = raw;
      if (!raw) {
        mruCache = [];
        return mruCache;
      }
      const parsed = JSON.parse(raw);
      mruCache = Array.isArray(parsed) ? parsed : [];
      return mruCache;
    } catch (e) {
      console.warn('Failed to load games_recently_played:', e);
      mruCache = [];
      mruCacheRaw = undefined;
      return mruCache;
    }
  }

  function failMRUWrite(error) {
    console.warn('Failed to save games_recently_played:', error || 'storage rejected the write');
    // Drop the cache so the next read re-serves the value the storage bridge
    // rolled back to, not the rejected list.
    mruCache = null;
    mruCacheRaw = undefined;
    return false;
  }

  function saveMRU(mru) {
    return writeTrackedJSON(MRU_KEY, mru, (cached, raw) => {
      mruCache = cached;
      mruCacheRaw = raw;
    }, failMRUWrite);
  }

  // Serializes writes so each one runs after the previous settles. `run` is
  // only invoked if no reset() happened since enqueue(); a write enqueued
  // before a reset is treated as resolved (true) and never runs, and its
  // settle does not decrement the fresh in-flight counter.
  function createSerialWriteQueue() {
    let chain = Promise.resolve();
    let inFlight = 0;
    let generation = 0;

    function enqueue(run) {
      const gen = generation;
      const guarded = () => {
        if (gen !== generation) return Promise.resolve(true);
        return run();
      };
      const settle = () => {
        if (gen === generation) inFlight -= 1;
      };
      const write = inFlight === 0 ? guarded() : chain.then(guarded);
      inFlight += 1;
      chain = write.then(settle, settle);
      return write;
    }

    function reset() {
      generation += 1;
      chain = Promise.resolve();
      inFlight = 0;
    }

    return { enqueue: enqueue, reset: reset };
  }

  // MRU touches are serialized so each write is confirmed (or rolled back by
  // the storage bridge) before the next touch derives from stored state:
  // overlapping writes would let a later rejection roll the bridge cache back
  // to an earlier, also-rejected list. Each queued touch applies to the
  // *stored* MRU when it runs, so a touch never derives from another touch's
  // unconfirmed values.
  const mruWriteQueue = createSerialWriteQueue();

  function touchMRU(gameId) {
    return mruWriteQueue.enqueue(() => {
      const mru = loadMRU();
      const idx = mru.indexOf(gameId);
      if (idx !== -1) mru.splice(idx, 1);
      mru.unshift(gameId);
      if (mru.length > MAX_MRU) mru.length = MAX_MRU;
      return saveMRU(mru);
    });
  }

  // Saves writes are serialized so each one is confirmed (or rolled back by
  // the storage bridge) before the next setItemAsync() starts: overlapping
  // writes would let the second write's rollback target be the first write's
  // unconfirmed (possibly later rejected) snapshot, resurrecting it in the
  // bridge cache. Each queued write carries an updater that is applied to the
  // *stored* saves when that write runs, so a write is never derived from
  // another write's unconfirmed values.
  const savesWriteQueue = createSerialWriteQueue();

  // `apply(saves)` mutates a copy of the stored saves and returns false to
  // skip the write entirely (nothing to persist). Resolves to whether a write
  // was persisted.
  function enqueueSavesWrite(apply) {
    return savesWriteQueue.enqueue(() => {
      let saves;
      try {
        saves = { ...savesStore.load() };
        if (apply(saves) === false) return Promise.resolve(true);
      } catch (e) {
        return Promise.resolve(savesStore.fail(e));
      }
      return savesStore.save(saves);
    });
  }

  // Persist a snapshot for a game that opted in via serialize(). Callers must
  // pass a concrete state; resolves to true when a save was written.
  function persistSave(gameId, state) {
    if (!gameId) return Promise.resolve(false);
    return enqueueSavesWrite((saves) => {
      saves[gameId] = { state: state, savedAt: Date.now() };
      return true;
    });
  }

  // A well-formed envelope carries a restorable snapshot: an object (the
  // games' restore paths all validate objects) plus the savedAt timestamp.
  // Anything else — a primitive state, a missing stamp — must not surface as
  // a save.
  function isValidSaveEnvelope(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (entry.state === null || typeof entry.state !== 'object' || Array.isArray(entry.state)) return false;
    return Number.isFinite(entry.savedAt);
  }

  function getSave(gameId) {
    const entry = savesStore.load()[gameId];
    return isValidSaveEnvelope(entry) ? entry : null;
  }

  function hasSave(gameId) {
    return getSave(gameId) !== null;
  }

  function clearSave(gameId) {
    return enqueueSavesWrite((saves) => {
      // Checked when the write runs, so a queued persistSave for the same
      // game is neither clobbered by an eager skip nor missed by the delete.
      if (!Object.hasOwn(saves, gameId)) return false;
      delete saves[gameId];
      return true;
    });
  }

  // ===================== Crypto-safe Random =====================

  function secureRandom() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / (0xFFFFFFFF + 1);
  }

  // ===================== Public API =====================

  function register(gameDef) {
    const idIsSafe = typeof gameDef?.id === 'string' && SAFE_ID_PATTERN.test(gameDef.id) && !RESERVED_IDS.has(gameDef.id);
    if (!idIsSafe || !gameDef.name || typeof gameDef.init !== 'function' || typeof gameDef.destroy !== 'function') {
      console.warn('GameRegistry.register: invalid game definition', gameDef);
      return false;
    }
    if (registeredGames[gameDef.id]) {
      console.warn('GameRegistry.register: duplicate game id', gameDef.id);
      return false;
    }
    registeredGames[gameDef.id] = gameDef;
    launchOrder.push(gameDef.id);
    return true;
  }

  function list() {
    return launchOrder.map(function (id) {
      return registeredGames[id];
    }).filter(Boolean);
  }

  function get(id) {
    return registeredGames[id] || null;
  }

  // Stats writes are serialized so each one is confirmed (or rolled back by
  // the storage bridge) before the next starts. Each queued write carries an
  // updater that is applied to the *stored* stats when that write runs, so a
  // write is never derived from another write's unconfirmed (possibly later
  // rejected) values. Reads overlay queued updaters for an optimistic view;
  // the write in flight is already reflected in the bridge's cache.
  let pendingStatsUpdates = [];
  const statsWriteQueue = createSerialWriteQueue();

  function toUpdater(updates) {
    if (typeof updates === 'function') return updates;
    const delta = { ...updates };
    return () => delta;
  }

  function applyUpdater(all, entry) {
    const current = all[entry.id] || {};
    const result = entry.updater({ ...current });
    return { ...current, ...(result && typeof result === 'object' ? result : {}) };
  }

  function viewStats() {
    const base = statsStore.load();
    const queued = pendingStatsUpdates.filter((entry) => !entry.started);
    if (queued.length === 0) return base;
    const view = { ...base };
    queued.forEach((entry) => {
      try {
        view[entry.id] = applyUpdater(view, entry);
      } catch (e) {
        console.warn('Failed to preview pending games_stats update:', e);
      }
    });
    return view;
  }

  function getStats(id) {
    const all = viewStats();
    return all[id] || {};
  }

  function getAllStats() {
    return viewStats();
  }

  function getAllSaves() {
    return savesStore.load();
  }

  // `updates` is either a partial stats object or an updater function
  // (storedStats) => partial stats. Resolves to whether the write persisted.
  function updateStats(id, updates) {
    const entry = { id, updater: toUpdater(updates), started: false };
    pendingStatsUpdates.push(entry);

    const settle = (saved) => {
      pendingStatsUpdates = pendingStatsUpdates.filter((pending) => pending !== entry);
      return saved;
    };

    const run = () => {
      entry.started = true;
      let all;
      try {
        // Stored state only: earlier writes have settled, and failures have
        // already been rolled back by the bridge.
        all = { ...statsStore.load() };
        all[id] = applyUpdater(all, entry);
      } catch (e) {
        return Promise.resolve(settle(statsStore.fail(e)));
      }
      return statsStore.save(all).then(settle);
    };

    return statsWriteQueue.enqueue(run);
  }

  // ===================== Lifecycle =====================

  function launch(gameId) {
    const game = registeredGames[gameId];
    if (!game) {
      console.warn('GameRegistry.launch: unknown game', gameId);
      return false;
    }

    // Destroy current game if one is running
    if (currentGame && currentGame.id !== gameId) {
      destroyCurrent();
    }

    // Already running same game
    if (currentGame && currentGame.id === gameId) {
      return true;
    }

    // Get the game container
    const container = document.getElementById('games-game-container');
    if (!container) {
      console.warn('GameRegistry.launch: missing #games-game-container');
      return false;
    }

    currentGame = game;

    // Hand a previously persisted snapshot to games that accept it; games that
    // ignore the second argument simply start fresh.
    const save = getSave(gameId);
    const savedState = save ? save.state : undefined;
    currentLaunchHadSave = !!save;

    container.innerHTML = '';
    try {
      game.init(container, savedState);
    } catch (e) {
      console.warn('GameRegistry.launch: error initializing', game.id, e);
      destroyCurrent({ serialize: false });
      return false;
    }
    void touchMRU(gameId);
    return true;
  }

  function serializeCurrent() {
    if (!currentGame || typeof currentGame.serialize !== 'function') return Promise.resolve(false);
    try {
      const state = currentGame.serialize();
      // Serialize-hook contract:
      //   object         -> persist the snapshot
      //   null/undefined -> nothing live to report right now; keep a snapshot
      //                     this launch restored (e.g. Snake waiting on
      //                     Continue), otherwise drop any stale entry.
      // Games own terminal/rejected-restore handling: they call
      // GameRegistry.clearSave(id) at those moments, so the hook never needs
      // to signal "discard" itself.
      if (state === null || state === undefined) {
        if (!currentLaunchHadSave) {
          return clearSave(currentGame.id).then(() => false);
        }
        return Promise.resolve(false);
      }
      return persistSave(currentGame.id, state);
    } catch (e) {
      console.warn('GameRegistry.serializeCurrent: error serializing', currentGame.id, e);
      return Promise.resolve(false);
    }
  }

  // serialize: pass { serialize: false } to tear down without touching the
  // save store (used when init() failed mid-mount and the game cannot report
  // trustworthy state).
  function destroyCurrent(options) {
    if (!currentGame) return false;
    let saveResult = true;
    if (options?.serialize !== false) {
      saveResult = serializeCurrent();
    }
    try {
      currentGame.destroy();
    } catch (e) {
      console.warn('GameRegistry.destroyCurrent: error destroying', currentGame.id, e);
    }
    const container = document.getElementById('games-game-container');
    if (container) container.innerHTML = '';
    currentGame = null;
    return saveResult;
  }

  function backToHub() {
    destroyCurrent();
    if (window.GamesApp && typeof window.GamesApp.showHub === 'function') {
      window.GamesApp.showHub();
    }
  }

  function getCurrentGame() {
    return currentGame;
  }

  function getMRU() {
    return loadMRU();
  }

  // ===================== Visibility Handling =====================

  function onVisibilityChange() {
    if (!currentGame) return;
    if (document.hidden) {
      // Opening another tab hides this page without closing the modal; save
      // before pausing so the run survives a reload that never calls close().
      void serializeCurrent();
      if (typeof currentGame.pause === 'function') {
        try {
          currentGame.pause();
        } catch (e) {
          console.warn('GameRegistry.onVisibilityChange: error pausing', currentGame.id, e);
        }
      }
    } else if (typeof currentGame.resume === 'function') {
      try {
        currentGame.resume();
      } catch (e) {
        console.warn('GameRegistry.onVisibilityChange: error resuming', currentGame.id, e);
      }
    }
  }

  // ===================== Init =====================

  function handleStorageEvent(e) {
    if (!e || e.key === null) {
      statsStore.invalidate();
      mruCache = null;
      mruCacheRaw = undefined;
      savesStore.invalidate();
      return;
    }
    if (e.key === STATS_KEY) {
      statsStore.invalidate();
    } else if (e.key === MRU_KEY) {
      mruCache = null;
      mruCacheRaw = undefined;
    } else if (e.key === SAVES_KEY) {
      savesStore.invalidate();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', handleStorageEvent);

    // A new tab replaces this page without ever closing the games modal, so
    // serialize the current game before the page unloads. pagehide fires on
    // both navigation and tab/window close; bfcache restores skip init()
    // because `initialized` is still true. If a saves write is still in
    // flight, this save queues behind it (writes are serialized so the
    // storage bridge cannot roll a rejected snapshot back into a newer
    // write, #1039): the wait is normally a single chrome.storage callback.
    // Accepted risk: if the page is torn down before that settles, the
    // queued write is never issued and the final snapshot is lost —
    // bypassing the queue here would reintroduce the overlapping-write
    // rollback serialization exists to prevent.
    window.addEventListener('pagehide', function () {
      void serializeCurrent();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function _reset() {
    destroyCurrent();
    registeredGames = Object.create(null);
    launchOrder = [];
    statsStore.invalidate();
    pendingStatsUpdates = [];
    statsStore.resetToast();
    savesStore.resetToast();
    // Invalidate writes enqueued (but not yet run) before this reset, then
    // start fresh queues for the next test.
    statsWriteQueue.reset();
    savesWriteQueue.reset();
    mruWriteQueue.reset();
    mruCache = null;
    mruCacheRaw = undefined;
    savesStore.invalidate();
  }

  window.GameRegistry = {
    register: register,
    list: list,
    get: get,
    getStats: getStats,
    getAllStats: getAllStats,
    getAllSaves: getAllSaves,
    updateStats: updateStats,
    launch: launch,
    destroyCurrent: destroyCurrent,
    backToHub: backToHub,
    getCurrentGame: getCurrentGame,
    getMRU: getMRU,
    hasSave: hasSave,
    getSave: getSave,
    clearSave: clearSave,
    isValidSaveEnvelope: isValidSaveEnvelope,
    secureRandom: secureRandom,
    _reset: _reset
  };
})();
