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

  // Translate a key, falling back to the key itself when it has no message.
  window.gamesHelpers.tr = function (key) {
    return window.gamesHelpers.t(key) || key;
  };

  // High-resolution timestamp with a Date.now() fallback.
  window.gamesHelpers.nowMs = function () {
    const perf = window.performance;
    return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
  };

  // True when a key event targets a text field, so games ignore the key.
  window.gamesHelpers.isEditableTarget = function (target) {
    if (!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || !!target.isContentEditable;
  };

  // Steering directions are resolved from KeyboardEvent.code, which is based
  // on the physical key position and therefore layout-independent (the same
  // physical block steers the same on QWERTY, AZERTY, Dvorak, ...). Arrow
  // keys are merged into every keymap so they always steer — a player can
  // never be locked out by picking an unfamiliar layout (#1023).
  const ARROW_CODE_TO_DIRECTION = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
  };
  const ARROW_KEY_TO_DIRECTION = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
  };
  // Selectable layouts, each combined with the arrow-key entries above.
  // `e.code` is the primary lookup so the maps stay layout-independent.
  const KEYMAP_CODE_SUFFIXES = {
    wasd: { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' },
    ijkl: { KeyI: 'up', KeyK: 'down', KeyJ: 'left', KeyL: 'right' },
    numpad: { Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right' }
  };
  // Fallback for events that carry only `key` (synthetic events, older
  // callers); e.code always wins when present.
  const KEYMAP_KEY_SUFFIXES = {
    wasd: { w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' },
    ijkl: { i: 'up', I: 'up', k: 'down', K: 'down', j: 'left', J: 'left', l: 'right', L: 'right' },
    // Numpad has no `key` fallback: a digit `key` cannot distinguish the
    // numpad block from the top-row digits, so match on `e.code` only.
    numpad: {}
  };
  const DEFAULT_KEYMAP_ID = 'wasd';

  let activeKeymapId = DEFAULT_KEYMAP_ID;
  let codeToDirection = {};
  let keyToDirection = {};

  function normalizeKeymapId(id) {
    return Object.prototype.hasOwnProperty.call(KEYMAP_CODE_SUFFIXES, id) ? id : DEFAULT_KEYMAP_ID;
  }

  function applyKeymap(id) {
    activeKeymapId = normalizeKeymapId(id);
    codeToDirection = Object.assign({}, ARROW_CODE_TO_DIRECTION, KEYMAP_CODE_SUFFIXES[activeKeymapId]);
    keyToDirection = Object.assign({}, ARROW_KEY_TO_DIRECTION, KEYMAP_KEY_SUFFIXES[activeKeymapId]);
  }

  // Resolve a steering direction ('up' | 'down' | 'left' | 'right') from a
  // keydown event, or null when the key is not a direction key (#876/#1023).
  window.gamesHelpers.parseDirection = function (e) {
    if (!e) return null;
    return codeToDirection[e.code] || keyToDirection[e.key] || null;
  };

  // Active keymap id ('wasd' | 'ijkl' | 'numpad') for the settings UI.
  window.gamesHelpers.getKeymap = function () {
    return activeKeymapId;
  };

  // Switch the steering keymap. An unknown id falls back to the default
  // without throwing. The choice is persisted under `games_keymap` (with a
  // localStorage try/catch, mirroring isEnabled) so it survives reloads;
  // parseDirection consults the active map per event, so the switch applies
  // to every steering game immediately, with no reload (#1023).
  window.gamesHelpers.setKeymap = function (id) {
    const resolved = normalizeKeymapId(id);
    applyKeymap(resolved);
    try {
      localStorage.setItem('games_keymap', resolved);
    } catch (_err) {
      // ignore storage errors
    }
    return resolved;
  };

  // Initialize the active map from storage; a missing or corrupted value
  // falls back to the default map without throwing.
  try {
    applyKeymap(localStorage.getItem('games_keymap'));
  } catch (_err) {
    applyKeymap(DEFAULT_KEYMAP_ID);
  }

  // True when a keydown event should be skipped entirely: OS auto-repeat
  // (holding a key would otherwise flood the game with moves), modified
  // shortcuts (Ctrl/Cmd/Alt combos belong to the browser, so Ctrl+S must
  // not be queued as a move or suppressed via preventDefault), and keys
  // typed into editable elements (#876).
  window.gamesHelpers.shouldIgnoreKey = function (e) {
    if (!e) return true;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return true;
    return window.gamesHelpers.isEditableTarget(e.target);
  };

  // Swallow the browser default (page scroll) for game control keys even
  // when the caller drops the event afterwards: a held arrow or Space key
  // would otherwise scroll the page behind the game (#876). Space is left
  // alone while a button, link, or [role="button"] is focused so keyboard
  // users can still activate those controls (#887).
  window.gamesHelpers.suppressGameKeyScroll = function (e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!window.gamesHelpers.parseDirection(e) && e.code !== 'Space') return;
    if (e.code === 'Space' && e.target && typeof e.target.closest === 'function' &&
        e.target.closest('button, a, [role="button"]')) {
      return;
    }
    e.preventDefault();
  };

  // Shared keydown prologue for the games. Returns false when the event
  // belongs to an editable element, is an OS auto-repeat, or is a modified
  // shortcut — the caller should drop it. Otherwise it has already swallowed
  // the browser default (page scroll) for game control keys and the caller
  // continues with its own started/gameOver/steering logic (#876/#887).
  window.gamesHelpers.beginGameKeydown = function (e) {
    if (window.gamesHelpers.isEditableTarget(e.target)) return false;
    window.gamesHelpers.suppressGameKeyScroll(e);
    if (window.gamesHelpers.shouldIgnoreKey(e)) return false;
    return true;
  };

  // Real-time variant of beginGameKeydown for games where players hold a
  // direction key to steer (Snake, Pac-Man). OS auto-repeat is allowed
  // through for direction keys so a held key keeps steering while the
  // current turn is not yet legal, but a repeated Space is still dropped so
  // a held Space can never flicker the pause toggle. Modified shortcuts and
  // editable targets stay ignored, and the browser default (page scroll) is
  // still swallowed for game control keys (#1016).
  window.gamesHelpers.beginRealTimeKeydown = function (e) {
    if (!e) return false;
    if (window.gamesHelpers.isEditableTarget(e.target)) return false;
    window.gamesHelpers.suppressGameKeyScroll(e);
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.repeat && !window.gamesHelpers.parseDirection(e)) return false;
    return true;
  };

  // Toggle manual pause on Space for the animation-driven games: resume a
  // manually paused run, otherwise pause it through onPause. Prevents the
  // Space default (page scroll) first and returns true when the key was
  // Space, false when the caller should keep handling the event (#876).
  // Space while a button, link, or [role="button"] is focused belongs to
  // that control (the #887 exemption in suppressGameKeyScroll), so the
  // pause toggle is skipped and the key is left for the caller.
  window.gamesHelpers.togglePauseOnSpace = function (e, isManualPaused, onPause, onResume) {
    if (e.code !== 'Space') return false;
    if (e.target && typeof e.target.closest === 'function' &&
        e.target.closest('button, a, [role="button"]')) {
      return false;
    }
    e.preventDefault();
    if (isManualPaused) onResume();
    else onPause();
    return true;
  };

  // Keep at most one state overlay (for example paused or game over) on a
  // stage. sync(stage, kind, optionsFor) re-renders only when kind changes;
  // optionsFor(kind) returns renderDOMOverlay options. A null kind clears it.
  window.gamesHelpers.createStateOverlay = function (className) {
    let overlayEl = null;
    let shownKind = null;
    function clear() {
      if (overlayEl) overlayEl.remove();
      overlayEl = null;
      shownKind = null;
    }
    function sync(stageEl, kind, optionsFor) {
      if (kind === shownKind) return;
      clear();
      if (!stageEl || !kind) return;
      overlayEl = window.gamesHelpers.renderDOMOverlay(stageEl, { className, ...optionsFor(kind) });
      shownKind = kind;
    }
    return { sync, clear };
  };

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
      // remove() is a no-op when the overlay is already detached, so no
      // parentNode guard is needed.
      overlay.remove();
      // Restore focus only when the captured target is still meaningful. The
      // launch flow clears the hub grid (removing the focused Play button)
      // before the game mounts, so the browser drops focus to document.body;
      // restoring that would yank focus away from the modal opener right after
      // dialog.close() already returned it. Elements inside a closed dialog
      // are not rendered either, so skip those as well.
      if (
        previouslyFocused &&
        previouslyFocused !== document.body &&
        previouslyFocused !== document.documentElement &&
        typeof previouslyFocused.focus === 'function' &&
        previouslyFocused.isConnected &&
        !(typeof previouslyFocused.closest === 'function' && previouslyFocused.closest('dialog:not([open])'))
      ) {
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

  // Pointer-based swipe steering (#1019). Resolves a direction as soon as the
  // pointer moves `threshold` px from the anchor (then re-anchors, so one
  // continuous drag can steer through several turns) instead of waiting for
  // release, and captures the pointer on down so a gesture that leaves the
  // canvas is never lost. Movement below the threshold fires nothing, so a
  // tap stays a tap and can mean start/restart. options:
  //   threshold — px before a direction fires (default 20)
  //   onTap — called on pointerup when the gesture never crossed the threshold
  // Returns { destroy } to detach every listener.
  window.gamesHelpers.createSwipeSteering = function (canvas, onDirection, options) {
    if (!canvas || typeof onDirection !== 'function') return null;
    const threshold = Number.isFinite(options?.threshold) ? options.threshold : 20;
    const onTap = typeof options?.onTap === 'function' ? options.onTap : null;
    let anchorX = 0;
    let anchorY = 0;
    let tracking = false;
    let moved = false;
    let activePointerId = null;

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // A second finger must not hijack the gesture: the anchor and the
      // tracked pointer stay with the first one (#1019 review).
      if (tracking) return;
      // Swallow the browser default so a mouse drag cannot start a native
      // text selection (or drag) that highlights the page around the board
      // (#1024). Cancelling pointerdown only suppresses the compatibility
      // mouse events; pointerup still fires, so tap-to-restart is intact.
      e.preventDefault();
      tracking = true;
      moved = false;
      activePointerId = e.pointerId;
      anchorX = e.clientX;
      anchorY = e.clientY;
      if (typeof canvas.setPointerCapture === 'function') {
        try { canvas.setPointerCapture(e.pointerId); } catch (_err) { /* ignore */ }
      }
    }

    function onPointerMove(e) {
      if (!tracking) return;
      if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
      const dx = e.clientX - anchorX;
      const dy = e.clientY - anchorY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      let dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';
      // Re-anchor so the rest of the same drag can trigger another turn.
      anchorX = e.clientX;
      anchorY = e.clientY;
      moved = true;
      onDirection(dir);
    }

    function onPointerEnd(e) {
      if (!tracking) return;
      if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
      tracking = false;
      activePointerId = null;
      if (typeof canvas.releasePointerCapture === 'function' && e && e.pointerId !== undefined) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (_err) { /* ignore */ }
      }
      // Only a deliberate pointerup counts as a tap; a pointercancel (the
      // browser taking over for scroll/zoom) must never restart a finished
      // run through onTap (#1019 review).
      if (!moved && onTap && e && e.type === 'pointerup') onTap();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    return {
      destroy: function () {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerEnd);
        canvas.removeEventListener('pointercancel', onPointerEnd);
        tracking = false;
        activePointerId = null;
      }
    };
  };

  // Compact on-screen D-pad for touch play (#1019), appended to a game stage
  // and calling onDirection('up' | 'down' | 'left' | 'right') per press. CSS
  // shows it only on coarse-pointer devices, so desktop is unchanged. Buttons
  // fire on pointerdown for a lag-free press and re-fire on click with
  // detail === 0 (keyboard/assistive-tech activation only, so a tap does not
  // double-fire). Returns { destroy, element }.
  window.gamesHelpers.createDPad = function (stage, onDirection) {
    if (!stage || typeof onDirection !== 'function') return null;

    const pad = document.createElement('div');
    pad.className = 'games-dpad';
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', window.gamesHelpers.tr('gamesDpad'));

    const buttons = [
      { dir: 'up', glyph: '▲', key: 'gamesDpadUp' },
      { dir: 'left', glyph: '◀', key: 'gamesDpadLeft' },
      { dir: 'right', glyph: '▶', key: 'gamesDpadRight' },
      { dir: 'down', glyph: '▼', key: 'gamesDpadDown' }
    ];

    const cleanups = buttons.map(function (spec) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'games-dpad-btn games-dpad-' + spec.dir;
      button.textContent = spec.glyph;
      button.setAttribute('aria-label', window.gamesHelpers.tr(spec.key));

      function onPointerDown(e) {
        // Same primary-button rule as the swipe helper: a right- or
        // middle-click must not steer (#1019 review).
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        onDirection(spec.dir);
      }
      function onClick(e) {
        // Pointer taps already fired on pointerdown; only keyboard and
        // assistive-tech clicks (detail 0) still need the direction here.
        if (e.detail !== 0) return;
        onDirection(spec.dir);
      }

      button.addEventListener('pointerdown', onPointerDown);
      button.addEventListener('click', onClick);
      pad.appendChild(button);
      return function () {
        button.removeEventListener('pointerdown', onPointerDown);
        button.removeEventListener('click', onClick);
      };
    });

    stage.appendChild(pad);

    return {
      element: pad,
      destroy: function () {
        cleanups.forEach(function (cleanup) { cleanup(); });
        pad.remove();
      }
    };
  };

  // Optional Gamepad API input for the steering games (#1022). Polls
  // navigator.getGamepads() on a single requestAnimationFrame loop and maps
  // the standard mapping onto the same entry points the keyboard uses:
  // D-pad and left stick call onDirection (feeding queueTurn), Start calls
  // onPause, and A/Cross calls onRestart. A direction fires only on the
  // transition into it and latches until every input returns inside the
  // deadzone, so a held stick behaves like a single key press instead of an
  // auto-repeat flood (the gamepad equivalent of shouldIgnoreKey dropping
  // OS repeats); a direct change to another direction counts as a fresh
  // edge, and buttons are edge-triggered the same way. Only controllers
  // reporting the standard mapping are selected, since the fixed button
  // indices below are meaningless on unmapped pads. Returns
  // { destroy } to stop the loop, or null when the Gamepad API (or
  // requestAnimationFrame) is unavailable, so tests and non-supporting
  // browsers never see a poller.
  window.gamesHelpers.createGamepadSteering = function (options) {
    if (typeof navigator.getGamepads !== 'function') return null;
    if (typeof window.requestAnimationFrame !== 'function') return null;
    const deadzone = Number.isFinite(options?.deadzone) ? options.deadzone : 0.4;
    const onDirection = typeof options?.onDirection === 'function' ? options.onDirection : null;
    const onPause = typeof options?.onPause === 'function' ? options.onPause : null;
    const onRestart = typeof options?.onRestart === 'function' ? options.onRestart : null;

    // Standard gamepad mapping: 0 = A/Cross, 9 = Start/Options, 12-15 = D-pad.
    const BUTTON_A = 0;
    const BUTTON_START = 9;
    const BUTTON_DPAD_UP = 12;
    const BUTTON_DPAD_DOWN = 13;
    const BUTTON_DPAD_LEFT = 14;
    const BUTTON_DPAD_RIGHT = 15;

    let rafId = null;
    let destroyed = false;
    let latchedDirection = null;
    let startHeld = false;
    let aHeld = false;
    let lastPad = null;

    function isPressed(button) {
      return !!button && (button.pressed === true || button.value > 0);
    }

    // Resolve the current direction, or null when everything is neutral
    // (inside the deadzone, D-pad released). Discrete D-pad presses win over
    // the analog stick, and opposing D-pad presses cancel each other.
    function readDirection(pad) {
      const buttons = pad.buttons || [];
      const up = isPressed(buttons[BUTTON_DPAD_UP]);
      const down = isPressed(buttons[BUTTON_DPAD_DOWN]);
      const left = isPressed(buttons[BUTTON_DPAD_LEFT]);
      const right = isPressed(buttons[BUTTON_DPAD_RIGHT]);
      if (up !== down) return up ? 'up' : 'down';
      if (left !== right) return left ? 'left' : 'right';
      const axes = pad.axes || [];
      const x = Number.isFinite(axes[0]) ? axes[0] : 0;
      const y = Number.isFinite(axes[1]) ? axes[1] : 0;
      if (Math.abs(x) <= deadzone && Math.abs(y) <= deadzone) return null;
      if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
      return y > 0 ? 'down' : 'up';
    }

    function poll(pad) {
      const direction = readDirection(pad);
      if (direction === null) {
        // Back to neutral: release the latch so the next press of the same
        // direction is a fresh edge instead of being swallowed forever.
        latchedDirection = null;
      } else if (latchedDirection !== direction) {
        // First press or a direct change to another direction: fire as a
        // fresh edge while still suppressing repeats of the held direction.
        latchedDirection = direction;
        if (onDirection) onDirection(direction);
      }

      const buttons = pad.buttons || [];
      const startPressed = isPressed(buttons[BUTTON_START]);
      if (startPressed && !startHeld && onPause) onPause();
      startHeld = startPressed;
      const aPressed = isPressed(buttons[BUTTON_A]);
      if (aPressed && !aHeld && onRestart) onRestart();
      aHeld = aPressed;
    }

    function frame() {
      if (destroyed) return;
      // Re-arm before polling so a callback that tears the poller down
      // mid-frame cancels the pending frame instead of resurrecting it.
      rafId = window.requestAnimationFrame(frame);
      let pad = null;
      try {
        const pads = navigator.getGamepads() || [];
        for (let i = 0; i < pads.length; i++) {
          if (pads[i] && pads[i].connected !== false && pads[i].mapping === 'standard') {
            pad = pads[i];
            break;
          }
        }
      } catch (_err) {
        pad = null;
      }
      if (!pad) {
        // No usable controller: reset every latch so a reconnect re-fires
        // its edges.
        latchedDirection = null;
        startHeld = false;
        aHeld = false;
        lastPad = null;
        return;
      }
      if (lastPad !== null && lastPad !== pad) {
        // The selected controller changed: its held inputs are fresh edges,
        // not continuations of the previous pad's latches.
        latchedDirection = null;
        startHeld = false;
        aHeld = false;
      }
      lastPad = pad;
      poll(pad);
    }

    rafId = window.requestAnimationFrame(frame);

    return {
      destroy: function () {
        destroyed = true;
        if (rafId !== null && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(rafId);
        }
        rafId = null;
      }
    };
  };

  // Key handling helper for restarting on Space when gameOver
  window.gamesHelpers.handleRestartSpace = function (ev, resetFn) {
    if (!ev || window.gamesHelpers.isEditableTarget(ev.target)) return;
    if (ev.code === 'Space') {
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
      if (typeof resetFn === 'function') resetFn();
    }
  };

  // Record a finished run: bump gamesPlayed and keep the best score.
  window.gamesHelpers.recordRunResult = function (gameId, finalScore) {
    window.gamesHelpers.updateStatsWith(gameId, function (stats) {
      const best = Number.isSafeInteger(stats.highScore) ? stats.highScore : 0;
      const played = Number.isSafeInteger(stats.gamesPlayed) ? stats.gamesPlayed : 0;
      return { highScore: Math.max(best, finalScore), gamesPlayed: played + 1 };
    });
  };

  // Wrapper to make updating stats less repetitive. fn receives current stats and should return updates.
  window.gamesHelpers.updateStatsWith = function (gameId, fn) {
    if (!window.GameRegistry || typeof fn !== 'function') return;
    try {
      // Pass the updater itself so it runs against the stored stats at write
      // time, never against another write's unconfirmed values.
      Promise.resolve(window.GameRegistry.updateStats(gameId, (stats) => fn(stats || {}) || {})).then((saved) => {
        if (!saved) {
          console.warn('gamesHelpers.updateStatsWith: failed to persist stats for', gameId);
        }
      }, (e) => {
        console.warn('gamesHelpers.updateStatsWith error', e);
      });
    } catch (e) {
      console.warn('gamesHelpers.updateStatsWith error', e);
    }
  };

})();
