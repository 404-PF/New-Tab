// src/features/ambient-sounds.js - Ambient focus soundscape player
//
// A small, unobtrusive sound widget that layers calming background audio
// (rain, ocean, wind, forest, café, fire, white/pink noise) over the new tab.
// Each layer is an HTML5 <audio> element looping a short, seamlessly
// crossfaded clip bundled with the extension under `sounds/`.
//
// State (which layers are on + volumes) persists in localStorage so the
// soundscape auto-resumes on the next visit. Autoplay is always opt-in:
// if the browser blocks it (or the user prefers reduced motion) playback
// waits for a user gesture and a "click to start" prompt is shown.

(function () {
  'use strict';

  const STORAGE_KEY = 'ambientSounds';
  const ENABLED_KEY = 'ambientSoundsEnabled';
  const SOUNDS_BASE = 'sounds/';
  const DEFAULT_MASTER = 0.6;
  const DEFAULT_LAYER_VOLUME = 0.5;

  // The available sound layers. `i18n` is the translation key for the label.
  const SOUND_LAYERS = [
    { id: 'rain', i18n: 'ambientSoundRain' },
    { id: 'ocean', i18n: 'ambientSoundOcean' },
    { id: 'wind', i18n: 'ambientSoundWind' },
    { id: 'forest', i18n: 'ambientSoundForest' },
    { id: 'cafe', i18n: 'ambientSoundCafe' },
    { id: 'fire', i18n: 'ambientSoundFire' },
    { id: 'whiteNoise', i18n: 'ambientSoundWhiteNoise' },
    { id: 'pinkNoise', i18n: 'ambientSoundPinkNoise' }
  ];

  let state = null;
  const audioEls = {};
  let audioContainer = null;
  let button = null;
  let popover = null;
  let started = false;
  let gestureHandlerAdded = false;

  // ------------------------------------------------------------------
  // Translation helper
  // ------------------------------------------------------------------
  function t(key, fallback) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      const value = window.i18n.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------
  function loadEnabled() {
    try {
      const stored = localStorage.getItem(ENABLED_KEY);
      if (stored === null) {
        console.warn('Failed to load ambient-sounds enabled: setting not found');
        return false;
      }
      return stored === 'true';
    } catch (e) {
      console.warn('Failed to load ambient-sounds enabled:', e);
      return false;
    }
  }

  function saveEnabled(enabled) {
    try {
      localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to save ambient-sounds enabled:', e);
    }
  }

  function defaultState() {
    const layers = {};
    SOUND_LAYERS.forEach(function (layer) {
      layers[layer.id] = { enabled: false, volume: DEFAULT_LAYER_VOLUME };
    });
    return { masterVolume: DEFAULT_MASTER, layers: layers };
  }

  function loadState() {
    const base = defaultState();
    let parsed = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        parsed = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to parse ambient-sounds state:', e);
    }
    if (!parsed || typeof parsed !== 'object') return base;

    if (typeof parsed.masterVolume === 'number' && isFinite(parsed.masterVolume)) {
      base.masterVolume = Math.min(1, Math.max(0, parsed.masterVolume));
    }
    if (parsed.layers && typeof parsed.layers === 'object') {
      SOUND_LAYERS.forEach(function (layer) {
        const stored = parsed.layers[layer.id];
        if (stored && typeof stored === 'object') {
          const target = base.layers[layer.id];
          if (typeof stored.enabled === 'boolean') target.enabled = stored.enabled;
          if (typeof stored.volume === 'number' && isFinite(stored.volume)) {
            target.volume = Math.min(1, Math.max(0, stored.volume));
          }
        }
      });
    }
    return base;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save ambient-sounds state:', e);
    }
  }

  // ------------------------------------------------------------------
  // Audio elements
  // ------------------------------------------------------------------
  function getAudioContainer() {
    if (audioContainer) return audioContainer;
    const el = document.createElement('div');
    el.className = 'ambient-sounds-audio';
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'none';
    (document.body || document.documentElement).appendChild(el);
    audioContainer = el;
    return el;
  }

  function getAudio(id) {
    if (audioEls[id]) return audioEls[id];
    const el = document.createElement('audio');
    el.src = SOUNDS_BASE + id + '.ogg';
    el.loop = true;
    el.preload = 'auto';
    el.dataset.soundId = id;
    getAudioContainer().appendChild(el);
    audioEls[id] = el;
    return el;
  }

  function effectiveVolume(layerId) {
    const layer = state.layers[layerId];
    if (!layer) return 0;
    return Math.min(1, Math.max(0, state.masterVolume * layer.volume));
  }

  function safePlay(audio, onBlocked) {
    try {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          if (onBlocked) onBlocked(null);
        }).catch(function (err) {
          if (onBlocked) onBlocked(err || new Error('play blocked'));
        });
      }
    } catch (e) {
      if (onBlocked) onBlocked(e);
    }
  }

  function startLayer(layerId) {
    if (!loadEnabled()) return;
    const layer = state.layers[layerId];
    if (!layer || !layer.enabled) return;
    const audio = getAudio(layerId);
    audio.volume = effectiveVolume(layerId);
    safePlay(audio, function (err) {
      if (err) {
        showClickToStart(true);
      } else {
        maybeClearClickToStart();
      }
    });
  }

  function stopLayer(layerId) {
    const audio = audioEls[layerId];
    if (audio) {
      try {
        audio.pause();
      } catch {
        void 0;
      }
    }
  }

  function syncLayer(layerId) {
    const layer = state.layers[layerId];
    if (!layer) return;
    if (layer.enabled) {
      startLayer(layerId);
    } else {
      stopLayer(layerId);
    }
    updateButtonActive();
  }

  function syncAll() {
    const anyEnabled = SOUND_LAYERS.some(function (l) {
      return state.layers[l.id].enabled;
    });
    if (anyEnabled) started = true;
    SOUND_LAYERS.forEach(function (layer) {
      const audio = getAudio(layer.id);
      audio.volume = effectiveVolume(layer.id);
      if (state.layers[layer.id].enabled) {
        startLayer(layer.id);
      } else {
        stopLayer(layer.id);
      }
    });
    updateButtonActive();
  }

  // ------------------------------------------------------------------
  // Click-to-start prompt (autoplay blocked)
  // ------------------------------------------------------------------
  function showClickToStart(show) {
    if (!button) return;
    button.classList.toggle('needs-start', !!show);
  }

  function maybeClearClickToStart() {
    const anyEnabled = SOUND_LAYERS.some(function (l) {
      return state.layers[l.id].enabled;
    });
    if (anyEnabled) showClickToStart(false);
  }

  function ensureResumeOnGesture() {
    if (gestureHandlerAdded) return;
    gestureHandlerAdded = true;
    const handler = function () {
      resume();
    };
    document.addEventListener('pointerdown', handler, { once: true });
    document.addEventListener('keydown', handler, { once: true });
  }

  // Attempt to (re)start every enabled layer. Used after a user gesture.
  function resume() {
    if (!loadEnabled()) return;
    const anyEnabled = SOUND_LAYERS.some(function (l) {
      return state.layers[l.id].enabled;
    });
    if (!anyEnabled) return;
    started = true;
    let pending = 0;
    let blocked = false;
    SOUND_LAYERS.forEach(function (layer) {
      if (state.layers[layer.id].enabled) pending += 1;
    });
    SOUND_LAYERS.forEach(function (layer) {
      if (!state.layers[layer.id].enabled) return;
      const audio = getAudio(layer.id);
      audio.volume = effectiveVolume(layer.id);
      safePlay(audio, function (err) {
        if (err) blocked = true;
        pending -= 1;
        if (pending === 0) showClickToStart(blocked);
      });
    });
  }

  // ------------------------------------------------------------------
  // Public state mutations
  // ------------------------------------------------------------------
  function setEnabled(enabled) {
    saveEnabled(enabled);
    if (enabled) {
      buildWidget();
      if (!(window.prefersReducedMotion && window.prefersReducedMotion())) {
        syncAll();
      }
    } else {
      SOUND_LAYERS.forEach(function (layer) {
        stopLayer(layer.id);
      });
      started = false;
      closePopover();
      if (button) button.style.display = 'none';
    }
  }

  function isEnabled() {
    return loadEnabled();
  }

  function toggleLayer(layerId, enabled) {
    const layer = state.layers[layerId];
    if (!layer) return;
    layer.enabled = enabled;
    saveState();
    if (enabled) {
      started = true;
      // If autoplay is blocked, a subsequent user gesture should resume.
      ensureResumeOnGesture();
    }
    syncLayer(layerId);
    refreshPopover();
  }

  function setLayerVolume(layerId, volume) {
    const layer = state.layers[layerId];
    if (!layer) return;
    layer.volume = Math.min(1, Math.max(0, volume));
    saveState();
    const audio = audioEls[layerId];
    if (audio) audio.volume = effectiveVolume(layerId);
    refreshPopover();
  }

  function setMasterVolume(volume) {
    state.masterVolume = Math.min(1, Math.max(0, volume));
    saveState();
    SOUND_LAYERS.forEach(function (layer) {
      const audio = audioEls[layer.id];
      if (audio) audio.volume = effectiveVolume(layer.id);
    });
    refreshPopover();
  }

  function stopAll() {
    SOUND_LAYERS.forEach(function (layer) {
      state.layers[layer.id].enabled = false;
      stopLayer(layer.id);
    });
    saveState();
    updateButtonActive();
    showClickToStart(false);
    refreshPopover();
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  // ------------------------------------------------------------------
  // Widget + popover UI (built dynamically)
  // ------------------------------------------------------------------
  function buildWidget() {
    if (button) {
      button.style.display = '';
      return;
    }

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ambient-sounds-button';
    button.id = 'ambient-sounds-button';
    button.setAttribute('data-i18n-aria-label', 'ambientSounds');
    button.setAttribute('aria-label', t('ambientSounds', 'Ambient Sounds'));
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M11 5 6 9H2v6h4l5 4V5Z"></path>' +
      '<path class="ambient-speaker-wave" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>' +
      '<path class="ambient-speaker-wave" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>' +
      '</svg>';
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePopover();
    });
    (document.body || document.documentElement).appendChild(button);

    buildPopover();
    updateButtonActive();
  }

  function buildPopover() {
    if (popover) return;

    popover = document.createElement('div');
    popover.className = 'ambient-sounds-popover';
    popover.id = 'ambient-sounds-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', t('ambientSounds', 'Ambient Sounds'));
    popover.hidden = true;

    const header = document.createElement('div');
    header.className = 'ambient-popover-header';

    const title = document.createElement('span');
    title.className = 'ambient-popover-title';
    title.setAttribute('data-i18n', 'ambientSounds');
    title.textContent = t('ambientSounds', 'Ambient Sounds');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ambient-popover-close';
    closeBtn.setAttribute('data-i18n-aria-label', 'ambientClose');
    closeBtn.setAttribute('aria-label', t('ambientClose', 'Close'));
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closePopover();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    popover.appendChild(header);

    // Master volume
    const masterWrap = document.createElement('div');
    masterWrap.className = 'ambient-master';
    const masterLabel = document.createElement('label');
    masterLabel.className = 'ambient-master-label';
    masterLabel.setAttribute('data-i18n', 'ambientMasterVolume');
    masterLabel.textContent = t('ambientMasterVolume', 'Master Volume');
    const masterSlider = document.createElement('input');
    masterSlider.type = 'range';
    masterSlider.className = 'ambient-master-slider';
    masterSlider.min = '0';
    masterSlider.max = '1';
    masterSlider.step = '0.01';
    masterSlider.dataset.role = 'master';
    masterSlider.setAttribute('data-i18n-aria-label', 'ambientMasterVolume');
    masterSlider.setAttribute('aria-label', t('ambientMasterVolume', 'Master Volume'));
    masterSlider.addEventListener('input', function () {
      setMasterVolume(parseFloat(masterSlider.value));
    });
    masterWrap.appendChild(masterLabel);
    masterWrap.appendChild(masterSlider);
    popover.appendChild(masterWrap);

    // Layers
    const layersWrap = document.createElement('div');
    layersWrap.className = 'ambient-layers';
    SOUND_LAYERS.forEach(function (layer) {
      const row = document.createElement('div');
      row.className = 'ambient-layer-row';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ambient-layer-toggle';
      toggle.dataset.soundId = layer.id;
      toggle.setAttribute('data-i18n', layer.i18n);
      toggle.setAttribute('aria-pressed', 'false');
      toggle.textContent = t(layer.i18n, layer.id);
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        const next = toggle.getAttribute('aria-pressed') !== 'true';
        toggleLayer(layer.id, next);
      });

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'ambient-layer-slider';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.dataset.soundId = layer.id;
      slider.setAttribute('data-i18n-aria-label', layer.i18n);
      slider.setAttribute('aria-label', t(layer.i18n, layer.id));
      slider.addEventListener('input', function () {
        setLayerVolume(layer.id, parseFloat(slider.value));
      });

      row.appendChild(toggle);
      row.appendChild(slider);
      layersWrap.appendChild(row);
    });
    popover.appendChild(layersWrap);

    // Stop all
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'ambient-stop-all';
    stopBtn.setAttribute('data-i18n', 'ambientStopAll');
    stopBtn.textContent = t('ambientStopAll', 'Stop All');
    stopBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      stopAll();
    });
    popover.appendChild(stopBtn);

    (document.body || document.documentElement).appendChild(popover);

    // Close when clicking outside the popover/button
    document.addEventListener('click', function (e) {
      if (!popover || popover.hidden) return;
      if (popover.contains(e.target) || (button && button.contains(e.target))) return;
      closePopover();
    });

    refreshPopover();
  }

  function openPopover() {
    if (!popover) return;
    popover.hidden = false;
    if (button) button.setAttribute('aria-expanded', 'true');
    refreshPopover();
  }

  function closePopover() {
    if (!popover) return;
    popover.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function togglePopover() {
    if (!loadEnabled()) return;
    if (!popover) return;
    if (popover.hidden) {
      openPopover();
    } else {
      closePopover();
    }
  }

  function refreshPopover() {
    if (!popover) return;
    const masterSlider = popover.querySelector('.ambient-master-slider');
    if (masterSlider) masterSlider.value = String(state.masterVolume);
    SOUND_LAYERS.forEach(function (layer) {
      const layerState = state.layers[layer.id];
      const toggle = popover.querySelector('.ambient-layer-toggle[data-sound-id="' + layer.id + '"]');
      const slider = popover.querySelector('.ambient-layer-slider[data-sound-id="' + layer.id + '"]');
      if (toggle) {
        toggle.setAttribute('aria-pressed', layerState.enabled ? 'true' : 'false');
        toggle.classList.toggle('active', layerState.enabled);
      }
      if (slider) slider.value = String(layerState.volume);
    });
  }

  function updateButtonActive() {
    if (!button) return;
    const anyEnabled = SOUND_LAYERS.some(function (l) {
      return state.layers[l.id].enabled;
    });
    button.classList.toggle('active', anyEnabled);
  }

  // ------------------------------------------------------------------
  // Visibility handling: pause when tab hidden, resume when visible again
  // ------------------------------------------------------------------
  function initVisibility() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        SOUND_LAYERS.forEach(function (layer) {
          if (state.layers[layer.id].enabled) stopLayer(layer.id);
        });
      } else if (started && loadEnabled() &&
        !(window.prefersReducedMotion && window.prefersReducedMotion())) {
        SOUND_LAYERS.forEach(function (layer) {
          if (state.layers[layer.id].enabled) startLayer(layer.id);
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // Settings toggle wiring (bound once)
  // ------------------------------------------------------------------
  let settingsBound = false;

  function initSettingsToggle() {
    if (settingsBound) return;
    settingsBound = true;
    const checkbox = document.getElementById('ambient-sounds-setting');
    if (checkbox) {
      checkbox.checked = loadEnabled();
      checkbox.addEventListener('change', function () {
        setEnabled(this.checked);
      });
    }
  }

  // ------------------------------------------------------------------
  // Global listeners (bound once)
  // ------------------------------------------------------------------
  let listenersBound = false;

  function bindGlobalListeners() {
    if (listenersBound) return;
    listenersBound = true;

    initVisibility();

    window.addEventListener('languageChanged', function () {
      if (button) {
        button.setAttribute('aria-label', t('ambientSounds', 'Ambient Sounds'));
      }
      if (popover) {
        popover.setAttribute('aria-label', t('ambientSounds', 'Ambient Sounds'));
      }
      refreshPopover();
    });
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    state = loadState();

    if (loadEnabled()) {
      buildWidget();
      const anyEnabled = SOUND_LAYERS.some(function (l) {
        return state.layers[l.id].enabled;
      });
      if (anyEnabled) {
        ensureResumeOnGesture();
        // Auto-resume only when motion is allowed; otherwise wait for the user.
        if (!(window.prefersReducedMotion && window.prefersReducedMotion())) {
          syncAll();
        }
      }
    }

    bindGlobalListeners();
    initSettingsToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AmbientSounds = {
    init: init,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    toggleLayer: toggleLayer,
    setLayerVolume: setLayerVolume,
    setMasterVolume: setMasterVolume,
    stopAll: stopAll,
    resume: resume,
    getState: getState,
    SOUND_LAYERS: SOUND_LAYERS
  };
})();
