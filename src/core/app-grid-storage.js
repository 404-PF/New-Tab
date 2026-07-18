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

const AppGridStorage = {
  loadOrder() {
    return readJsonArray('appOrder', null, 'appOrder', 'null');
  },

  saveOrder(order) {
    return writeJson('appOrder', order);
  },

  loadCustomApps() {
    return readJsonArray('customApps', [], 'customApps', '[]');
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
