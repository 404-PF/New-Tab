// src/features/games/snake.js - Snake Game

(function () {
  'use strict';

  const GRID_SIZE = 20;
  const CELL_SIZE = 15;
  const TICK_MS = 120;

  let canvas = null;
  let ctx = null;
  let snake = [];
  let food = null;
  let direction = 'right';
  let nextDirection = 'right';
  let score = 0;
  let gameOver = false;
  let paused = false;
  let manualPause = false;
  let tickTimer = null;
  let container = null;
  let scoreEl = null;

  // ===================== Helpers =====================

  function t(key) {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
  }

  function randomInt(min, max) {
    return Math.floor(window.GameRegistry.secureRandom() * (max - min + 1)) + min;
  }

  // ===================== Game Logic =====================

  function initSnake() {
    const midX = Math.floor(GRID_SIZE / 2);
    const midY = Math.floor(GRID_SIZE / 2);
    snake = [
      { x: midX, y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY }
    ];
    direction = 'right';
    nextDirection = 'right';
    score = 0;
    gameOver = false;
    paused = false;
    spawnFood();
  }

  function spawnFood() {
    const empty = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const occupied = snake.some(function (s) { return s.x === x && s.y === y; });
        if (!occupied) empty.push({ x: x, y: y });
      }
    }
    if (empty.length === 0) {
      gameOver = true;
      return;
    }
    food = empty[randomInt(0, empty.length - 1)];
  }

  function tick() {
    if (paused || gameOver) return;

    direction = nextDirection;
    const head = { ...snake[0] };

    if (direction === 'right') head.x++;
    else if (direction === 'left') head.x--;
    else if (direction === 'up') head.y--;
    else if (direction === 'down') head.y++;

    // Wall collision
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      endGame();
      return;
    }

    // Self collision
    for (const seg of snake) {
      if (seg.x === head.x && seg.y === head.y) {
        endGame();
        return;
      }
    }

    snake.unshift(head);

    // Eat food
    if (food && head.x === food.x && head.y === food.y) {
      score += 10;
      if (scoreEl) scoreEl.textContent = t('gamesScore') + ': ' + score;
      spawnFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function endGame() {
    gameOver = true;
    stopTick();
    // Save stats
    if (window.GameRegistry) {
      const stats = window.GameRegistry.getStats('snake');
      const highScore = stats.highScore || 0;
      window.GameRegistry.updateStats('snake', {
        highScore: Math.max(highScore, score),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      });
    }
    draw();
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(tick, TICK_MS);
  }

  // ===================== Drawing =====================

  function draw() {
    if (!ctx) return;
    const w = GRID_SIZE * CELL_SIZE;
    const h = GRID_SIZE * CELL_SIZE;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Grid lines (subtle)
    ctx.strokeStyle = '#2d2d44';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(w, i * CELL_SIZE);
      ctx.stroke();
    }

    // Food
    if (food) {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Snake
    snake.forEach(function (seg, idx) {
      const brightness = 1 - (idx / snake.length) * 0.5;
      ctx.fillStyle = idx === 0
        ? '#4ecdc4'
        : 'rgba(78, 205, 196, ' + brightness + ')';
      ctx.fillRect(
        seg.x * CELL_SIZE + 1,
        seg.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
      if (idx === 0) {
        ctx.strokeStyle = '#2d8a83';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          seg.x * CELL_SIZE + 1,
          seg.y * CELL_SIZE + 1,
          CELL_SIZE - 2,
          CELL_SIZE - 2
        );
      }
    });

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('gamesGameOver') || 'Game Over', w / 2, h / 2 - 10);
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText((t('gamesScore') || 'Score') + ': ' + score, w / 2, h / 2 + 20);
      ctx.fillText(t('gamesPressSpace') || 'Press Space to restart', w / 2, h / 2 + 50);
    }

    // Paused overlay
    if (paused && !gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e0e0e0';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('gamesPaused') || 'Paused', w / 2, h / 2);
    }
  }

  // ===================== Input =====================

  function handleKeydown(e) {
    if (gameOver) {
      if (e.code === 'Space') {
        e.preventDefault();
        initSnake();
        draw();
        startTick();
      }
      return;
    }

    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
      manualPause = paused;
      if (paused) stopTick(); else startTick();
      draw();
      return;
    }

    const keyMap = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };
    const newDir = keyMap[e.key] || keyMap[e.code];
    if (!newDir) return;

    e.preventDefault();
    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[newDir] !== direction) {
      nextDirection = newDir;
    }
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
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 20) return;

    let newDir;
    if (absDx > absDy) {
      newDir = dx > 0 ? 'right' : 'left';
    } else {
      newDir = dy > 0 ? 'down' : 'up';
    }

    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[newDir] !== direction) {
      nextDirection = newDir;
    }
  }

  // ===================== Lifecycle =====================

  function init(containerEl) {
    container = containerEl;

    // Score display
    scoreEl = document.createElement('div');
    scoreEl.className = 'games-score-display';
    scoreEl.textContent = t('gamesScore') + ': 0';
    container.appendChild(scoreEl);

    // Canvas
    canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE * CELL_SIZE;
    canvas.height = GRID_SIZE * CELL_SIZE;
    canvas.className = 'games-snake-canvas';
    ctx = canvas.getContext('2d');
    container.appendChild(canvas);

    // Instructions
    const instructions = document.createElement('div');
    instructions.className = 'games-instructions';
    instructions.textContent = t('gamesSnakeControls') || 'Arrow keys or WASD to move, Space to pause';
    container.appendChild(instructions);

    initSnake();
    draw();
    startTick();

    document.addEventListener('keydown', handleKeydown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  function destroy() {
    stopTick();
    document.removeEventListener('keydown', handleKeydown);
    if (canvas) {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
    }
    canvas = null;
    ctx = null;
    if (container) container.innerHTML = '';
    container = null;
    scoreEl = null;
  }

  function pause() {
    if (!paused) manualPause = false;
    paused = true;
    stopTick();
    draw();
  }

  function resume() {
    if (!gameOver && !manualPause) {
      paused = false;
      startTick();
      draw();
    }
  }

  window.GameRegistry?.register({
    id: 'snake',
    name: 'gamesSnake',
    description: 'gamesSnakeDesc',
    icon: '🐍',
    init: init,
    destroy: destroy,
    pause: pause,
    resume: resume
  });
})();
