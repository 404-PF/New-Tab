// src/features/games/game-registry.js - Game Registry & Lifecycle Manager

(function () {
  'use strict';

  const STATS_KEY = 'games_stats';
  const MRU_KEY = 'games_recently_played';
  const MAX_MRU = 20;

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

  // ===================== Crypto-safe Random =====================

  function secureRandom() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / (0xFFFFFFFF + 1);
  }

  // ===================== Public API =====================

  function register(gameDef) {
    if (!gameDef?.id || !gameDef.name || typeof gameDef.init !== 'function' || typeof gameDef.destroy !== 'function') {
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

    container.innerHTML = '';
    try {
      game.init(container);
    } catch (e) {
      console.warn('GameRegistry.launch: error initializing', game.id, e);
      destroyCurrent();
      return false;
    }
    touchMRU(gameId);
    return true;
  }

  function destroyCurrent() {
    if (!currentGame) return;
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

  // ===================== Visibility Handling =====================

  function onVisibilityChange() {
    if (!currentGame) return;
    if (document.hidden) {
      if (typeof currentGame.pause === 'function') {
        currentGame.pause();
      }
    } else if (typeof currentGame.resume === 'function') {
      currentGame.resume();
    }
  }

  // ===================== Init =====================

  function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
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
    secureRandom: secureRandom,
    _reset: _reset
  };
})();
