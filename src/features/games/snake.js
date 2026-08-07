// src/features/games/snake.js - Snake Game

(function () {
  'use strict';

  const GRID_SIZE = 20;
  const CELL_SIZE = 15;
  const BASE_TICK_MS = 120;
  const MAX_OBSTACLES = 6;
  const OBSTACLE_START_FOODS = 5;
  const OBSTACLE_EVERY_FOODS = 5;
  const BONUS_START_FOODS = 4;
  const BONUS_WORTH = 30;
  const BONUS_LIFETIME_MS = 5000;
  const BONUS_SPAWN_CHANCE = 0.3;

  // Difficulty presets: tick drops `step` ms every `every` foods eaten, floored at `min`.
  // `constant` keeps a fixed speed regardless of progress.
  const DIFFICULTIES = {
    constant: { start: 120, min: 120, step: 0, every: 5 },
    easy: { start: 130, min: 85, step: 5, every: 4 },
    normal: { start: 120, min: 60, step: 5, every: 3 },
    hard: { start: 100, min: 45, step: 5, every: 2 }
  };

  const SETTINGS_KEYS = {
    wrap: 'snake_wrap_enabled',
    bonus: 'snake_bonus_enabled',
    obstacles: 'snake_obstacles_enabled',
    dpad: 'snake_dpad_enabled',
    sound: 'snake_sound_enabled',
    difficulty: 'snake_difficulty'
  };

  let canvas = null;
  let ctx = null;
  let boardEl = null;
  let dpadEl = null;
  let snake = [];
  let food = null;
  let bonusFood = null;
  let bonusTimer = null;
  let obstacles = [];
  let direction = 'right';
  let nextDirection = 'right';
  let score = 0;
  let foodsEaten = 0;
  let highScore = 0;
  let tickMs = BASE_TICK_MS;
  let gameOver = false;
  let paused = false;
  let manualPause = false;
  let tickTimer = null;
  let container = null;
  let scoreEl = null;
  let pauseBtn = null;
  let restartBtn = null;
  let audioCtx = null;
  let bonusToast = null;
  let bonusToastTimer = null;

  const settings = {
    wrap: false,
    bonus: true,
    obstacles: true,
    dpad: false,
    sound: false,
    difficulty: 'normal'
  };

  // ===================== Helpers =====================

  const t = window.gamesHelpers?.t || function (key) { return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key; };

  function randomInt(min, max) {
    return Math.floor(window.GameRegistry.secureRandom() * (max - min + 1)) + min;
  }

  // ===================== Settings =====================

  function loadSettings() {
    try {
      settings.wrap = localStorage.getItem(SETTINGS_KEYS.wrap) === 'true';
      settings.bonus = localStorage.getItem(SETTINGS_KEYS.bonus) !== 'false';
      settings.obstacles = localStorage.getItem(SETTINGS_KEYS.obstacles) !== 'false';
      settings.sound = localStorage.getItem(SETTINGS_KEYS.sound) === 'true';
      const dpadRaw = localStorage.getItem(SETTINGS_KEYS.dpad);
      settings.dpad = dpadRaw === null
        ? ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0)
        : dpadRaw === 'true';
      settings.difficulty = localStorage.getItem(SETTINGS_KEYS.difficulty) || 'normal';
    } catch (e) {
      console.warn('Snake: failed to load settings, using defaults', e);
    }
    if (!DIFFICULTIES[settings.difficulty]) settings.difficulty = 'normal';
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEYS.wrap, settings.wrap);
      localStorage.setItem(SETTINGS_KEYS.bonus, settings.bonus);
      localStorage.setItem(SETTINGS_KEYS.obstacles, settings.obstacles);
      localStorage.setItem(SETTINGS_KEYS.sound, settings.sound);
      localStorage.setItem(SETTINGS_KEYS.dpad, settings.dpad);
      localStorage.setItem(SETTINGS_KEYS.difficulty, settings.difficulty);
    } catch (e) {
      console.warn('Snake: failed to save settings', e);
    }
  }

  // ===================== Speed / difficulty =====================

  function getTickMs() {
    const cfg = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.normal;
    const steps = Math.floor(foodsEaten / cfg.every);
    return Math.max(cfg.min, cfg.start - steps * cfg.step);
  }

  function applySpeed() {
    const nextMs = getTickMs();
    if (nextMs !== tickMs) {
      tickMs = nextMs;
      if (!paused && !gameOver) startTick();
    }
  }

  // ===================== Board helpers =====================

  function isCellFree(p) {
    const onSnake = snake.some(function (s) { return s.x === p.x && s.y === p.y; });
    if (onSnake) return false;
    if (food && food.x === p.x && food.y === p.y) return false;
    if (bonusFood && bonusFood.x === p.x && bonusFood.y === p.y) return false;
    return !obstacles.some(function (o) { return o.x === p.x && o.y === p.y; });
  }

  function isNearHead(p) {
    const head = snake[0];
    if (!head) return false;
    if (settings.wrap) {
      // Use wrapping distance so edge-adjacent cells across opposite
      // borders are not treated as far away when wrap-around is enabled.
      const dx = Math.min(Math.abs(p.x - head.x), GRID_SIZE - Math.abs(p.x - head.x));
      const dy = Math.min(Math.abs(p.y - head.y), GRID_SIZE - Math.abs(p.y - head.y));
      return dx <= 2 && dy <= 2;
    }
    return Math.abs(p.x - head.x) <= 2 && Math.abs(p.y - head.y) <= 2;
  }

  function pickEmptyCell(opts) {
    const fixed = opts?.fixed;
    if (fixed && isCellFree(fixed)) return { x: fixed.x, y: fixed.y };

    const empty = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const p = { x: x, y: y };
        if (!isCellFree(p)) continue;
        if (opts?.avoidHead && isNearHead(p)) continue;
        empty.push(p);
      }
    }
    if (empty.length === 0) return null;
    return empty[randomInt(0, empty.length - 1)];
  }

  function spawnFood() {
    const pos = pickEmptyCell();
    if (!pos) {
      endGame();
      return;
    }
    food = pos;
  }

  // ===================== Bonus food =====================

  function clearBonusTimer() {
    if (bonusTimer) {
      clearTimeout(bonusTimer);
      bonusTimer = null;
    }
  }

  function maybeSpawnBonus() {
    if (!settings.bonus || bonusFood || foodsEaten < BONUS_START_FOODS) return;
    if (window.GameRegistry.secureRandom() >= BONUS_SPAWN_CHANCE) return;
    spawnBonusFood();
  }

  function spawnBonusFood(x, y) {
    const pos = pickEmptyCell({ fixed: (x !== undefined && y !== undefined) ? { x: x, y: y } : null });
    if (!pos) return;
    bonusFood = pos;
    clearBonusTimer();
    bonusTimer = setTimeout(function () {
      bonusFood = null;
      draw();
    }, BONUS_LIFETIME_MS);
  }

  function showBonusToast() {
    if (!boardEl) return;
    if (bonusToastTimer) clearTimeout(bonusToastTimer);
    if (bonusToast) bonusToast.remove();
    bonusToast = document.createElement('div');
    bonusToast.className = 'games-snake-bonus-toast';
    bonusToast.textContent = '+' + BONUS_WORTH + ' ' + (t('gamesSnakeBonusGot') || 'Bonus!');
    boardEl.appendChild(bonusToast);
    bonusToastTimer = setTimeout(function () {
      if (bonusToast) bonusToast.remove();
      bonusToast = null;
      bonusToastTimer = null;
    }, 1200);
  }

  function clearBonusToast() {
    if (bonusToastTimer) {
      clearTimeout(bonusToastTimer);
      bonusToastTimer = null;
    }
    if (bonusToast) {
      bonusToast.remove();
      bonusToast = null;
    }
  }

  // ===================== Obstacles =====================

  function maybeSpawnObstacles() {
    if (!settings.obstacles || foodsEaten < OBSTACLE_START_FOODS) return;
    if (obstacles.length >= MAX_OBSTACLES) return;
    const targetCount = Math.min(MAX_OBSTACLES, Math.floor((foodsEaten - OBSTACLE_START_FOODS) / OBSTACLE_EVERY_FOODS) + 1);
    while (obstacles.length < targetCount) {
      const pos = pickEmptyCell({ avoidHead: true });
      if (!pos) break;
      obstacles.push(pos);
    }
  }

  // ===================== Game Logic =====================

  function loadHighScore() {
    try {
      highScore = window.GameRegistry?.getStats('snake')?.highScore || 0;
    } catch (_e) {
      highScore = 0;
    }
  }

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
    foodsEaten = 0;
    obstacles = [];
    clearBonusTimer();
    bonusFood = null;
    loadHighScore();
    tickMs = getTickMs();
    gameOver = false;
    paused = false;
    manualPause = false;
    spawnFood();
    renderHud();
  }

  function hitsSelf(head, body) {
    for (const seg of body) {
      if (seg.x === head.x && seg.y === head.y) return true;
    }
    return false;
  }

  function moveHead(direction, head) {
    if (direction === 'right') head.x++;
    else if (direction === 'left') head.x--;
    else if (direction === 'up') head.y--;
    else if (direction === 'down') head.y++;
  }

  function resolveWall(head) {
    if (head.x >= 0 && head.x < GRID_SIZE && head.y >= 0 && head.y < GRID_SIZE) return false;
    if (settings.wrap) {
      head.x = (head.x + GRID_SIZE) % GRID_SIZE;
      head.y = (head.y + GRID_SIZE) % GRID_SIZE;
      return false;
    }
    endGame();
    return true;
  }

  function tick() {
    if (paused || gameOver) return;

    direction = nextDirection;
    const head = { ...snake[0] };

    moveHead(direction, head);

    // Wall collision / wrap-around
    if (resolveWall(head)) return;

    // Obstacle collision
    const hitsObstacle = obstacles.some(function (o) { return o.x === head.x && o.y === head.y; });
    if (hitsObstacle) {
      endGame();
      return;
    }

    const eating = !!food && head.x === food.x && head.y === food.y;
    const eatingBonus = !!bonusFood && head.x === bonusFood.x && head.y === bonusFood.y;

    // Self collision. When not eating, the tail vacates its cell this tick,
    // so moving into it is legal; exclude it from the check. When eating the
    // snake grows, so the tail still occupies its cell.
    const body = eating || eatingBonus ? snake : snake.slice(0, -1);
    if (hitsSelf(head, body)) {
      endGame();
      return;
    }

    snake.unshift(head);

    if (eating) {
      score += 10;
      foodsEaten++;
      applySpeed();
      maybeSpawnBonus();
      maybeSpawnObstacles();
      spawnFood();
      if (gameOver) return;
      playSound('eat');
      renderHud();
    } else if (eatingBonus) {
      score += BONUS_WORTH;
      clearBonusTimer();
      bonusFood = null;
      showBonusToast();
      playSound('bonus');
      renderHud();
    } else {
      snake.pop();
    }

    draw();
  }

  function endGame() {
    gameOver = true;
    stopTick();
    clearBonusTimer();
    if (score > highScore) highScore = score;
    window.gamesHelpers?.updateStatsWith?.('snake', function (stats) {
      const prevHigh = stats.highScore || 0;
      return {
        highScore: Math.max(prevHigh, score),
        gamesPlayed: (stats.gamesPlayed || 0) + 1
      };
    });
    renderHud();
    draw();
    updateControls();
    renderOverlays();
    playSound('gameover');
  }

  function restart() {
    clearOverlays();
    clearBonusToast();
    initSnake();
    draw();
    updateControls();
    startTick();
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(tick, tickMs);
  }

  // ===================== HUD =====================

  function renderHud() {
    if (scoreEl) {
      scoreEl.textContent = (t('gamesScore') || 'Score') + ': ' + score + ' · ' +
        (t('gamesHighScore') || 'High Score') + ': ' + Math.max(highScore, score);
    }
  }

  function updateControls() {
    if (pauseBtn) {
      pauseBtn.disabled = gameOver;
      pauseBtn.textContent = paused && !gameOver
        ? (t('gamesSnakeResume') || 'Resume')
        : (t('gamesSnakePause') || 'Pause');
    }
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

    // Obstacles
    ctx.fillStyle = '#57606a';
    obstacles.forEach(function (o) {
      ctx.fillRect(o.x * CELL_SIZE + 1, o.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    });

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

    // Bonus food (golden, timed)
    if (bonusFood) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(
        bonusFood.x * CELL_SIZE + CELL_SIZE / 2,
        bonusFood.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 1,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = '#e6c200';
      ctx.lineWidth = 1;
      ctx.stroke();
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
  }

  // ===================== Overlays =====================

  function clearOverlays() {
    if (!boardEl) return;
    boardEl.querySelectorAll('.games-snake-overlay').forEach(function (el) { el.remove(); });
  }

  function renderOverlays() {
    if (!boardEl) return;
    clearOverlays();

    if (gameOver) {
      const statsHtml = (t('gamesScore') || 'Score') + ': ' + score + ' · ' +
        (t('gamesHighScore') || 'High Score') + ': ' + Math.max(highScore, score);
      const overlay = window.gamesHelpers?.renderDOMOverlay?.(boardEl, {
        className: 'games-snake-overlay',
        text: t('gamesGameOver') || 'Game Over',
        statsHtml: statsHtml,
        sub: t('gamesPressSpace') || 'Press Space to restart'
      });
      if (overlay) {
        const btn = document.createElement('button');
        btn.className = 'games-snake-btn games-snake-overlay-restart';
        btn.textContent = t('gamesSnakeRestart') || 'Restart';
        btn.addEventListener('click', restart);
        overlay.appendChild(btn);
      }
    } else if (paused) {
      window.gamesHelpers?.renderDOMOverlay?.(boardEl, {
        className: 'games-snake-overlay',
        text: t('gamesPaused') || 'Paused',
        sub: t('gamesSnakePauseHint') || 'Press Space to resume'
      });
    }
  }

  // ===================== Input =====================

  function setDirection(newDir) {
    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[newDir] !== direction) {
      nextDirection = newDir;
    }
  }

  function togglePause() {
    if (gameOver) return;
    if (paused) {
      paused = false;
      manualPause = false;
      startTick();
    } else {
      paused = true;
      manualPause = true;
      stopTick();
      playSound('pause');
    }
    updateControls();
    renderOverlays();
    draw();
  }

  function handleKeydown(e) {
    unlockAudio();
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) {
      return;
    }

    if (gameOver) {
      if (window.gamesHelpers && typeof window.gamesHelpers.handleRestartSpace === 'function') {
        window.gamesHelpers.handleRestartSpace(e, restart);
      } else if (e.code === 'Space') {
        e.preventDefault();
        restart();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
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
    setDirection(newDir);
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
        restart();
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
    setDirection(newDir);
  }

  // ===================== Sound =====================

  function getAudioCtx() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioCtx = new Ctx();
    } catch (_e) {
      return null;
    }
    return audioCtx;
  }

  // Resume the AudioContext from a user gesture so sounds are audible under
  // the browser autoplay policy (a context created outside a gesture starts
  // suspended and would otherwise stay silent).
  function unlockAudio() {
    if (!settings.sound) return;
    const ctx = getAudioCtx();
    if (!ctx || ctx.state === 'running') return;
    const resume = ctx.resume && ctx.resume.bind(ctx);
    if (resume) {
      Promise.resolve(resume()).catch(function () {});
    }
  }

  function playSound(type) {
    if (!settings.sound) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const freqs = { eat: 660, bonus: 880, gameover: 220, pause: 440 };
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freqs[type] || 440;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (_e) {
      console.warn('Snake: unable to play sound effect', _e);
    }
  }

  // ===================== Settings UI =====================

  function createToggleRow(key, label, desc) {
    const row = document.createElement('label');
    row.className = 'games-snake-setting';

    const textWrap = document.createElement('span');
    textWrap.className = 'games-snake-setting-text';
    const name = document.createElement('span');
    name.className = 'games-snake-setting-label';
    name.textContent = label || key;
    textWrap.appendChild(name);
    if (desc) {
      const d = document.createElement('span');
      d.className = 'games-snake-setting-desc';
      d.textContent = desc;
      textWrap.appendChild(d);
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'games-snake-setting-input';
    checkbox.checked = !!settings[key];
    checkbox.addEventListener('change', function () {
      settings[key] = this.checked;
      saveSettings();
      applySettingChange(key);
    });

    row.appendChild(textWrap);
    row.appendChild(checkbox);
    return row;
  }

  function applySettingChange(key) {
    if (key === 'dpad') {
      applyDpad();
    } else if (key === 'bonus' && !settings.bonus) {
      clearBonusTimer();
      bonusFood = null;
      draw();
    } else if (key === 'obstacles' && !settings.obstacles) {
      obstacles = [];
      draw();
    } else if (key === 'wrap') {
      draw();
    }
  }

  function buildSettings() {
    const wrap = document.createElement('div');
    wrap.className = 'games-snake-settings';

    wrap.appendChild(createToggleRow('wrap', t('gamesSnakeWrap'), t('gamesSnakeWrapDesc')));
    wrap.appendChild(createToggleRow('bonus', t('gamesSnakeBonusFood'), t('gamesSnakeBonusFoodDesc')));
    wrap.appendChild(createToggleRow('obstacles', t('gamesSnakeObstacles'), t('gamesSnakeObstaclesDesc')));
    wrap.appendChild(createToggleRow('sound', t('gamesSnakeSound'), t('gamesSnakeSoundDesc')));
    wrap.appendChild(createToggleRow('dpad', t('gamesSnakeDpad'), t('gamesSnakeDpadDesc')));

    const diffRow = document.createElement('label');
    diffRow.className = 'games-snake-setting';
    const diffLabel = document.createElement('span');
    diffLabel.className = 'games-snake-setting-label';
    diffLabel.textContent = t('gamesSnakeDifficulty') || 'Difficulty';
    diffRow.appendChild(diffLabel);

    const select = document.createElement('select');
    select.className = 'games-snake-setting-select';
    Object.keys(DIFFICULTIES).forEach(function (key) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = t('gamesSnakeDifficulty' + key.charAt(0).toUpperCase() + key.slice(1)) || key;
      select.appendChild(opt);
    });
    select.value = settings.difficulty;
    select.addEventListener('change', function () {
      settings.difficulty = this.value;
      saveSettings();
      tickMs = getTickMs();
      if (!paused && !gameOver) startTick();
    });
    diffRow.appendChild(select);

    wrap.appendChild(diffRow);
    return wrap;
  }

  // ===================== D-pad =====================

  function createDpad() {
    const dpad = document.createElement('div');
    dpad.className = 'games-snake-dpad';
    const dirs = ['up', 'left', 'down', 'right'];
    const arrows = { up: '▲', down: '▼', left: '◀', right: '▶' };
    const labelKeys = {
      up: 'gamesSnakeDpadUp', down: 'gamesSnakeDpadDown',
      left: 'gamesSnakeDpadLeft', right: 'gamesSnakeDpadRight'
    };
    dirs.forEach(function (dir) {
      const btn = document.createElement('button');
      btn.className = 'games-snake-dpad-btn games-snake-dpad-' + dir;
      btn.dataset.dir = dir;
      btn.setAttribute('aria-label', t(labelKeys[dir]) || dir);
      btn.textContent = arrows[dir];
      btn.addEventListener('click', function () {
        if (gameOver) {
          restart();
          return;
        }
        setDirection(dir);
      });
      dpad.appendChild(btn);
    });
    return dpad;
  }

  function applyDpad() {
    if (dpadEl) dpadEl.style.display = settings.dpad ? '' : 'none';
  }

  // ===================== Lifecycle =====================

  function init(containerEl) {
    container = containerEl;
    loadSettings();

    // Score display
    scoreEl = document.createElement('div');
    scoreEl.className = 'games-score-display games-snake-hud';
    container.appendChild(scoreEl);

    // Controls (pause / restart)
    const controls = document.createElement('div');
    controls.className = 'games-snake-controls';

    pauseBtn = document.createElement('button');
    pauseBtn.className = 'games-snake-btn games-snake-pause';
    pauseBtn.textContent = t('gamesSnakePause') || 'Pause';
    pauseBtn.addEventListener('click', togglePause);

    restartBtn = document.createElement('button');
    restartBtn.className = 'games-snake-btn games-snake-restart';
    restartBtn.textContent = t('gamesSnakeRestart') || 'Restart';
    restartBtn.addEventListener('click', restart);

    controls.appendChild(pauseBtn);
    controls.appendChild(restartBtn);
    container.appendChild(controls);

    // Board wrapper + canvas
    boardEl = document.createElement('div');
    boardEl.className = 'games-snake-board';
    canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE * CELL_SIZE;
    canvas.height = GRID_SIZE * CELL_SIZE;
    canvas.className = 'games-snake-canvas';
    ctx = canvas.getContext('2d');
    boardEl.appendChild(canvas);
    container.appendChild(boardEl);

    // Settings panel
    container.appendChild(buildSettings());

    // Touch D-pad
    dpadEl = createDpad();
    container.appendChild(dpadEl);
    applyDpad();

    // Instructions
    const instructions = document.createElement('div');
    instructions.className = 'games-instructions';
    instructions.textContent = t('gamesSnakeControls') || 'Arrow keys or WASD to move, Space to pause';
    container.appendChild(instructions);

    initSnake();
    draw();
    updateControls();
    startTick();

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  function destroy() {
    stopTick();
    clearBonusTimer();
    clearBonusToast();
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('pointerdown', unlockAudio);
    if (canvas) {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
    }
    canvas = null;
    ctx = null;
    boardEl = null;
    dpadEl = null;
    if (container) container.innerHTML = '';
    container = null;
    scoreEl = null;
    pauseBtn = null;
    restartBtn = null;
  }

  function pause() {
    if (!paused) manualPause = false;
    paused = true;
    stopTick();
    updateControls();
    renderOverlays();
    draw();
  }

  function resume() {
    if (!gameOver && !manualPause) {
      paused = false;
      startTick();
      updateControls();
      renderOverlays();
      draw();
    }
  }

  // ===================== Debug / test API =====================

  function getState() {
    return {
      score: score,
      foodsEaten: foodsEaten,
      tickMs: tickMs,
      highScore: Math.max(highScore, score),
      direction: direction,
      nextDirection: nextDirection,
      paused: paused,
      gameOver: gameOver,
      manualPause: manualPause,
      wrapEnabled: settings.wrap,
      bonusEnabled: settings.bonus,
      obstaclesEnabled: settings.obstacles,
      soundEnabled: settings.sound,
      dpadEnabled: settings.dpad,
      difficulty: settings.difficulty,
      snake: snake.map(function (s) { return { x: s.x, y: s.y }; }),
      food: food ? { x: food.x, y: food.y } : null,
      bonusFood: bonusFood ? { x: bonusFood.x, y: bonusFood.y } : null,
      obstacles: obstacles.map(function (o) { return { x: o.x, y: o.y }; })
    };
  }

  function simulateEatenFoods(n) {
    for (let i = 0; i < n; i++) {
      foodsEaten++;
      score += 10;
      applySpeed();
      maybeSpawnBonus();
      maybeSpawnObstacles();
    }
    renderHud();
    draw();
  }

  window.GameRegistry?.register({
    id: 'snake',
    name: 'gamesSnake',
    description: 'gamesSnakeDesc',
    icon: '🐍',
    init: init,
    destroy: destroy,
    pause: pause,
    resume: resume,
    _debug: {
      getState: getState,
      step: tick,
      setDirection: setDirection,
      setFood: function (x, y) {
        if (x !== undefined && y !== undefined && x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE) {
          food = { x: x, y: y };
        }
      },
      setBonusFood: function (x, y) {
        if (x !== undefined && y !== undefined && x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE) {
          clearBonusTimer();
          bonusFood = { x: x, y: y };
        }
      },
      setObstacles: function (cells) {
        obstacles = Array.isArray(cells)
          ? cells.filter(function (c) {
            return c && c.x >= 0 && c.y >= 0 && c.x < GRID_SIZE && c.y < GRID_SIZE;
          }).map(function (c) { return { x: c.x, y: c.y }; })
          : [];
      },
      simulateEatenFoods: simulateEatenFoods,
      spawnBonusFood: function (x, y) { spawnBonusFood(x, y); }
    }
  });
})();
