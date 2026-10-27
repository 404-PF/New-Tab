// simple-mode.js - Simple mode toggle functionality

function loadSimpleMode() {
  return localStorage.getItem('simpleMode') === 'true';
}

function applySimpleMode() {
  const isSimple = loadSimpleMode();
  const focusModeActive = typeof window.loadFocusMode === 'function'
    ? window.loadFocusMode()
    : document.body.getAttribute('data-focus-mode') === 'true';
  const effectiveSimpleMode = isSimple && !focusModeActive;
  const checkbox = document.getElementById('simple-mode-checkbox');
  
  if (checkbox) {
    checkbox.checked = isSimple;
  }
  
  document.body.classList.toggle('simple-mode', effectiveSimpleMode);


  // Notify dependent modules that simple mode has changed
  window.dispatchEvent(new CustomEvent('simpleModeChanged', {
    detail: { enabled: effectiveSimpleMode }
  }));
}

function initSimpleMode() {
  const checkbox = document.getElementById('simple-mode-checkbox');
  const toggleContainer = document.getElementById('simple-mode-toggle');
  
  if (!checkbox || !toggleContainer) return;
  
  checkbox.addEventListener('change', function() {
    const persisted = window.persistFeatureToggle('simpleMode', this.checked);
    // Re-apply either way: after a rejected write it restores the checkbox to
    // the rolled-back value instead of leaving it desynced.
    applySimpleMode();
    if (!persisted) {
      window.showFeatureToggleSaveError();
    }
  });
  
  applySimpleMode();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSimpleMode);
} else {
  initSimpleMode();
}

window.applySimpleMode = applySimpleMode;
window.loadSimpleMode = loadSimpleMode;
