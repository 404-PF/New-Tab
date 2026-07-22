// src/core/version.js - Centralized version management

function getCurrentVersion() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
      return chrome.runtime.getManifest().version;
    }
  } catch (error) {
    console.error('Failed to read extension version from manifest:', error);
  }

  return null;
}

const CURRENT_VERSION = getCurrentVersion();
const VERSION_DISPLAY_UNAVAILABLE_TEXT = 'extension only';

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CURRENT_VERSION, VERSION_DISPLAY_UNAVAILABLE_TEXT, getCurrentVersion };
}

// Also expose to window for global access
if (typeof window !== 'undefined') {
  window.CURRENT_VERSION = CURRENT_VERSION;
  window.VERSION_DISPLAY_UNAVAILABLE_TEXT = VERSION_DISPLAY_UNAVAILABLE_TEXT;
}

function renderVersionDisplay() {
  const versionDisplay = document.getElementById('version-display');
  if (versionDisplay) {
    versionDisplay.textContent = CURRENT_VERSION ? `v${CURRENT_VERSION}` : VERSION_DISPLAY_UNAVAILABLE_TEXT;
  }
}

// This file loads dynamically after the storage bridge. By that point the DOM
// may already be ready, so support both document states.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVersionDisplay, { once: true });
  } else {
    renderVersionDisplay();
  }
}
