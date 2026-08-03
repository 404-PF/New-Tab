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

  // ===================== Helpers =====================

  function t(key) {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
  }

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

  function canMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) return true;
        if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
        if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
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
      const reversed = col.toReversed();
      const slid = slideRow(reversed);
      const result = slid.toReversed();
      for (let r = 0; r < SIZE; r++) board[r][c] = result[r];
      if (result.join(',') !== before) changed = true;
    }
    return changed;
  }

  // ===================== Rendering =====================

  function render() {
    if (!boardEl) return;
    boardEl.innerHTML = '';

    const cellSize = 70;
    const gap = 8;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const val = board[r][c];
        const cell = document.createElement('div');
        cell.className = 'games-2048-cell';
        if (val > 0) {
          cell.classList.add('games-2048-cell-filled');
          const colorClass = getColorClass(val);
          cell.classList.add(colorClass);
          cell.textContent = val;
        }
        cell.style.width = cellSize + 'px';
        cell.style.height = cellSize + 'px';
        cell.style.left = (gap + c * (cellSize + gap)) + 'px';
        cell.style.top = (gap + r * (cellSize + gap)) + 'px';
        boardEl.appendChild(cell);
      }
    }

    if (scoreEl) {
      scoreEl.textContent = t('gamesScore') + ': ' + score;
    }

    if (gameOver) {
      const overlay = document.createElement('div');
      overlay.className = 'games-2048-overlay';
      overlay.innerHTML = '<div class="games-2048-overlay-text">' +
        (won ? (t('gamesYouWin') || 'You Win!') : (t('gamesGameOver') || 'Game Over')) +
        '</div><div class="games-2048-overlay-sub">' +
        (t('gamesPressSpace') || 'Press Space to restart') + '</div>';
      boardEl.appendChild(overlay);
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

  // ===================== Input =====================

  function afterMove(moved) {
    if (!moved) return;
    addRandomTile();
    render();
    if (hasWon() && !won) {
      won = true;
    }
    if (!canMove()) {
      gameOver = true;
      render();
    }
    if (won || gameOver) {
      saveStats();
    }
  }

  function handleKeydown(e) {
    if (gameOver) {
      if (e.code === 'Space') {
        e.preventDefault();
        resetGame();
      }
      return;
    }

    let moved;
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moved = moveLeft(); break;
      case 'ArrowRight': e.preventDefault(); moved = moveRight(); break;
      case 'ArrowUp': e.preventDefault(); moved = moveUp(); break;
      case 'ArrowDown': e.preventDefault(); moved = moveDown(); break;
      default: return;
    }

    afterMove(moved);
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
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 30) return;

    let moved;
    if (absDx > absDy) {
      moved = dx > 0 ? moveRight() : moveLeft();
    } else {
      moved = dy > 0 ? moveDown() : moveUp();
    }

    afterMove(moved);
  }

  // ===================== Stats =====================

  function saveStats() {
    if (window.GameRegistry) {
      const stats = window.GameRegistry.getStats('2048');
      const highScore = stats.highScore || 0;
      window.GameRegistry.updateStats('2048', {
        highScore: Math.max(highScore, score),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      });
    }
  }

  // ===================== Lifecycle =====================

  function resetGame() {
    board = createEmpty();
    score = 0;
    gameOver = false;
    won = false;
    addRandomTile();
    addRandomTile();
    render();
  }

  function init(containerEl) {
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

    const instructions = document.createElement('div');
    instructions.className = 'games-instructions';
    instructions.textContent = t('games2048Controls') || 'Arrow keys to merge tiles';
    container.appendChild(instructions);

    resetGame();

    document.addEventListener('keydown', handleKeydown);
    boardEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    boardEl.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  function destroy() {
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
    resume: resume
  });
})();
