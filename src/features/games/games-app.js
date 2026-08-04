// src/features/games/games-app.js - Games Hub Modal

(function () {
  'use strict';

  let initialized = false;

  // ===================== Helpers =====================

  const t = window.gamesHelpers?.t || function (key) { return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key; };

  function getModalElement() {
    return document.getElementById('games-app-modal');
  }

  function isEnabled() {
    return window.gamesHelpers && typeof window.gamesHelpers.isEnabled === 'function'
      ? window.gamesHelpers.isEnabled()
      : true;
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

    // Sort by MRU
    let mru = [];
    try {
      const parsedMru = JSON.parse(localStorage.getItem('games_recently_played') || '[]');
      if (Array.isArray(parsedMru)) {
        mru = parsedMru;
      } else {
        console.warn('Invalid games_recently_played value, expected an array');
      }
    } catch (err) {
      console.warn('Invalid games_recently_played value, using empty list:', err.message);
    }

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
      playBtn.textContent = t('gamesPlay');
      playBtn.addEventListener('click', function () {
        launchGame(game.id);
      });

      card.appendChild(iconEl);
      card.appendChild(nameEl);
      card.appendChild(descEl);
      card.appendChild(statsEl);
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

  function open() {
    const modal = getModalElement();
    if (!modal) return;

    if (!isEnabled()) {
      renderDisabled();
      modal.showModal();
      requestAnimationFrame(() => {
        modal.classList.add('modal-open');
      });
      return;
    }

    if (window.GameRegistry) {
      window.GameRegistry.destroyCurrent();
    }
    renderHub();
    modal.showModal();
    requestAnimationFrame(() => {
      modal.classList.add('modal-open');
    });
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
    showHub: showHub
  };
})();
