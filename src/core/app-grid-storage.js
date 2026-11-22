// src/core/app-grid-storage.js
// Shared persistence helpers for custom app state.

const APP_GRID_STORAGE_KEYS = new Set(['appOrder', 'customApps', 'appFolders', 'hiddenDefaultApps']);
const APP_GRID_SAVE_ERROR_FALLBACK = 'Failed to save app changes. Your last action was not saved.';
function getAppGridSaveErrorMessage() {
  if (!window.i18n || typeof window.i18n.t !== 'function') {
    return APP_GRID_SAVE_ERROR_FALLBACK;
  }

  const message = window.i18n.t('appGridSaveError');
  return message && message !== 'appGridSaveError' ? message : APP_GRID_SAVE_ERROR_FALLBACK;
}

function showAppGridSaveError() {
  const message = getAppGridSaveErrorMessage();
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'error', { duration: 3000 });
    return;
  }

  // toast.js failed to load; degrade to a console warning instead of
  // duplicating the toast DOM construction here.
  console.warn('[app-grid-storage] Save error suppressed (showToast unavailable):', message);
}

// Async half of #1238: chrome.storage can reject hiddenDefaultApps and
// customApps through runtime.lastError after setItem already returned true,
// so the success path has already patched the grid tile and the Settings > Apps
// checkbox optimistically. The bridge dispatches storageBridgeWriteError
// before rolling its cache back — wait a macrotask for that rollback, then
// repaint from the restored store so grid and storage agree without a reload.
// The shared toast in this listener stays the single appGridSaveError owner
// for these keys, so the resync pass only repaints.
const APP_GRID_RESYNC_KEYS = new Set(['hiddenDefaultApps', 'customApps']);
// Set only while the recovery repaint below runs: loadCustomApps() persists
// its URL migration during the read, so a rejected migration write would
// dispatch storageBridgeWriteError again and loop repaint → migration →
// failure for as long as the rejection lasts. The recovery read still
// normalizes URLs for rendering; the write happens on the next read outside
// recovery (page load or user action).
let recoveryRepaintInProgress = false;

window.addEventListener('storageBridgeWriteError', (event) => {
  if (!event.detail || !APP_GRID_STORAGE_KEYS.has(event.detail.key)) return;
  showAppGridSaveError();
  if (!APP_GRID_RESYNC_KEYS.has(event.detail.key)) return;
  setTimeout(() => {
    recoveryRepaintInProgress = true;
    try {
      if (typeof window.renderDefaultAppVisibilityList === 'function') {
        window.renderDefaultAppVisibilityList();
      }
      if (typeof window.renderAllApps === 'function') {
        window.renderAllApps();
      }
    } finally {
      recoveryRepaintInProgress = false;
    }
  });
});

function readJsonArray(key, fallbackValue, warningLabel, fallbackLabel) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`Invalid ${warningLabel} data in localStorage: expected array, resetting to ${fallbackLabel}`);
      return fallbackValue;
    }

    return parsed;
  } catch (error) {
    console.warn(`Failed to parse ${warningLabel} from localStorage, resetting to ${fallbackLabel}:`, error);
    return fallbackValue;
  }
}
window.readJsonArray = readJsonArray;

function writeJson(key, value) {
  try {
    const result = localStorage.setItem(key, JSON.stringify(value));
    return result !== false;
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
    showAppGridSaveError();
    return false;
  }
}

// Fallback copy of utils.js's normalizeCustomAppUrl. It only runs when this
// file is injected in isolation without utils.js (some tests do that);
// bootstrap.js loads utils.js first, but Promise.allSettled still runs this file if utils.js fails to load.
// Keep in sync with src/core/utils.js normalizeCustomAppUrl.
function normalizeCustomAppUrlFallback(url) {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed === '#' || trimmed.startsWith('#')) return trimmed;
  if (trimmed.startsWith('//') || trimmed.startsWith('\\')) return null;
  if (trimmed.startsWith('/\\')) return null;
  if (trimmed.startsWith('/')) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
    } catch {
      return null;
    }
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;

  try {
    const parsed = new URL('https://' + trimmed);
    if (!parsed.hostname) return null;
    if (parsed.hostname.includes(' ') || parsed.hostname.includes('/')) return null;
    if (
      !parsed.hostname.includes('.') &&
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname) &&
      !/^localhost$/i.test(parsed.hostname) &&
      !/^[a-zA-Z0-9-]+:\d+/.test(trimmed)
    ) {
      return null;
    }
    return 'https://' + trimmed;
  } catch {
    return null;
  }
}

function normalizeCustomAppUrlLocal(url) {
  if (typeof window.normalizeCustomAppUrl === 'function') {
    return window.normalizeCustomAppUrl(url);
  }
  return normalizeCustomAppUrlFallback(url);
}

window.__normalizeAppUrlForCheck = function (trimmed) {
  if (!trimmed || trimmed.startsWith('/')) return trimmed;
  return normalizeCustomAppUrlLocal(trimmed) || trimmed;
};

/**
 * Migrates persisted custom app URLs in place and reports whether storage changed.
 * @param {Array<unknown>} apps Persisted custom app records.
 * @returns {boolean} True when one or more records were normalized or sanitized.
 */
function migrateCustomAppUrls(apps) {
  let mutated = false;
  for (const app of apps) {
    if (!app || typeof app !== 'object' || !Object.prototype.hasOwnProperty.call(app, 'url')) continue;

    const originalUrl = app.url;
    if (typeof originalUrl !== 'string') {
      // Keep the app record but replace invalid URL values with a harmless no-op
      // so stale appOrder/folder references remain valid.
      app.url = '#';
      mutated = true;
      continue;
    }

    const normalizedUrl = normalizeCustomAppUrlLocal(originalUrl);
    if (normalizedUrl === null) {
      // Keep the app record but replace attacker-controlled destinations with a
      // harmless no-op so stale appOrder/folder references remain valid.
      app.url = '#';
      mutated = true;
      continue;
    }

    if (normalizedUrl !== originalUrl) {
      app.url = normalizedUrl;
      mutated = true;
    }
  }
  return mutated;
}

const AppGridStorage = {
  loadOrder() {
    return readJsonArray('appOrder', null, 'appOrder', 'null');
  },

  saveOrder(order) {
    return writeJson('appOrder', order);
  },

  loadCustomApps() {
    const apps = readJsonArray('customApps', [], 'customApps', '[]');
    const migrated = migrateCustomAppUrls(apps);
    if (migrated && !recoveryRepaintInProgress) {
      writeJson('customApps', apps);
    }
    return apps;
  },

  /**
   * Validates and normalizes custom app URLs before persisting app state.
   * @param {unknown} apps Custom app records to persist.
   * @returns {boolean} Whether the value was successfully written.
   */
  saveCustomApps(apps) {
    if (Array.isArray(apps)) {
      for (const app of apps) {
        if (!app || typeof app !== 'object' || !Object.prototype.hasOwnProperty.call(app, 'url')) continue;
        if (typeof app.url !== 'string') return false;
        const normalizedUrl = normalizeCustomAppUrlLocal(app.url);
        if (normalizedUrl === null) return false;
        app.url = normalizedUrl;
      }
    }
    return writeJson('customApps', apps);
  },

  loadFolders() {
    return readJsonArray('appFolders', [], 'appFolders', '[]');
  },

  saveFolders(folders) {
    return writeJson('appFolders', folders);
  },

  loadHiddenDefaultApps() {
    return readJsonArray('hiddenDefaultApps', [], 'hiddenDefaultApps', '[]');
  },

  saveHiddenDefaultApps(ids) {
    return writeJson('hiddenDefaultApps', ids);
  }
};

window.AppGridStorage = AppGridStorage;
