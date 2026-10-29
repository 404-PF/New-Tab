// src/features/games/2048.js - 2048 Game

(function () {
  'use strict';

  const SIZE = 4;
  let board = [];
  let score = 0;
  let gameOver = false;
  let won = false;
  let container = null;
  let boardEl = null;
  let scoreEl = null;
  let started = false;
  let readyScreen = null;
  let tiles = null;
  // Rapid keys are buffered here and drained one per animation frame so the
  // board renders at most once per frame (#876).
  const MAX_QUEUED_MOVES = 4;
  let queuedMoves = [];
  let moveFrame = null;

  // ===================== Helpers =====================

  const t = window.gamesHelpers?.t || function (key) { return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : undefined; };

  // ===================== Board Logic =====================

  function createEmpty() {
    const b = [];
    for (let r = 0; r < SIZE; r++) {
      b[r] = [];
      for (let c = 0; c < SIZE; c++) {
        b[r][c] = 0;
      }
    }
    return b;
  }

  function emptyCells() {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) cells.push({ r: r, c: c });
      }
    }
    return cells;
  }

  function addRandomTile() {
    const empty = emptyCells();
    if (empty.length === 0) return;
    const cell = empty[Math.floor(window.GameRegistry.secureRandom() * empty.length)];
    board[cell.r][cell.c] = window.GameRegistry.secureRandom() < 0.9 ? 2 : 4;
  }

  function canMove(targetBoard) {
    const b = targetBoard || board;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c] === 0) return true;
        if (c < SIZE - 1 && b[r][c] === b[r][c + 1]) return true;
        if (r < SIZE - 1 && b[r][c] === b[r + 1][c]) return true;
      }
    }
    return false;
  }

  function hasWon() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 2048) return true;
      }
    }
    return false;
  }

  // ===================== Move Logic =====================

  function slideRow(row) {
    const filtered = row.filter(function (v) { return v !== 0; });
    const merged = [];
    let i = 0;
    while (i < filtered.length) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        merged.push(filtered[i] * 2);
        score += filtered[i] * 2;
        i += 2;
      } else {
        merged.push(filtered[i]);
        i++;
      }
    }
    while (merged.length < SIZE) merged.push(0);
    return merged;
  }

  function moveLeft() {
    let changed = false;
    for (let r = 0; r < SIZE; r++) {
      const before = board[r].slice();
      board[r] = slideRow(board[r]);
      if (board[r].join(',') !== before.join(',')) changed = true;
    }
    return changed;
  }

  function moveRight() {
    let changed = false;
    for (let r = 0; r < SIZE; r++) {
      const before = board[r].slice();
      board[r] = slideRow(board[r].slice().reverse()).reverse();
      if (board[r].join(',') !== before.join(',')) changed = true;
    }
    return changed;
  }

  function moveUp() {
    let changed = false;
    for (let c = 0; c < SIZE; c++) {
      let col = [];
      for (let r = 0; r < SIZE; r++) col.push(board[r][c]);
      const before = col.join(',');
      col = slideRow(col);
      for (let r = 0; r < SIZE; r++) board[r][c] = col[r];
      if (col.join(',') !== before) changed = true;
    }
    return changed;
  }

  function moveDown() {
    let changed = false;
    for (let c = 0; c < SIZE; c++) {
      let col = [];
      for (let r = 0; r < SIZE; r++) col.push(board[r][c]);
      const before = col.join(',');
      const reversed = col.slice().reverse();
      const slid = slideRow(reversed);
      const result = slid.slice().reverse();
      for (let r = 0; r < SIZE; r++) board[r][c] = result[r];
      if (result.join(',') !== before) changed = true;
    }
    return changed;
  }

  // ===================== Rendering =====================

  function render() {
    if (!boardEl) return;

    if (tiles) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const idx = r * SIZE + c;
          const val = board[r][c];
          const cell = tiles[idx];
          cell.className = 'games-2048-cell';
          cell.textContent = '';
          if (val > 0) {
            cell.classList.add('games-2048-cell-filled', getColorClass(val));
            cell.textContent = val;
          }
        }
      }
    }

    if (scoreEl) {
      scoreEl.textContent = (t('gamesScore') || 'Score') + ': ' + score;
    }

    if (gameOver) {
      window.gamesHelpers?.renderDOMOverlay?.(boardEl, {
        className: 'games-2048-overlay',
        text: won ? (t('gamesYouWin') || 'You Win!') : (t('gamesGameOver') || 'Game Over'),
        sub: (t('gamesPressSpace') || 'Press Space to restart')
      });
    } else if (boardEl) {
      const prev = boardEl.querySelector('.games-2048-overlay');
      if (prev) prev.remove();
    }
  }

  function getColorClass(val) {
    const colors = {
      2: 'games-2048-tile-2',
      4: 'games-2048-tile-4',
      8: 'games-2048-tile-8',
      16: 'games-2048-tile-16',
      32: 'games-2048-tile-32',
      64: 'games-2048-tile-64',
      128: 'games-2048-tile-128',
      256: 'games-2048-tile-256',
      512: 'games-2048-tile-512',
      1024: 'games-2048-tile-1024',
      2048: 'games-2048-tile-2048'
    };
    return colors[val] || 'games-2048-tile-super';
  }

  // ===================== Save / Restore (#646) =====================

  function isValidTileValue(v) {
    if (v === 0) return true;
    // Powers of two only. Avoid bitwise checks: they coerce to 32 bits and
    // would accept values like 4294967297.
    return typeof v === 'number' && Number.isInteger(v) && v >= 2 &&
      v <= 4503599627370496 && Math.log2(v) % 1 === 0;
  }

  function isValidSavedBoard(value) {
    return Array.isArray(value) && value.length === SIZE && value.every(function (row) {
      return Array.isArray(row) && row.length === SIZE && row.every(isValidTileValue);
    });
  }

  function boardHasWonTile(value) {
    return value.some(function (row) { return row.includes(2048); });
  }

  // Snapshot the live run, or null when there is nothing to report right now
  // (pre-start). Terminal runs and restores rejected as corrupt clear their
  // save directly via GameRegistry.clearSave, so no third return value is
  // needed here.
  function serialize() {
    if (!started || gameOver) return null;
    // Apply keys still buffered for the next animation frame so the saved
    // run reflects every move the player already made (#876).
    flushQueuedMoves();
    // A drained move can end the run; a terminal board must not be saved.
    if (gameOver) return null;
    return {
      board: board.map(function (row) { return row.slice(); }),
      score: score,
      won: won
    };
  }

  // Returns true when savedState was applied. Runs before any ready screen so
  // a resumed run picks up where the previous session left off.
  function applyRestoredState(savedState) {
    if (!savedState || typeof savedState !== 'object') return false;
    if (!isValidSavedBoard(savedState.board)) return false;
    if (typeof savedState.score !== 'number' || !Number.isSafeInteger(savedState.score) || savedState.score < 0) return false;
    // A won board is terminal: it can never appear in a legitimate snapshot
    // (the win path ends the run), so treat the flag as corruption rather
    // than trusting it.
    if (savedState.won !== false) return false;
    // Reaching 2048 ends the run, so a live board can never contain a 2048
    // tile either — reject it even when the flag lies.
    if (boardHasWonTile(savedState.board)) return false;
    // A live snapshot must have a legal move; a full dead board would strand
    // the player with no overlay and no way to restart (Space only works
    // when gameOver is true).
    if (!canMove(savedState.board)) return false;

    board = savedState.board.map(function (row) { return row.slice(); });
    score = savedState.score;
    won = false;
    gameOver = false;
    return true;
  }

  // ===================== Input =====================

  function afterMove(moved) {
    if (!moved) return;
    addRandomTile();
    render();
    let shouldSave = false;
    if (hasWon() && !won) {
      won = true;
      gameOver = true;
      shouldSave = true;
    }
    if (!canMove() && !gameOver) {
      gameOver = true;
      shouldSave = true;
    }
    if (shouldSave) {
      render();
      saveStats();
      // The run reached a terminal state: drop any persisted snapshot so the
      // next launch starts fresh instead of resuming a dead board.
      void window.GameRegistry?.clearSave('2048');
    }
  }

  // The keydown handler only buffers a direction; a requestAnimationFrame
  // callback drains one buffered move, so hammering arrows can no longer
  // queue several DOM updates inside a single frame (#876).
  function cancelMoveFrame() {
    if (moveFrame === null) return;
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(moveFrame);
    }
    moveFrame = null;
  }

  function clearQueuedMoves() {
    queuedMoves = [];
    cancelMoveFrame();
  }

  function queueMove(dir) {
    if (!dir || queuedMoves.length >= MAX_QUEUED_MOVES) return;
    queuedMoves.push(dir);
    if (moveFrame === null) {
      moveFrame = window.requestAnimationFrame(applyQueuedMove);
    }
  }

  function applyMove(dir) {
    let moved;
    if (dir === 'left') moved = moveLeft();
    else if (dir === 'right') moved = moveRight();
    else if (dir === 'up') moved = moveUp();
    else moved = moveDown();
    afterMove(moved);
  }

  function applyQueuedMove() {
    moveFrame = null;
    const dir = queuedMoves.shift();
    if (!dir || !started || gameOver) {
      queuedMoves = [];
      return;
    }
    applyMove(dir);
    if (!gameOver && queuedMoves.length > 0) {
      moveFrame = window.requestAnimationFrame(applyQueuedMove);
    }
  }

  // Drain the buffer synchronously so a snapshot taken on a visibilitychange
  // or pagehide serialization cannot drop a key whose animation frame has
  // not run yet (#876). applyMove() can end the run through afterMove(), so
  // gameOver is re-checked inside the loop before each drained move.
  function flushQueuedMoves() {
    cancelMoveFrame();
    while (queuedMoves.length > 0) {
      if (gameOver) return;
      applyMove(queuedMoves.shift());
    }
  }

  // The shared key helpers in shared.js always load before this game (the
  // Games hub loader and the tests both load them first, the assumption
  // Pac-Man already makes), so the handler calls them directly (#876).
  function handleKeydown(e) {
    if (!window.gamesHelpers.beginGameKeydown(e)) return;

    // Ignore all moves until the player has started the game.
    if (!started) return;

    if (gameOver) {
      window.gamesHelpers.handleRestartSpace(e, resetGame);
      return;
    }

    const dir = window.gamesHelpers.parseDirection(e);
    if (!dir) return;

    e.preventDefault();
    queueMove(dir);
  }

  // ===================== Touch =====================

  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }

  function handleTouchEnd(e) {
    if (gameOver) {
      if (e.changedTouches && e.changedTouches.length > 0) resetGame();
      return;
    }
    if (!started) return;
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 30) return;

    if (absDx > absDy) {
      queueMove(dx > 0 ? 'right' : 'left');
    } else {
      queueMove(dy > 0 ? 'down' : 'up');
    }
  }

  // ===================== Stats =====================

  function saveStats() {
    // Snapshot run values now: the updater may run later, after a reset.
    const finalScore = score;
    window.gamesHelpers?.updateStatsWith?.('2048', function (stats) {
      const highScore = stats.highScore || 0;
      return {
        highScore: Math.max(highScore, finalScore),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      };
    });
  }

  // ===================== Lifecycle =====================

  function resetGame() {
    clearQueuedMoves();
    board = createEmpty();
    score = 0;
    gameOver = false;
    won = false;
    addRandomTile();
    addRandomTile();
    render();
  }

  function init(containerEl, savedState) {
    container = containerEl;

    scoreEl = document.createElement('div');
    scoreEl.className = 'games-score-display';
    scoreEl.textContent = t('gamesScore') + ': 0';
    container.appendChild(scoreEl);

    boardEl = document.createElement('div');
    boardEl.className = 'games-2048-board';
    boardEl.style.position = 'relative';
    const boardSize = SIZE * 70 + (SIZE + 1) * 8;
    boardEl.style.width = boardSize + 'px';
    boardEl.style.height = boardSize + 'px';
    container.appendChild(boardEl);

    const cellSize = 70;
    const gap = 8;
    tiles = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'games-2048-cell';
        cell.style.width = cellSize + 'px';
        cell.style.height = cellSize + 'px';
        cell.style.left = (gap + c * (cellSize + gap)) + 'px';
        cell.style.top = (gap + r * (cellSize + gap)) + 'px';
        boardEl.appendChild(cell);
        tiles.push(cell);
      }
    }

    const instructions = document.createElement('div');
    instructions.className = 'games-instructions';
    instructions.textContent = t('games2048Controls') || 'Arrow keys or WASD to merge tiles';
    container.appendChild(instructions);

    // A restored run was already started in a previous session, so it skips
    // the ready screen and is playable immediately.
    const restored = applyRestoredState(savedState);
    if (restored) {
      started = true;
      render();
    } else {
      resetGame();
      started = false;
    }
    if (!restored && savedState !== undefined && savedState !== null) {
      // The handed-down snapshot failed validation: discard that stale save
      // now rather than keeping or re-saving it at teardown.
      void window.GameRegistry?.clearSave('2048');
    }

    document.addEventListener('keydown', handleKeydown);
    boardEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    boardEl.addEventListener('touchend', handleTouchEnd, { passive: true });

    // A fresh run holds on the ready screen until the player signals they are
    // ready; a restored run skips it and is playable immediately.
    if (restored) return;

    started = false;
    if (typeof window.gamesHelpers?.createReadyScreen === 'function') {
      readyScreen = window.gamesHelpers.createReadyScreen(boardEl, {
        text: t('gamesReady') || 'Ready?',
        sub: t('gamesReadyStart') || 'Press Space or tap to start',
        buttonText: t('gamesStart') || 'Start',
        onStart: function () {
          started = true;
        }
      });
    } else {
      // No ready-screen helper available: start immediately so the game is
      // still playable instead of being stuck with started === false.
      started = true;
    }
  }

  function destroy() {
    if (readyScreen) {
      try {
        readyScreen.remove();
      } catch (e) {
        console.warn('2048.destroy: error removing ready screen', e);
      }
      readyScreen = null;
    }
    started = false;
    clearQueuedMoves();
    document.removeEventListener('keydown', handleKeydown);
    if (boardEl) {
      boardEl.removeEventListener('touchstart', handleTouchStart);
      boardEl.removeEventListener('touchend', handleTouchEnd);
    }
    board = [];
    if (container) container.innerHTML = '';
    container = null;
    boardEl = null;
    scoreEl = null;
    tiles = null;
  }

  function pause() { /* 2048 is turn-based, no timer to pause */ }

  function resume() { /* 2048 is turn-based, no timer to resume */ }

  window.GameRegistry?.register({
    id: '2048',
    name: 'games2048',
    description: 'games2048Desc',
    icon: '🔢',
    init: init,
    destroy: destroy,
    pause: pause,
    resume: resume,
    serialize: serialize
  });

  // Test hook: expose whether the game has been started so tests can assert it
  // holds on the ready screen until the player signals readiness.
  window.__game2048Ready = {
    isStarted: function () { return started; }
  };
})();
