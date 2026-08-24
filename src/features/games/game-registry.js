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

  // Persist a snapshot for a game that opted in via serialize(). Returns true
  // when a save was written.
  function persistSave(gameId, state) {
    if (!gameId || state === undefined || state === null) return false;
    const saves = loadSaves();
    saves[gameId] = { state: state, savedAt: Date.now() };
    saveSaves(saves);
    return true;
  }

  function getSave(gameId) {
    const saves = loadSaves();
    const entry = saves[gameId];
    return entry && typeof entry === 'object' ? entry : null;
  }

  function hasSave(gameId) {
    return getSave(gameId) !== null;
  }

  function clearSave(gameId) {
    const saves = loadSaves();
    if (!(gameId in saves)) return;
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

    container.innerHTML = '';
    try {
      game.init(container, savedState);
    } catch (e) {
      console.warn('GameRegistry.launch: error initializing', game.id, e);
      destroyCurrent();
      return false;
    }
    touchMRU(gameId);
    return true;
  }

  function serializeCurrent() {
    if (!currentGame || typeof currentGame.serialize !== 'function') return false;
    try {
      const state = currentGame.serialize();
      // A null snapshot means the run is not worth carrying over (never
      // started or already over): drop any stale save so the next launch
      // starts fresh.
      if (state === null || state === undefined) {
        clearSave(currentGame.id);
        return false;
      }
      return persistSave(currentGame.id, state);
    } catch (e) {
      console.warn('GameRegistry.serializeCurrent: error serializing', currentGame.id, e);
      return false;
    }
  }

  function destroyCurrent() {
    if (!currentGame) return;
    serializeCurrent();
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
