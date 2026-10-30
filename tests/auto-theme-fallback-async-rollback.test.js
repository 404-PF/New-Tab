import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

// #1081 fallback path: toast.js is deliberately not loaded here, so
// persistSetting uses the localStorage.setItem fallback and auto-theme.js
// must register its own storageBridgeWriteError resync — otherwise an async
// rejection (setItem already returned true) strands the toggle, time inputs,
// and scheduler on the rejected value.

const STORAGE_KEYS = ['autoTheme', 'autoThemeLightTime', 'autoThemeDarkTime', 'theme'];

const restorers = [];
let visibilityIntervals = [];

function failWriteFor(key, mode) {
  const restore = failStorageWritesFor(key, mode);
  restorers.push(restore);
  return restore;
}

beforeAll(() => {
  // DOM stubs the module binds its change handlers to; they must exist
  // before the script is injected because init() runs immediately.
  if (!document.getElementById('auto-theme-toggle')) {
    document.body.insertAdjacentHTML('beforeend', `
      <input id="auto-theme-toggle" type="checkbox"><input id="auto-theme-light-time">
      <input id="auto-theme-dark-time"><div id="auto-theme-times"></div>
      <label class="theme-option"></label>
      <input name="theme" value="light"><input name="theme" value="dark">
    `);
  }

  // Never actually tick; track construction/destruction so specs can assert
  // the scheduler does not diverge from the persisted enabled state.
  window.VisibilityInterval = class {
    constructor() {
      this.destroyed = false;
      visibilityIntervals.push(this);
    }

    destroy() {
      this.destroyed = true;
    }
  };

  // The whole point of this file: toast.js (and with it
  // window.persistFeatureToggle) must be absent.
  expect(typeof window.persistFeatureToggle).toBe('undefined');
  injectScript('src/features/auto-theme.js');
});

beforeEach(() => {
  visibilityIntervals = [];

  STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

  const toggle = document.getElementById('auto-theme-toggle');
  toggle.checked = false;
  document.getElementById('auto-theme-light-time').value = '';
  document.getElementById('auto-theme-dark-time').value = '';
  document.getElementById('auto-theme-times').style.display = '';
  document.querySelectorAll('.theme-option').forEach((label) => label.classList.remove('auto-active'));

  window.loadTheme = () => localStorage.getItem('theme');
  window.applyTheme = vi.fn();
});

afterEach(async () => {
  // Drain any storageBridgeWriteError resync timers this test scheduled so
  // they cannot fire against the next test's reset DOM/storage state.
  await flushDeferredFailureSync();
  await flushDeferredFailureSync();
  while (restorers.length > 0) {
    const restore = restorers.pop();
    restore();
  }
  delete window.applyTheme;
  delete window.loadTheme;
});

describe('auto-theme fallback async rollback without toast.js (#1081)', () => {
  it('reverts the toggle and stops the scheduler after an async rejected write', async () => {
    localStorage.setItem('autoTheme', 'false');
    failWriteFor('autoTheme', 'async');

    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    // The bridge accepts the write optimistically; nothing resyncs yet.
    expect(localStorage.getItem('autoTheme')).toBe('true');
    expect(toggle.checked).toBe(true);
    expect(visibilityIntervals).toHaveLength(1);

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('autoTheme')).toBe('false');
    expect(toggle.checked).toBe(false);
    expect(document.getElementById('auto-theme-times').style.display).toBe('none');
    expect(visibilityIntervals[0].destroyed).toBe(true);
  });

  it('reverts a time input after an async rejected write', async () => {
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '07:00');
    localStorage.setItem('autoThemeDarkTime', '19:00');
    window.refreshAutoTheme();

    failWriteFor('autoThemeLightTime', 'async');
    const lightInput = document.getElementById('auto-theme-light-time');
    lightInput.value = '23:00';
    lightInput.dispatchEvent(new Event('change'));

    // Accepted optimistically until the bridge callback reports the failure.
    expect(localStorage.getItem('autoThemeLightTime')).toBe('23:00');
    expect(lightInput.value).toBe('23:00');

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('autoThemeLightTime')).toBe('07:00');
    expect(lightInput.value).toBe('07:00');
  });

  it('leaves the controls alone when the write is accepted', async () => {
    localStorage.setItem('autoTheme', 'false');

    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('autoTheme')).toBe('true');
    expect(toggle.checked).toBe(true);
    expect(visibilityIntervals).toHaveLength(1);
    expect(visibilityIntervals[0].destroyed).toBe(false);
  });
});
