(function () {
  'use strict';

  // Shared helpers for games to reduce duplicated code across modules.
  window.gamesHelpers = window.gamesHelpers || {};

  if (!window.gamesHelpers.t) {
    window.gamesHelpers.t = function (key) {
      if (window.i18n && typeof window.i18n.t === 'function') {
        const value = window.i18n.t(key);
        return value === key ? undefined : value;
      }
      return key;
    };
  }

  if (!window.gamesHelpers.isEnabled) {
    window.gamesHelpers.isEnabled = function () {
      try {
        return localStorage.getItem('games_enabled') !== 'false';
      } catch (_err) {
        return true;
      }
    };
  }

  // Render a simple DOM overlay inside a given parent element.
  // options: { className, text, sub, statsHtml }
  window.gamesHelpers.renderDOMOverlay = function (parentEl, options) {
    if (!parentEl) return null;
    const className = options?.className || 'games-overlay';
    // Remove any existing overlay of the same class
    const prev = parentEl.querySelector('.' + className);
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.className = className;

    function addLine(text, className) {
      if (!text) return;
      const node = document.createElement('div');
      node.className = className;
      node.textContent = text;
      overlay.appendChild(node);
    }

    addLine(options?.text, options?.textClass || (overlay.className + '-text'));
    addLine(options?.statsHtml, options?.statsClass || (overlay.className + '-stats'));
    addLine(options?.sub, options?.subClass || (overlay.className + '-sub'));

    parentEl.appendChild(overlay);
    return overlay;
  };

  // Key handling helper for restarting on Space when gameOver
  window.gamesHelpers.handleRestartSpace = function (ev, resetFn) {
    if (!ev) return;
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable)) {
      return;
    }
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
