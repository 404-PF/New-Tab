// src/features/games/game-registry.js - Game Registry & Lifecycle Manager

(function () {
  'use strict';

  const STATS_KEY = 'games_stats';
  const MRU_KEY = 'games_recently_played';
  const SAVES_KEY = 'games_saves';
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

  // ===================== Storage Helpers =====================

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      console.warn('Failed to load games_stats:', e);
      return {};
    }
  }

  function saveStats(stats) {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn('Failed to save games_stats:', e);
    }
  }

  function loadMRU() {
    try {
      const raw = localStorage.getItem(MRU_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to load games_recently_played:', e);
      return [];
    }
  }

  function saveMRU(mru) {
    try {
      localStorage.setItem(MRU_KEY, JSON.stringify(mru));
    } catch (e) {
      console.warn('Failed to save games_recently_played:', e);
    }
  }

  function touchMRU(gameId) {
    const mru = loadMRU();
    const idx = mru.indexOf(gameId);
    if (idx !== -1) mru.splice(idx, 1);
    mru.unshift(gameId);
    if (mru.length > MAX_MRU) mru.length = MAX_MRU;
    saveMRU(mru);
  }

  function loadSaves() {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      console.warn('Failed to load games_saves:', e);
      return {};
    }
  }

  function saveSaves(saves) {
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
    } catch (e) {
      console.warn('Failed to save games_saves:', e);
    }
  }

  // Persist a snapshot for a game that opted in via serialize(). Callers must
  // pass a concrete state; returns true when a save was written.
  function persistSave(gameId, state) {
    if (!gameId) return false;
    const saves = loadSaves();
    saves[gameId] = { state: state, savedAt: Date.now() };
    saveSaves(saves);
    return true;
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
    const entry = loadSaves()[gameId];
    return isValidSaveEnvelope(entry) ? entry : null;
  }

  function hasSave(gameId) {
    return getSave(gameId) !== null;
  }

  function clearSave(gameId) {
    const saves = loadSaves();
    if (!Object.hasOwn(saves, gameId)) return;
    delete saves[gameId];
    saveSaves(saves);
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

  function getStats(id) {
    const all = loadStats();
    return all[id] || {};
  }

  function updateStats(id, updates) {
    const all = loadStats();
    all[id] = { ...all[id], ...updates };
    saveStats(all);
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
    touchMRU(gameId);
    return true;
  }

  function serializeCurrent() {
    if (!currentGame || typeof currentGame.serialize !== 'function') return false;
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
          clearSave(currentGame.id);
        }
        return false;
      }
      return persistSave(currentGame.id, state);
    } catch (e) {
      console.warn('GameRegistry.serializeCurrent: error serializing', currentGame.id, e);
      return false;
    }
  }

  // serialize: pass { serialize: false } to tear down without touching the
  // save store (used when init() failed mid-mount and the game cannot report
  // trustworthy state).
  function destroyCurrent(options) {
    if (!currentGame) return;
    if (options?.serialize !== false) {
      serializeCurrent();
    }
    try {
      currentGame.destroy();
    } catch (e) {
      console.warn('GameRegistry.destroyCurrent: error destroying', currentGame.id, e);
    }
    const container = document.getElementById('games-game-container');
    if (container) container.innerHTML = '';
    currentGame = null;
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
      serializeCurrent();
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

  function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('visibilitychange', onVisibilityChange);

    // A new tab replaces this page without ever closing the games modal, so
    // serialize the current game before the page unloads. pagehide fires on
    // both navigation and tab/window close; bfcache restores skip init()
    // because `initialized` is still true.
    window.addEventListener('pagehide', function () {
      serializeCurrent();
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
  }

  window.GameRegistry = {
    register: register,
    list: list,
    get: get,
    getStats: getStats,
    updateStats: updateStats,
    launch: launch,
    destroyCurrent: destroyCurrent,
    backToHub: backToHub,
    getCurrentGame: getCurrentGame,
    getMRU: getMRU,
    hasSave: hasSave,
    getSave: getSave,
    clearSave: clearSave,
    secureRandom: secureRandom,
    _reset: _reset
  };
})();
