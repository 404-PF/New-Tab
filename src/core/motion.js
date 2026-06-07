// src/core/motion.js - prefers-reduced-motion helper
//
// Provides a single source of truth for the user's motion preference plus a
// subscription API and a `reduce-motion` class on <html> that other scripts
// (and CSS) can target without each re-implementing matchMedia wiring.
//
// Loaded as a plain <script> in New-Tab.html before any feature module that
// needs to read the preference. Exposes the helpers on `window` for both
// runtime consumers and tests.

(function () {
  'use strict';

  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
  const ROOT_CLASS = 'reduce-motion';

  let mql = null;
  let currentReduced = false;
  let initialized = false;
  let detachBrowserListener = null;
  // Handlers registered via `onReducedMotionChange`. Each handler is expected
  // to register once at module evaluation and never re-register. If a module
  // re-evaluates in production (HMR, dev reload, etc.) the same handler
  // closure can be added multiple times; callers should hold the unsubscribe
  // function and call it on teardown, or use `_resetSubscribersForTests` in
  // test setups that re-inject modules.
  const subscribers = new Set();

  function readMql() {
    if (mql !== null) return mql;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      mql = false;
      return mql;
    }
    try {
      mql = window.matchMedia(REDUCED_QUERY);
    } catch {
      mql = false;
    }
    return mql;
  }

  function applyRootClass(reduced) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    if (reduced) {
      document.documentElement.classList.add(ROOT_CLASS);
    } else {
      document.documentElement.classList.remove(ROOT_CLASS);
    }
  }

  function setReduced(reduced, fireSubscribers) {
    const next = !!reduced;
    if (currentReduced === next && !fireSubscribers) {
      applyRootClass(next);
      return;
    }
    currentReduced = next;
    applyRootClass(next);
    if (fireSubscribers) {
      subscribers.forEach((handler) => {
        try {
          handler(next);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('motion: subscriber threw', e);
          }
        }
      });
    }
  }

  function handleBrowserChange(event) {
    setReduced(!!(event && event.matches), true);
  }

  function attachBrowserListener() {
    const list = readMql();
    if (!list || typeof list.addEventListener !== 'function') return;
    list.addEventListener('change', handleBrowserChange);
    detachBrowserListener = () => {
      if (typeof list.removeEventListener === 'function') {
        list.removeEventListener('change', handleBrowserChange);
      }
      detachBrowserListener = null;
    };
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const list = readMql();
    if (list) {
      setReduced(!!list.matches, false);
      attachBrowserListener();
    } else {
      setReduced(false, false);
    }
  }

  function prefersReducedMotion() {
    return currentReduced;
  }

  function onReducedMotionChange(handler) {
    if (typeof handler !== 'function') return () => {};
    subscribers.add(handler);
    return () => subscribers.delete(handler);
  }

  // Returns 0 when the user prefers reduced motion, otherwise the
  // supplied duration. Use this to wrap any visual-delay setTimeout in
  // the codebase so the JS-side cleanup collapses alongside the CSS
  // transition that the global reduced-motion override already shortens.
  function crossfadeDelayMs(duration) {
    return currentReduced ? 0 : duration;
  }

  // Test hook: lets jsdom flip the preference without depending on a real
  // MediaQueryList change event. Mirrors what the browser would do.
  function _setReducedForTests(reduced) {
    setReduced(!!reduced, true);
  }

  // Test hook: replace the cached mql. The next call to `init` (or
  // `prefersReducedMotion` after a `_setReducedForTests`) will read from the
  // injected object. Useful when overriding `window.matchMedia` after this
  // file has already loaded.
  function _setMqlForTests(list) {
    if (detachBrowserListener) {
      detachBrowserListener();
    }
    mql = list;
    initialized = false;
    init();
  }

  // Test hook: clear all registered subscribers. Tests that re-inject a
  // module (and therefore re-register its motion-change handler) should
  // call this first to avoid duplicate handler accumulation in `subscribers`.
  function _resetSubscribersForTests() {
    subscribers.clear();
  }

  init();

  window.prefersReducedMotion = prefersReducedMotion;
  window.onReducedMotionChange = onReducedMotionChange;
  window.crossfadeDelayMs = crossfadeDelayMs;
  window.__motionInit = init;
  window._setReducedForTests = _setReducedForTests;
  window._setMqlForTests = _setMqlForTests;
  window._resetSubscribersForTests = _resetSubscribersForTests;
})();
