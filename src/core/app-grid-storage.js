// src/core/app-grid-storage.js
// Shared persistence helpers for custom app state.

const APP_GRID_STORAGE_KEYS = new Set(['appOrder', 'customApps', 'appFolders']);
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

function isCustomSchemeLocal(url) {
  if (typeof window.isCustomScheme === 'function') return window.isCustomScheme(url);
  const trimmed = String(url || '').trim();
  if (!trimmed || trimmed === '#' || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) return true;
  if (hasHttpSchemeSafeLocal(trimmed)) return false;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  const colonIdx = trimmed.indexOf(':');
  const before = trimmed.slice(0, colonIdx);
  const after = trimmed.slice(colonIdx + 1);
  const lowerBefore = before.toLowerCase();
  const isKnownNumericScheme = ['tel', 'sms', 'mailto', 'sip', 'callto', 'facetime', 'geo', 'magnet', 'urn', 'bitcoin'].includes(lowerBefore);
  const looksLikeHostPort = (before.includes('.') || /^localhost$/i.test(before) || /^(\d{1,3}\.){3}\d{1,3}$/.test(before) || (/^[a-zA-Z0-9-]+$/.test(before) && !isKnownNumericScheme)) && /^\d+(\/|$|\?|#)/.test(after);
  return !looksLikeHostPort;
}
window.__fallbackIsCustomScheme = isCustomSchemeLocal;

function needsSchemeMigration(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#') return false;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;
  if (hasHttpSchemeSafeLocal(trimmed)) return false;
  if (isCustomSchemeLocal(trimmed)) return false;
  if (trimmed.startsWith('/')) return false;
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

function migrateCustomAppUrls(apps) {
  let mutated = false;
  for (const app of apps) {
    if (app && typeof app.url === 'string' && needsSchemeMigration(app.url)) {
      app.url = 'https://' + app.url.trim();
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

  saveCustomApps(apps) {
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
