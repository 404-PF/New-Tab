// src/features/games/games-app.js - Games Hub Modal

(function () {
  'use strict';

  let initialized = false;

  // ===================== Lazy loader =====================

  // Heavy game modules are not part of the critical bootstrap path.
  // They are fetched on first interaction with the Games hub.
  const GAME_SCRIPTS = [
    'src/features/games/shared.js',
    'src/features/games/game-registry.js',
    'src/features/games/snake.js',
    'src/features/games/2048.js',
    'src/features/games/memory.js'
  ];

  let gamesLoadPromise = null;
  let gamesLoaded = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.body.appendChild(script);
    });
  }

  function ensureGamesLoaded() {
    if (gamesLoaded) return Promise.resolve();
    if (gamesLoadPromise) return gamesLoadPromise;
    if (window.GameRegistry && window.gamesHelpers) {
      gamesLoaded = true;
      return Promise.resolve();
    }
    // Load sequentially to preserve dependency order (shared -> registry -> games)
    // even when the browser optimizes parallel fetches.
    let chain = Promise.resolve();
    GAME_SCRIPTS.forEach(function (src) {
      chain = chain.then(function () { return loadScript(src); });
    });
    gamesLoadPromise = chain.then(function () {
      gamesLoaded = true;
    }).catch(function (err) {
      // Allow retry on next open() attempt
      gamesLoadPromise = null;
      throw err;
    });
    return gamesLoadPromise;
  }

  // ===================== Helpers =====================

  function t(key) {
    if (window.gamesHelpers && typeof window.gamesHelpers.t === 'function') {
      const v = window.gamesHelpers.t(key);
      if (v !== undefined) return v;
    }
    if (window.i18n && typeof window.i18n.t === 'function') {
      const v = window.i18n.t(key);
      if (v !== undefined && v !== key) return v;
    }
    return key;
  }

  function getModalElement() {
    return document.getElementById('games-app-modal');
  }

  function isEnabled() {
    return window.gamesHelpers && typeof window.gamesHelpers.isEnabled === 'function'
      ? window.gamesHelpers.isEnabled()
      : (function () {
          try { return localStorage.getItem('games_enabled') !== 'false'; } catch (_e) { return true; }
        })();
  }

  // ===================== Hub Rendering =====================

  function renderHub() {
    const container = document.getElementById('games-hub-content');
    if (!container) return;

    container.innerHTML = '';

    const games = window.GameRegistry ? window.GameRegistry.list() : [];

    if (games.length === 0) {
      container.innerHTML = '<div class="games-hub-empty"><p>' + t('gamesNoGames') + '</p></div>';
      return;
    }

    // Sort by MRU (source of truth lives in GameRegistry)
    const mru = window.GameRegistry && typeof window.GameRegistry.getMRU === 'function'
      ? window.GameRegistry.getMRU()
      : [];

    const sorted = games.slice().sort(function (a, b) {
      const ia = mru.indexOf(a.id);
      const ib = mru.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    const grid = document.createElement('div');
    grid.className = 'games-hub-grid';

    sorted.forEach(function (game) {
      const card = document.createElement('div');
      card.className = 'games-hub-card';

      const iconEl = document.createElement('div');
      iconEl.className = 'games-hub-card-icon';
      iconEl.textContent = game.icon || '🎮';

      const nameEl = document.createElement('div');
      nameEl.className = 'games-hub-card-name';
      nameEl.textContent = t(game.name) || game.name;

      const descEl = document.createElement('div');
      descEl.className = 'games-hub-card-desc';
      descEl.textContent = t(game.description) || game.description || '';

      // Stats summary
      const stats = window.GameRegistry.getStats(game.id);
      const statsEl = document.createElement('div');
      statsEl.className = 'games-hub-card-stats';
      if (stats.highScore !== undefined) {
        statsEl.textContent = t('gamesHighScore') + ': ' + stats.highScore;
      } else if (stats.bestMoves !== undefined) {
        statsEl.textContent = t('gamesBestMoves') + ': ' + stats.bestMoves;
      }

      const playBtn = document.createElement('button');
      playBtn.className = 'games-hub-card-play';
      // A game with a persisted snapshot offers to continue instead of play.
      const hasSavedGame = window.GameRegistry.hasSave(game.id);
      playBtn.textContent = t(hasSavedGame ? 'gamesContinue' : 'gamesPlay');
      if (hasSavedGame) {
        playBtn.classList.add('games-hub-card-play-continue');
      }
      playBtn.addEventListener('click', function () {
        launchGame(game.id);
      });

      card.appendChild(iconEl);
      card.appendChild(nameEl);
      card.appendChild(descEl);
      card.appendChild(statsEl);
      if (hasSavedGame) {
        const savedEl = document.createElement('div');
        savedEl.className = 'games-hub-card-saved';
        savedEl.textContent = t('gamesSaved');
        card.appendChild(savedEl);
      }
      card.appendChild(playBtn);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  function launchGame(gameId) {
    const container = document.getElementById('games-hub-content');
    if (!container) return;

    container.innerHTML = '';

    // Add back button
    const backRow = document.createElement('div');
    backRow.className = 'games-game-header';
    const backBtn = document.createElement('button');
    backBtn.className = 'games-back-btn';
    backBtn.textContent = '← ' + t('gamesBack');
    backBtn.addEventListener('click', function () {
      window.GameRegistry.backToHub();
    });
    backRow.appendChild(backBtn);
    container.appendChild(backRow);

    // Game container
    const gameContainer = document.createElement('div');
    gameContainer.id = 'games-game-container';
    container.appendChild(gameContainer);

    // Launch the game
    window.GameRegistry.launch(gameId);
  }

  // ===================== Open / Close =====================

  function renderLoading() {
    const container = document.getElementById('games-hub-content');
    if (!container) return;
    const txt = t('gamesLoading');
    const display = txt !== 'gamesLoading' ? txt : 'Loading games…';
    container.innerHTML = '<div class="games-hub-empty"><p>' + display + '</p></div>';
  }

  function renderLoadError(err) {
    const container = document.getElementById('games-hub-content');
    if (!container) return;
    const fallback = (function () { const v = t('gamesLoadError'); return v !== 'gamesLoadError' ? v : 'Failed to load games. Please try again.'; })();
    const msg = err && err.message ? err.message : fallback;
    container.innerHTML = '<div class="games-hub-empty"><p>' + msg + '</p></div>';
  }

  async function open() {
    const modal = getModalElement();
    if (!modal) return;

    if (!isEnabled()) {
      renderDisabled();
      if (!modal.open) modal.showModal();
      requestAnimationFrame(function () {
        modal.classList.add('modal-open');
      });
      return;
    }

    // Show modal immediately with a loading placeholder while game scripts fetch
    if (!modal.open) modal.showModal();
    requestAnimationFrame(function () {
      modal.classList.add('modal-open');
    });
    renderLoading();

    try {
      await ensureGamesLoaded();
    } catch (err) {
      console.error('[GamesApp] Failed to lazy-load game scripts:', err);
      renderLoadError(err);
      return;
    }

    if (window.GameRegistry) {
      window.GameRegistry.destroyCurrent();
    }
    renderHub();
  }

  function close() {
    const modal = getModalElement();
    if (!modal) return;
    modal.classList.remove('modal-open');
    if (modal.open) {
      modal.close();
    }
    // Destroy any running game
    if (window.GameRegistry) {
      window.GameRegistry.destroyCurrent();
    }
  }

  function showHub() {
    renderHub();
  }

  function renderDisabled() {
    const container = document.getElementById('games-hub-content');
    if (!container) return;
    container.innerHTML = '<div class="games-app-disabled"><p>' + t('gamesDisabled') + '</p></div>';
  }

  // ===================== Init =====================

  function setupListeners() {
    const modal = getModalElement();
    if (!modal || modal._gamesListenersAttached) return;
    modal._gamesListenersAttached = true;

    // Click overlay to close
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) {
        close();
      }
    });

    // Escape key to close
    modal.addEventListener('cancel', function (ev) {
      ev.preventDefault();
      close();
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    setupListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.GamesApp = {
    init: init,
    open: open,
    close: close,
    showHub: showHub,
    ensureGamesLoaded: ensureGamesLoaded,
    preload: ensureGamesLoaded
  };
})();
