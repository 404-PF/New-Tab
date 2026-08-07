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
  let prevSnake = null;
  let lastTickAt = 0;
  let animFrame = null;
  let particles = [];
  let shakeUntil = 0;

  // ===================== Helpers =====================

  const t = window.gamesHelpers?.t || function (key) { return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key; };

  function randomInt(min, max) {
    return Math.floor(window.GameRegistry.secureRandom() * (max - min + 1)) + min;
  }

  function nowMs() {
    return (typeof window.performance === 'object' && typeof window.performance.now === 'function')
      ? window.performance.now()
      : Date.now();
  }

  function reducedMotion() {
    return !!(window.prefersReducedMotion && window.prefersReducedMotion());
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rgbString(r, g, b, a) {
    return 'rgba(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ', ' + (a === undefined ? 1 : a) + ')';
  }

  function roundedRectPath(x, y, w, h, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    // Manual rounded-rect path fallback for older runtimes.
    const r = Math.min(radius, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
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
    if (scoreEl) scoreEl.textContent = t('gamesScore') + ': 0';
    gameOver = false;
    paused = false;
    prevSnake = null;
    lastTickAt = nowMs();
    particles = [];
    shakeUntil = 0;
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
      endGame();
      return;
    }
    food = empty[randomInt(0, empty.length - 1)];
  }

  function hitsSelf(head, body) {
    for (const seg of body) {
      if (seg.x === head.x && seg.y === head.y) return true;
    }
    return false;
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

    const eating = food && head.x === food.x && head.y === food.y;

    // Self collision. When not eating, the tail vacates its cell this tick,
    // so moving into it is legal; exclude it from the check. When eating the
    // snake grows, so the tail still occupies its cell.
    const body = eating ? snake : snake.slice(0, -1);
    if (hitsSelf(head, body)) {
      endGame();
      return;
    }

    // Capture the pre-tick positions for smooth interpolation.
    prevSnake = snake.map(function (s) { return { x: s.x, y: s.y }; });
    lastTickAt = nowMs();

    snake.unshift(head);

    // Eat food
    if (eating) {
      score += 10;
      if (scoreEl) scoreEl.textContent = t('gamesScore') + ': ' + score;
      spawnParticles(food.x * CELL_SIZE + CELL_SIZE / 2, food.y * CELL_SIZE + CELL_SIZE / 2);
      shakeUntil = nowMs() + SHAKE_MS;
      spawnFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function endGame() {
    gameOver = true;
    stopTick();
    stopAnimation();
    // Save stats
    window.gamesHelpers?.updateStatsWith?.('snake', function (stats) {
      const highScore = stats.highScore || 0;
      return {
        highScore: Math.max(highScore, score),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      };
    });
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

  const SHAKE_MS = 140;
  const HEAD_COLOR = { r: 94, g: 234, b: 212 };
  const TAIL_COLOR = { r: 45, g: 138, b: 131 };

  function drawBackground() {
    const w = GRID_SIZE * CELL_SIZE;
    const h = GRID_SIZE * CELL_SIZE;

    // Base vertical gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#161631');
    bg.addColorStop(1, '#1c1c3a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle checkerboard
    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if ((x + y) % 2 === 0) {
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Faint grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(w, i * CELL_SIZE);
      ctx.stroke();
    }
  }

  function drawFood(now) {
    if (!food) return;
    const cx = food.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = food.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = reducedMotion() ? 0 : Math.sin(now / 160) * 1.2;
    const radius = CELL_SIZE / 2 - 2 + pulse;

    // Soft glow
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius * 2.2);
    glow.addColorStop(0, 'rgba(255, 107, 107, 0.4)');
    glow.addColorStop(1, 'rgba(255, 107, 107, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    const core = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 1, cx, cy, radius);
    core.addColorStop(0, '#ffd2d2');
    core.addColorStop(0.55, '#ff6b6b');
    core.addColorStop(1, '#d64545');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.35, cy - radius * 0.4, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function segmentPosition(idx, now) {
    const target = snake[idx];
    const interpolate = !paused && !gameOver && !reducedMotion() && prevSnake && prevSnake[idx];
    let gx = target.x;
    let gy = target.y;
    if (interpolate) {
      const p = clamp((now - lastTickAt) / TICK_MS, 0, 1);
      gx = lerp(prevSnake[idx].x, target.x, p);
      gy = lerp(prevSnake[idx].y, target.y, p);
    }
    return { x: gx * CELL_SIZE, y: gy * CELL_SIZE };
  }

  function drawEyes(pos, size) {
    const eyeSize = 2.6;
    const offset = 3.5;
    let dx = 0;
    let dy = 0;
    if (direction === 'right') dx = 1;
    else if (direction === 'left') dx = -1;
    else if (direction === 'up') dy = -1;
    else if (direction === 'down') dy = 1;

    // Eyes sit perpendicular to the direction of travel, offset forward.
    const perpX = -dy;
    const perpY = dx;

    const eyePositions = [
      {
        x: pos.x + size / 2 + dx * offset + perpX * offset * 0.7,
        y: pos.y + size / 2 + dy * offset + perpY * offset * 0.7
      },
      {
        x: pos.x + size / 2 + dx * offset - perpX * offset * 0.7,
        y: pos.y + size / 2 + dy * offset - perpY * offset * 0.7
      }
    ];

    eyePositions.forEach(function (eye) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12202e';
      ctx.beginPath();
      ctx.arc(eye.x + dx, eye.y + dy, eyeSize * 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawSnake(now) {
    const length = snake.length;
    snake.forEach(function (seg, idx) {
      const pos = segmentPosition(idx, now);
      const ratio = length <= 1 ? 0 : idx / (length - 1);
      const color = {
        r: lerp(HEAD_COLOR.r, TAIL_COLOR.r, ratio),
        g: lerp(HEAD_COLOR.g, TAIL_COLOR.g, ratio),
        b: lerp(HEAD_COLOR.b, TAIL_COLOR.b, ratio)
      };
      const inset = idx === 0 ? 1 : 2;
      const size = CELL_SIZE - inset * 2;

      // Segment body
      roundedRectPath(pos.x + inset, pos.y + inset, size, size, 5);
      ctx.fillStyle = rgbString(color.r, color.g, color.b);
      ctx.fill();

      // Soft outline
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Top gloss highlight
      roundedRectPath(pos.x + inset + 2, pos.y + inset + 2, size - 4, size * 0.3, 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();

      if (idx === 0) {
        drawEyes(pos, size);
      }
    });
  }

  function spawnParticles(x, y) {
    if (reducedMotion()) return;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: nowMs(),
        life: 450 + Math.random() * 250,
        size: 1.5 + Math.random() * 2
      });
    }
  }

  function drawParticles(now) {
    const remaining = [];
    particles.forEach(function (particle) {
      const age = now - particle.born;
      if (age >= particle.life) return;
      const t = age / particle.life;
      const alpha = 1 - t;
      ctx.fillStyle = 'rgba(255, 107, 107, ' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(particle.x + particle.vx * t, particle.y + particle.vy * t, particle.size * (1 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
      remaining.push(particle);
    });
    particles = remaining;
  }

  function drawOverlayPanel(title, titleColor, subLines) {
    const w = GRID_SIZE * CELL_SIZE;
    const h = GRID_SIZE * CELL_SIZE;
    const panelW = Math.min(w - 40, 250);
    const panelH = 74 + subLines.length * 26;
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;

    ctx.fillStyle = 'rgba(10, 10, 24, 0.72)';
    ctx.fillRect(0, 0, w, h);

    roundedRectPath(px, py, panelW, panelH, 12);
    ctx.fillStyle = 'rgba(20, 20, 44, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(78, 205, 196, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = titleColor;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, py + 34);

    ctx.fillStyle = '#e0e0e0';
    ctx.font = '15px system-ui, sans-serif';
    subLines.forEach(function (line, i) {
      ctx.fillText(line, w / 2, py + 34 + 26 + i * 24);
    });
  }

  function draw(now) {
    if (!ctx) return;
    if (typeof now !== 'number') now = nowMs();

    drawBackground();

    // Screen shake is applied to the scene layer only (not the overlays).
    let shakeX = 0;
    let shakeY = 0;
    if (!reducedMotion() && now < shakeUntil) {
      const strength = clamp((shakeUntil - now) / SHAKE_MS, 0, 1) * 2.5;
      shakeX = (Math.random() * 2 - 1) * strength;
      shakeY = (Math.random() * 2 - 1) * strength;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawFood(now);
    drawSnake(now);
    drawParticles(now);

    ctx.restore();

    if (gameOver) {
      drawOverlayPanel(
        t('gamesGameOver') || 'Game Over',
        '#ff6b6b',
        [
          (t('gamesScore') || 'Score') + ': ' + score,
          t('gamesPressSpace') || 'Press Space to restart'
        ]
      );
    } else if (paused) {
      drawOverlayPanel(t('gamesPaused') || 'Paused', '#e0e0e0', []);
    }
  }

  // ===================== Animation =====================

  function animate(now) {
    draw(now);
    if (animFrame !== null) {
      animFrame = window.requestAnimationFrame(animate);
    }
  }

  function startAnimation() {
    if (animFrame === null && !reducedMotion() && typeof window.requestAnimationFrame === 'function') {
      animFrame = window.requestAnimationFrame(animate);
    }
  }

  function stopAnimation() {
    if (animFrame !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(animFrame);
    }
    animFrame = null;
  }

  // ===================== Input =====================

  function handleKeydown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }

    if (gameOver) {
      if (window.gamesHelpers && typeof window.gamesHelpers.handleRestartSpace === 'function') {
        window.gamesHelpers.handleRestartSpace(e, function () { initSnake(); draw(); startTick(); startAnimation(); });
      } else if (e.code === 'Space') {
        e.preventDefault();
        initSnake();
        draw();
        startTick();
        startAnimation();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
      manualPause = paused;
      if (paused) {
        stopTick();
        stopAnimation();
      } else {
        startTick();
        startAnimation();
      }
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
    if (gameOver) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        initSnake();
        draw();
        startTick();
        startAnimation();
      }
      return;
    }
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
    startAnimation();

    document.addEventListener('keydown', handleKeydown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  function destroy() {
    stopTick();
    stopAnimation();
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
    stopAnimation();
    draw();
  }

  function resume() {
    if (!gameOver && !manualPause) {
      paused = false;
      startTick();
      startAnimation();
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
