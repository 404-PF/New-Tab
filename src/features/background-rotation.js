// src/features/background-rotation.js - Background rotation/scheduling

(function () {
  'use strict';

  const ROTATION_ENABLED_KEY = 'bgRotationEnabled';
  const ROTATION_INTERVAL_KEY = 'bgRotationInterval';
  const ROTATION_SELECTION_KEY = 'bgRotationSelection';

  const INTERVAL_OPTIONS = {
    '5min': 5 * 60 * 1000,
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1hour': 60 * 60 * 1000,
    'hourly': 60 * 60 * 1000,
    'daily': 24 * 60 * 60 * 1000,
  };

  let rotationTimer = null;

  function loadEnabled() {
    return localStorage.getItem(ROTATION_ENABLED_KEY) === 'true';
  }

  function loadInterval() {
    return localStorage.getItem(ROTATION_INTERVAL_KEY) || '30min';
  }

  function loadSelection() {
    try {
      const raw = localStorage.getItem(ROTATION_SELECTION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_err) { /* ignore parse errors */ }
    return null;
  }

  function saveEnabled(value) {
    localStorage.setItem(ROTATION_ENABLED_KEY, value ? 'true' : 'false');
  }

  function saveInterval(value) {
    localStorage.setItem(ROTATION_INTERVAL_KEY, value);
  }

  function saveSelection(ids) {
    localStorage.setItem(ROTATION_SELECTION_KEY, JSON.stringify(ids));
  }

  function getAllBackgrounds() {
    if (!window._backgrounds) return [];
    return window._backgrounds;
  }

  function getRotatableBackgrounds() {
    const selection = loadSelection();
    const all = getAllBackgrounds();
    if (selection) {
      return all.filter(function (bg) { return selection.indexOf(bg.id) !== -1; });
    }
    return all;
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  let shuffledPool = [];
  let poolIndex = 0;

  function getNextBackground() {
    const pool = getRotatableBackgrounds();
    if (pool.length === 0) return null;

    if (shuffledPool.length === 0 || poolChanged(pool)) {
      shuffledPool = shuffleArray(pool);
      poolIndex = 0;
    }

    const bg = shuffledPool[poolIndex];
    poolIndex = (poolIndex + 1) % shuffledPool.length;
    return bg;
  }

  function poolChanged(currentPool) {
    if (shuffledPool.length !== currentPool.length) return true;
    for (let i = 0; i < currentPool.length; i++) {
      if (currentPool[i].id !== shuffledPool[i].id) return true;
    }
    return false;
  }

  function advanceBackground() {
    const bg = getNextBackground();
    if (!bg) return;
    localStorage.setItem('homepageBg', bg.id);
    if (typeof window.applyBg === 'function') {
      window.applyBg();
    }
  }

  function startRotation() {
    stopRotation();
    if (!loadEnabled()) return;

    const pool = getRotatableBackgrounds();
    if (pool.length <= 1) return;

    const intervalKey = loadInterval();
    const ms = INTERVAL_OPTIONS[intervalKey] || INTERVAL_OPTIONS['30min'];

    rotationTimer = new window.VisibilityInterval(function () {
      advanceBackground();
    }, ms, false);

    shuffledPool = shuffleArray(pool);
    poolIndex = 0;
  }

  function stopRotation() {
    if (rotationTimer) {
      rotationTimer.destroy();
      rotationTimer = null;
    }
    shuffledPool = [];
    poolIndex = 0;
  }

  function applyRotation() {
    if (loadEnabled()) {
      startRotation();
    } else {
      stopRotation();
    }
  }

  function renderBackgroundPicker() {
    const container = document.getElementById('bg-rotation-picker');
    if (!container) return;

    container.innerHTML = '';
    const all = getAllBackgrounds();
    const selection = loadSelection();

    all.forEach(function (bg) {
      const label = document.createElement('label');
      label.className = 'bg-rotation-pick-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = bg.id;
      checkbox.checked = selection ? selection.indexOf(bg.id) !== -1 : true;

      const img = document.createElement('img');
      img.className = 'bg-rotation-pick-thumb';
      img.src = bg.thumb;
      img.alt = bg.title;
      img.loading = 'lazy';

      const name = document.createElement('span');
      name.className = 'bg-rotation-pick-name';
      name.textContent = bg.title;

      label.appendChild(checkbox);
      label.appendChild(img);
      label.appendChild(name);
      container.appendChild(label);
    });
  }

  function initRotationUI() {
    const toggle = document.getElementById('bg-rotation-toggle');
    const intervalSelect = document.getElementById('bg-rotation-interval');
    const optionsEl = document.getElementById('bg-rotation-options');
    const pickerWrap = document.getElementById('bg-rotation-picker-wrap');
    const nextBtn = document.getElementById('bg-rotation-next');

    if (toggle) {
      toggle.checked = loadEnabled();
      toggle.addEventListener('change', function () {
        saveEnabled(toggle.checked);
        if (optionsEl) optionsEl.hidden = !toggle.checked;
        if (pickerWrap) pickerWrap.hidden = !toggle.checked;
        applyRotation();
      });

      if (optionsEl) optionsEl.hidden = !toggle.checked;
      if (pickerWrap) pickerWrap.hidden = !toggle.checked;
    }

    if (intervalSelect) {
      intervalSelect.value = loadInterval();
      intervalSelect.addEventListener('change', function () {
        saveInterval(intervalSelect.value);
        if (loadEnabled()) startRotation();
      });
    }

    if (pickerWrap) {
      pickerWrap.hidden = !loadEnabled();
    }

    renderBackgroundPicker();

    const pickerContainer = document.getElementById('bg-rotation-picker');
    if (pickerContainer) {
      pickerContainer.addEventListener('change', function (e) {
        if (e.target.matches && e.target.matches('.bg-rotation-pick-item input[type="checkbox"]')) {
          const checkboxes = pickerContainer.querySelectorAll('input[type="checkbox"]');
          const selected = [];
          checkboxes.forEach(function (cb) {
            if (cb.checked) selected.push(cb.value);
          });
          saveSelection(selected);
          if (loadEnabled()) startRotation();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        advanceBackground();
      });
    }
  }

  function init() {
    initRotationUI();
    applyRotation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BackgroundRotation = {
    apply: applyRotation,
    advance: advanceBackground,
    isEnabled: loadEnabled,
    getInterval: loadInterval,
    getSelection: loadSelection,
    start: startRotation,
    stop: stopRotation,
    renderPicker: renderBackgroundPicker,
    initUI: initRotationUI,
  };
})();
