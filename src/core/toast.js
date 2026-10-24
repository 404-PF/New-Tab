// src/core/toast.js
// Centralized in-app toast notifications. Every transient pop-up message in
// the page (save errors, import/export results, copy feedback, update
// notices, etc.) flows through window.showToast so all notifications share
// one position (top-middle), one animation, one lifetime model, and never
// stack with each other.

const TOAST_FADE_OUT_MS = 300;
const TOAST_DEFAULT_DURATION_MS = 2000;

// Handle for the toast currently on screen. A new toast dismisses the
// active one so notifications never pile up, and callers can dismiss their
// own toast precisely instead of removing whatever happens to be visible.
let activeToastHandle = null;

// type: '' | 'success' | 'error' | 'info' | 'warning'
// options.duration: override hide delay in ms (default 2000)
// options.action: optional { label, onClick } rendered as a button via
//   textContent (never innerHTML) so the provider stays XSS-safe
// Returns { dismiss, element } so callers can remove their own toast.
function showToast(message, type = '', options = {}) {
  // Replace the visible toast so notifications never pile up.
  if (activeToastHandle) {
    activeToastHandle.dismiss();
  }

  if (!document.body) {
    console.warn('[toast] document.body unavailable; message dropped:', message);
    return { dismiss() {}, element: null };
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  if (type) {
    toast.classList.add('toast-' + type);
  }
  toast.setAttribute('role', 'alert');
  toast.textContent = message;

  let autoHideTimeoutId = null;
  let fadeOutTimeoutId = null;
  let unsubscribeVisibility = null;
  let remaining = 0;
  let startedAt = 0;

  const clearAutoHide = () => {
    if (autoHideTimeoutId) {
      clearTimeout(autoHideTimeoutId);
      autoHideTimeoutId = null;
    }
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  };

  const handle = {
    element: toast,
    dismiss: null
  };

  const forgetHandle = () => {
    if (activeToastHandle === handle) {
      activeToastHandle = null;
    }
  };

  // Immediate removal: cancel every timer and drop the element at once.
  handle.dismiss = () => {
    clearAutoHide();
    if (fadeOutTimeoutId) {
      clearTimeout(fadeOutTimeoutId);
      fadeOutTimeoutId = null;
    }
    toast.remove();
    forgetHandle();
  };

  if (options.action && options.action.label) {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'toast-action';
    actionButton.textContent = options.action.label;
    actionButton.addEventListener('click', () => {
      if (typeof options.action.onClick === 'function') {
        options.action.onClick();
      }
      handle.dismiss();
    });
    toast.appendChild(actionButton);
  }

  document.body.appendChild(toast);
  activeToastHandle = handle;

  const revealToast = () => toast.classList.add('show');
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(revealToast);
  } else {
    revealToast();
  }

  const duration = typeof options.duration === 'number' && options.duration > 0
    ? options.duration
    : TOAST_DEFAULT_DURATION_MS;

  const scheduleAutoHide = () => {
    if (autoHideTimeoutId) {
      clearTimeout(autoHideTimeoutId);
    }
    autoHideTimeoutId = setTimeout(() => {
      autoHideTimeoutId = null;
      clearAutoHide();
      toast.classList.remove('show');
      fadeOutTimeoutId = setTimeout(() => {
        fadeOutTimeoutId = null;
        toast.remove();
        forgetHandle();
      }, TOAST_FADE_OUT_MS);
    }, remaining);
  };

  // Visibility-aware auto-hide: pause the countdown while the tab is hidden
  // (the model the update banner used via _scheduleTimedAutoHide) so a toast
  // raised in a background tab does not expire unseen.
  remaining = duration;
  startedAt = Date.now();
  if (window.visibilityManager) {
    unsubscribeVisibility = window.visibilityManager.onChange((visible) => {
      if (visible) {
        startedAt = Date.now();
        scheduleAutoHide();
      } else if (autoHideTimeoutId) {
        remaining -= Date.now() - startedAt;
        clearTimeout(autoHideTimeoutId);
        autoHideTimeoutId = null;
      }
    });
    if (window.visibilityManager.isVisible) {
      scheduleAutoHide();
    }
  } else {
    scheduleAutoHide();
  }

  return handle;
}

window.showToast = showToast;
