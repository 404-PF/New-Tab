// src/features/auto-theme.js - Automatic dark/light theme switching by time of day

(function () {
  'use strict';

  const STORAGE_KEY_ENABLED = 'autoTheme';
  const STORAGE_KEY_LIGHT_TIME = 'autoThemeLightTime';
  const STORAGE_KEY_DARK_TIME = 'autoThemeDarkTime';
  const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

  const DEFAULT_LIGHT_TIME = '07:00';
  const DEFAULT_DARK_TIME = '19:00';

  let checkTimer = null;
  let lastScheduledTheme = null; // Track last scheduled theme to detect boundary crossings
  let isInitialized = false;

  function loadEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
    } catch (e) {
      console.warn('Failed to read auto-theme enabled state from localStorage:', e);
      return false;
    }
  }

  function reportSaveError() {
    if (typeof window.showFeatureToggleSaveError === 'function') {
      window.showFeatureToggleSaveError();
    }
  }

  // Snap the toggle, time inputs, radios, and times visibility back to the
  // persisted state after a rejected write so the UI never claims a schedule
  // storage did not accept (#1081).
  function resyncControls() {
    const toggle = document.getElementById('auto-theme-toggle');
    const lightInput = document.getElementById('auto-theme-light-time');
    const darkInput = document.getElementById('auto-theme-dark-time');
    if (toggle) toggle.checked = loadEnabled();
    if (lightInput) lightInput.value = loadLightTime();
    if (darkInput) darkInput.value = loadDarkTime();
    updateTimesVisibility();
    if (loadEnabled()) {
      disableManualRadios();
    } else {
      enableManualRadios();
    }
  }

  function persistSettingLocal(key, value) {
    if (typeof window.persistSetting === 'function') {
      return window.persistSetting(key, value);
    }
    let persisted;
    try {
      persisted = typeof window.persistFeatureToggle === 'function'
        ? window.persistFeatureToggle(key, value)
        : localStorage.setItem(key, value) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (error) {
      console.warn('Failed to save ' + key + ':', error);
      persisted = false;
    }
    return persisted;
  }

  function saveEnabled(enabled) {
    return persistSettingLocal(STORAGE_KEY_ENABLED, String(enabled));
  }

  function loadLightTime() {
    try {
      return localStorage.getItem(STORAGE_KEY_LIGHT_TIME) || DEFAULT_LIGHT_TIME;
    } catch (e) {
      console.warn('Failed to read auto-theme light time from localStorage:', e);
      return DEFAULT_LIGHT_TIME;
    }
  }

  function saveLightTime(time) {
    return persistSettingLocal(STORAGE_KEY_LIGHT_TIME, time);
  }

  function loadDarkTime() {
    try {
      return localStorage.getItem(STORAGE_KEY_DARK_TIME) || DEFAULT_DARK_TIME;
    } catch (e) {
      console.warn('Failed to read auto-theme dark time from localStorage:', e);
      return DEFAULT_DARK_TIME;
    }
  }

  function saveDarkTime(time) {
    return persistSettingLocal(STORAGE_KEY_DARK_TIME, time);
  }

  // Parse "HH:MM" string into minutes since midnight
  function parseTimeMinutes(timeStr) {
    const parts = String(timeStr).split(':');
    if (parts.length !== 2) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  }

  // Determine which theme should be active based on current time.
  // Between light-time and dark-time → light; otherwise → dark.
  function getScheduledTheme() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const lightMinutes = parseTimeMinutes(loadLightTime());
    const darkMinutes = parseTimeMinutes(loadDarkTime());

    if (lightMinutes < darkMinutes) {
      // e.g. light 07:00, dark 19:00 — light during the day
      return (currentMinutes >= lightMinutes && currentMinutes < darkMinutes) ? 'light' : 'dark';
    } else if (lightMinutes > darkMinutes) {
      // e.g. light 19:00, dark 07:00 — inverted schedule
      return (currentMinutes >= darkMinutes && currentMinutes < lightMinutes) ? 'dark' : 'light';
    }
    // Same time — default to dark
    return 'dark';
  }

  // Returns whether the storage bridge accepted the write the way
  // persistSetting does, so checkAndApply only consumes the schedule
  // boundary once the switch actually landed (#1242).
  function setTheme(theme) {
    if (window.loadTheme && window.loadTheme() === theme) return true;
    let persisted;
    try {
      persisted = localStorage.setItem('theme', theme) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch {
      // localStorage unavailable
      persisted = false;
    }
    if (window.applyTheme) window.applyTheme();
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme } }));
    return persisted;
  }

  function checkAndApply() {
    if (!loadEnabled()) return;
    const theme = getScheduledTheme();
    // Only apply if the scheduled theme has changed (boundary crossing)
    // This preserves manual overrides until the next scheduled switch
    if (theme !== lastScheduledTheme) {
      // A stored 'system' theme (issue #1011) takes precedence over the
      // schedule: track the boundary but let the OS preference decide the
      // effective theme instead of overwriting the stored value.
      const storedTheme = window.loadTheme?.();
      if (storedTheme === 'system') {
        lastScheduledTheme = theme;
        syncRadioButtons();
        return;
      }
      // Consume the boundary only once the write lands: a rejected theme
      // write leaves it pending so the next tick retries the switch (#1242).
      const persisted = setTheme(theme);
      lastScheduledTheme = persisted ? theme : null;
      syncRadioButtons();
      if (!persisted) reportSaveError();
    }
  }

  function syncRadioButtons() {
    const theme = (window.loadTheme && window.loadTheme()) || 'dark';
    ['dark', 'light', 'system'].forEach(function (value) {
      const radio = document.querySelector('input[name="theme"][value="' + value + '"]');
      if (radio) radio.checked = theme === value;
    });
  }

  function updateTimesVisibility() {
    const toggle = document.getElementById('auto-theme-toggle');
    const timesContainer = document.getElementById('auto-theme-times');
    if (timesContainer) {
      timesContainer.style.display = toggle && toggle.checked ? 'block' : 'none';
    }
  }

  function startInterval() {
    stopInterval();
    if (typeof window.VisibilityInterval === 'function') {
      checkTimer = new window.VisibilityInterval(checkAndApply, CHECK_INTERVAL_MS);
    } else {
      checkTimer = setInterval(checkAndApply, CHECK_INTERVAL_MS);
    }
  }

  function stopInterval() {
    if (checkTimer) {
      if (checkTimer.destroy) {
        checkTimer.destroy();
      } else {
        clearInterval(checkTimer);
      }
      checkTimer = null;
    }
  }

  function enableAutoTheme() {
    if (!saveEnabled(true)) {
      resyncControls();
      reportSaveError();
      return;
    }
    lastScheduledTheme = null;
    checkAndApply();
    startInterval();
    updateTimesVisibility();
    disableManualRadios();
  }

  function disableAutoTheme() {
    if (!saveEnabled(false)) {
      resyncControls();
      reportSaveError();
      return;
    }
    stopInterval();
    lastScheduledTheme = null;
    updateTimesVisibility();
    enableManualRadios();
  }

  function disableManualRadios() {
    const labels = document.querySelectorAll('.theme-option');
    labels.forEach(function (label) { label.classList.add('auto-active'); });
  }

  function enableManualRadios() {
    const labels = document.querySelectorAll('.theme-option');
    labels.forEach(function (label) { label.classList.remove('auto-active'); });
  }

  // Manual override: user clicks a theme radio while auto-theme is on
  function onManualThemeChange(e) {
    if (e.target.name !== 'theme') return;
    if (!loadEnabled()) return;
    // Apply the manually chosen theme and record it, but leave auto enabled.
    // The next scheduled check will overwrite it if the time has changed.
    const selectedTheme = e.target.value;
    let committed;
    if (typeof window.commitTheme === 'function') {
      committed = window.commitTheme(selectedTheme);
    } else {
      try {
        committed = localStorage.setItem('theme', selectedTheme) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
      } catch {
        // localStorage unavailable
        committed = false;
      }
      if (window.applyTheme) window.applyTheme();
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: selectedTheme } }));
    }
    // A rejected scheduled write leaves its boundary pending so the next tick
    // retries the switch. A successful manual choice settles that pending
    // retry so it cannot overwrite the user's theme 30 seconds later (#1242).
    if (committed && lastScheduledTheme === null) {
      lastScheduledTheme = getScheduledTheme();
    }
    // Prevent the settings.js change handler from double-applying
    e.stopImmediatePropagation();
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    const toggle = document.getElementById('auto-theme-toggle');
    const lightInput = document.getElementById('auto-theme-light-time');
    const darkInput = document.getElementById('auto-theme-dark-time');

    if (!toggle) return;

    // Restore saved state
    toggle.checked = loadEnabled();
    if (lightInput) lightInput.value = loadLightTime();
    if (darkInput) darkInput.value = loadDarkTime();

    updateTimesVisibility();

    if (loadEnabled()) {
      disableManualRadios();
      lastScheduledTheme = null;
      checkAndApply();
      startInterval();
    }

    toggle.addEventListener('change', function () {
      if (toggle.checked) {
        enableAutoTheme();
      } else {
        disableAutoTheme();
      }
    });

    if (lightInput) {
      lightInput.addEventListener('change', function () {
        if (!saveLightTime(lightInput.value)) {
          lightInput.value = loadLightTime();
          reportSaveError();
          return;
        }
        if (loadEnabled()) {
          lastScheduledTheme = null;
          checkAndApply();
        }
      });
    }

    if (darkInput) {
      darkInput.addEventListener('change', function () {
        if (!saveDarkTime(darkInput.value)) {
          darkInput.value = loadDarkTime();
          reportSaveError();
          return;
        }
        if (loadEnabled()) {
          lastScheduledTheme = null;
          checkAndApply();
        }
      });
    }

    // Listen for manual theme radio changes (capture phase to intercept before settings.js)
    document.addEventListener('change', onManualThemeChange, true);
  }

  // Re-read the persisted keys and re-sync the toggle, time inputs, radios,
  // and scheduler. Used by data-manager after a settings import (issue #838)
  // because init() is a one-shot guarded no-op once initialized.
  function refresh() {
    if (!isInitialized) {
      init();
      return;
    }
    const toggle = document.getElementById('auto-theme-toggle');
    const lightInput = document.getElementById('auto-theme-light-time');
    const darkInput = document.getElementById('auto-theme-dark-time');
    if (!toggle) return;

    toggle.checked = loadEnabled();
    if (lightInput) lightInput.value = loadLightTime();
    if (darkInput) darkInput.value = loadDarkTime();
    updateTimesVisibility();

    if (loadEnabled()) {
      disableManualRadios();
      // Keep lastScheduledTheme so checkAndApply only switches the theme when
      // the imported schedule actually crossed a boundary; a manual override
      // survives an import that does not change the current scheduled theme.
      checkAndApply();
      startInterval();
    } else {
      stopInterval();
      lastScheduledTheme = null;
      enableManualRadios();
    }
  }

  // True when a control still shows the rejected value the bridge has
  // already rolled back (mirrors toast.js's featureToggleControlDesynced for
  // the auto-theme keys).
  function controlDesynced(key) {
    if (key === 'theme') {
      // Mirror toast.js's theme case (#1242): the optimistic radio/body
      // class still shows the rejected theme after the bridge rolled back.
      if (typeof window.applyTheme !== 'function') return false;
      const stored = typeof window.loadTheme === 'function'
        ? window.loadTheme()
        : (localStorage.getItem('theme') || 'dark');
      const checked = document.querySelector('input[name="theme"]:checked');
      if (checked && checked.value !== stored) return true;
      const effective = typeof window.resolveTheme === 'function' ? window.resolveTheme(stored) : stored;
      return document.body.classList.contains('light-theme') !== (effective === 'light');
    }
    if (key === STORAGE_KEY_ENABLED) {
      const toggle = document.getElementById('auto-theme-toggle');
      return Boolean(toggle) && toggle.checked !== loadEnabled();
    }
    const lightInput = document.getElementById('auto-theme-light-time');
    const darkInput = document.getElementById('auto-theme-dark-time');
    if (key === STORAGE_KEY_LIGHT_TIME) {
      return Boolean(lightInput) && lightInput.value !== loadLightTime();
    }
    return Boolean(darkInput) && darkInput.value !== loadDarkTime();
  }

  // #1242: setItem accepts the theme write optimistically, so the rollback
  // event is the only signal that a scheduled switch never landed. Un-consume
  // the boundary the failed write consumed — guarded to that exact value and
  // to the still-optimistic stored value so a late failure cannot re-arm the
  // scheduler after a newer manual override won the write — and, only when
  // toast.js is absent, mirror its theme resync through controlDesynced.
  // Registered unconditionally: the boundary reset is scheduler bookkeeping,
  // not a resync, so it can never duplicate toast.js's centralized handler.
  window.addEventListener('storageBridgeWriteError', function (event) {
    const detail = event && event.detail ? event.detail : null;
    if (!detail || detail.key !== 'theme') return;
    let storedTheme = null;
    try {
      storedTheme = typeof window.loadTheme === 'function'
        ? window.loadTheme()
        : localStorage.getItem('theme');
    } catch (e) {
      console.warn('Failed to read theme from localStorage:', e);
    }
    // The bridge dispatches before rolling its cache back, so a still-matching
    // value means the failed scheduled write still owns storage. A newer
    // successful manual write has already replaced it and must be preserved.
    if (detail.value === lastScheduledTheme && storedTheme === detail.value) {
      lastScheduledTheme = null;
    }
    if (typeof window.persistFeatureToggle === 'function') return;
    // Wait a macrotask for the bridge to roll its cache back, then skip
    // when the synchronous failure path already reapplied the controls.
    setTimeout(function () {
      if (!controlDesynced('theme')) return;
      if (window.applyTheme) window.applyTheme();
      // Mirror toast.js's theme resync so listeners (e.g. AI chat) learn the
      // restored effective theme instead of the rejected optimistic one.
      if (typeof window.loadTheme === 'function' && typeof window.resolveTheme === 'function') {
        window.dispatchEvent(new CustomEvent('themeChanged', {
          detail: { theme: window.resolveTheme(window.loadTheme()) }
        }));
      }
      reportSaveError();
    });
  });

  // Fallback half of #1081: when toast.js failed to load, its centralized
  // storageBridgeWriteError listener does not exist, so an async rejection
  // (setItem already returned true) would strand the toggle, time inputs,
  // and scheduler on the rejected value. Register this mirror only while
  // persistSetting's fallback path is in play, so it can never duplicate the
  // centralized listener when toast.js did load.
  if (typeof window.persistFeatureToggle !== 'function') {
    window.addEventListener('storageBridgeWriteError', function (event) {
      const key = event && event.detail ? event.detail.key : null;
      if (key !== STORAGE_KEY_ENABLED && key !== STORAGE_KEY_LIGHT_TIME && key !== STORAGE_KEY_DARK_TIME) return;
      // Wait a macrotask for the bridge to roll its cache back, then skip
      // when the synchronous failure path already reapplied the controls.
      setTimeout(function () {
        if (!controlDesynced(key)) return;
        refresh();
        reportSaveError();
      });
    });
  }

  // Expose for settings.js to call after initSettings
  window.initAutoTheme = init;

  // Expose for data-manager to re-apply imported auto-theme settings live
  window.refreshAutoTheme = refresh;

  // Also auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
