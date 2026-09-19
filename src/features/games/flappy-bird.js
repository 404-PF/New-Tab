// src/features/games/flappy-bird.js - Flappy Bird Game
(function () {
  'use strict';

  const CANVAS_WIDTH = 360;
  const CANVAS_HEIGHT = 560;
  const BIRD_X = 84;
  const BIRD_RADIUS = 16;
  const GRAVITY = 1450;
  const FLAP_VELOCITY = -430;
  const BASE_SPEED = 160;
  const MAX_SPEED = 250;
  const SPEED_STEP = 15;
  const BASE_GAP = 155;
  const MIN_GAP = 122;
  const GAP_STEP = 6;
  const DIFFICULTY_STEP_SCORE = 5;
  const PIPE_WIDTH = 66;
  const PIPE_SPACING = 220;
  const PIPE_MIN_SPACING = PIPE_WIDTH + 44;
  const MAX_PIPES = 8;
  const PIPE_TOP_MARGIN = 76;
  const PIPE_BOTTOM_MARGIN = 92;
  const PIPE_MIN_CENTER = PIPE_TOP_MARGIN + MIN_GAP / 2;
  const PIPE_MAX_CENTER = CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN - MIN_GAP / 2;
  const MAX_PIPE_X = CANVAS_WIDTH + PIPE_SPACING * MAX_PIPES;
  const MAX_VELOCITY = 1200;
  const DEATH_ANIMATION_MS = 280;

  let container = null;
  let stage = null;
  let canvas = null;
  let ctx = null;
  let scoreEl = null;
  let instructionsEl = null;
  let bgCache = null;
  let readyScreen = null;
  let stateOverlay = null;
  let stateOverlayKind = null;

  let bird = null;
  let pipes = [];
  let score = 0;
  let speed = BASE_SPEED;
  let started = false;
  let paused = false;
  let manualPause = false;
  let gameOver = false;
  let rafId = null;
  let lastFrameAt = 0;
  let particles = [];
  let shakeUntil = 0;
  let touchActive = false;
  let suppressClickUntil = 0;

  const t = window.gamesHelpers?.t || function (key) {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
  };

  function tr(key) {
    return t(key) || key;
  }

  function nowMs() {
    return (typeof window.performance === 'object' && typeof window.performance.now === 'function')
      ? window.performance.now()
      : Date.now();
  }

  function reducedMotion() {
    return !!window.prefersReducedMotion?.();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomInRange(min, max) {
    return min + window.GameRegistry.secureRandom() * (max - min);
  }

  function levelForScore(scoreValue) {
    if (!Number.isFinite(scoreValue) || scoreValue < 0) return 1;
    return 1 + Math.floor(scoreValue / DIFFICULTY_STEP_SCORE);
  }

  function speedForScore(scoreValue) {
    return Math.min(
      MAX_SPEED,
      BASE_SPEED + Math.floor(Math.max(0, scoreValue) / DIFFICULTY_STEP_SCORE) * SPEED_STEP
    );
  }

  function gapForScore(scoreValue) {
    return Math.max(
      MIN_GAP,
      BASE_GAP - Math.floor(Math.max(0, scoreValue) / DIFFICULTY_STEP_SCORE) * GAP_STEP
    );
  }

  function createPipe(x, scoreValue) {
    const gap = gapForScore(scoreValue);
    const minCenter = PIPE_TOP_MARGIN + gap / 2;
    const maxCenter = CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN - gap / 2;
    return {
      x: x,
      gapY: Math.round(randomInRange(minCenter, maxCenter)),
      gap: gap,
      passed: false
    };
  }

  function resetState() {
    bird = { x: BIRD_X, y: CANVAS_HEIGHT * 0.46, vy: 0 };
    pipes = [];
    score = 0;
    speed = BASE_SPEED;
    started = false;
    paused = false;
    manualPause = false;
    gameOver = false;
    particles = [];
    shakeUntil = 0;
    touchActive = false;
    suppressClickUntil = 0;

    pipes.push(createPipe(CANVAS_WIDTH + 80, score));
    pipes.push(createPipe(CANVAS_WIDTH + 80 + PIPE_SPACING, score));
    updateScoreHud();
  }

  function updateScoreHud() {
    if (!scoreEl) return;
    const stats = window.GameRegistry?.getStats?.('flappy-bird') || {};
    const highScore = Math.max(Number.isSafeInteger(stats.highScore) ? stats.highScore : 0, score);
    scoreEl.textContent =
      tr('gamesScore') + ': ' + score +
      '  ·  ' + tr('gamesHighScore') + ': ' + highScore +
      '  ·  ' + tr('gamesLevel') + ': ' + levelForScore(score);
  }

  function buildBackgroundCache() {
    const offscreen = document.createElement('canvas');
    offscreen.width = CANVAS_WIDTH;
    offscreen.height = CANVAS_HEIGHT;
    const bgCtx = offscreen.getContext('2d');
    if (!bgCtx) return null;

    const sky = bgCtx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    sky.addColorStop(0, '#6fd8ff');
    sky.addColorStop(0.65, '#b9f0ff');
    sky.addColorStop(1, '#e9f8d3');
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    bgCtx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    [
      { x: 48, y: 92, w: 86, h: 26 },
      { x: 238, y: 146, w: 74, h: 22 },
      { x: 136, y: 208, w: 60, h: 18 }
    ].forEach(function (cloud) {
      bgCtx.beginPath();
      bgCtx.arc(cloud.x, cloud.y + 8, 13, 0, Math.PI * 2);
      bgCtx.arc(cloud.x + 18, cloud.y, 18, 0, Math.PI * 2);
      bgCtx.arc(cloud.x + 40, cloud.y + 9, 14, 0, Math.PI * 2);
      bgCtx.fill();
      bgCtx.fillRect(cloud.x, cloud.y + 8, cloud.w, cloud.h - 8);
    });

    const groundY = CANVAS_HEIGHT - 54;
    bgCtx.fillStyle = '#8fd35b';
    bgCtx.fillRect(0, groundY, CANVAS_WIDTH, 54);
    bgCtx.fillStyle = '#78bc48';
    for (let x = -12; x < CANVAS_WIDTH + 12; x += 20) {
      bgCtx.fillRect(x, groundY, 10, 8);
    }
    bgCtx.fillStyle = '#d5ad63';
    bgCtx.fillRect(0, groundY + 8, CANVAS_WIDTH, 46);

    return offscreen;
  }

  function drawBackground() {
    if (!ctx || !bgCache) return;
    ctx.drawImage(bgCache, 0, 0);
  }

  function drawBird(timestamp) {
    const wingLift = reducedMotion() ? 0 : Math.sin(timestamp / 90) * 4;

    ctx.save();
    ctx.translate(bird.x, bird.y);

    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f1ad20';
    ctx.beginPath();
    ctx.ellipse(-5, 5 + wingLift * 0.35, 10, 6, -0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#172033';
    ctx.beginPath();
    ctx.arc(7.5, -6, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff7e35';
    ctx.beginPath();
    ctx.moveTo(12, -1);
    ctx.lineTo(25, 3);
    ctx.lineTo(12, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawPipe(pipe) {
    const gap = pipe.gap || BASE_GAP;
    const gapTop = pipe.gapY - gap / 2;
    const gapBottom = pipe.gapY + gap / 2;
    const groundY = CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN;

    const topHeight = Math.max(0, gapTop);
    const bottomHeight = Math.max(0, groundY - gapBottom);

    ctx.fillStyle = '#55ad4b';
    if (topHeight > 0) {
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, topHeight);
      ctx.fillRect(pipe.x - 4, topHeight - 18, PIPE_WIDTH + 8, 18);
    }
    if (bottomHeight > 0) {
      ctx.fillRect(pipe.x, gapBottom, PIPE_WIDTH, bottomHeight);
      ctx.fillRect(pipe.x - 4, gapBottom, PIPE_WIDTH + 8, 18);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(pipe.x + 10, 0, 8, Math.max(0, topHeight));
    ctx.fillRect(pipe.x + 10, gapBottom, 8, Math.max(0, bottomHeight));
  }

  function drawParticles() {
    if (reducedMotion()) return;
    particles.forEach(function (particle) {
      ctx.fillStyle = 'rgba(255, 142, 46, ' + particle.alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function draw(timestamp) {
    if (!ctx || !bird) return;

    drawBackground();

    let shakeX = 0;
    let shakeY = 0;
    if (!reducedMotion() && timestamp < shakeUntil) {
      const strength = 4 * clamp((shakeUntil - timestamp) / DEATH_ANIMATION_MS, 0, 1);
      shakeX = (window.GameRegistry.secureRandom() * 2 - 1) * strength;
      shakeY = (window.GameRegistry.secureRandom() * 2 - 1) * strength;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);
    pipes.forEach(drawPipe);
    drawBird(timestamp);
    drawParticles();
    ctx.restore();

    syncStateOverlay();
  }

  function advanceParticles(timestamp) {
    particles = particles.filter(function (particle) {
      const age = timestamp - particle.born;
      if (age >= particle.life) return false;
      const progress = age / particle.life;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.alpha = 1 - progress;
      particle.size *= 0.992;
      return true;
    });
  }

  function spawnDeathParticles() {
    particles = [];
    if (reducedMotion()) return;
    const born = nowMs();
    for (let i = 0; i < 18; i++) {
      const angle = window.GameRegistry.secureRandom() * Math.PI * 2;
      const magnitude = 0.7 + window.GameRegistry.secureRandom() * 2.6;
      particles.push({
        x: bird.x,
        y: bird.y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude,
        size: 2 + window.GameRegistry.secureRandom() * 2,
        born: born,
        life: 180 + window.GameRegistry.secureRandom() * 180,
        alpha: 1
      });
    }
  }

  function stopAnimation() {
    if (rafId !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(rafId);
    }
    rafId = null;
  }

  function frame(timestamp) {
    if (!started || paused || gameOver) {
      rafId = null;
      return;
    }

    const elapsed = Math.max(0, timestamp - lastFrameAt);
    lastFrameAt = timestamp;
    const dt = clamp(elapsed / 1000, 0, 0.05);
    update(dt);

    if (!gameOver) {
      draw(timestamp);
      rafId = window.requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  }

  function deathFrame(timestamp) {
    advanceParticles(timestamp);
    draw(timestamp);
    if (timestamp < shakeUntil || particles.length > 0) {
      rafId = window.requestAnimationFrame(deathFrame);
    } else {
      rafId = null;
    }
  }

  function startAnimation() {
    stopAnimation();
    if (typeof window.requestAnimationFrame !== 'function') return;
    lastFrameAt = nowMs();
    rafId = window.requestAnimationFrame(frame);
  }

  function startDeathAnimation() {
    stopAnimation();
    if (reducedMotion() || typeof window.requestAnimationFrame !== 'function') return;
    rafId = window.requestAnimationFrame(deathFrame);
  }

  function circleIntersectsRect(cx, cy, radius, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  function collidesWithPipe(pipe) {
    const gap = pipe.gap || BASE_GAP;
    const gapTop = pipe.gapY - gap / 2;
    const gapBottom = pipe.gapY + gap / 2;
    const hitsHorizontal = bird.x + BIRD_RADIUS >= pipe.x && bird.x - BIRD_RADIUS <= pipe.x + PIPE_WIDTH;
    if (!hitsHorizontal) return false;

    return circleIntersectsRect(bird.x, bird.y, BIRD_RADIUS, pipe.x, 0, PIPE_WIDTH, gapTop) ||
      circleIntersectsRect(
        bird.x,
        bird.y,
        BIRD_RADIUS,
        pipe.x,
        gapBottom,
        PIPE_WIDTH,
        CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN - gapBottom
      );
  }

  function hitsBounds() {
    const groundY = CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN;
    return bird.y - BIRD_RADIUS <= 0 || bird.y + BIRD_RADIUS >= groundY;
  }

  function spawnPipeIfNeeded() {
    if (pipes.length === 0) {
      pipes.push(createPipe(CANVAS_WIDTH + 80, score));
      return;
    }
    const last = pipes[pipes.length - 1];
    while (last.x < CANVAS_WIDTH + PIPE_SPACING && pipes.length < MAX_PIPES) {
      pipes.push(createPipe(last.x + PIPE_SPACING, score));
    }
  }

  function update(dt) {
    bird.vy = clamp(bird.vy + GRAVITY * dt, -MAX_VELOCITY, MAX_VELOCITY);
    bird.y += bird.vy * dt;

    pipes.forEach(function (pipe) {
      pipe.x -= speed * dt;
    });

    let scoredThisFrame = false;
    pipes.forEach(function (pipe) {
      if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x) {
        pipe.passed = true;
        score += 1;
        scoredThisFrame = true;
      }
    });

    if (scoredThisFrame) {
      speed = speedForScore(score);
      updateScoreHud();
    }

    pipes = pipes.filter(function (pipe) {
      return pipe.x > -PIPE_WIDTH - 4;
    });
    spawnPipeIfNeeded();

    if (hitsBounds() || pipes.some(collidesWithPipe)) {
      endGame();
    }
  }

  function clearStateOverlay() {
    if (stateOverlay) {
      stateOverlay.remove();
      stateOverlay = null;
    }
    stateOverlayKind = null;
  }

  function syncStateOverlay() {
    if (!stage) return;
    const kind = gameOver ? 'game-over' : (paused ? 'paused' : null);
    if (kind === stateOverlayKind) return;

    clearStateOverlay();

    if (kind === 'game-over') {
      stateOverlay = window.gamesHelpers?.renderDOMOverlay?.(stage, {
        className: 'games-flappy-overlay',
        text: tr('gamesGameOver'),
        statsHtml: tr('gamesScore') + ': ' + score,
        sub: tr('gamesPressSpace')
      }) || null;
      stateOverlayKind = kind;
    } else if (kind === 'paused') {
      stateOverlay = window.gamesHelpers?.renderDOMOverlay?.(stage, {
        className: 'games-flappy-overlay',
        text: tr('gamesPaused')
      }) || null;
      stateOverlayKind = kind;
    }
  }

  function endGame() {
    if (gameOver) return;
    gameOver = true;
    paused = false;
    manualPause = false;
    stopAnimation();
    spawnDeathParticles();
    shakeUntil = reducedMotion() ? 0 : nowMs() + DEATH_ANIMATION_MS;

    window.gamesHelpers?.updateStatsWith?.('flappy-bird', function (stats) {
      const highScore = Number.isSafeInteger(stats.highScore) ? stats.highScore : 0;
      const gamesPlayed = Number.isSafeInteger(stats.gamesPlayed) ? stats.gamesPlayed : 0;
      return {
        highScore: Math.max(highScore, score),
        gamesPlayed: gamesPlayed + 1
      };
    });
    window.GameRegistry?.clearSave?.('flappy-bird');
    updateScoreHud();
    draw(nowMs());
    startDeathAnimation();
  }

  function flap() {
    if (!started || paused || gameOver) return;
    bird.vy = FLAP_VELOCITY;
    draw(nowMs());
  }

  function resetAndStart() {
    resetState();
    started = true;
    paused = false;
    manualPause = false;
    updateScoreHud();
    draw(nowMs());
    startAnimation();
    try { canvas?.focus(); } catch (_e) { /* ignore */ }
  }

  function resumeFromManualPause() {
    if (!started || gameOver) return;
    manualPause = false;
    paused = false;
    startAnimation();
    draw(nowMs());
  }

  function handleKeydown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }
    if (!started) return;

    if (gameOver) {
      if (window.gamesHelpers && typeof window.gamesHelpers.handleRestartSpace === 'function') {
        window.gamesHelpers.handleRestartSpace(e, resetAndStart);
      } else if (e.code === 'Space') {
        e.preventDefault();
        resetAndStart();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (manualPause) {
        resumeFromManualPause();
      } else {
        paused = true;
        manualPause = true;
        stopAnimation();
        draw(nowMs());
      }
      return;
    }

    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      flap();
    }
  }

  function handleTouchStart(e) {
    touchActive = !!(e.touches && e.touches.length === 1);
  }

  function handleTouchEnd(e) {
    suppressClickUntil = Date.now() + 450;
    if (gameOver) {
      if (e.changedTouches && e.changedTouches.length > 0) resetAndStart();
      return;
    }
    if (!started || paused || !touchActive) {
      touchActive = false;
      return;
    }
    touchActive = false;
    flap();
  }

  function handleClick(e) {
    if (e && e.target && e.target !== canvas) return;
    if (Date.now() < suppressClickUntil) return;
    if (gameOver) {
      resetAndStart();
    } else {
      flap();
    }
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function validateSavedState(savedState) {
    if (!savedState || typeof savedState !== 'object' || Array.isArray(savedState)) return false;
    if (!savedState.bird || typeof savedState.bird !== 'object' || Array.isArray(savedState.bird)) return false;
    if (!isFiniteNumber(savedState.bird.x) || savedState.bird.x !== BIRD_X) return false;
    if (!isFiniteNumber(savedState.bird.y) ||
        savedState.bird.y < BIRD_RADIUS ||
        savedState.bird.y > CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN - BIRD_RADIUS) return false;
    if (!isFiniteNumber(savedState.bird.vy) || Math.abs(savedState.bird.vy) > MAX_VELOCITY) return false;

    if (!Number.isSafeInteger(savedState.score) || savedState.score < 0 || savedState.score > 100000) return false;
    if (!isFiniteNumber(savedState.speed) || savedState.speed !== speedForScore(savedState.score)) return false;

    if (!Array.isArray(savedState.pipes) || savedState.pipes.length < 1 || savedState.pipes.length > MAX_PIPES) return false;

    let previousX = null;
    let foundUnpassedAhead = false;

    for (let i = 0; i < savedState.pipes.length; i++) {
      const pipe = savedState.pipes[i];
      if (!pipe || typeof pipe !== 'object' || Array.isArray(pipe)) return false;
      if (!isFiniteNumber(pipe.x) || pipe.x < -PIPE_WIDTH - 4 || pipe.x > MAX_PIPE_X) return false;
      if (!isFiniteNumber(pipe.gapY) || pipe.gapY < PIPE_MIN_CENTER || pipe.gapY > PIPE_MAX_CENTER) return false;
      if (typeof pipe.passed !== 'boolean') return false;
      if (previousX !== null && pipe.x - previousX < PIPE_MIN_SPACING) return false;
      previousX = pipe.x;

      if (pipe.passed && pipe.x + PIPE_WIDTH > savedState.bird.x + 1) return false;
      if (!pipe.passed && pipe.x + PIPE_WIDTH < savedState.bird.x) return false;
      if (!pipe.passed && pipe.x + PIPE_WIDTH >= savedState.bird.x) foundUnpassedAhead = true;
      if (pipe.gap !== undefined && (!isFiniteNumber(pipe.gap) || pipe.gap < MIN_GAP || pipe.gap > BASE_GAP)) return false;
    }

    if (!foundUnpassedAhead && savedState.pipes[savedState.pipes.length - 1].x < savedState.bird.x) return false;

    // A live save must contain only geometry that fits inside the playable pipe corridor.
    for (let i = 0; i < savedState.pipes.length; i++) {
      const pipe = savedState.pipes[i];
      const pipeGap = pipe.gap === undefined ? BASE_GAP : pipe.gap;
      const gapTop = pipe.gapY - pipeGap / 2;
      const gapBottom = pipe.gapY + pipeGap / 2;
      if (gapTop < 0 || gapBottom > CANVAS_HEIGHT - PIPE_BOTTOM_MARGIN) return false;
    }

    return true;
  }

  function applyRestoredState(savedState) {
    if (!validateSavedState(savedState)) return false;

    bird = {
      x: savedState.bird.x,
      y: savedState.bird.y,
      vy: savedState.bird.vy
    };
    pipes = savedState.pipes.map(function (pipe) {
      return { x: pipe.x, gapY: pipe.gapY, gap: pipe.gap || BASE_GAP, passed: pipe.passed };
    });
    score = savedState.score;
    speed = savedState.speed;
    started = false;
    paused = false;
    manualPause = false;
    gameOver = false;
    particles = [];
    shakeUntil = 0;
    updateScoreHud();
    return true;
  }

  function serialize() {
    if (!started || gameOver) return null;
    return {
      bird: { x: bird.x, y: bird.y, vy: bird.vy },
      pipes: pipes.map(function (pipe) {
        return { x: pipe.x, gapY: pipe.gapY, gap: pipe.gap || BASE_GAP, passed: pipe.passed };
      }),
      score: score,
      speed: speed
    };
  }

  function init(containerEl, savedState) {
    container = containerEl;

    scoreEl = document.createElement('div');
    scoreEl.className = 'games-score-display games-flappy-score';
    container.appendChild(scoreEl);

    stage = document.createElement('div');
    stage.className = 'games-flappy-stage';

    canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.className = 'games-flappy-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', tr('gamesFlappyBird'));
    canvas.tabIndex = 0;

    ctx = canvas.getContext('2d');
    bgCache = ctx ? buildBackgroundCache() : null;

    stage.appendChild(canvas);
    container.appendChild(stage);

    instructionsEl = document.createElement('div');
    instructionsEl.className = 'games-instructions games-flappy-instructions';
    instructionsEl.textContent = tr('gamesFlappyBirdControls');
    container.appendChild(instructionsEl);

    resetState();
    let restoredRun = false;
    if (savedState) {
      restoredRun = applyRestoredState(savedState);
      if (!restoredRun) {
        window.GameRegistry?.clearSave?.('flappy-bird');
        resetState();
      }
    }

    updateScoreHud();
    draw(nowMs());

    document.addEventListener('keydown', handleKeydown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
    canvas.addEventListener('click', handleClick);

    if (typeof window.gamesHelpers?.createReadyScreen === 'function') {
      readyScreen = window.gamesHelpers.createReadyScreen(stage, {
        text: tr('gamesReady'),
        sub: tr('gamesReadyStart'),
        buttonText: restoredRun ? tr('gamesContinue') : tr('gamesStart'),
        onStart: function () {
          if (restoredRun) {
            started = true;
            paused = false;
            manualPause = false;
            lastFrameAt = nowMs();
            draw(lastFrameAt);
            startAnimation();
            try { canvas.focus(); } catch (_e) { /* ignore */ }
          } else {
            resetAndStart();
          }
        }
      });
    } else {
      resetAndStart();
    }
  }

  function destroy() {
    if (readyScreen) {
      try { readyScreen.remove(); } catch (_e) { /* ignore */ }
      readyScreen = null;
    }

    started = false;
    stopAnimation();
    clearStateOverlay();

    document.removeEventListener('keydown', handleKeydown);
    if (canvas) {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('click', handleClick);
    }

    if (container) container.innerHTML = '';

    container = null;
    stage = null;
    canvas = null;
    ctx = null;
    scoreEl = null;
    instructionsEl = null;
    bgCache = null;
    bird = null;
    pipes = [];
    particles = [];
    touchActive = false;
    suppressClickUntil = 0;
  }

  function pause() {
    if (!started || gameOver) return;
    if (!paused) manualPause = false;
    paused = true;
    stopAnimation();
    draw(nowMs());
  }

  function resume() {
    if (!started || gameOver || manualPause) return;
    paused = false;
    startAnimation();
    draw(nowMs());
  }

  window.GameRegistry?.register({
    id: 'flappy-bird',
    name: 'gamesFlappyBird',
    description: 'gamesFlappyBirdDesc',
    icon: '🐦',
    init: init,
    destroy: destroy,
    pause: pause,
    resume: resume,
    serialize: serialize
  });

  window.__flappyBirdTest = {
    levelForScore: levelForScore,
    speedForScore: speedForScore,
    gapForScore: gapForScore,
    validateSavedState: validateSavedState,
    applyRestoredState: applyRestoredState,
    serialize: serialize,
    getState: function () {
      return {
        bird: bird ? { x: bird.x, y: bird.y, vy: bird.vy } : null,
        pipes: pipes.map(function (pipe) { return { x: pipe.x, gapY: pipe.gapY, passed: pipe.passed }; }),
        score: score,
        speed: speed,
        started: started,
        paused: paused,
        manualPause: manualPause,
        gameOver: gameOver
      };
    },
    forceGameOver: endGame,
    constants: {
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      birdX: BIRD_X,
      birdRadius: BIRD_RADIUS,
      baseSpeed: BASE_SPEED,
      maxSpeed: MAX_SPEED,
      speedStep: SPEED_STEP,
      baseGap: BASE_GAP,
      minGap: MIN_GAP,
      gapStep: GAP_STEP,
      difficultyStepScore: DIFFICULTY_STEP_SCORE
    }
  };
})();
