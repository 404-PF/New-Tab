// src/core/toast.js
// Centralized in-app toast notifications. Every transient pop-up message in
// the page (save errors, import/export results, copy feedback, update
// notices, etc.) flows through window.showToast so all notifications share
// one position (top-middle), one animation, one lifetime model, and never
// stack with each other.

const TOAST_FADE_OUT_MS = 300;
const TOAST_DEFAULT_DURATION_MS = 2000;

// Handle for the toast currently on screen. A new toast dismisses the
// active one so notifications never pile up, and callers can dismiss their
// own toast precisely instead of removing whatever happens to be visible.
let activeToastHandle = null;

// type: '' | 'success' | 'error' | 'info' | 'warning'
// options.duration: override hide delay in ms (default 2000)
// options.action: optional { label, onClick } rendered as a button via
//   textContent (never innerHTML) so the provider stays XSS-safe
// options.onDismiss: optional callback fired exactly once when the toast
//   leaves the screen — auto-hide, replacement by a newer toast, or an
//   explicit dismiss — so callers can release state whose lifetime must
//   match the toast (e.g. an undo slot)
// Returns { dismiss, element } so callers can remove their own toast.
function showToast(message, type = '', options = {}) {
  // Replace the visible toast so notifications never pile up.
  if (activeToastHandle) {
    activeToastHandle.dismiss();
  }

  if (!document.body) {
    console.warn('[toast] document.body unavailable; message dropped:', message);
    return { dismiss() {}, element: null };
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  if (type) {
    toast.classList.add('toast-' + type);
  }
  toast.setAttribute('role', 'alert');
  toast.textContent = message;

  let autoHideTimeoutId = null;
  let fadeOutTimeoutId = null;
  let unsubscribeVisibility = null;
  let remaining = 0;
  let startedAt = 0;

  const clearAutoHide = () => {
    if (autoHideTimeoutId) {
      clearTimeout(autoHideTimeoutId);
      autoHideTimeoutId = null;
    }
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  };

  const handle = {
    element: toast,
    dismiss: null
  };

  const forgetHandle = () => {
    if (activeToastHandle === handle) {
      activeToastHandle = null;
    }
  };

  // Notify the caller once the toast is gone, whichever path removed it.
  // Guarded so replacement, auto-hide and explicit dismissal cannot double-fire.
  let dismissNotified = false;
  const notifyDismiss = () => {
    if (dismissNotified) return;
    dismissNotified = true;
    if (typeof options.onDismiss === 'function') {
      try {
        options.onDismiss();
      } catch (error) {
        console.warn('[toast] onDismiss callback failed:', error);
      }
    }
  };

  // Immediate removal: cancel every timer and drop the element at once.
  handle.dismiss = () => {
    clearAutoHide();
    if (fadeOutTimeoutId) {
      clearTimeout(fadeOutTimeoutId);
      fadeOutTimeoutId = null;
    }
    toast.remove();
    forgetHandle();
    notifyDismiss();
  };

  if (options.action && options.action.label) {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'toast-action';
    actionButton.textContent = options.action.label;
    actionButton.addEventListener('click', () => {
      if (typeof options.action.onClick === 'function') {
        options.action.onClick();
      }
      handle.dismiss();
    });
    toast.appendChild(actionButton);
  }

  document.body.appendChild(toast);
  activeToastHandle = handle;

  const revealToast = () => toast.classList.add('show');
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(revealToast);
  } else {
    revealToast();
  }

  const duration = typeof options.duration === 'number' && options.duration > 0
    ? options.duration
    : TOAST_DEFAULT_DURATION_MS;

  const scheduleAutoHide = () => {
    if (autoHideTimeoutId) {
      clearTimeout(autoHideTimeoutId);
    }
    autoHideTimeoutId = setTimeout(() => {
      autoHideTimeoutId = null;
      clearAutoHide();
      // The countdown is over: the toast is on its way out, so drop the
      // action button first — it would otherwise stay clickable during the
      // 300 ms fade and fire a handler whose state is already gone (e.g. an
      // expired Undo) — then release caller state now rather than after the
      // fade (a visibility pause delays this callback, which is exactly the
      // lifetime callers want).
      const actionButton = toast.querySelector('.toast-action');
      if (actionButton) actionButton.remove();
      notifyDismiss();
      toast.classList.remove('show');
      fadeOutTimeoutId = setTimeout(() => {
        fadeOutTimeoutId = null;
        toast.remove();
        forgetHandle();
      }, TOAST_FADE_OUT_MS);
    }, remaining);
  };

  // Visibility-aware auto-hide: pause the countdown while the tab is hidden
  // (the model the update banner used via _scheduleTimedAutoHide) so a toast
  // raised in a background tab does not expire unseen.
  remaining = duration;
  startedAt = Date.now();
  if (window.visibilityManager) {
    unsubscribeVisibility = window.visibilityManager.onChange((visible) => {
      if (visible) {
        startedAt = Date.now();
        scheduleAutoHide();
      } else if (autoHideTimeoutId) {
        remaining -= Date.now() - startedAt;
        clearTimeout(autoHideTimeoutId);
        autoHideTimeoutId = null;
      }
    });
    if (window.visibilityManager.isVisible) {
      scheduleAutoHide();
    }
  } else {
    scheduleAutoHide();
  }

  return handle;
}

// Shared write check for feature toggles (#969): the storage bridge's setItem
// returns false instead of throwing on a rejected write, so callers must check
// the result rather than relying on catch alone. Returns whether the write was
// accepted.
function persistFeatureToggle(key, value) {
  try {
    return localStorage.setItem(key, value) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
  } catch (error) {
    console.warn('Failed to save ' + key + ':', error);
    return false;
  }
}

// Shared failure feedback for feature toggles whose storage write the bridge
// rejected (#969). The bridge's setItem returns false instead of throwing on a
// rejected write, so callers that only wrap the write in try/catch never learn
// it failed and the control would snap back with no visible feedback.
function showFeatureToggleSaveError() {
  const fallback = 'Failed to save this setting. Your last action was not saved.';
  let message = fallback;
  if (window.i18n && typeof window.i18n.t === 'function') {
    const translated = window.i18n.t('featureToggleSaveError');
    if (translated && translated !== 'featureToggleSaveError') {
      message = translated;
    }
  }

  // Resolve through window so tests can stub the toast provider.
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'error');
  } else {
    console.warn(message);
  }
}

// Weather rollback resync (#1081): re-applying the controls alone is not
// enough — a refresh started with the rejected setting can still land stale
// weather after the rollback, so force one more refresh from the persisted
// settings. applySettings runs first so the manual-city input is restored
// before the refresh re-reads it.
function resyncWeatherSettings() {
  if (!window.WeatherWidget || typeof window.WeatherWidget.applySettings !== 'function') {
    return;
  }
  window.WeatherWidget.applySettings();
  if (typeof window.WeatherWidget.refresh === 'function') {
    Promise.resolve(window.WeatherWidget.refresh(true)).catch(function (error) {
      console.warn('Weather refresh after settings rollback failed:', error);
    });
  }
}

// Shared resync callers for the #1149 entries below. Reusing one function
// reference per helper keeps the map free of copy-pasted blocks (Sonar
// duplication gate) while preserving the typeof guard for modules that
// failed to load.
function resyncClockDateStyleSafe() {
  if (typeof window.resyncClockDateStyle === 'function') {
    window.resyncClockDateStyle();
  }
}
function resyncVideoPlaybackSafe() {
  if (typeof window.applyVideoPlaybackSettings === 'function') {
    window.applyVideoPlaybackSettings();
  }
}
function resyncBgOverlaySafe() {
  if (typeof window.applyBgOverlaySettings === 'function') {
    window.applyBgOverlaySettings();
  }
}

// Controls that must resync when the bridge rolls a rejected write back after
// setItem already returned true (the async runtime.lastError path, #969).
const FEATURE_TOGGLE_RESYNC = {
  simpleMode: function () {
    if (typeof window.applySimpleMode === 'function') {
      window.applySimpleMode();
    }
  },
  focusMode: function () {
    if (typeof window.applyFocusMode === 'function') {
      window.applyFocusMode();
    }
  },
  todoEnabled: function () {
    if (typeof window.applyTodoEnabled === 'function') {
      window.applyTodoEnabled();
    }
  },
  notesEnabled: function () {
    if (typeof window.applyNotesEnabled === 'function') {
      window.applyNotesEnabled();
    }
  },
  eyeCareReminder: function () {
    if (typeof window.applyEyeCareReminderSettings === 'function') {
      window.applyEyeCareReminderSettings();
    }
    if (typeof window.refreshEyeCareReminder === 'function') {
      window.refreshEyeCareReminder();
    }
  },
  // The theme write is applied optimistically (radio, body class), so an async
  // rollback must re-apply the persisted theme and tell listeners the restored
  // effective theme.
  theme: function () {
    if (typeof window.applyTheme === 'function') {
      window.applyTheme();
    }
    if (typeof window.loadTheme === 'function' && typeof window.resolveTheme === 'function') {
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: window.resolveTheme(window.loadTheme()) } }));
    }
  },
  liquidGlassEnabled: function () {
    if (typeof window.applyLiquidGlassEnabled === 'function') {
      window.applyLiquidGlassEnabled();
    }
  },
  autoTheme: function () {
    if (typeof window.refreshAutoTheme === 'function') {
      window.refreshAutoTheme();
    }
  },
  autoThemeLightTime: function () {
    if (typeof window.refreshAutoTheme === 'function') {
      window.refreshAutoTheme();
    }
  },
  autoThemeDarkTime: function () {
    if (typeof window.refreshAutoTheme === 'function') {
      window.refreshAutoTheme();
    }
  },
  weatherEnabled: resyncWeatherSettings,
  weatherUnit: resyncWeatherSettings,
  weatherLocationMode: resyncWeatherSettings,
  weatherManualCity: resyncWeatherSettings,
  // Settings added by #1089 (search provider, search history, language,
  // update check). All helpers resolve through window with typeof guards so
  // a module that failed to load degrades to "no resync" instead of a throw.
  searchProvider: function () {
    if (typeof window.refreshProviderBar === 'function') {
      window.refreshProviderBar();
    }
  },
  searchHistoryEnabled: function () {
    if (typeof window.resyncSearchHistorySetting === 'function') {
      window.resyncSearchHistorySetting();
    }
  },
  language: function () {
    // A missing key is the default English profile (#1089), so a rollback
    // that leaves no key still resyncs the UI back to English.
    const stored = localStorage.getItem('language') || 'en';
    if (window.i18n && typeof window.i18n.applyLanguage === 'function') {
      window.i18n.applyLanguage(stored);
    }
  },
  updateCheckEnabled: function () {
    if (window.updateChecker && typeof window.updateChecker.resyncEnabledSetting === 'function') {
      window.updateChecker.resyncEnabledSetting();
    }
  },
  // #1129: the settings write re-derived the live timer phase from the
  // rejected duration, so both the inputs and the timer must snap back.
  pomodoro: function () {
    if (typeof window.resyncPomodoroSettings === 'function') {
      window.resyncPomodoroSettings();
    }
    if (typeof window.resyncPomodoroTimer === 'function') {
      window.resyncPomodoroTimer();
    }
    if (typeof window.renderTodos === 'function') {
      window.renderTodos();
    }
  },
  // #1142: the three Settings > Apps app-grid writes must resync their
  // controls after an async rollback like every other feature toggle.
  // Helpers resolve through window with typeof guards so a module that
  // failed to load degrades to "no resync" instead of a throw.
  openAppsInNewTab: function () {
    if (typeof window.applyOpenNewTabSetting === 'function') {
      window.applyOpenNewTabSetting();
    }
  },
  iconSize: function () {
    if (typeof window.applyIconSize === 'function') {
      window.applyIconSize();
    }
  },
  appsButtonCurvature: function () {
    if (typeof window.applyCurvature === 'function') {
      window.applyCurvature();
    }
  },
    // #1149: the Settings-modal clock/date, video, background, overlay/stats
    // and Games writes below check the bridge result on the sync path; these
    // entries cover the async runtime.lastError rollback the same way.
    // Clock/date style and format share one resync helper (settings.js)
    // that also re-renders the clock from the restored format.
    clockColor: resyncClockDateStyleSafe,
    clockFont: resyncClockDateStyleSafe,
    clockSize: resyncClockDateStyleSafe,
    clockFormat: resyncClockDateStyleSafe,
    dateColor: resyncClockDateStyleSafe,
    dateFont: resyncClockDateStyleSafe,
    dateSize: resyncClockDateStyleSafe,
    dateFormat: resyncClockDateStyleSafe,
    videoAutoplay: resyncVideoPlaybackSafe,
    videoMuted: resyncVideoPlaybackSafe,
    videoPauseHidden: resyncVideoPlaybackSafe,
    homepageBg: function () {
      if (typeof window.applyBg === 'function') {
        window.applyBg();
      }
    },
    bgOverlayOpacity: resyncBgOverlaySafe,
    bgOverlayBlur: resyncBgOverlaySafe,
    bgTint: resyncBgOverlaySafe,
    bgTintStrength: resyncBgOverlaySafe,
    pomodoroStatsEnabled: function () {
      if (typeof window.applyPomodoroStatsEnabled === 'function') {
        window.applyPomodoroStatsEnabled();
      }
    },
    games_enabled: function () {
      if (typeof window.applyGamesEnabled === 'function') {
        window.applyGamesEnabled();
      }
    },
    games_keymap: function () {
      // The no-override path is write-free, so rollback never issues a
      // second storage write for the rolled-back value.
      if (typeof window.applyGamesKeymap === 'function') {
        window.applyGamesKeymap();
      }
    },
    games_fps_enabled: function () {
      if (typeof window.applyGamesFps === 'function') {
        window.applyGamesFps();
      }
    }
  };

// Pure-read helpers for the desync comparison below (#1149 review). The
// loaders in settings.js self-heal out-of-range values via setItem, so the
// rollback path must not call them — a detector write could dispatch a
// second storageBridgeWriteError. These mirror the loader defaults and
// normalization without writing.
function desyncStoredColor(key, fallback) {
  return localStorage.getItem(key) || fallback;
}
function desyncStoredFont(key) {
  const raw = localStorage.getItem(key);
  const resolved = raw && typeof window.resolveFontAlias === 'function'
    ? window.resolveFontAlias(raw)
    : raw;
  return resolved || window.FONT_DEFAULT || '';
}
function desyncStoredFormat(key, valid) {
  const raw = localStorage.getItem(key);
  return valid.includes(raw) ? raw : 'auto';
}
function desyncClosestSize(key, fallback, options) {
  const parsed = Number.parseInt(localStorage.getItem(key) || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  // Prefer the shared snap helper so the detector and the loaders cannot
  // drift apart if the option sets change (#1149 review).
  if (typeof window.getClosestSettingSize === 'function') {
    return window.getClosestSettingSize(parsed, options);
  }
  return options.reduce(function (closest, option) {
    return Math.abs(option - parsed) < Math.abs(closest - parsed) ? option : closest;
  }, options[0]);
}
function desyncClampedInt(key, fallback, min, max) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function desyncOverlayTint(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const normalized = raw.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

// Shared one-liner comparisons for the #1149 desync checks. Each case below
// stays a single call so the new switch cannot reintroduce copy-pasted
// blocks (Sonar duplication gate).
function desyncCheckboxControl(checkboxId, key, activeIsTrue) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return false;
  const stored = localStorage.getItem(key);
  const expected = activeIsTrue ? stored === 'true' : stored !== 'false';
  return checkbox.checked !== expected;
}
function desyncClockDateReady() {
  // Without the settings resync helper the control cannot be restored,
  // so stay silent like the theme case instead of toasting alone.
  return typeof window.resyncClockDateStyle === 'function';
}
function desyncColorControl(pickerId, key, fallback) {
  if (!desyncClockDateReady()) return false;
  const picker = document.getElementById(pickerId);
  return Boolean(picker) && picker.value !== desyncStoredColor(key, fallback);
}
function desyncFontControl(pickerId, key) {
  if (!desyncClockDateReady()) return false;
  const picker = document.getElementById(pickerId);
  return Boolean(picker) && picker.value !== desyncStoredFont(key);
}
function desyncFormatControl(pickerId, key, valid) {
  if (!desyncClockDateReady()) return false;
  const picker = document.getElementById(pickerId);
  return Boolean(picker) && picker.value !== desyncStoredFormat(key, valid);
}
function desyncSizeControl(group, key, fallback, options) {
  if (!desyncClockDateReady()) return false;
  const stored = desyncClosestSize(key, fallback, options);
  const buttons = document.querySelectorAll('[data-size-group="' + group + '"] .size-choice-button');
  return Array.prototype.some.call(buttons, function (btn) {
    return btn.classList.contains('active') !== (Number.parseInt(btn.dataset.size, 10) === stored);
  });
}
function desyncVideoControl(checkboxId, key) {
  if (typeof window.applyVideoPlaybackSettings !== 'function') return false;
  return desyncCheckboxControl(checkboxId, key, false);
}
function desyncOverlayInputControl(inputId, key, fallback, min, max) {
  if (typeof window.applyBgOverlaySettings !== 'function') return false;
  const input = document.getElementById(inputId);
  return Boolean(input) && input.value !== String(desyncClampedInt(key, fallback, min, max));
}
function desyncTintControl(inputId, key, fallback) {
  if (typeof window.applyBgOverlaySettings !== 'function') return false;
  const input = document.getElementById(inputId);
  return Boolean(input) && input.value !== desyncOverlayTint(key, fallback);
}

// #1149 desync checks split out so featureToggleControlDesynced stays under
// Sonar's 30-case limit, and split again so each helper stays under the
// cognitive-complexity limit. Each returns true/false for its keys and null
// for anything else so the caller can fall through.
function checkClockDateDesynced(key) {
  switch (key) {
    case 'clockColor': return desyncColorControl('clock-color-picker', key, '#ffffff');
    case 'clockFont': return desyncFontControl('clock-font-picker', key);
    case 'clockSize': return desyncSizeControl('clock', key, 80, [60, 80, 100]);
    case 'clockFormat': return desyncFormatControl('clock-format-picker', key, ['auto', '12h', '24h']);
    case 'dateColor': return desyncColorControl('date-color-picker', key, '#ffffff');
    case 'dateFont': return desyncFontControl('date-font-picker', key);
    case 'dateSize': return desyncSizeControl('date', key, 24, [20, 24, 30]);
    case 'dateFormat': return desyncFormatControl('date-format-picker', key, ['auto', 'long', 'compact', 'numeric']);
    default: return null;
  }
}
function checkMediaSettingsDesynced(key) {
  switch (key) {
    case 'videoAutoplay': return desyncVideoControl('video-autoplay-setting', key);
    case 'videoMuted': return desyncVideoControl('video-muted-setting', key);
    case 'videoPauseHidden': return desyncVideoControl('video-pause-hidden-setting', key);
    case 'homepageBg': return desyncHomepageBgControl(key);
    case 'bgOverlayOpacity': return desyncOverlayInputControl('bg-overlay-dim', key, 0, 0, 80);
    case 'bgOverlayBlur': return desyncOverlayInputControl('bg-overlay-blur', key, 0, 0, 12);
    case 'bgTint': return desyncTintControl('bg-tint-color', key, '#000000');
    case 'bgTintStrength': return desyncOverlayInputControl('bg-tint-strength', key, 0, 0, 50);
    case 'pomodoroStatsEnabled': {
      if (typeof window.applyPomodoroStatsEnabled !== 'function') return false;
      return desyncCheckboxControl('pomodoro-stats-enabled-setting', key, true);
    }
    case 'games_enabled': {
      if (typeof window.applyGamesEnabled !== 'function') return false;
      return desyncCheckboxControl('games-enabled-setting', key, false);
    }
    case 'games_keymap': return desyncGamesKeymapControl(key);
    case 'games_fps_enabled': {
      if (typeof window.applyGamesFps !== 'function') return false;
      return desyncCheckboxControl('games-fps-setting', key, true);
    }
    default: return null;
  }
}
function desyncHomepageBgControl(key) {
  if (typeof window.applyBg !== 'function') return false;
  const stored = typeof window.loadBg === 'function'
    ? window.loadBg()
    : (localStorage.getItem(key) || 'Water Beside Forest');
  const current = document.body.dataset.bg;
  // Uninitialized pages (no data-bg yet) have nothing to compare.
  if (current === undefined) return false;
  return current !== stored;
}
function desyncGamesKeymapControl(key) {
  if (typeof window.applyGamesKeymap !== 'function') return false;
  const stored = typeof window.loadGamesKeymap === 'function'
    ? window.loadGamesKeymap()
    : (localStorage.getItem(key) || 'wasd');
  const select = document.getElementById('games-keymap-setting');
  return Boolean(select) && select.value !== stored;
}
function checkRecentSettingsDesynced(key) {
  const clockDate = checkClockDateDesynced(key);
  if (clockDate !== null) return clockDate;
  return checkMediaSettingsDesynced(key);
}

// True when a control still shows the rejected value the bridge has already
// rolled back. The synchronous-failure path re-applies the control and toasts
// before this runs, so comparing first keeps that path from reporting twice.
function featureToggleControlDesynced(key) {
  const recent = checkRecentSettingsDesynced(key);
  if (recent !== null) return recent;
  switch (key) {
    case 'simpleMode': {
      const checkbox = document.getElementById('simple-mode-checkbox');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) === 'true');
    }
    case 'focusMode': {
      const checkbox = document.getElementById('focus-mode-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) === 'true');
    }
    case 'todoEnabled': {
      const checkbox = document.getElementById('todo-enabled-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
    }
    case 'notesEnabled': {
      const checkbox = document.getElementById('notes-enabled-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
    }
    case 'eyeCareReminder': {
      try {
        const state = JSON.parse(localStorage.getItem(key) || '{}');
        const enabled = document.getElementById('eye-care-enabled-setting');
        const interval = document.getElementById('eye-care-interval-setting');
        const notification = document.getElementById('eye-care-browser-notification-setting');
        return (Boolean(enabled) && enabled.checked !== (state.enabled === true)) ||
          (Boolean(interval) && interval.value !== String(state.intervalMinutes)) ||
          (Boolean(notification) && notification.checked !== (state.browserNotification === true));
      } catch {
        return true;
      }
    }
    case 'autoTheme': {
      const checkbox = document.getElementById('auto-theme-toggle');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) === 'true');
    }
    case 'autoThemeLightTime': {
      // Mirror the module's fallback defaults (auto-theme.js).
      const input = document.getElementById('auto-theme-light-time');
      return Boolean(input) && input.value !== (localStorage.getItem(key) || '07:00');
    }
    case 'autoThemeDarkTime': {
      const input = document.getElementById('auto-theme-dark-time');
      return Boolean(input) && input.value !== (localStorage.getItem(key) || '19:00');
    }
    case 'weatherEnabled': {
      const checkbox = document.getElementById('weather-enabled-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) === 'true');
    }
    case 'weatherUnit': {
      const stored = localStorage.getItem(key) === 'fahrenheit' ? 'fahrenheit' : 'celsius';
      const buttons = document.querySelectorAll('[data-weather-choice="unit"] .weather-choice-button');
      return Array.prototype.some.call(buttons, function (btn) {
        return btn.classList.contains('active') !== (btn.dataset.value === stored);
      });
    }
    case 'weatherLocationMode': {
      const stored = localStorage.getItem(key) || 'auto';
      const buttons = document.querySelectorAll('[data-weather-choice="mode"] .weather-choice-button');
      return Array.prototype.some.call(buttons, function (btn) {
        return btn.classList.contains('active') !== (btn.dataset.value === stored);
      });
    }
    case 'weatherManualCity': {
      const input = document.getElementById('weather-manual-city');
      return Boolean(input) && input.value !== (localStorage.getItem(key) || '');
    }
    case 'searchProvider': {
      const bar = document.getElementById('search-provider-bar');
      if (!bar) return false;
      const stored = typeof window.loadActiveProvider === 'function'
        ? window.loadActiveProvider()
        : (localStorage.getItem(key) || 'google');
      const activeBtn = bar.querySelector('.search-provider-btn.active');
      return Boolean(activeBtn) && activeBtn.dataset.provider !== stored;
    }
    case 'searchHistoryEnabled': {
      const checkbox = document.getElementById('search-history-enabled-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
    }
    case 'language': {
      // A missing key is the default English profile (#1089); comparing to
      // it lets a rollback that removed the key still report the desync.
      const stored = localStorage.getItem(key) || 'en';
      const current = window.i18n && typeof window.i18n.currentLanguage === 'function'
        ? window.i18n.currentLanguage()
        : document.documentElement.lang;
      return current !== stored;
    }
    case 'updateCheckEnabled': {
      const checkbox = document.getElementById('update-check-enabled');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
    }
    case 'liquidGlassEnabled': {
      const checkbox = document.getElementById('liquid-glass-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
    }
    case 'theme': {
      if (typeof window.applyTheme !== 'function') return false;
      const stored = typeof window.loadTheme === 'function' ? window.loadTheme() : (localStorage.getItem(key) || 'dark');
      const checked = document.querySelector('input[name="theme"]:checked');
      if (checked && checked.value !== stored) return true;
      const effective = typeof window.resolveTheme === 'function' ? window.resolveTheme(stored) : stored;
      return document.body.classList.contains('light-theme') !== (effective === 'light');
    }
    case 'pomodoro': {
      if (typeof window.loadPomodoroDurations !== 'function') return false;
      const stored = window.loadPomodoroDurations();
      const enabled = document.getElementById('pomodoro-enabled-setting');
      const work = document.getElementById('pomodoro-work-duration');
      const shortBreak = document.getElementById('pomodoro-short-break-duration');
      const longBreak = document.getElementById('pomodoro-long-break-duration');
      const sessions = document.getElementById('pomodoro-sessions-before-long');
      return (Boolean(enabled) && enabled.checked !== stored.enabled) ||
        (Boolean(work) && work.value !== String(stored.workDuration)) ||
        (Boolean(shortBreak) && shortBreak.value !== String(stored.shortBreakDuration)) ||
        (Boolean(longBreak) && longBreak.value !== String(stored.longBreakDuration)) ||
        (Boolean(sessions) && sessions.value !== String(stored.sessionsBeforeLongBreak));
    }
    case 'openAppsInNewTab': {
      const checkbox = document.getElementById('open-new-tab-setting');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
    }
    case 'iconSize': {
      // Mirror loadIconSize's default and closest-option snap (app-manager.js)
      // so the comparison matches what the size buttons actually show.
      const options = [48, 60, 72];
      const parsed = Number.parseInt(localStorage.getItem(key) || '60', 10);
      const stored = Number.isFinite(parsed)
        ? options.reduce((closest, option) => {
            return Math.abs(option - parsed) < Math.abs(closest - parsed) ? option : closest;
          }, options[0])
        : 60;
      const buttons = document.querySelectorAll('[data-size-group="icon"] .size-choice-button');
      return Array.prototype.some.call(buttons, function (btn) {
        return btn.classList.contains('active') !== (Number.parseInt(btn.dataset.size, 10) === stored);
      });
    }
    case 'appsButtonCurvature': {
      const stored = localStorage.getItem(key) || '20';
      const radios = document.querySelectorAll('input[name="curvature"]');
      return Array.prototype.some.call(radios, function (radio) {
        return radio.checked !== (radio.value === stored);
      });
    }
  }
  return false;
}

// Async half of #969: chrome.storage reports a failed write through
// runtime.lastError inside the set callback, after setItem has already
// returned true. The bridge rolls its cache back and dispatches
// storageBridgeWriteError; wait a macrotask for that rollback to land, then
// resync the affected control and notify once.
window.addEventListener('storageBridgeWriteError', function (event) {
  const key = event?.detail?.key;
  if (!Object.prototype.hasOwnProperty.call(FEATURE_TOGGLE_RESYNC, key)) return;

  // Rotation advances share the homepageBg key: their failures are owned
  // by background-rotation.js (pool rewind + rotation-specific toast), so
  // the generic handler stays silent instead of toasting a second time.
  if (key === 'homepageBg' && window.BackgroundRotation &&
      typeof window.BackgroundRotation.ownsPendingHomepageBgWrite === 'function') {
    try {
      if (window.BackgroundRotation.ownsPendingHomepageBgWrite(event?.detail?.value)) return;
    } catch {
      // Fall through to the generic resync when the ownership check fails.
    }
  }

  setTimeout(function () {
    if (!featureToggleControlDesynced(key)) return;
    FEATURE_TOGGLE_RESYNC[key]();
    showFeatureToggleSaveError();
  });
});

window.showToast = showToast;
window.showFeatureToggleSaveError = showFeatureToggleSaveError;
window.persistFeatureToggle = persistFeatureToggle;
