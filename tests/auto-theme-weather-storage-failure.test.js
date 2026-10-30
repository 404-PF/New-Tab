import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

// #1081: the storage bridge's setItem returns false on a rejected write, so
// the auto-theme scheduler and the weather widget must check the result,
// snap their controls back to the persisted state, and surface the shared
// save-error toast — the same contract the #969 helpers established for the
// keyboard and settings toggles.

const SAVE_ERROR_MESSAGE = 'Failed to save this setting. Your last action was not saved.';

const STORAGE_KEYS = [
  'autoTheme',
  'autoThemeLightTime',
  'autoThemeDarkTime',
  'theme',
  'weatherEnabled',
  'weatherUnit',
  'weatherLocationMode',
  'weatherManualCity',
  'weatherCache'
];

const restorers = [];
const visibilityIntervals = [];
let originalGeolocation;
let originalFetch;

function failWriteFor(key, mode) {
  const restore = failStorageWritesFor(key, mode);
  restorers.push(restore);
  return restore;
}

beforeAll(() => {
  // DOM stubs the modules bind their change handlers to; they must exist
  // before the feature scripts are injected.
  if (!document.getElementById('auto-theme-toggle')) {
    document.body.insertAdjacentHTML('beforeend', `
      <input id="auto-theme-toggle" type="checkbox"><input id="auto-theme-light-time">
      <input id="auto-theme-dark-time"><div id="auto-theme-times"></div>
      <label class="theme-option"></label>
      <input name="theme" value="light"><input name="theme" value="dark">
    `);
  }
  if (!document.querySelector('[data-weather-choice="unit"]')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div data-weather-choice="unit">
        <button type="button" class="weather-choice-button active" data-value="celsius" aria-pressed="true"></button>
        <button type="button" class="weather-choice-button" data-value="fahrenheit" aria-pressed="false"></button>
      </div>
      <div data-weather-choice="mode">
        <button type="button" class="weather-choice-button active" data-value="auto" aria-pressed="true"></button>
        <button type="button" class="weather-choice-button" data-value="manual" aria-pressed="false"></button>
      </div>
    `);
  }

  // renderError escapes through window.escapeHtml (utils.js) when a refresh
  // settles during the optimistic-enable window of an async-failure test.
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
  injectScript('src/features/weather-utils.js');
  injectScript('src/features/weather.js');
  injectScript('src/features/auto-theme.js');

  // Never actually tick; track construction/destruction so specs can assert
  // the scheduler does not diverge from the persisted enabled state. Set
  // after injection because utils.js also assigns window.VisibilityInterval.
  window.VisibilityInterval = class {
    constructor() {
      this.destroyed = false;
      visibilityIntervals.push(this);
    }

    destroy() {
      this.destroyed = true;
    }
  };
});

beforeEach(() => {
  originalGeolocation = navigator.geolocation;
  originalFetch = global.fetch;

  STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  visibilityIntervals.length = 0;

  const toggle = document.getElementById('auto-theme-toggle');
  toggle.checked = false;
  document.getElementById('auto-theme-light-time').value = '';
  document.getElementById('auto-theme-dark-time').value = '';
  document.getElementById('auto-theme-times').style.display = '';
  document.querySelectorAll('.theme-option').forEach((label) => label.classList.remove('auto-active'));

  document.querySelectorAll('[data-weather-choice="unit"] .weather-choice-button').forEach((btn) => {
    const isCelsius = btn.dataset.value === 'celsius';
    btn.classList.toggle('active', isCelsius);
    btn.setAttribute('aria-pressed', isCelsius ? 'true' : 'false');
  });
  document.querySelectorAll('[data-weather-choice="mode"] .weather-choice-button').forEach((btn) => {
    const isAuto = btn.dataset.value === 'auto';
    btn.classList.toggle('active', isAuto);
    btn.setAttribute('aria-pressed', isAuto ? 'true' : 'false');
  });
  const enabledCheckbox = document.getElementById('weather-enabled-setting');
  enabledCheckbox.checked = false;
  document.getElementById('weather-manual-city').value = '';
  document.getElementById('weather-manual-group').style.display = '';
  const widget = document.getElementById('weather-widget');
  if (widget) {
    widget.style.display = 'none';
    widget.innerHTML = '';
  }

  // Keep async weather refreshes off the network: geolocation fails fast and
  // fetch never resolves into a real response.
  navigator.geolocation = {
    getCurrentPosition: (_success, failure) => {
      failure(new Error('Geolocation failed'));
    }
  };
  global.fetch = vi.fn(() => Promise.reject(new Error('network disabled in tests')));

  window.loadTheme = () => localStorage.getItem('theme');
  window.applyTheme = vi.fn();
  window.showToast = vi.fn();
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
  if (originalGeolocation !== undefined) {
    navigator.geolocation = originalGeolocation;
  } else {
    delete navigator.geolocation;
  }
  global.fetch = originalFetch;
  originalGeolocation = undefined;
  originalFetch = undefined;
  delete window.showToast;
  delete window.applyTheme;
  delete window.loadTheme;
});

describe('auto-theme scheduler reports rejected writes (#1081)', () => {
  it('enable with a sync-rejected write snaps the toggle back, skips the scheduler, and toasts', () => {
    localStorage.setItem('autoTheme', 'false');
    failWriteFor('autoTheme');

    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('autoTheme')).toBe('false');
    expect(toggle.checked).toBe(false);
    expect(document.getElementById('auto-theme-times').style.display).toBe('none');
    expect(visibilityIntervals).toHaveLength(0);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('enable persists an accepted write without toasting', () => {
    localStorage.setItem('autoTheme', 'false');

    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('autoTheme')).toBe('true');
    expect(toggle.checked).toBe(true);
    expect(visibilityIntervals).toHaveLength(1);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('disable with a sync-rejected write keeps the stored state and interval and toasts', () => {
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '07:00');
    localStorage.setItem('autoThemeDarkTime', '19:00');
    window.refreshAutoTheme();
    const interval = visibilityIntervals[0];
    expect(interval).toBeDefined();

    failWriteFor('autoTheme');
    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('autoTheme')).toBe('true');
    expect(toggle.checked).toBe(true);
    expect(document.getElementById('auto-theme-times').style.display).toBe('block');
    expect(interval.destroyed).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('a rejected light-time write snaps the input back to the stored schedule and toasts', () => {
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '07:00');
    localStorage.setItem('autoThemeDarkTime', '19:00');
    window.refreshAutoTheme();

    failWriteFor('autoThemeLightTime');
    const lightInput = document.getElementById('auto-theme-light-time');
    lightInput.value = '23:00';
    lightInput.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('autoThemeLightTime')).toBe('07:00');
    expect(lightInput.value).toBe('07:00');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('a rejected dark-time write snaps the input back to the stored schedule and toasts', () => {
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '07:00');
    localStorage.setItem('autoThemeDarkTime', '19:00');
    window.refreshAutoTheme();

    failWriteFor('autoThemeDarkTime');
    const darkInput = document.getElementById('auto-theme-dark-time');
    darkInput.value = '03:00';
    darkInput.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('autoThemeDarkTime')).toBe('19:00');
    expect(darkInput.value).toBe('19:00');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('enable resyncs and toasts once after an async lastError rollback', async () => {
    localStorage.setItem('autoTheme', 'false');
    failWriteFor('autoTheme', 'async');

    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    // The bridge accepted the write optimistically; the failure only arrives
    // through runtime.lastError in the chrome.storage callback.
    expect(localStorage.getItem('autoTheme')).toBe('true');
    expect(toggle.checked).toBe(true);
    expect(visibilityIntervals).toHaveLength(1);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('autoTheme')).toBe('false');
    expect(toggle.checked).toBe(false);
    expect(document.getElementById('auto-theme-times').style.display).toBe('none');
    expect(visibilityIntervals[0].destroyed).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('a light-time change resyncs the input and toasts once after an async lastError rollback', async () => {
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '07:00');
    localStorage.setItem('autoThemeDarkTime', '19:00');
    window.refreshAutoTheme();
    failWriteFor('autoThemeLightTime', 'async');

    const lightInput = document.getElementById('auto-theme-light-time');
    lightInput.value = '23:00';
    lightInput.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('autoThemeLightTime')).toBe('23:00');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('autoThemeLightTime')).toBe('07:00');
    expect(lightInput.value).toBe('07:00');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});

describe('weather settings report rejected writes (#1081)', () => {
  it('enable with a sync-rejected write keeps storage off, hides the widget, and toasts', () => {
    localStorage.setItem('weatherEnabled', 'false');
    failWriteFor('weatherEnabled');

    const checkbox = document.getElementById('weather-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('weatherEnabled')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(document.getElementById('weather-widget').style.display).toBe('none');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('enable persists an accepted write without toasting', () => {
    localStorage.setItem('weatherEnabled', 'false');

    const checkbox = document.getElementById('weather-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('weatherEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('a rejected unit save restores the active button and toasts', () => {
    localStorage.setItem('weatherEnabled', 'false');
    localStorage.setItem('weatherUnit', 'celsius');
    failWriteFor('weatherUnit');

    document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="fahrenheit"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(localStorage.getItem('weatherUnit')).toBe('celsius');
    const celsiusBtn = document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="celsius"]');
    const fahrenheitBtn = document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="fahrenheit"]');
    expect(celsiusBtn.classList.contains('active')).toBe(true);
    expect(fahrenheitBtn.classList.contains('active')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('a rejected location-mode save restores the active button and toasts', () => {
    localStorage.setItem('weatherEnabled', 'false');
    localStorage.setItem('weatherLocationMode', 'auto');
    failWriteFor('weatherLocationMode');

    document.querySelector('[data-weather-choice="mode"] .weather-choice-button[data-value="manual"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(localStorage.getItem('weatherLocationMode')).toBe('auto');
    const autoBtn = document.querySelector('[data-weather-choice="mode"] .weather-choice-button[data-value="auto"]');
    const manualBtn = document.querySelector('[data-weather-choice="mode"] .weather-choice-button[data-value="manual"]');
    expect(autoBtn.classList.contains('active')).toBe(true);
    expect(manualBtn.classList.contains('active')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('a rejected manual-city save restores the input and toasts', () => {
    localStorage.setItem('weatherEnabled', 'false');
    localStorage.setItem('weatherManualCity', 'Paris');
    failWriteFor('weatherManualCity');

    const input = document.getElementById('weather-manual-city');
    input.value = 'London';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(localStorage.getItem('weatherManualCity')).toBe('Paris');
    expect(input.value).toBe('Paris');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('enable resyncs the checkbox and toasts once after an async lastError rollback', async () => {
    localStorage.setItem('weatherEnabled', 'false');
    failWriteFor('weatherEnabled', 'async');

    const checkbox = document.getElementById('weather-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    // The bridge accepted the write optimistically; the failure only arrives
    // through runtime.lastError in the chrome.storage callback.
    expect(localStorage.getItem('weatherEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('weatherEnabled')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(document.getElementById('weather-widget').style.display).toBe('none');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('a unit change resyncs the buttons and toasts once after an async lastError rollback', async () => {
    localStorage.setItem('weatherEnabled', 'false');
    localStorage.setItem('weatherUnit', 'celsius');
    failWriteFor('weatherUnit', 'async');

    document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="fahrenheit"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(localStorage.getItem('weatherUnit')).toBe('fahrenheit');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('weatherUnit')).toBe('celsius');
    const celsiusBtn = document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="celsius"]');
    const fahrenheitBtn = document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="fahrenheit"]');
    expect(celsiusBtn.classList.contains('active')).toBe(true);
    expect(fahrenheitBtn.classList.contains('active')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('async weather rollback forces a refresh from the persisted settings', async () => {
    localStorage.setItem('weatherEnabled', 'false');
    localStorage.setItem('weatherUnit', 'celsius');
    failWriteFor('weatherUnit', 'async');

    const refreshSpy = vi.spyOn(window.WeatherWidget, 'refresh')
      .mockImplementation(() => Promise.resolve(undefined));

    try {
      document.querySelector('[data-weather-choice="unit"] .weather-choice-button[data-value="fahrenheit"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      // Re-applying the controls is not enough: a refresh started with the
      // rejected setting can still render stale weather after the rollback,
      // so the resync must also force a refresh from persisted settings.
      expect(refreshSpy).toHaveBeenCalledWith(true);
    } finally {
      refreshSpy.mockRestore();
    }
  });

  it('a manual-city change resyncs the input and toasts once after an async lastError rollback', async () => {
    // Weather must be enabled so the Enter handler's refresh runs:
    // runRefreshWeather re-reads the in-flight input, and persisting the
    // same city a second time would let two rejections roll back to the
    // first optimistic value, retaining the rejected city unreported.
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherLocationMode', 'manual');
    localStorage.setItem('weatherManualCity', 'Paris');
    failWriteFor('weatherManualCity', 'async');

    const input = document.getElementById('weather-manual-city');
    input.value = 'London';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Accepted optimistically; the refresh re-reads the input but must not
    // write the same city a second time.
    expect(localStorage.getItem('weatherManualCity')).toBe('London');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('weatherManualCity')).toBe('Paris');
    expect(input.value).toBe('Paris');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});
