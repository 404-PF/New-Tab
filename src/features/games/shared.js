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
    const selectorClass = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(className) : className;
    const prev = parentEl.querySelector('.' + selectorClass);
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

  // Render a "ready" screen that holds gameplay until the user signals they are
  // ready (press Space, or click/tap the Start button). Games opt in by calling
  // this from init() and gating their loop behind the onStart callback.
  // options: { text, sub, buttonText, onStart }
  // Returns { start, remove } (or null when parentEl is missing):
  //   - start(): tears down the screen and fires onStart once.
  //   - remove(): tears down the screen without starting (for destroy()).
  window.gamesHelpers.createReadyScreen = function (parentEl, options) {
    if (!parentEl) return null;
    const onStart = typeof options?.onStart === 'function' ? options.onStart : function () {};
    const title = options?.text || window.gamesHelpers.t('gamesReady') || 'Ready?';
    const sub = options?.sub || window.gamesHelpers.t('gamesReadyStart') || 'Press Space or tap to start';
    const buttonText = options?.buttonText || window.gamesHelpers.t('gamesStart') || 'Start';

    const overlay = document.createElement('div');
    overlay.className = 'games-ready-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    const textEl = document.createElement('div');
    textEl.className = 'games-ready-text';
    textEl.textContent = title;
    overlay.appendChild(textEl);

    const subEl = document.createElement('div');
    subEl.className = 'games-ready-sub';
    subEl.textContent = sub;
    overlay.appendChild(subEl);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'games-ready-start';
    button.textContent = buttonText;
    overlay.appendChild(button);

    let started = false;

    // Remember what had focus before the overlay opened so remove() can hand
    // focus back instead of leaving it dangling behind a removed element.
    const previouslyFocused = document.activeElement;

    function remove() {
      document.removeEventListener('keydown', onKeydown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && previouslyFocused.isConnected) {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    }

    function start() {
      if (started) return;
      started = true;
      remove();
      onStart();
    }

    function onKeydown(e) {
      if (e.code === 'Tab') {
        // Trap focus inside the overlay so Tab can't escape into the board
        // behind it while the modal dialog is open.
        const focusables = overlay.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === overlay)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (e.code !== 'Space') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      start();
    }

    button.addEventListener('click', start);
    parentEl.appendChild(overlay);

    // Move focus to the Start button so keyboard users can also activate it
    // with Enter/Space. Guarded because some environments (tests) may not
    // support element focus.
    try { button.focus(); } catch { /* ignore */ }

    document.addEventListener('keydown', onKeydown);

    return { start: start, remove: remove };
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
