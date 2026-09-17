// src/core/app-grid-storage.js
// Shared persistence helpers for custom app state.

const APP_GRID_STORAGE_KEYS = new Set(['appOrder', 'customApps', 'appFolders']);
const APP_GRID_SAVE_ERROR_FALLBACK = 'Failed to save app changes. Your last action was not saved.';
const SAFE_CUSTOM_APP_SCHEMES = new Set([
  'tel',
  'sms',
  'mailto',
  'sip',
  'callto',
  'facetime',
  'geo',
  'magnet',
  'urn',
  'bitcoin'
]);

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
    window.showToast(message, 'error');
    return;
  }

  const container = document.body || document.documentElement;
  if (!container) {
    console.warn(message);
    return;
  }

  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification toast-error';
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  container.appendChild(toast);

  const revealToast = () => toast.classList.add('show');
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(revealToast);
  } else {
    revealToast();
  }

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.addEventListener('storageBridgeWriteError', (event) => {
  if (event.detail && APP_GRID_STORAGE_KEYS.has(event.detail.key)) {
    showAppGridSaveError();
  }
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

function hasHttpSchemeSafeLocal(url) {
  if (typeof window.hasHttpScheme === 'function') return window.hasHttpScheme(url);
  if (typeof window.hasHttpSchemeSafe === 'function') return window.hasHttpSchemeSafe(url);
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * Reports whether a URL uses a custom application scheme or another unsafe URL form.
 * @param {unknown} url Candidate app URL.
 * @returns {boolean} True when the value should not be treated as an http(s) URL.
 */
function isCustomSchemeLocal(url) {
  const trimmed = String(url || '').trim();
  if (trimmed.startsWith('//')) return true;
  if (typeof window.isCustomScheme === 'function') return window.isCustomScheme(url);
  if (!trimmed || trimmed === '#' || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) return true;
  if (hasHttpSchemeSafeLocal(trimmed)) return false;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  const sep = trimmed.indexOf(':');
  const hostPart = trimmed.slice(0, sep);
  const rest = trimmed.slice(sep + 1);
  const lowerHost = hostPart.toLowerCase();
  if (SAFE_CUSTOM_APP_SCHEMES.has(lowerHost)) return true;
  if (/^\d+(\/|$|\?|#)/.test(rest)) {
    if (hostPart.includes('.')) return false;
    if (/^localhost$/i.test(hostPart)) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostPart)) return false;
    if (/^[a-zA-Z0-9-]+$/.test(hostPart)) return false;
  }
  return true;
}
window.__fallbackIsCustomScheme = isCustomSchemeLocal;
window.__normalizeAppUrlForCheck = function (trimmed) {
  if (!trimmed || trimmed.startsWith('/')) return trimmed;
  if (hasHttpSchemeSafeLocal(trimmed)) return trimmed;
  if (isCustomSchemeLocal(trimmed)) return trimmed;
  return 'https://' + trimmed;
};

/**
 * Determines whether a host-like value can be safely migrated to https://.
 * @param {unknown} url Candidate value from persisted custom app state.
 * @returns {boolean} True when the value has a valid host-like shape.
 */
function needsSchemeMigration(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#') return false;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;
  if (hasHttpSchemeSafeLocal(trimmed)) return false;
  if (isCustomSchemeLocal(trimmed)) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false;
  try {
    const parsed = new URL('https://' + trimmed);
    if (!parsed.hostname) return false;
    if (parsed.hostname.includes(' ') || parsed.hostname.includes('/')) return false;
    if (!parsed.hostname.includes('.') && !/^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname) && !/^localhost$/i.test(parsed.hostname)) {
      if (!/^[a-zA-Z0-9-]+:\d+/.test(trimmed)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a custom app URL while allowing only approved schemes and safe path forms.
 * @param {unknown} url Raw URL supplied by app state.
 * @returns {string|null} Normalized URL, or null when the value must be rejected.
 */
function normalizeCustomAppUrl(url) {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed === '#' || trimmed.startsWith('#')) return trimmed;
  // Protocol-relative URLs still select a network destination and must not
  // bypass the explicit http(s) scheme allowlist.
  if (trimmed.startsWith('//')) return null;
  // Backslash-prefixed values can be normalized by the browser into an external
  // authority, so they are not safe same-origin paths.
  if (trimmed.startsWith('\\')) return null;
  // Backslash authority forms are also interpreted as network destinations by
  // the browser URL parser and must not be accepted as same-origin paths.
  if (trimmed.startsWith('/') && !trimmed.startsWith('/\\')) return trimmed;

  if (hasHttpSchemeSafeLocal(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
    } catch {
      return null;
    }
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    return SAFE_CUSTOM_APP_SCHEMES.has(schemeMatch[1].toLowerCase()) ? trimmed : null;
  }

  return needsSchemeMigration(trimmed) ? 'https://' + trimmed : null;
}

/**
 * Returns a URL safe to assign to an app link, falling back to a harmless fragment.
 * @param {unknown} url Raw app URL from any app-data source.
 * @returns {string} Safe URL or '#'.
 */
function getSafeCustomAppUrl(url) {
  return normalizeCustomAppUrl(url) || '#';
}

window.getSafeCustomAppUrl = getSafeCustomAppUrl;

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

    const normalizedUrl = normalizeCustomAppUrl(originalUrl);
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
    if (migrateCustomAppUrls(apps)) {
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
        const normalizedUrl = normalizeCustomAppUrl(app.url);
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
  }
};

window.AppGridStorage = AppGridStorage;
