// simple-mode.js - Simple mode toggle functionality

function loadSimpleMode() {
  return localStorage.getItem('simpleMode') === 'true';
}

function applySimpleMode() {
  const isSimple = loadSimpleMode();
  const checkbox = document.getElementById('simple-mode-checkbox');
  
  if (checkbox) {
    checkbox.checked = isSimple;
  }
  
  document.body.classList.toggle('simple-mode', isSimple);
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