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
  const searchBar = document.querySelector('.search-bar');
  
  if (checkbox) {
    checkbox.checked = isSimple;
  }
  
  document.body.classList.toggle('simple-mode', effectiveSimpleMode);

  if (searchBar) {
    searchBar.classList.toggle('visible', effectiveSimpleMode);
  }

  // Pause or resume video background based on simple mode
  const videoEl = document.getElementById('bg-video');
  if (videoEl && videoEl.currentSrc) {
    if (effectiveSimpleMode) {
      videoEl.dataset.simpleModePaused = 'true';
      if (!videoEl.paused) {
        safePause(videoEl);
      }
    } else {
      if (videoEl.dataset.simpleModePaused === 'true' && videoEl.paused) {
        const autoplay = window.loadVideoAutoplay ? window.loadVideoAutoplay() : localStorage.getItem('videoAutoplay') !== 'false';
        if (autoplay) {
          videoEl.play().catch(function () {});
        }
        videoEl.dataset.simpleModePaused = 'false';
      }
    }
  }

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
    localStorage.setItem('simpleMode', this.checked);
    applySimpleMode();
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
