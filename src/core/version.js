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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CURRENT_VERSION, getCurrentVersion };
}

// Also expose to window for global access
if (typeof window !== 'undefined') {
  window.CURRENT_VERSION = CURRENT_VERSION;
}

// Update version display in HTML when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
      versionDisplay.textContent = CURRENT_VERSION ? `v${CURRENT_VERSION}` : 'extension only';
    }
  });
}
