// tests/prefers-reduced-motion.test.js
// Verifies that the prefers-reduced-motion helper and the JS-driven
// animation paths in main.js, todo.js, and the background modules all
// honor the user's motion preference.

/* global displayDailyMotto, setupRefreshMotto, renderTodos */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const setReduced = (value) => window._setReducedForTests(value);

beforeAll(() => {
  // moto.js's `const mottos` is not visible when the file is loaded via
  // eval (it becomes a block-scoped binding in the eval scope), so we
  // expose a small set on the global object before main.js is injected.
  globalThis.mottos = { en: ['Sample motto for testing'], zh: ['测试样本'] };
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/motion.js');
  injectScript('src/features/todo.js');
  injectScript('src/core/main.js');
  injectScript('src/ui/settings.js');
  // Production order (in src/core/bootstrap.js) loads custom-backgrounds.js
  // BEFORE settings.js. The test loads them in the opposite order so the
  // public window._customBackgrounds API is registered AFTER settings.js has
  // finished module evaluation; this lets the settings.js change-handler
  // tests run first against a clean module state. Both orders are safe
  // because each module only references the other (window.loadBg,
  // window._customBackgrounds, etc.) at call time, never at module-evaluation
  // time.
  injectScript('src/data/custom-backgrounds.js');
});

afterEach(() => {
  setReduced(false);
  document.documentElement.classList.remove('reduce-motion');
  vi.useRealTimers();
});

describe('motion helper', () => {
  it('defaults to false in jsdom (no preference)', () => {
    setReduced(false);
    expect(window.prefersReducedMotion()).toBe(false);
  });

  it('reflects the test hook value', () => {
    setReduced(true);
    expect(window.prefersReducedMotion()).toBe(true);
    setReduced(false);
    expect(window.prefersReducedMotion()).toBe(false);
  });

  it('toggles the reduce-motion class on <html>', () => {
    setReduced(true);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    setReduced(false);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
  });

  it('notifies subscribers when the preference flips', () => {
    const calls = [];
    const unsubscribe = window.onReducedMotionChange((reduced) => calls.push(reduced));
    setReduced(true);
    setReduced(false);
    setReduced(true);
    unsubscribe();
    expect(calls).toEqual([true, false, true]);
  });

  it('tolerates a throwing subscriber without breaking the rest', () => {
    const good = vi.fn();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const unsubBad = window.onReducedMotionChange(bad);
    const unsubGood = window.onReducedMotionChange(good);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      setReduced(true);
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
    } finally {
      unsubBad();
      unsubGood();
      errSpy.mockRestore();
    }
  });
});

describe('motto fade respects reduced motion', () => {
  beforeEach(() => {
    const el = document.getElementById('motto-text');
    if (el) {
      el.textContent = '';
      el.style.transition = '';
      el.style.opacity = '';
    }
    // setupRefreshMotto attaches its click handler to #refresh-motto-btn;
    // the global test stubs don't include it, so add a fresh one each test.
    if (!document.getElementById('refresh-motto-btn')) {
      const btn = document.createElement('button');
      btn.id = 'refresh-motto-btn';
      document.body.appendChild(btn);
    }
  });

  it('skips the 50ms fade timer when reduced motion is on', () => {
    setReduced(true);
    vi.useFakeTimers();
    displayDailyMotto();
    const mottoText = document.getElementById('motto-text');
    expect(mottoText.textContent.length).toBeGreaterThan(0);
    expect(mottoText.style.opacity).toBe('1');
    expect(mottoText.style.transition).toBe('none');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules the fade timer when reduced motion is off', () => {
    setReduced(false);
    vi.useFakeTimers();
    displayDailyMotto();
    const mottoText = document.getElementById('motto-text');
    expect(mottoText.textContent.length).toBeGreaterThan(0);
    expect(mottoText.style.opacity).toBe('0');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.advanceTimersByTime(60);
    expect(mottoText.style.opacity).toBe('1');
  });

  it('refresh button is instant under reduced motion', () => {
    setReduced(true);
    setupRefreshMotto();
    const btn = document.getElementById('refresh-motto-btn');
    const mottoText = document.getElementById('motto-text');
    const before = mottoText.textContent;
    vi.useFakeTimers();
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(mottoText.textContent).not.toBe(before);
    expect(mottoText.style.opacity).toBe('1');
    expect(mottoText.style.transition).toBe('none');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renderTodos asks the helper before applying a FLIP transform', async () => {
    setReduced(true);
    initTodo();
    addTodo('FLIP A');
    addTodo('FLIP B');
    addTodo('FLIP C');

    const list = document.getElementById('todo-list');
    // Force different positions on each render so the FLIP branch runs.
    const items = () => Array.from(list.querySelectorAll('.todo-item'));
    let n = 0;
    const install = () => {
      items().forEach((el, i) => {
        Object.defineProperty(el, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ top: (n + i) * 25, left: 0, width: 100, height: 25, right: 100, bottom: (n + i) * 25 + 25 })
        });
      });
    };
    install();
    renderTodos();
    await new Promise((r) => requestAnimationFrame(() => r()));
    n += 1;
    install();
    renderTodos();
    // Wait for the inner requestAnimationFrame to fire.
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => requestAnimationFrame(() => r()));

    // Under reduced motion the items must end up without a translate delta
    // and without a transform transition.
    const remaining = items();
    expect(remaining.length).toBeGreaterThan(0);
    remaining.forEach((el) => {
      const t = el.style.transform || '';
      expect(t === '' || t === 'translate(0px, 0px)').toBe(true);
    });
  });
});

describe('todo date highlight respects reduced motion', () => {
  it('skips the in-place highlight when reduced motion is on (toast still fires)', () => {
    setReduced(true);
    const el = document.createElement('div');
    el.className = 'todo-due-date clickable';
    el.innerHTML = '<span class="due-date-text">No date</span>';
    document.body.appendChild(el);
    const showToastRef = globalThis.showToast;
    globalThis.showToast = () => {};
    try {
      window.showDateUpdateFeedback(el, null, '2026-06-05');
      // No backgroundColor, no transform, no transition under reduced motion.
      // The 150ms clearing flash the previous version scheduled would have
      // left backgroundColor set then cleared it; here nothing is set at all.
      expect(el.style.backgroundColor).toBe('');
      expect(el.style.transform).toBe('');
      expect(el.style.transition).toBe('');
    } finally {
      globalThis.showToast = showToastRef;
      el.remove();
    }
  });

  it('applies the transform + transition when reduced motion is off', () => {
    setReduced(false);
    const el = document.createElement('div');
    el.className = 'todo-due-date clickable';
    el.innerHTML = '<span class="due-date-text">No date</span>';
    document.body.appendChild(el);
    const showToastRef = globalThis.showToast;
    globalThis.showToast = () => {};
    try {
      window.showDateUpdateFeedback(el, null, '2026-06-05');
      expect(el.style.transition).toContain('transform 0.2s ease');
      expect(el.style.transform).toBe('scale(1.05)');
    } finally {
      globalThis.showToast = showToastRef;
      el.remove();
    }
  });
});

describe('background video autoplay respects reduced motion', () => {
  let origCanPlayType;

  beforeEach(() => {
    origCanPlayType = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = () => 'probably';

    localStorage.setItem('homepageBg', 'Mountain View');
    window._backgrounds = [
      { id: 'Mountain View', type: 'video', thumb: 'thumb.jpg', url: 'video.mp4' }
    ];
    window._interactiveBackground = { stop: vi.fn() };
    delete window._customBackgrounds;

    const videoEl = document.getElementById('bg-video');
    if (!videoEl.querySelector('source')) {
      const source = document.createElement('source');
      source.setAttribute('src', '');
      source.setAttribute('type', 'video/mp4');
      videoEl.appendChild(source);
    }
  });

  afterEach(() => {
    if (origCanPlayType) {
      HTMLVideoElement.prototype.canPlayType = origCanPlayType;
      origCanPlayType = null;
    }
    const videoEl = document.getElementById('bg-video');
    delete videoEl.readyState;
    delete videoEl.currentSrc;
    delete videoEl.dataset.crossfadeTriggered;
    delete videoEl.dataset.simpleModePaused;
    delete videoEl.dataset.reducedMotionPaused;
    videoEl.classList.remove('active', 'ready', 'loading');
    document.body.querySelectorAll('#video-autoplay-setting').forEach((el) => el.remove());
  });

  it('does not call play() on the video when reduced motion is on', () => {
    setReduced(true);
    const videoEl = document.getElementById('bg-video');
    Object.defineProperty(videoEl, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(videoEl, 'currentSrc', { value: 'test.mp4', configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;

    const autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.id = 'video-autoplay-setting';
    autoCheckbox.checked = true;
    document.body.appendChild(autoCheckbox);

    autoCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(videoEl.dataset.crossfadeTriggered).toBe('true');
    expect(videoEl.classList.contains('active')).toBe(true);
    expect(videoEl.classList.contains('ready')).toBe(true);
    expect(playSpy).not.toHaveBeenCalled();
    expect(videoEl.dataset.reducedMotionPaused).toBe('true');
  });

  it('calls play() normally when reduced motion is off', () => {
    setReduced(false);
    const videoEl = document.getElementById('bg-video');
    Object.defineProperty(videoEl, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(videoEl, 'currentSrc', { value: 'test.mp4', configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;

    const autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.id = 'video-autoplay-setting';
    autoCheckbox.checked = true;
    document.body.appendChild(autoCheckbox);

    autoCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(videoEl.dataset.crossfadeTriggered).toBe('true');
    expect(videoEl.classList.contains('active')).toBe(true);
    expect(playSpy).toHaveBeenCalled();
  });

  it('clears reducedMotionPaused via the motion subscriber when the user toggles motion back to normal (bug regression)', () => {
    // The original bug: when motion flips from reduced → normal, the flag was
    // never cleared, so the visibility-resume handler in settings.js blocked
    // the next play() call. The motion subscriber in settings.js must clear
    // the flag as part of the toggle (no extra change-event dispatch).
    setReduced(true);
    const videoEl = document.getElementById('bg-video');
    Object.defineProperty(videoEl, 'readyState', { value: 3, configurable: true });
    Object.defineProperty(videoEl, 'currentSrc', { value: 'test.mp4', configurable: true });
    videoEl.classList.add('active');

    const autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.id = 'video-autoplay-setting';
    autoCheckbox.checked = true;
    document.body.appendChild(autoCheckbox);
    autoCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(videoEl.dataset.reducedMotionPaused).toBe('true');

    // Now flip motion back. The subscriber alone (not the change handler)
    // should clear the flag and replay.
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;
    setReduced(false);

    expect(videoEl.dataset.reducedMotionPaused).toBeUndefined();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});

describe('custom-backgrounds.js respects dynamic reduced motion changes', () => {
  beforeEach(() => {
    // Re-injecting the module re-registers its motion-change handler in the
    // shared subscribers Set. Clear first to avoid duplicate handlers from
    // piling up across tests.
    window._resetSubscribersForTests();
    // The earlier describe deletes window._customBackgrounds in its own
    // beforeEach, so re-inject the module and re-register the public API.
    injectScript('src/data/custom-backgrounds.js');
    // Mark the active background as a custom one so the
    // syncCustomVideoToMotionPreference subscriber actually runs (it guards
    // on isCustomBackground()).
    localStorage.setItem('homepageBg', 'custom_video_xyz');
  });

  afterEach(() => {
    // Restore document.hidden if a test overrode it, so subsequent
    // describes observe the real jsdom value.
    delete document.hidden;
  });

  it('subscribes to motion changes and pauses an active custom video background', () => {
    const videoEl = document.getElementById('bg-video');
    videoEl.classList.add('active');
    Object.defineProperty(videoEl, 'currentSrc', { value: 'custom.mp4', configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    const pauseSpy = vi.fn();
    videoEl.play = playSpy;
    videoEl.pause = pauseSpy;
    Object.defineProperty(videoEl, 'paused', { value: false, configurable: true });

    setReduced(true);

    expect(videoEl.dataset.reducedMotionPaused).toBe('true');
    expect(pauseSpy).toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();

    // Restore for cleanup
    delete videoEl.dataset.reducedMotionPaused;
    videoEl.classList.remove('active');
    delete videoEl.currentSrc;
  });

  it('clears the flag and replays the video when motion goes back to normal', () => {
    setReduced(true);
    const videoEl = document.getElementById('bg-video');
    videoEl.classList.add('active');
    videoEl.dataset.reducedMotionPaused = 'true';
    Object.defineProperty(videoEl, 'currentSrc', { value: 'custom.mp4', configurable: true });
    Object.defineProperty(videoEl, 'readyState', { value: 3, configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    // Autoplay is enabled by default in the test harness
    setReduced(false);

    expect(videoEl.dataset.reducedMotionPaused).toBeUndefined();
    expect(playSpy).toHaveBeenCalled();

    // Cleanup
    videoEl.classList.remove('active');
    delete videoEl.currentSrc;
    delete videoEl.readyState;
  });
});

describe('video visibility-resume respects reduced motion', () => {
  // Regression test: when the tab is hidden while a video background is
  // playing, settings.js records `wasPlaying = 'true'` and pauses the video.
  // If the user flips reduced motion on while the tab is hidden, the motion
  // subscriber sets `reducedMotionPaused = 'true'`. The visibility-resume
  // path in `initVideoVisibilityHandler` must NOT replay the video when the
  // tab becomes visible, or the reduced-motion preference is silently
  // ignored on tab return.

  afterEach(() => {
    delete document.hidden;
    const videoEl = document.getElementById('bg-video');
    delete videoEl.dataset.wasPlaying;
    delete videoEl.dataset.simpleModePaused;
    delete videoEl.dataset.reducedMotionPaused;
    delete videoEl.currentSrc;
  });

  it('does not replay the video on visibilitychange when reducedMotionPaused is set', () => {
    const videoEl = document.getElementById('bg-video');
    videoEl.dataset.wasPlaying = 'true';
    videoEl.dataset.reducedMotionPaused = 'true';
    Object.defineProperty(videoEl, 'paused', { value: true, configurable: true });
    Object.defineProperty(videoEl, 'currentSrc', { value: 'test.mp4', configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(playSpy).not.toHaveBeenCalled();
    // The handler should drop wasPlaying because the resume was skipped.
    expect(videoEl.dataset.wasPlaying).toBeUndefined();
  });

  it('does not replay the video on visibilitychange when simpleModePaused is set', () => {
    const videoEl = document.getElementById('bg-video');
    videoEl.dataset.wasPlaying = 'true';
    videoEl.dataset.simpleModePaused = 'true';
    Object.defineProperty(videoEl, 'paused', { value: true, configurable: true });
    Object.defineProperty(videoEl, 'currentSrc', { value: 'test.mp4', configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(playSpy).not.toHaveBeenCalled();
    expect(videoEl.dataset.wasPlaying).toBeUndefined();
  });

  it('replays the video on visibilitychange when no pause flag is set', () => {
    const videoEl = document.getElementById('bg-video');
    videoEl.dataset.wasPlaying = 'true';
    Object.defineProperty(videoEl, 'paused', { value: true, configurable: true });
    Object.defineProperty(videoEl, 'currentSrc', { value: 'test.mp4', configurable: true });
    const playSpy = vi.fn().mockReturnValue(Promise.resolve());
    videoEl.play = playSpy;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(videoEl.dataset.wasPlaying).toBe('false');
  });
});
