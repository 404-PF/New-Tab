(function () {
  const MAX_PARTICLES = 22;
  const DPR_CAP = 1.5;

  let canvasEl = null;
  let ctx = null;
  let containerEl = null;
  let width = 0;
  let height = 0;
  let devicePixelRatioValue = 1;
  let rafId = 0;
  let isInitialized = false;
  let isEnabled = false;
  let currentBackgroundId = '';
  let lastFrameTime = 0;
  let particles = [];
  let animationListenersBound = false;
  let pointer = {
    x: 0.5,
    y: 0.45,
    targetX: 0.5,
    targetY: 0.45,
  };
  let reducedMotionQuery = null;
  let canvasSupported = null;
  let resizeHandler = null;
  let pointerMoveHandler = null;
  let pointerLeaveHandler = null;
  let visibilityHandler = null;
  let mediaQueryHandler = null;
  let lifecycleListenersBound = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1.2 + Math.random() * 2.8,
      speedX: (Math.random() - 0.5) * 0.18,
      speedY: (Math.random() - 0.5) * 0.16,
      drift: 0.6 + Math.random() * 1.4,
      alpha: 0.18 + Math.random() * 0.28,
    };
  }

  function supportsCanvas() {
    if (canvasSupported !== null) {
      return canvasSupported;
    }

    const testCanvas = document.createElement('canvas');
    canvasSupported = !!(testCanvas.getContext && testCanvas.getContext('2d'));
    return canvasSupported;
  }

  function prefersReducedMotion() {
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  function isSupported() {
    return supportsCanvas();
  }

  function initParticles() {
    const count = Math.min(MAX_PARTICLES, Math.max(12, Math.round((width * height) / 90000)));

    while (particles.length < count) {
      particles.push(createParticle());
    }

    if (particles.length > count) {
      particles.length = count;
    }

    for (let index = 0; index < particles.length; index += 1) {
      particles[index].x = clamp(particles[index].x, 0, width);
      particles[index].y = clamp(particles[index].y, 0, height);
    }
  }

  function resizeCanvas() {
    if (!canvasEl || !ctx || !containerEl) {
      return;
    }

    const rect = containerEl.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    devicePixelRatioValue = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    canvasEl.width = Math.round(width * devicePixelRatioValue);
    canvasEl.height = Math.round(height * devicePixelRatioValue);
    canvasEl.style.width = width + 'px';
    canvasEl.style.height = height + 'px';

    ctx.setTransform(devicePixelRatioValue, 0, 0, devicePixelRatioValue, 0, 0);
    initParticles();
  }

  function updatePointer(event) {
    if (!containerEl) {
      return;
    }

    const rect = containerEl.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    pointer.targetX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    pointer.targetY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  }

  function resetPointer() {
    pointer.targetX = 0.5;
    pointer.targetY = 0.45;
  }

  function updateParticle(particle, delta) {
    const driftX = (pointer.x - 0.5) * particle.drift;
    const driftY = (pointer.y - 0.5) * particle.drift;

    particle.x += (particle.speedX + driftX) * delta;
    particle.y += (particle.speedY + driftY) * delta;

    if (particle.x < -20) particle.x = width + 20;
    if (particle.x > width + 20) particle.x = -20;
    if (particle.y < -20) particle.y = height + 20;
    if (particle.y > height + 20) particle.y = -20;
  }

  function drawGlow(x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function render(timestamp) {
    if (!isEnabled || !ctx || !canvasEl) {
      return;
    }

    if (document.hidden || prefersReducedMotion()) {
      stopAnimation();
      return;
    }

    const delta = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 16.67, 2.5) : 1;
    lastFrameTime = timestamp;

    pointer.x += (pointer.targetX - pointer.x) * 0.08;
    pointer.y += (pointer.targetY - pointer.y) * 0.08;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(4, 10, 22, 0.18)';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'screen';

    const glowX = width * (0.28 + (pointer.x - 0.5) * 0.18);
    const glowY = height * (0.26 + (pointer.y - 0.5) * 0.14);
    const glowX2 = width * (0.78 - (pointer.x - 0.5) * 0.12);
    const glowY2 = height * (0.72 - (pointer.y - 0.5) * 0.1);

    drawGlow(glowX, glowY, Math.max(width, height) * 0.42, 'rgba(91, 205, 255, 0.17)');
    drawGlow(glowX2, glowY2, Math.max(width, height) * 0.36, 'rgba(167, 139, 250, 0.14)');
    drawGlow(width * 0.5, height * 0.52, Math.max(width, height) * 0.26, 'rgba(125, 211, 252, 0.08)');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    particles.forEach((particle) => {
      updateParticle(particle, delta);
      ctx.globalAlpha = particle.alpha;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'source-over';
    rafId = window.requestAnimationFrame(render);
  }

  function startAnimation() {
    if (rafId || !isEnabled || document.hidden || prefersReducedMotion()) {
      return;
    }

    bindAnimationListeners();

    if (containerEl) {
      containerEl.classList.add('interactive-active');
    }

    if (canvasEl) {
      canvasEl.hidden = false;
    }

    lastFrameTime = 0;
    rafId = window.requestAnimationFrame(render);
  }

  function stopAnimation() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    lastFrameTime = 0;

    if (containerEl) {
      containerEl.classList.remove('interactive-active');
    }

    if (canvasEl) {
      canvasEl.hidden = true;
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
      }
    }

    unbindAnimationListeners();
  }

  function updateAnimationState() {
    if (!isEnabled || prefersReducedMotion() || document.hidden) {
      stopAnimation();
      return;
    }

    startAnimation();
  }

  function init() {
    if (isInitialized) {
      return;
    }

    canvasEl = document.getElementById('bg-interactive');
    containerEl = document.getElementById('background-container');

    if (!canvasEl || !containerEl || !isSupported()) {
      return;
    }

    ctx = canvasEl.getContext('2d');
    if (!ctx) {
      return;
    }

    reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    resizeHandler = function () {
      if (!isEnabled) {
        return;
      }

      resizeCanvas();
    };

    pointerMoveHandler = updatePointer;
    pointerLeaveHandler = resetPointer;
    visibilityHandler = updateAnimationState;
    mediaQueryHandler = updateAnimationState;

    bindLifecycleListeners();

    canvasEl.hidden = true;
    isInitialized = true;
  }

  function bindLifecycleListeners() {
    if (lifecycleListenersBound) {
      return;
    }

    if (visibilityHandler) {
      document.addEventListener('visibilitychange', visibilityHandler);
    }

    if (reducedMotionQuery && mediaQueryHandler) {
      if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', mediaQueryHandler);
      } else if (typeof reducedMotionQuery.addListener === 'function') {
        reducedMotionQuery.addListener(mediaQueryHandler);
      }
    }

    lifecycleListenersBound = true;
  }

  function bindAnimationListeners() {
    if (animationListenersBound) {
      return;
    }

    if (resizeHandler) {
      window.addEventListener('resize', resizeHandler);
    }
    if (pointerMoveHandler) {
      window.addEventListener('pointermove', pointerMoveHandler, { passive: true });
    }
    if (pointerLeaveHandler) {
      containerEl.addEventListener('pointerleave', pointerLeaveHandler, { passive: true });
    }

    animationListenersBound = true;
  }

  function unbindAnimationListeners() {
    if (!animationListenersBound) {
      return;
    }

    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
    }
    if (pointerMoveHandler) {
      window.removeEventListener('pointermove', pointerMoveHandler);
    }
    if (pointerLeaveHandler) {
      containerEl.removeEventListener('pointerleave', pointerLeaveHandler);
    }

    animationListenersBound = false;
  }

  function apply(backgroundId) {
    init();

    if (!canvasEl || !ctx || !containerEl || !isSupported()) {
      return false;
    }

    currentBackgroundId = backgroundId || '';
    isEnabled = true;

    resizeCanvas();
    updateAnimationState();
    return true;
  }

  function stop() {
    currentBackgroundId = '';
    isEnabled = false;
    stopAnimation();
  }

  window._interactiveBackground = {
    apply: apply,
    stop: stop,
    isSupported: isSupported,
    currentBackgroundId: function () {
      return currentBackgroundId;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();