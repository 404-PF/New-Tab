// focus-mode.js - Focus mode toggle functionality

let focusModeInitialized = false;

function loadFocusMode() {
  try {
    return localStorage.getItem('focusMode') === 'true';
  } catch (e) {
    console.warn('Failed to read focusMode:', e);
    return false;
  }
}

function syncFocusModeLabel(indicator, enabled) {
  if (!indicator) return;

  const t = window.i18n && typeof window.i18n.t === 'function'
    ? window.i18n.t
    : function (key) { return key; };
  const label = indicator.querySelector('span');
  const resolve = function (key, fallback) {
    const value = t(key);
    return value && value !== key ? value : fallback;
  };

  if (label) {
    label.textContent = resolve('focusMode', 'Focus');
  }

  indicator.setAttribute('aria-label', enabled ? resolve('focusModeExit', 'Exit Focus Mode') : resolve('focusMode', 'Focus'));
  indicator.title = enabled ? resolve('focusModeExit', 'Exit Focus Mode') : resolve('focusMode', 'Focus');
}

function applyFocusMode() {
  const enabled = loadFocusMode();
  const checkbox = document.getElementById('focus-mode-setting');
  const indicator = document.getElementById('focus-mode-indicator');

  if (checkbox) {
    checkbox.checked = enabled;
  }

  document.body.classList.toggle('focus-mode', enabled);
  document.body.setAttribute('data-focus-mode', enabled ? 'true' : 'false');

  if (indicator) {
    indicator.hidden = !enabled;
    indicator.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    syncFocusModeLabel(indicator, enabled);
  }

  window.dispatchEvent(new CustomEvent('focusModeChanged', {
    detail: { enabled }
  }));
}

function setFocusMode(enabled) {
  try {
    localStorage.setItem('focusMode', enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('Failed to save focusMode:', e);
  }
  applyFocusMode();
}

function toggleFocusMode() {
  setFocusMode(!loadFocusMode());
}

function initFocusMode() {
  if (focusModeInitialized) return;
  focusModeInitialized = true;

  const checkbox = document.getElementById('focus-mode-setting');
  const indicator = document.getElementById('focus-mode-indicator');

  if (checkbox) {
    checkbox.addEventListener('change', function () {
      setFocusMode(this.checked);
    });
  }

  if (indicator) {
    indicator.addEventListener('click', function () {
      setFocusMode(false);
    });
  }

  window.addEventListener('languageChanged', function () {
    syncFocusModeLabel(indicator, loadFocusMode());
  });

  applyFocusMode();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFocusMode);
} else {
  initFocusMode();
}

window.loadFocusMode = loadFocusMode;
window.applyFocusMode = applyFocusMode;
window.setFocusMode = setFocusMode;
window.toggleFocusMode = toggleFocusMode;
