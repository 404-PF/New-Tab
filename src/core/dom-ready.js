// src/core/dom-ready.js - Shared DOM ready helper

function onDomReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
    return;
  }

  callback();
}

window.onDomReady = onDomReady;
