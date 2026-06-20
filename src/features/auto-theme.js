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
  let lastAppliedTheme = null;
  let lastScheduledTheme = null; // Track last scheduled theme to detect boundary crossings

  function loadEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
    } catch (_) {
      return false;
    }
  }

  function saveEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
    } catch (_) {
      // localStorage unavailable
    }
  }

  function loadLightTime() {
    try {
      return localStorage.getItem(STORAGE_KEY_LIGHT_TIME) || DEFAULT_LIGHT_TIME;
    } catch (_) {
      return DEFAULT_LIGHT_TIME;
    }
  }

  function saveLightTime(time) {
    try {
      localStorage.setItem(STORAGE_KEY_LIGHT_TIME, time);
    } catch (_) {
      // localStorage unavailable
    }
  }

  function loadDarkTime() {
    try {
      return localStorage.getItem(STORAGE_KEY_DARK_TIME) || DEFAULT_DARK_TIME;
    } catch (_) {
      return DEFAULT_DARK_TIME;
    }
  }

  function saveDarkTime(time) {
    try {
      localStorage.setItem(STORAGE_KEY_DARK_TIME, time);
    } catch (_) {
      // localStorage unavailable
    }
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

  function setTheme(theme) {
    if (window.loadTheme && window.loadTheme() === theme) return;
    try {
      localStorage.setItem('theme', theme);
    } catch (_) {
      // localStorage unavailable
    }
    if (window.applyTheme) window.applyTheme();
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme } }));
  }

  function checkAndApply() {
    if (!loadEnabled()) return;
    const theme = getScheduledTheme();
    // Only apply if the scheduled theme has changed (boundary crossing)
    // This preserves manual overrides until the next scheduled switch
    if (theme !== lastScheduledTheme) {
      lastScheduledTheme = theme;
      lastAppliedTheme = theme;
      setTheme(theme);
      syncRadioButtons();
    }
  }

  function syncRadioButtons() {
    const theme = (window.loadTheme && window.loadTheme()) || 'dark';
    const darkRadio = document.querySelector('input[name="theme"][value="dark"]');
    const lightRadio = document.querySelector('input[name="theme"][value="light"]');
    if (darkRadio) darkRadio.checked = theme === 'dark';
    if (lightRadio) lightRadio.checked = theme === 'light';
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
    if (window.VisibilityInterval) {
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
    saveEnabled(true);
    lastAppliedTheme = null; // force re-evaluation
    lastScheduledTheme = null;
    checkAndApply();
    startInterval();
    updateTimesVisibility();
    disableManualRadios();
  }

  function disableAutoTheme() {
    saveEnabled(false);
    stopInterval();
    lastAppliedTheme = null;
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
    try {
      localStorage.setItem('theme', selectedTheme);
    } catch (_) {
      // localStorage unavailable
    }
    if (window.applyTheme) window.applyTheme();
    lastAppliedTheme = selectedTheme;
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: selectedTheme } }));
    // Prevent the settings.js change handler from double-applying
    e.stopImmediatePropagation();
  }

  function init() {
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
      lastAppliedTheme = null;
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
        saveLightTime(lightInput.value);
        if (loadEnabled()) {
          lastAppliedTheme = null;
          lastScheduledTheme = null;
          checkAndApply();
        }
      });
    }

    if (darkInput) {
      darkInput.addEventListener('change', function () {
        saveDarkTime(darkInput.value);
        if (loadEnabled()) {
          lastAppliedTheme = null;
          lastScheduledTheme = null;
          checkAndApply();
        }
      });
    }

    // Listen for manual theme radio changes (capture phase to intercept before settings.js)
    document.addEventListener('change', onManualThemeChange, true);
  }

  // Expose for settings.js to call after initSettings
  window.initAutoTheme = init;

  // Also auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
