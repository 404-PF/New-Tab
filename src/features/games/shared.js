(function () {
  'use strict';

  // Shared helpers for games to reduce duplicated code across modules.
  window.gamesHelpers = window.gamesHelpers || {};

  if (!window.gamesHelpers.t) {
    window.gamesHelpers.t = function (key) {
      return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
    };
  }

  // Render a simple DOM overlay inside a given parent element.
  // options: { className, text, sub, statsHtml }
  window.gamesHelpers.renderDOMOverlay = function (parentEl, options) {
    if (!parentEl) return null;
    // Remove any existing overlay of the same class
    try {
      if (options && options.className) {
        const prev = parentEl.querySelector('.' + options.className);
        if (prev) parentEl.removeChild(prev);
      }
    } catch (e) { /* ignore */ }

    const overlay = document.createElement('div');
    overlay.className = options && options.className ? options.className : 'games-overlay';

    let inner = '';
    if (options && options.text) inner += '<div class="' + (options.textClass || (overlay.className + '-text')) + '">' + options.text + '</div>';
    if (options && options.statsHtml) inner += '<div class="' + (options.statsClass || (overlay.className + '-stats')) + '">' + options.statsHtml + '</div>';
    if (options && options.sub) inner += '<div class="' + (options.subClass || (overlay.className + '-sub')) + '">' + options.sub + '</div>';
    overlay.innerHTML = inner;
    parentEl.appendChild(overlay);
    return overlay;
  };

  window.gamesHelpers.removeOverlay = function (parentEl, selectorOrClass) {
    if (!parentEl) return;
    try {
      if (!selectorOrClass) selectorOrClass = '.games-overlay';
      const sel = selectorOrClass.indexOf('.') === 0 || selectorOrClass.indexOf('#') === 0 ? selectorOrClass : '.' + selectorOrClass;
      const el = parentEl.querySelector(sel);
      if (el) parentEl.removeChild(el);
    } catch (e) { /* ignore */ }
  };

  // Key handling helper for restarting on Space when gameOver
  window.gamesHelpers.handleRestartSpace = function (ev, resetFn) {
    if (!ev) return;
    if (ev.code === 'Space') {
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
      if (typeof resetFn === 'function') resetFn();
    }
  };

  // Wrapper to make updating stats less repetitive. fn receives current stats and should return updates.
  window.gamesHelpers.updateStatsWith = function (gameId, fn) {
    if (!window.GameRegistry || typeof fn !== 'function') return;
    try {
      const stats = window.GameRegistry.getStats(gameId) || {};
      const updates = fn(stats) || {};
      window.GameRegistry.updateStats(gameId, updates);
    } catch (e) {
      console.warn('gamesHelpers.updateStatsWith error', e);
    }
  };

})();
