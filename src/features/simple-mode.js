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
    // Guard the shared helper: toast.js may fail to load, and an unguarded
    // call would throw before the write (#969 review thread).
    let persisted;
    try {
      persisted = typeof window.persistFeatureToggle === 'function'
        ? window.persistFeatureToggle('simpleMode', this.checked)
        : localStorage.setItem('simpleMode', this.checked) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save simpleMode:', e);
      persisted = false;
    }
    // Re-apply either way: after a rejected write it restores the checkbox to
    // the rolled-back value instead of leaving it desynced.
    applySimpleMode();
    if (!persisted && typeof window.showFeatureToggleSaveError === 'function') {
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
