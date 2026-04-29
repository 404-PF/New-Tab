// src/core/app-grid-storage.js
// Shared persistence helpers for custom app state.

function readJsonArray(key, fallbackValue, warningLabel) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`Invalid ${warningLabel} data in localStorage: expected array, resetting to fallback`);
      return fallbackValue;
    }

    return parsed;
  } catch (error) {
    console.warn(`Failed to parse ${warningLabel} from localStorage, resetting to fallback:`, error);
    return fallbackValue;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const AppGridStorage = {
  loadOrder() {
    return readJsonArray('appOrder', null, 'appOrder');
  },

  saveOrder(order) {
    writeJson('appOrder', order);
  },

  loadCustomApps() {
    return readJsonArray('customApps', [], 'customApps');
  },

  saveCustomApps(apps) {
    writeJson('customApps', apps);
  }
};

window.AppGridStorage = AppGridStorage;