// src/features/games/memory.js - Memory Match Game

(function () {
  'use strict';

  const EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔'];
  const PAIRS = 8;
  let cards = [];
  let flipped = [];
  let matched = 0;
  let moves = 0;
  let startTime = 0;
  let timerInterval = null;
  let gameOver = false;
  let pausedAt = 0;
  let container = null;
  let gridEl = null;
  let movesEl = null;
  let timeEl = null;
  let pendingTimeouts = [];
  let pendingResolve = null;
  let started = false;
  let readyScreen = null;

  // ===================== Helpers =====================

  const t = window.gamesHelpers?.t || function (key) { return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key; };

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(window.GameRegistry.secureRandom() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // ===================== Game Logic =====================

  function createCards() {
    const selected = EMOJIS.slice(0, PAIRS);
    const pairs = selected.concat(selected);
    shuffle(pairs);
    return pairs.map(function (emoji, idx) {
      return {
        id: idx,
        emoji: emoji,
        flipped: false,
        matched: false
      };
    });
  }

  function flipCard(cardId) {
    if (!started || gameOver) return;
    const card = cards[cardId];
    if (!card || card.flipped || card.matched) return;
    if (flipped.length >= 2) return;

    card.flipped = true;
    flipped.push(card);
    renderCard(cardId);

    if (flipped.length === 2) {
      moves++;
      if (movesEl) movesEl.textContent = t('gamesMoves') + ': ' + moves;
      checkMatch();
    }
  }

  function clearPendingTimeouts() {
    pendingTimeouts.forEach(function (id) { clearTimeout(id); });
    pendingTimeouts = [];
  }

  function checkMatch() {
    const a = flipped[0];
    const b = flipped[1];

    if (a.emoji === b.emoji) {
      a.matched = true;
      b.matched = true;
      matched++;
      flipped = [];
      pendingResolve = { a: a, b: b, match: true };

      pendingTimeouts.push(setTimeout(function () {
        if (gameOver) return;
        pendingResolve = null;
        renderCard(a.id);
        renderCard(b.id);
        if (matched === PAIRS) endGame();
      }, 200));
    } else {
      pendingResolve = { a: a, b: b, match: false };
      pendingTimeouts.push(setTimeout(function () {
        if (gameOver) return;
        pendingResolve = null;
        a.flipped = false;
        b.flipped = false;
        renderCard(a.id);
        renderCard(b.id);
        flipped = [];
      }, 800));
    }
  }

  function endGame() {
    gameOver = true;
    stopTimer();
    const time = getElapsed();
    saveStats(time);
    showWinOverlay(time);
  }

  function getElapsed() {
    return ((Date.now() - startTime) / 1000).toFixed(1);
  }

  function saveStats(time) {
    window.gamesHelpers?.updateStatsWith?.('memory', function (stats) {
      const bestMoves = stats.bestMoves || Infinity;
      const bestTime = stats.bestTime || Infinity;
      return {
        bestMoves: Math.min(bestMoves, moves),
        bestTime: Math.min(bestTime, Number.parseFloat(time)),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      };
    });
  }

  function showWinOverlay(time) {
    if (!gridEl) return;
    const statsHtml = (t('gamesMoves') || 'Moves') + ': ' + moves + ' | ' + (t('gamesTime') || 'Time') + ': ' + time + 's';
    window.gamesHelpers?.renderDOMOverlay?.(gridEl, {
      className: 'games-memory-overlay',
      text: (t('gamesYouWin') || 'You Win!'),
      statsHtml: statsHtml,
      sub: (t('gamesPressSpace') || 'Press Space to play again')
    });
  }

  // ===================== Timer =====================

  function startTicker() {
    stopTimer();
    timerInterval = setInterval(function () {
      if (timeEl) timeEl.textContent = t('gamesTime') + ': ' + getElapsed() + 's';
    }, 200);
  }

  function startTimer() {
    startTime = Date.now();
    startTicker();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ===================== Rendering =====================

  function renderCard(cardId) {
    const card = cards[cardId];
    if (!gridEl) return;
    const el = gridEl.querySelector('.games-memory-card[data-id="' + cardId + '"]');
    if (!el) return;

    if (card.matched) {
      el.classList.add('games-memory-card-matched');
      el.textContent = card.emoji;
    } else if (card.flipped) {
      el.classList.add('games-memory-card-flipped');
      el.textContent = card.emoji;
    } else {
      el.classList.remove('games-memory-card-flipped');
      el.textContent = '?';
    }
  }

  function renderAll() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    cards.forEach(function (card, idx) {
      const el = document.createElement('div');
      el.className = 'games-memory-card';
      el.dataset.id = idx;
      el.textContent = '?';
      el.addEventListener('click', function () { flipCard(idx); });
      gridEl.appendChild(el);
    });
  }

  // ===================== Input =====================

  function handleKeydown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }

    if (gameOver) {
      if (window.gamesHelpers && typeof window.gamesHelpers.handleRestartSpace === 'function') {
        window.gamesHelpers.handleRestartSpace(e, resetGame);
      } else if (e.code === 'Space') {
        e.preventDefault();
        resetGame();
      }
    }
  }

  // ===================== Lifecycle =====================

  // Build a fresh board without starting the clock. Used on init() so the game
  // can hold on the ready screen; resetGame() calls it and then starts the timer.
  function setupBoard() {
    clearPendingTimeouts();
    pendingResolve = null;
    stopTimer();
    pausedAt = 0;
    cards = createCards();
    flipped = [];
    matched = 0;
    moves = 0;
    gameOver = false;
    if (movesEl) movesEl.textContent = t('gamesMoves') + ': 0';
    if (timeEl) timeEl.textContent = t('gamesTime') + ': 0.0s';
    renderAll();
  }

  function resetGame() {
    setupBoard();
    startTimer();
  }

  function init(containerEl) {
    container = containerEl;

    // Stats bar
    const statsBar = document.createElement('div');
    statsBar.className = 'games-memory-stats';

    movesEl = document.createElement('span');
    movesEl.className = 'games-memory-moves';
    movesEl.textContent = t('gamesMoves') + ': 0';

    timeEl = document.createElement('span');
    timeEl.className = 'games-memory-time';
    timeEl.textContent = t('gamesTime') + ': 0.0s';

    statsBar.appendChild(movesEl);
    statsBar.appendChild(timeEl);
    container.appendChild(statsBar);

    // Grid
    gridEl = document.createElement('div');
    gridEl.className = 'games-memory-grid';
    container.appendChild(gridEl);

    // Instructions
    const instructions = document.createElement('div');
    instructions.className = 'games-instructions';
    instructions.textContent = t('gamesMemoryControls') || 'Flip cards to find matching pairs';
    container.appendChild(instructions);

    setupBoard();

    document.addEventListener('keydown', handleKeydown);

    // Hold play until the user signals they are ready.
    started = false;
    if (typeof window.gamesHelpers?.createReadyScreen === 'function') {
      readyScreen = window.gamesHelpers.createReadyScreen(gridEl, {
        text: t('gamesReady') || 'Ready?',
        sub: t('gamesReadyStart') || 'Press Space or tap to start',
        buttonText: t('gamesStart') || 'Start',
        onStart: function () {
          started = true;
          // A pause taken before Start must not leak a stale pausedAt into the
          // new run's elapsed-time math.
          pausedAt = 0;
          startTimer();
        }
      });
    } else {
      // No ready-screen helper available: start immediately so the game is
      // still playable instead of being stuck with started === false.
      started = true;
      pausedAt = 0;
      startTimer();
    }
  }

  function destroy() {
    if (readyScreen) {
      try {
        readyScreen.remove();
      } catch (e) {
        console.warn('memory.destroy: error removing ready screen', e);
      }
      readyScreen = null;
    }
    started = false;
    clearPendingTimeouts();
    pendingResolve = null;
    stopTimer();
    document.removeEventListener('keydown', handleKeydown);
    cards = [];
    flipped = [];
    if (container) container.innerHTML = '';
    container = null;
    gridEl = null;
    movesEl = null;
    timeEl = null;
  }

  function pause() {
    // A game that hasn't been started yet must stay on the ready screen.
    if (!started) return;
    pausedAt = Date.now();
    stopTimer();
    clearPendingTimeouts();
    // Finalize any pending pair resolution so the board stays consistent while hidden.
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      if (resolve.match) {
        renderCard(resolve.a.id);
        renderCard(resolve.b.id);
        if (matched === PAIRS) endGame();
      } else {
        resolve.a.flipped = false;
        resolve.b.flipped = false;
        renderCard(resolve.a.id);
        renderCard(resolve.b.id);
        flipped = [];
      }
    }
    // A lone revealed card stays flipped so resume preserves the current turn state.
  }

  function resume() {
    // A game that hasn't been started yet must stay on the ready screen.
    if (!started) return;
    if (!gameOver && startTime > 0 && pausedAt > 0) {
      const elapsed = pausedAt - startTime;
      startTime = Date.now() - elapsed;
      startTicker();
    }
  }

  window.GameRegistry?.register({
    id: 'memory',
    name: 'gamesMemory',
    description: 'gamesMemoryDesc',
    icon: '🃏',
    init: init,
    destroy: destroy,
    pause: pause,
    resume: resume
  });

  // Test hook: expose whether the game has been started so tests can assert it
  // holds on the ready screen until the player signals readiness. get/setPausedAt
  // let tests simulate a stale pausedAt surviving into the ready state so the
  // resume() guard can be pinned directly.
  window.__memoryReady = {
    isStarted: function () { return started; },
    getPausedAt: function () { return pausedAt; },
    setPausedAt: function (value) { pausedAt = value; }
  };
})();
