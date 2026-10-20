// src/core/toast.js
// Centralized in-app toast notifications. Every transient pop-up message in
// the page (save errors, import/export results, copy feedback, etc.) flows
// through window.showToast so all notifications share one position
// (top-middle), one animation, one lifetime, and never stack with each other.

const TOAST_ELEMENT_SELECTOR = '.toast-notification';
const TOAST_FADE_OUT_MS = 300;
const TOAST_DEFAULT_DURATION_MS = 2000;

// type: '' | 'success' | 'error' | 'info' | 'warning'
// options.duration: override hide delay in ms (default 2000)
function showToast(message, type = '', options = {}) {
  // Replace any visible toast so notifications never pile up.
  const existingToast = document.querySelector(TOAST_ELEMENT_SELECTOR);
  if (existingToast) {
    existingToast.remove();
  }

  if (!document.body) {
    console.warn('[toast] document.body unavailable; message dropped:', message);
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  if (type) {
    toast.classList.add('toast-' + type);
  }
  toast.setAttribute('role', 'alert');
  toast.textContent = message;

  document.body.appendChild(toast);

  const revealToast = () => toast.classList.add('show');
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(revealToast);
  } else {
    revealToast();
  }

  const duration = typeof options.duration === 'number' && options.duration > 0
    ? options.duration
    : TOAST_DEFAULT_DURATION_MS;
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, TOAST_FADE_OUT_MS);
  }, duration);
}

window.showToast = showToast;
