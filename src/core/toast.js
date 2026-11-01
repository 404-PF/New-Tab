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

  // Immediate removal: cancel every timer and drop the element at once.
  handle.dismiss = () => {
    clearAutoHide();
    if (fadeOutTimeoutId) {
      clearTimeout(fadeOutTimeoutId);
      fadeOutTimeoutId = null;
    }
    toast.remove();
    forgetHandle();
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
    const stored = localStorage.getItem('language');
    if (stored && window.i18n && typeof window.i18n.applyLanguage === 'function') {
      window.i18n.applyLanguage(stored);
    }
  },
  updateCheckEnabled: function () {
    if (window.updateChecker && typeof window.updateChecker.resyncEnabledSetting === 'function') {
      window.updateChecker.resyncEnabledSetting();
    }
  }
};

// True when a control still shows the rejected value the bridge has already
// rolled back. The synchronous-failure path re-applies the control and toasts
// before this runs, so comparing first keeps that path from reporting twice.
function featureToggleControlDesynced(key) {
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
      const stored = localStorage.getItem(key);
      if (!stored) return false;
      const current = window.i18n && typeof window.i18n.currentLanguage === 'function'
        ? window.i18n.currentLanguage()
        : document.documentElement.lang;
      return current !== stored;
    }
    case 'updateCheckEnabled': {
      const checkbox = document.getElementById('update-check-enabled');
      return Boolean(checkbox) && checkbox.checked !== (localStorage.getItem(key) !== 'false');
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

  setTimeout(function () {
    if (!featureToggleControlDesynced(key)) return;
    FEATURE_TOGGLE_RESYNC[key]();
    showFeatureToggleSaveError();
  });
});

window.showToast = showToast;
window.showFeatureToggleSaveError = showFeatureToggleSaveError;
window.persistFeatureToggle = persistFeatureToggle;
