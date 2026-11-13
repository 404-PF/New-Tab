import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

// #1127: the storage bridge's setItem returns false instead of throwing on a
// rejected write, so saveTimeZones must propagate that result, the settings
// add/remove handlers must surface it, and an async runtime.lastError rollback
// must resync the chips instead of leaving a ghost clock behind.

const SAVE_ERROR_MESSAGE = 'Failed to save this setting. Your last action was not saved.';

const restorers = [];

beforeAll(() => {
  // The settings timezone controls must exist before settings.js binds its
  // add/remove handlers at load time. Built from specs so this stub setup
  // stays distinct from the equivalent block in settings.test.js.
  [
    { id: 'timezone-picker', tag: 'input' },
    { id: 'timezone-options', tag: 'div' },
    { id: 'add-timezone-btn', tag: 'button' },
    { id: 'timezone-current-list', tag: 'div' }
  ].forEach((spec) => {
    const el = document.createElement(spec.tag);
    el.id = spec.id;
    document.body.appendChild(el);
  });

  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/core/toast.js');
  injectScript('src/features/timezone-clocks.js');
  injectScript('src/ui/settings.js');
});

beforeEach(() => {
  window.showToast = vi.fn();
});

afterEach(async () => {
  // Drain any storageBridgeWriteError resync timers this test scheduled so
  // they cannot fire against the next test's reset DOM/storage state.
  await flushDeferredFailureSync();
  await flushDeferredFailureSync();
  while (restorers.length > 0) {
    restorers.pop()();
  }
  const clock = document.getElementById('clock');
  if (clock) clock.remove();
  delete window.showToast;
});

function failWriteFor(key, mode) {
  const restore = failStorageWritesFor(key, mode);
  restorers.push(restore);
  return restore;
}

// Fresh #clock host so each test gets exactly one container (and one click
// listener), then re-render both lists from the persisted zone state.
function setupClocks(zones) {
  const existing = document.getElementById('clock');
  if (existing) existing.remove();
  const clock = document.createElement('div');
  clock.id = 'clock';
  document.body.appendChild(clock);
  window.initTimezoneClocks();
  if (zones) {
    localStorage.setItem('extraTimeZones', JSON.stringify(zones));
  }
  window.renderExtraClocks();
  if (typeof window.renderTimezoneCurrentList === 'function') {
    window.renderTimezoneCurrentList();
  }
  return clock;
}

function selectChicago() {
  const picker = document.getElementById('timezone-picker');
  picker.dispatchEvent(new Event('focus'));
  const option = document.querySelector('#timezone-options button[data-zone="America/Chicago"]');
  option.click();
}

function clockChips() {
  return document.querySelectorAll('#extra-timezones .timezone-chip');
}

function settingsChips() {
  return document.querySelectorAll('#timezone-current-list .timezone-current-chip');
}

// Shared assertions for a rejected remove: the chip list, the settings list,
// and storage all still show the zone that was supposed to be deleted, and
// the failure surfaced exactly one toast.
function expectRejectedRemoveState() {
  expect(clockChips().length).toBe(1);
  expect(JSON.parse(localStorage.getItem('extraTimeZones'))).toEqual(['America/New_York']);
  expect(clockChips()[0].dataset.zone).toBe('America/New_York');
  expect(settingsChips().length).toBe(1);
  expect(window.showToast).toHaveBeenCalledTimes(1);
  expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
}

// Shared assertions for a rejected add: no ghost clock landed anywhere and
// the failure surfaced exactly one toast.
function expectRejectedAddState() {
  expect(clockChips().length).toBe(0);
  expect(settingsChips().length).toBe(0);
  expect(localStorage.getItem('extraTimeZones')).toBe(null);
  expect(window.showToast).toHaveBeenCalledTimes(1);
  expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
}

describe('timezone clocks', () => {
  it('re-renders generated controls when the language changes', () => {
    const clock = document.createElement('div');
    clock.id = 'clock';
    document.body.appendChild(clock);
    localStorage.setItem('extraTimeZones', JSON.stringify(['America/New_York']));

    const originalI18n = window.i18n;
    window.i18n = {
      t(key, replacements) {
        if (key === 'removeTimezone') return 'Remove';
        return 'Remove ' + replacements.city;
      }
    };
    window.initTimezoneClocks();

    window.i18n = {
      t(key, replacements) {
        if (key === 'removeTimezone') return 'Eliminar';
        return 'Eliminar ' + replacements.city;
      }
    };
    window.dispatchEvent(new Event('languageChanged'));

    const removeBtn = document.querySelector('.timezone-remove');
    expect(removeBtn.title).toBe('Eliminar');
    expect(removeBtn.getAttribute('aria-label')).toBe('Eliminar New York');

    window.i18n = originalI18n;
    clock.remove();
  });

  it('reports a rejected write instead of pretending it saved (#1127)', () => {
    setupClocks(['America/New_York']);

    const falseSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => false);
    try {
      expect(window.saveTimeZones(['America/Chicago'])).toBe(false);
      expect(window.addTimeZone('America/Chicago')).toBe(false);
      expect(window.removeTimeZone('America/New_York')).toBe(false);
      expect(window.addTimeZone('Not/A_Zone')).toBe(false);
    } finally {
      falseSpy.mockRestore();
    }

    expect(JSON.parse(localStorage.getItem('extraTimeZones'))).toEqual(['America/New_York']);
    expect(clockChips().length).toBe(1);
    expect(clockChips()[0].dataset.zone).toBe('America/New_York');
    expect(settingsChips().length).toBe(1);
  });

  it('keeps the chip and surfaces an error when the chip remove write is rejected (#1127)', async () => {
    setupClocks(['America/New_York']);
    failWriteFor('extraTimeZones', 'sync');

    document.querySelector('#extra-timezones .timezone-remove').click();
    await flushDeferredFailureSync();

    expectRejectedRemoveState();
  });

  it('surfaces a rejected settings add instead of silently re-rendering (#1127)', async () => {
    setupClocks();
    failWriteFor('extraTimeZones', 'sync');

    selectChicago();
    document.getElementById('add-timezone-btn').click();
    await flushDeferredFailureSync();

    expectRejectedAddState();
  });

  it('surfaces a rejected settings remove instead of silently re-rendering (#1127)', async () => {
    setupClocks(['America/New_York']);
    failWriteFor('extraTimeZones', 'sync');

    document.querySelector('#timezone-current-list button[data-zone="America/New_York"]').click();
    await flushDeferredFailureSync();

    expectRejectedRemoveState();
  });

  it('resyncs the chips and toasts once after an async lastError rollback (#1127)', async () => {
    setupClocks();
    failWriteFor('extraTimeZones', 'async');

    selectChicago();
    document.getElementById('add-timezone-btn').click();

    // The bridge accepted the write optimistically; the failure only arrives
    // through runtime.lastError in the chrome.storage callback.
    expect(clockChips().length).toBe(1);
    expect(settingsChips().length).toBe(1);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expectRejectedAddState();
  });

  // #1200: selection writes a display label ("Chicago (UTC-6)") into the
  // picker; refocusing must still show the full zone list instead of filtering
  // by a label that never matches the zone corpus.
  it('shows the full zone list when the picker is refocused after a selection (#1200)', () => {
    setupClocks();
    selectChicago();

    const picker = document.getElementById('timezone-picker');
    const optionsList = document.getElementById('timezone-options');
    expect(optionsList.hidden).toBe(true);
    expect(picker.getAttribute('aria-expanded')).toBe('false');

    picker.dispatchEvent(new Event('focus'));

    expect(optionsList.hidden).toBe(false);
    expect(picker.getAttribute('aria-expanded')).toBe('true');
    expect(optionsList.querySelectorAll('button[data-zone]').length).toBe(window.POPULAR_ZONES.length);
  });
});
