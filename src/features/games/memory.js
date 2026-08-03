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

  // ===================== Helpers =====================

  function t(key) {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // NOSONAR card shuffle
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
    if (gameOver) return;
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

      pendingTimeouts.push(setTimeout(function () {
        if (gameOver) return;
        renderCard(a.id);
        renderCard(b.id);
        if (matched === PAIRS) endGame();
      }, 200));
    } else {
      pendingTimeouts.push(setTimeout(function () {
        if (gameOver) return;
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
    if (window.GameRegistry) {
      const stats = window.GameRegistry.getStats('memory');
      const bestMoves = stats.bestMoves || Infinity;
      const bestTime = stats.bestTime || Infinity;
      window.GameRegistry.updateStats('memory', {
        bestMoves: Math.min(bestMoves, moves),
        bestTime: Math.min(bestTime, Number.parseFloat(time)),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      });
    }
  }

  function showWinOverlay(time) {
    if (!gridEl) return;
    const overlay = document.createElement('div');
    overlay.className = 'games-memory-overlay';
    overlay.innerHTML =
      '<div class="games-memory-overlay-text">' + (t('gamesYouWin') || 'You Win!') + '</div>' +
      '<div class="games-memory-overlay-stats">' +
        (t('gamesMoves') || 'Moves') + ': ' + moves + ' | ' +
        (t('gamesTime') || 'Time') + ': ' + time + 's' +
      '</div>' +
      '<div class="games-memory-overlay-sub">' +
        (t('gamesPressSpace') || 'Press Space to play again') +
      '</div>';
    gridEl.appendChild(overlay);
  }

  // ===================== Timer =====================

  function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(function () {
      if (timeEl) timeEl.textContent = t('gamesTime') + ': ' + getElapsed() + 's';
    }, 200);
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
    if (gameOver) {
      if (e.code === 'Space') {
        e.preventDefault();
        resetGame();
      }
    }
  }

  // ===================== Lifecycle =====================

  function resetGame() {
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

    resetGame();

    document.addEventListener('keydown', handleKeydown);
  }

  function destroy() {
    clearPendingTimeouts();
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
    pausedAt = Date.now();
    stopTimer();
  }

  function resume() {
    if (!gameOver && startTime > 0 && pausedAt > 0) {
      const elapsed = pausedAt - startTime;
      startTime = Date.now() - elapsed;
      startTimer();
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
})();
