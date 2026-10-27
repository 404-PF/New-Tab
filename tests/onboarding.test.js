import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// The instance injected here stays registered for the whole file; the
// auto-start describe below keeps it inert (see its beforeEach).
let persistedInstance;

beforeAll(() => {
  // dom-ready.js must load before onboarding.js: the auto-start engine
  // registers through window.onDomReady, exactly as bootstrap.js orders it.
  injectScript('src/core/dom-ready.js');
  // Inject under fake timers so the initial 500ms auto-start delay
  // (src/features/onboarding.js setTimeout(checkAndStart, 500)) lands on
  // the fake clock and is discarded with it, instead of becoming a native
  // timer that can fire after teardown when globalThis.localStorage is gone.
  vi.useFakeTimers();
  injectScript('src/features/onboarding.js');
  persistedInstance = window.onboardingTour;
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.onboardingTour.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OnboardingTour class', () => {
  it('isCompleted returns true when localStorage has flag', () => {
    expect(window.onboardingTour.isCompleted()).toBe(false);
    localStorage.setItem('onboardingCompleted', 'true');
    expect(window.onboardingTour.isCompleted()).toBe(true);
  });

  it('markCompleted sets flag and clears saved step', async () => {
    localStorage.setItem('onboardingStep', '3');
    await window.onboardingTour.markCompleted();
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    expect(localStorage.getItem('onboardingStep')).toBeNull();
    expect(window.onboardingTour.completed).toBe(true);
  });

  it('reset clears all onboarding keys', () => {
    localStorage.setItem('onboardingCompleted', 'true');
    localStorage.setItem('onboardingStep', '5');
    window.onboardingTour.reset();
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
    expect(localStorage.getItem('onboardingStep')).toBeNull();
    expect(window.onboardingTour.completed).toBe(false);
    expect(window.onboardingTour.currentStep).toBe(0);
  });
});

describe('Progress saving on navigation', () => {
  function startAndGetStep(n) {
    window.onboardingTour.start(n);
    return window.onboardingTour.currentStep;
  }

  it('saves step on nextStep', () => {
    startAndGetStep(0);
    window.onboardingTour.nextStep();
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    window.onboardingTour.nextStep();
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    window.onboardingTour.end(true);
  });

  it('saves step on prevStep', () => {
    startAndGetStep(3);
    window.onboardingTour.prevStep();
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    window.onboardingTour.end(true);
  });

  it('saves step on goToStep', () => {
    startAndGetStep(0);
    window.onboardingTour.goToStep(5);
    expect(localStorage.getItem('onboardingStep')).toBe('5');
    window.onboardingTour.end(true);
  });

  it('end(false) preserves saved step without marking completed', () => {
    window.onboardingTour.currentStep = 4;
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    window.onboardingTour.end(false);
    expect(localStorage.getItem('onboardingStep')).toBe('4');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
    expect(window.onboardingTour.completed).toBe(false);
  });

  it('end(true) marks completed and clears saved step', async () => {
    localStorage.setItem('onboardingStep', '9');
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    await window.onboardingTour.end(true);
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    expect(localStorage.getItem('onboardingStep')).toBeNull();
    expect(window.onboardingTour.completed).toBe(true);
  });

  it('end() with no argument defaults to dismiss (preserves step)', () => {
    window.onboardingTour.currentStep = 2;
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    window.onboardingTour.end();
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('close button saves progress for resume', () => {
    const tour = window.onboardingTour;
    tour.start(4);
    const closeBtn = document.querySelector('.onboarding-close-btn');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
    expect(localStorage.getItem('onboardingStep')).toBe('4');
    expect(tour.completed).toBe(false);
  });

  it('nextStep on last step calls end(true)', async () => {
    window.onboardingTour.currentStep = window.onboardingTour.steps.length - 1;
    window.onboardingTour.isActive = true;
    window.onboardingTour.completed = false;
    await window.onboardingTour.nextStep();
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    expect(localStorage.getItem('onboardingStep')).toBeNull();
  });
});

describe('Resume behavior', () => {
  it('start accepts a step parameter', () => {
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.completed = false;
    window.onboardingTour.start(5);
    expect(window.onboardingTour.currentStep).toBe(5);
    // Clean up overlay
    window.onboardingTour.end(true);
  });

  it('start is a no-op when tour is already completed', () => {
    window.onboardingTour.completed = true;
    window.onboardingTour.currentStep = 7;
    window.onboardingTour.start(0);
    // Should not reset step or set completed to false
    expect(window.onboardingTour.currentStep).toBe(7);
    expect(window.onboardingTour.completed).toBe(true);
  });

  it('start works after reset (restart path)', () => {
    window.onboardingTour.reset();
    window.onboardingTour.start(0);
    expect(window.onboardingTour.completed).toBe(false);
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.end(true);
  });

  it('_dismissedThisSession prevents re-trigger on same page load', () => {
    const tour = window.onboardingTour;
    tour.start(0);
    expect(tour.isActive).toBe(true);
    // Dismiss the tour
    tour.end(false);
    expect(tour._dismissedThisSession).toBe(true);
    expect(tour.isActive).toBe(false);
    // Simulate the auto-start guard — _tryStart should NOT re-launch
    expect(tour.isCompleted()).toBe(false);
    expect(tour._dismissedThisSession).toBe(true);
    // Just checking the guard flags; _tryStart would be blocked by
    // the check in the auto-start callers (onDomReady / load handlers)
  });

  it('_dismissedThisSession is false after start() for restart', () => {
    const tour = window.onboardingTour;
    tour._dismissedThisSession = true;
    tour.start(0);
    expect(tour._dismissedThisSession).toBe(false);
    tour.end(true);
  });

  it('_dismissedThisSession is false after reset()', () => {
    const tour = window.onboardingTour;
    tour._dismissedThisSession = true;
    tour.reset();
    expect(tour._dismissedThisSession).toBe(false);
  });

  it('end(true) does not set _dismissedThisSession', () => {
    const tour = window.onboardingTour;
    tour.start(0);
    tour.end(true);
    expect(tour._dismissedThisSession).toBe(false);
  });
});

describe('Saved step detection in auto-start', () => {
  it('_resolveSavedStep returns saved step from localStorage', () => {
    localStorage.setItem('onboardingStep', '6');
    expect(window.onboardingTour._resolveSavedStep()).toBe(6);
  });

  it('_resolveSavedStep returns 0 when no step is saved', () => {
    localStorage.removeItem('onboardingStep');
    expect(window.onboardingTour._resolveSavedStep()).toBe(0);
  });

  it('_resolveSavedStep returns 0 for out-of-bounds step', () => {
    localStorage.setItem('onboardingStep', '999');
    expect(window.onboardingTour._resolveSavedStep()).toBe(0);
  });

  it('_resolveSavedStep returns 0 for NaN step', () => {
    localStorage.setItem('onboardingStep', 'abc');
    expect(window.onboardingTour._resolveSavedStep()).toBe(0);
  });

  it('start uses saved step when onboardingStep exists', () => {
    localStorage.setItem('onboardingStep', '6');
    window.onboardingTour.completed = false;
    window.onboardingTour.start(window.onboardingTour._resolveSavedStep());
    expect(window.onboardingTour.currentStep).toBe(6);
    window.onboardingTour.end(true);
  });

  it('start clamps out-of-bounds step index', () => {
    window.onboardingTour.completed = false;
    window.onboardingTour.start(999);
    expect(window.onboardingTour.currentStep).toBe(window.onboardingTour.steps.length - 1);
    window.onboardingTour.end(true);

    window.onboardingTour.completed = false;
    window.onboardingTour.start(-5);
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.end(true);
  });

  it('_tryStart starts from saved step when onboardingStep exists', () => {
    localStorage.setItem('onboardingStep', '6');
    window.onboardingTour.completed = false;
    window.onboardingTour._tryStart();
    expect(window.onboardingTour.currentStep).toBe(6);
    window.onboardingTour.end(true);
  });

  it('_tryStart starts from beginning when no step is saved', () => {
    localStorage.removeItem('onboardingStep');
    window.onboardingTour.completed = false;
    window.onboardingTour._tryStart();
    expect(window.onboardingTour.currentStep).toBe(0);
    window.onboardingTour.end(true);
  });

  it('isCompleted blocks auto-start when onboardingCompleted is set', () => {
    localStorage.setItem('onboardingCompleted', 'true');
    localStorage.setItem('onboardingStep', '3');
    expect(window.onboardingTour.isCompleted()).toBe(true);
    // Auto-start callers (onDomReady / load handlers) check
    // isCompleted() before calling _tryStart(), so this guard
    // correctly prevents resuming a previously completed tour.
  });
});

describe('Immediate progress saving on language/theme selection', () => {
  it('language radio selection saves progress to next step immediately', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    const radio = document.querySelector('input[name="onboarding-language"]');
    expect(radio).not.toBeNull();
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Step should be saved immediately, not only after the 500ms timeout
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    tour.end(true);
  });

  it('theme radio selection saves progress to next step immediately', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    const radio = document.querySelector('input[name="onboarding-theme"]');
    expect(radio).not.toBeNull();
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Step should be saved immediately, not only after the 500ms timeout
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    tour.end(true);
  });

  it('theme radio selection dispatches themeChanged event', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    const handler = vi.fn();
    window.addEventListener('themeChanged', handler);
    const radio = document.querySelector('input[name="onboarding-theme"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { theme: 'dark' } })
    );
    window.removeEventListener('themeChanged', handler);
    tour.end(true);
  });

  it('end(false) after language selection preserves optimistically saved next step', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    const radio = document.querySelector('input[name="onboarding-language"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Radio handler saved step 1 and scheduled 500ms nextStep
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    // Dismiss before the 500ms timeout fires
    tour.end(false);
    // Should keep step 1, not overwrite with currentStep (0)
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('end(false) after theme selection preserves optimistically saved next step', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    const radio = document.querySelector('input[name="onboarding-theme"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Radio handler saved step 2 and scheduled 500ms nextStep
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    // Dismiss before the 500ms timeout fires
    tour.end(false);
    // Should keep step 2, not overwrite with currentStep (1)
    expect(localStorage.getItem('onboardingStep')).toBe('2');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('radio change after end(false) does not corrupt saved step (language)', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    // Dismiss the tour — sets isActive=false, saves step 0, starts 300ms fade-out
    tour.end(false);
    expect(localStorage.getItem('onboardingStep')).toBe('0');
    // Stale radio change event during the fade-out window
    const radio = document.querySelector('input[name="onboarding-language"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Should NOT overwrite the step end(false) saved
    expect(localStorage.getItem('onboardingStep')).toBe('0');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('radio change after end(false) does not corrupt saved step (theme)', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    // Dismiss the tour — sets isActive=false, saves step 1, starts 300ms fade-out
    tour.end(false);
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    // Stale radio change event during the fade-out window
    const radio = document.querySelector('input[name="onboarding-theme"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Should NOT overwrite the step end(false) saved
    expect(localStorage.getItem('onboardingStep')).toBe('1');
    expect(localStorage.getItem('onboardingCompleted')).toBeNull();
  });

  it('revisiting language step does not accumulate duplicate listeners', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    // First visit: attach handler
    tour.handleAction('select-language', tour.steps[0]);
    const firstHandler = tour._languageChangeHandler;
    expect(firstHandler).not.toBeNull();
    // Simulate step navigation (showStep replaces innerHTML, destroying old radios)
    tour.currentStep = 1;
    tour.showStep();
    // Revisit language step: old handler should be removed, new one attached
    tour.currentStep = 0;
    tour.showStep();
    const secondHandler = tour._languageChangeHandler;
    expect(secondHandler).not.toBeNull();
    expect(secondHandler.fn).not.toBe(firstHandler.fn);
  });

  it('revisiting theme step does not accumulate duplicate listeners', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    // First visit: attach handler
    tour.handleAction('select-theme', tour.steps[1]);
    const firstHandler = tour._themeChangeHandler;
    expect(firstHandler).not.toBeNull();
    // Simulate step navigation
    tour.currentStep = 0;
    tour.showStep();
    // Revisit theme step
    tour.currentStep = 1;
    tour.showStep();
    const secondHandler = tour._themeChangeHandler;
    expect(secondHandler).not.toBeNull();
    expect(secondHandler.fn).not.toBe(firstHandler.fn);
  });

  it('language radio change after revisiting step only advances once', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(0);
    // Navigate away and back to language step
    tour.currentStep = 1;
    tour.showStep();
    tour.currentStep = 0;
    tour.showStep();
    // Spy on nextStep
    const spy = vi.spyOn(tour, 'nextStep');
    // Trigger language selection
    const radio = document.querySelector('input[name="onboarding-language"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Advance past the 500ms auto-advance timeout
    vi.advanceTimersByTime(600);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('theme radio change after revisiting step only advances once', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    tour.start(1);
    // Navigate away and back to theme step
    tour.currentStep = 0;
    tour.showStep();
    tour.currentStep = 1;
    tour.showStep();
    // Spy on nextStep
    const spy = vi.spyOn(tour, 'nextStep');
    // Trigger theme selection
    const radio = document.querySelector('input[name="onboarding-theme"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    // Advance past the 500ms auto-advance timeout
    vi.advanceTimersByTime(600);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('Timeout cleanup', () => {
  it('reset clears pending action timeouts', () => {
    const tour = window.onboardingTour;
    tour._actionTimeouts = [123, 456];
    tour.reset();
    expect(tour._actionTimeouts).toEqual([]);
  });

  it('_clearActionTimeouts empties the timeouts array', () => {
    const tour = window.onboardingTour;
    tour._actionTimeouts = [789];
    tour._clearActionTimeouts();
    expect(tour._actionTimeouts).toEqual([]);
  });

  it('end clears pending action timeouts', () => {
    const tour = window.onboardingTour;
    tour.start(0);
    const radio = document.querySelector('input[name="onboarding-language"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    tour.end(false);
    expect(tour._actionTimeouts).toEqual([]);
  });
});

describe('Completion persistence failures', () => {
  const SAVE_ERROR_MESSAGE = 'Failed to save onboarding completion. Your progress was kept so you can retry.';

  function restoreSetItemAsync(original) {
    if (original) localStorage.setItemAsync = original;
    else delete localStorage.setItemAsync;
  }

  function restoreShowToast(original) {
    if (original) window.showToast = original;
    else delete window.showToast;
  }

  it('markCompleted keeps saved step and shows a toast when setItemAsync reports failure', async () => {
    const originalSetItemAsync = localStorage.setItemAsync;
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    localStorage.setItemAsync = vi.fn().mockResolvedValue(false);
    window.showToast = showToast;

    try {
      localStorage.setItem('onboardingStep', '9');
      const result = await window.onboardingTour.markCompleted();

      expect(result).toBe(false);
      expect(localStorage.getItem('onboardingStep')).toBe('9');
      expect(window.onboardingTour.isCompleted()).toBe(false);
      expect(window.onboardingTour.completed).toBe(false);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      restoreSetItemAsync(originalSetItemAsync);
      restoreShowToast(originalShowToast);
    }
  });

  it('markCompleted keeps saved step when chrome.storage.local.set fails asynchronously', async () => {
    const originalSet = chrome.storage.local.set;
    localStorage.setItem('onboardingStep', '9');

    // The bridge accepts the completion write optimistically, then surfaces
    // the asynchronous chrome.storage.local.set failure via lastError.
    chrome.storage.local.set = (items, callback) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      if (callback) callback();
      chrome.runtime.lastError = null;
      return Promise.resolve();
    };

    try {
      const result = await window.onboardingTour.markCompleted();

      expect(result).toBe(false);
      expect(localStorage.getItem('onboardingStep')).toBe('9');
      expect(window.onboardingTour.isCompleted()).toBe(false);
      expect(window.onboardingTour.completed).toBe(false);
    } finally {
      chrome.storage.local.set = originalSet;
    }
  });

  it('end(true) leaves the tour resumable when the completion write fails', async () => {
    const originalSetItemAsync = localStorage.setItemAsync;
    localStorage.setItemAsync = vi.fn().mockResolvedValue(false);

    try {
      localStorage.setItem('onboardingStep', '9');
      window.onboardingTour.isActive = true;
      window.onboardingTour.completed = false;
      await window.onboardingTour.end(true);

      expect(localStorage.getItem('onboardingStep')).toBe('9');
      expect(window.onboardingTour.isCompleted()).toBe(false);
      expect(window.onboardingTour.completed).toBe(false);
      expect(window.onboardingTour.isActive).toBe(false);
      expect(window.onboardingTour._resolveSavedStep()).toBe(9);
    } finally {
      restoreSetItemAsync(originalSetItemAsync);
    }
  });

  it('markCompleted falls back to sync setItem when setItemAsync is unavailable', async () => {
    const originalSetItemAsync = localStorage.setItemAsync;
    delete localStorage.setItemAsync;

    try {
      localStorage.setItem('onboardingStep', '3');
      const result = await window.onboardingTour.markCompleted();

      expect(result).toBe(true);
      expect(localStorage.getItem('onboardingCompleted')).toBe('true');
      expect(localStorage.getItem('onboardingStep')).toBeNull();
      expect(window.onboardingTour.completed).toBe(true);
    } finally {
      restoreSetItemAsync(originalSetItemAsync);
    }
  });

  it('markCompleted keeps saved step when the sync fallback write throws', async () => {
    const originalSetItemAsync = localStorage.setItemAsync;
    const originalSetItem = localStorage.setItem;
    const originalShowToast = window.showToast;
    const showToast = vi.fn();

    localStorage.setItem('onboardingStep', '3');
    delete localStorage.setItemAsync;
    localStorage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    window.showToast = showToast;

    try {
      const result = await window.onboardingTour.markCompleted();

      expect(result).toBe(false);
      expect(localStorage.getItem('onboardingStep')).toBe('3');
      expect(window.onboardingTour.isCompleted()).toBe(false);
      expect(window.onboardingTour.completed).toBe(false);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      restoreSetItemAsync(originalSetItemAsync);
      localStorage.setItem = originalSetItem;
      restoreShowToast(originalShowToast);
    }
  });
});

describe('Auto-start registration timing', () => {
  // isTourReady() requires these elements to have non-zero dimensions;
  // jsdom reports 0 for offsetWidth/offsetHeight unless stubbed.
  const REQUIRED_ELEMENTS = [
    { selector: '#clock', id: 'clock' },
    { selector: '#date', id: 'date' },
    { selector: '.search-bar', className: 'search-bar' },
    { selector: '#app-grid', id: 'app-grid' },
    { selector: '#motto-container', id: 'motto-container' }
  ];

  function stubRequiredElements() {
    REQUIRED_ELEMENTS.forEach(({ selector, id, className }) => {
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement('div');
        if (id) {
          element.id = id;
        } else {
          element.className = className;
        }
        element.setAttribute('data-onboarding-stub', 'true');
        document.body.appendChild(element);
      }
      Object.defineProperty(element, 'offsetWidth', { value: 100, configurable: true });
      Object.defineProperty(element, 'offsetHeight', { value: 100, configurable: true });
    });
  }

  let pendingListeners;

  beforeEach(() => {
    pendingListeners = [];
    // The instance injected by the file-level beforeAll keeps its listeners
    // registered for the whole file; mark it dismissed so its retry chain
    // and handlers can never start a tour during these tests.
    persistedInstance._dismissedThisSession = true;
  });

  afterEach(() => {
    pendingListeners.forEach(([type, listener]) => {
      window.removeEventListener(type, listener);
      document.removeEventListener(type, listener);
    });
    pendingListeners = [];
    window.onboardingTour.reset();
    document.querySelectorAll('[data-onboarding-stub]').forEach((element) => element.remove());
    ['date', 'motto-container'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        delete element.offsetWidth;
        delete element.offsetHeight;
      }
    });
    delete window.appGridReady;
    delete window.visibilityManager;
    if (vi.isFakeTimers()) vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  // Inject a fresh onboarding.js while recording every listener it registers,
  // so this test's instance can be fully detached afterwards.
  function injectOnboarding() {
    const windowSpy = vi.spyOn(window, 'addEventListener');
    const documentSpy = vi.spyOn(document, 'addEventListener');
    injectScript('src/features/onboarding.js');
    const windowCalls = windowSpy.mock.calls.map((call) => [call[0], call[1]]);
    const documentCalls = documentSpy.mock.calls.map((call) => [call[0], call[1]]);
    windowSpy.mockRestore();
    documentSpy.mockRestore();
    windowCalls.forEach((call) => pendingListeners.push(call));
    documentCalls.forEach((call) => pendingListeners.push(call));
    return { windowCalls, documentCalls };
  }

  it('registers the auto-start engine immediately when scripts run after DOM ready', () => {
    // jsdom mirrors the real extension: bootstrap.js injects scripts after
    // DOMContentLoaded has already fired.
    expect(document.readyState).not.toBe('loading');
    const timersBefore = vi.getTimerCount();
    const { windowCalls, documentCalls } = injectOnboarding();

    const windowTypes = windowCalls.map(([type]) => type);
    expect(windowTypes).toContain('appGridReady');
    expect(windowTypes).toContain('beforeunload');
    expect(windowTypes).toContain('load');
    // Regression guard for issue #840: registration must not hang off a
    // DOMContentLoaded listener that bootstrap-loaded scripts never observe.
    expect(documentCalls.map(([type]) => type)).not.toContain('DOMContentLoaded');
    // The 50-attempt retry loop is armed with its initial 500 ms timeout.
    expect(vi.getTimerCount()).toBeGreaterThan(timersBefore);
  });

  it('defers auto-start registration until DOMContentLoaded while the document is loading', () => {
    const ownDescriptor = Object.getOwnPropertyDescriptor(document, 'readyState');
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
    const windowSpy = vi.spyOn(window, 'addEventListener');
    const documentSpy = vi.spyOn(document, 'addEventListener');
    try {
      injectScript('src/features/onboarding.js');

      expect(documentSpy.mock.calls.map((call) => call[0])).toContain('DOMContentLoaded');
      expect(windowSpy.mock.calls.map((call) => call[0])).not.toContain('appGridReady');

      document.dispatchEvent(new Event('DOMContentLoaded'));

      const windowTypes = windowSpy.mock.calls.map((call) => call[0]);
      expect(windowTypes).toContain('appGridReady');
      expect(windowTypes).toContain('beforeunload');
    } finally {
      // Record every listener registered by this injection (including any
      // added during the DOMContentLoaded dispatch) for afterEach cleanup.
      windowSpy.mock.calls.forEach((call) => pendingListeners.push([call[0], call[1]]));
      documentSpy.mock.calls.forEach((call) => pendingListeners.push([call[0], call[1]]));
      windowSpy.mockRestore();
      documentSpy.mockRestore();
      if (ownDescriptor) {
        Object.defineProperty(document, 'readyState', ownDescriptor);
      } else {
        delete document.readyState;
      }
    }
  });

  it('starts the tour when appGridReady fires after load + 1000 ms', () => {
    injectOnboarding();
    const tour = window.onboardingTour;
    stubRequiredElements();

    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(1100);

    // The one-shot load fallback has given up; the retry loop has not.
    expect(tour.isActive).toBe(false);

    // Grid finishes rendering after the fallback window closed.
    window.appGridReady = true;
    window.dispatchEvent(new Event('appGridReady'));

    expect(tour.isActive).toBe(true);
    expect(tour.overlay).not.toBeNull();
  });

  it('does not start twice when the load fallback fires after the ready path already started', () => {
    injectOnboarding();
    const tour = window.onboardingTour;
    stubRequiredElements();
    window.appGridReady = true;

    const tryStartSpy = vi.spyOn(tour, '_tryStart');
    window.dispatchEvent(new Event('load'));

    vi.advanceTimersByTime(600); // ready path's initial check runs at 500 ms
    expect(tour.isActive).toBe(true);
    expect(tryStartSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000); // load fallback (1000 ms) + retry window
    expect(tryStartSpy).toHaveBeenCalledTimes(1);

    // A late duplicate appGridReady dispatch must not restart the tour.
    window.dispatchEvent(new Event('appGridReady'));
    expect(tryStartSpy).toHaveBeenCalledTimes(1);
  });

  it('does not start while the tab is hidden and starts once visible', () => {
    injectOnboarding();
    const tour = window.onboardingTour;
    stubRequiredElements();
    window.appGridReady = true;

    const visibilitySubscribers = [];
    window.visibilityManager = {
      isVisible: false,
      onChange(callback) {
        visibilitySubscribers.push(callback);
        return () => {
          const index = visibilitySubscribers.indexOf(callback);
          if (index > -1) visibilitySubscribers.splice(index, 1);
        };
      }
    };

    vi.advanceTimersByTime(2000);
    expect(tour.isActive).toBe(false);
    expect(visibilitySubscribers.length).toBeGreaterThan(0);

    window.visibilityManager.isVisible = true;
    visibilitySubscribers.slice().forEach((callback) => callback(true));

    expect(tour.isActive).toBe(true);
    expect(visibilitySubscribers).toHaveLength(0);
  });
});

describe('System theme choice on the onboarding theme step (issue #1011)', () => {
  it('checks only the system radio for a stored system theme', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    localStorage.setItem('theme', 'system');
    tour.start(1);

    const systemRadio = document.querySelector('input[name="onboarding-theme"][value="system"]');
    expect(systemRadio).not.toBeNull();
    expect(systemRadio.checked).toBe(true);
    expect(document.querySelector('input[name="onboarding-theme"][value="dark"]').checked).toBe(false);
    expect(document.querySelector('input[name="onboarding-theme"][value="light"]').checked).toBe(false);
    tour.end(true);
  });

  it('dispatches themeChanged with the resolved theme when system is picked', () => {
    const tour = window.onboardingTour;
    tour.completed = false;
    localStorage.setItem('theme', 'dark');
    tour.start(1);

    const systemRadio = document.querySelector('input[name="onboarding-theme"][value="system"]');
    const events = [];
    const onThemeChanged = (e) => events.push(e.detail.theme);
    window.resolveTheme = (theme) => (theme === 'system' ? 'light' : theme);
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      systemRadio.checked = true;
      systemRadio.dispatchEvent(new Event('change'));

      expect(localStorage.getItem('theme')).toBe('system');
      expect(document.body.classList.contains('light-theme')).toBe(true);
      expect(events).toEqual(['light']);
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
      delete window.resolveTheme;
      document.body.classList.remove('light-theme');
      tour.end(true);
    }
  });
});
