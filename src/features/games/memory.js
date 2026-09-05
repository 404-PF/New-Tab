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
      const resolve = { a: a, b: b, match: true };
      pendingResolve = resolve;

      pendingTimeouts.push(setTimeout(function () {
        if (gameOver) return;
        if (pendingResolve !== resolve) return;
        pendingResolve = null;
        renderCard(a.id);
        renderCard(b.id);
        if (matched === PAIRS) endGame();
      }, 200));
    } else {
      const resolve = { a: a, b: b, match: false };
      pendingResolve = resolve;
      pendingTimeouts.push(setTimeout(function () {
        if (gameOver) return;
        if (pendingResolve !== resolve) return;
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
    // The run reached its terminal state: drop any persisted snapshot so the
    // next launch starts fresh instead of resuming a finished board.
    window.GameRegistry?.clearSave('memory');
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

  // ===================== Save / Restore (#646) =====================

  // Shape and per-card invariants for one entry of a saved deck.
  function isValidSavedCard(c, idx) {
    const ok = c && typeof c === 'object' &&
      typeof c.emoji === 'string' && EMOJIS.includes(c.emoji) &&
      typeof c.matched === 'boolean' && (c.flipped === undefined || typeof c.flipped === 'boolean');
    if (!ok) return false;
    // ids are positional; a mismatched id would desync flipCard(cardId)
    return c.id === undefined || c.id === idx;
  }

  function isValidSavedCards(value) {
    if (!Array.isArray(value) || value.length !== PAIRS * 2) return false;
    // Every emoji must occur exactly twice; both cards of a pair must agree
    // on matched, a matched card is never left face up, and at most one
    // unmatched card may be face up mid-turn.
    if (!value.every(function (c, idx) { return isValidSavedCard(c, idx); })) return false;
    if (value.some(function (c) { return c.matched && c.flipped === true; })) return false;

    let loneReveals = 0;
    let matchedTotal = 0;
    const seen = Object.create(null);
    const seenMatched = Object.create(null);
    value.forEach(function (c) {
      seen[c.emoji] = (seen[c.emoji] || 0) + 1;
      seenMatched[c.emoji] = (seenMatched[c.emoji] || 0) + (c.matched ? 1 : 0);
      if (c.matched) matchedTotal++;
      if (c.flipped === true && !c.matched) loneReveals++;
    });

    const pairFlagsConsistent = EMOJIS.slice(0, PAIRS).every(function (emoji) {
      return seen[emoji] % 2 === 0 && seenMatched[emoji] % 2 === 0;
    });
    // A fully matched board is terminal and is never saved.
    return pairFlagsConsistent && matchedTotal < PAIRS * 2 && loneReveals <= 1;
  }

  // Snapshot the live run, or null when there is nothing to report right now
  // (pre-start). Terminal runs and restores rejected as corrupt clear their
  // save directly via GameRegistry.clearSave, so no third return value is
  // needed here.
  function serialize() {
    if (!started || startTime <= 0) return null;
    // Settle a pair whose reveal timeout hasn't fired yet so the snapshot is
    // never taken mid-resolution.
    finalizePendingPair();
    if (gameOver) return null;
    // While paused the ticker is stopped and pausedAt marks the freeze point,
    // so measuring from Date.now() would silently add the hidden interval to
    // the saved elapsed time. resume() clears pausedAt, so a positive value
    // here always means the timer is genuinely stopped.
    const nowMs = pausedAt > 0 ? pausedAt : Date.now();
    return {
      cards: cards.map(function (card) {
        // Matched cards are stored face down so the validator's invariants
        // hold and restore re-applies their matched styling instead.
        return { emoji: card.emoji, flipped: card.matched ? false : card.flipped, matched: card.matched };
      }),
      moves: moves,
      elapsedMs: Math.max(0, nowMs - startTime)
    };
  }

  // Returns true when savedState was applied. Runs before the ready screen so
  // a resumed run picks up where the previous session left off. The clock is
  // restarted from the saved elapsed offset rather than the wall time at which
  // the previous session ended.
  function applyRestoredState(savedState) {
    if (!savedState || typeof savedState !== 'object') return false;
    if (!isValidSavedCards(savedState.cards)) return false;
    if (typeof savedState.moves !== 'number' || !Number.isInteger(savedState.moves) || savedState.moves < 0) return false;
    if (typeof savedState.elapsedMs !== 'number' || !Number.isFinite(savedState.elapsedMs) || savedState.elapsedMs < 0) return false;

    cards = savedState.cards.map(function (card, idx) {
      return {
        id: idx,
        emoji: card.emoji,
        flipped: card.flipped === true,
        matched: card.matched === true
      };
    });
    flipped = [];
    cards.forEach(function (card) {
      if (card.flipped && !card.matched) flipped.push(card);
    });
    // `matched` counts completed pairs, not cards (endGame triggers at PAIRS).
    matched = Math.floor(cards.filter(function (card) { return card.matched; }).length / 2);
    moves = savedState.moves;
    gameOver = false;

    startTime = Date.now() - Math.floor(savedState.elapsedMs);
    pausedAt = 0;
    startTicker();
    if (timeEl) timeEl.textContent = t('gamesTime') + ': ' + getElapsed() + 's';
    if (movesEl) movesEl.textContent = t('gamesMoves') + ': ' + moves;
    renderAll();
    // Re-apply persisted face-up states on top of the fresh face-down grid.
    cards.forEach(function (card) {
      if (card.matched || card.flipped) renderCard(card.id);
    });
    return true;
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

  function init(containerEl, savedState) {
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

    document.addEventListener('keydown', handleKeydown);

    // A restored run was already started in a previous session, so it skips
    // the ready screen and is playable immediately.
    const restored = applyRestoredState(savedState);
    if (restored) {
      started = true;
      return;
    }
    if (savedState !== undefined && savedState !== null) {
      // The handed-down snapshot failed validation: discard that stale save
      // now rather than keeping or re-saving it at teardown.
      window.GameRegistry?.clearSave('memory');
    }

    setupBoard();

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

  // Settle a pair whose reveal timeout hasn't fired yet so the board is
  // consistent for serialization or while hidden. Shared by pause() and
  // serialize(). Also handles the orphaned-pair softlock (#632) where an
  // earlier timeout cleared pendingResolve before the later pair resolved.
  function finalizePendingPair() {
    clearPendingTimeouts();
    if (!pendingResolve) {
      // Defensive fallback: if two non-matched cards are stuck face-up with no
      // pendingResolve (orphaned by an earlier timeout), finalize directly
      // from the flipped array so pause() always leaves flipped.length < 2.
      if (flipped.length === 2) {
        const fa = flipped[0];
        const fb = flipped[1];
        if (!fa.matched && !fb.matched) {
          if (fa.emoji === fb.emoji) {
            fa.matched = true;
            fb.matched = true;
            matched++;
            renderCard(fa.id);
            renderCard(fb.id);
            flipped = [];
            if (matched === PAIRS) endGame();
          } else {
            fa.flipped = false;
            fb.flipped = false;
            renderCard(fa.id);
            renderCard(fb.id);
            flipped = [];
          }
        }
      }
      return;
    }
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

  function pause() {
    // A game that hasn't been started yet must stay on the ready screen.
    if (!started) return;
    pausedAt = Date.now();
    stopTimer();
    finalizePendingPair();
    // A lone revealed card stays flipped so resume preserves the current turn state.
  }

  function resume() {
    // A game that hasn't been started yet must stay on the ready screen.
    if (!started) return;
    if (!gameOver && startTime > 0 && pausedAt > 0) {
      const elapsed = pausedAt - startTime;
      startTime = Date.now() - elapsed;
      // The run is live again: a positive pausedAt from here on would make
      // serialize() stamp the snapshot at the old pause point and lose the
      // post-resume interval.
      pausedAt = 0;
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
    resume: resume,
    serialize: serialize
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
