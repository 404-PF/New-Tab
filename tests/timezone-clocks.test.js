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
  it('accepts any zone the runtime validates, keeping the cap and rejections (#1199)', () => {
    setupClocks();

    expect(window.isValidZoneId('America/Bogota')).toBe(true);
    expect(window.isValidZoneId('Europe/Kyiv')).toBe(true);
    expect(window.isValidZoneId('Not/A_Zone')).toBe(false);
    expect(window.isValidZoneId('')).toBe(false);
    // Intl resolves these case-insensitively / as offsets, but they must not
    // be storable next to the canonical spelling as duplicate clocks.
    expect(window.isValidZoneId('america/new_york')).toBe(false);
    expect(window.isValidZoneId('+05:30')).toBe(false);

    expect(window.addTimeZone('America/Bogota')).toBe(true);
    expect(window.addTimeZone('Europe/Kyiv')).toBe(true);
    expect(window.addTimeZone('Asia/Kathmandu')).toBe(true);
    expect(window.addTimeZone('Pacific/Fiji')).toBe(true);

    // Rejected while the list is still under the cap, so these fail on the
    // duplicate/invalid checks themselves rather than on the cap.
    expect(window.addTimeZone('America/Bogota')).toBe(false);
    expect(window.addTimeZone('Not/A_Zone')).toBe(false);
    expect(window.addTimeZone('america/new_york')).toBe(false);

    expect(window.addTimeZone('Australia/Sydney')).toBe(true);
    // A sixth otherwise-valid zone is rejected only because the cap is full.
    expect(window.addTimeZone('America/Chicago')).toBe(false);

    expect(window.loadTimeZones()).toEqual([
      'America/Bogota',
      'Europe/Kyiv',
      'Asia/Kathmandu',
      'Pacific/Fiji',
      'Australia/Sydney'
    ]);
    expect(clockChips().length).toBe(5);
    expect(clockChips()[1].querySelector('.timezone-city').textContent).toBe('Kyiv');
    expect(clockChips()[3].querySelector('.timezone-city').textContent).toBe('Fiji');
  });

  it('loads previously saved zones outside the shortlist unchanged (#1199)', () => {
    localStorage.setItem('extraTimeZones', JSON.stringify(['America/Bogota', 'Asia/Kathmandu']));
    setupClocks();

    expect(window.loadTimeZones()).toEqual(['America/Bogota', 'Asia/Kathmandu']);
    expect(clockChips().length).toBe(2);
    expect(clockChips()[0].querySelector('.timezone-city').textContent).toBe('Bogota');
    expect(clockChips()[1].querySelector('.timezone-city').textContent).toBe('Kathmandu');
  });

  it('builds picker options from Intl beyond the curated shortlist (#1199)', () => {
    const options = window.getTimeZoneOptions();
    const shortlist = window.POPULAR_ZONES;

    expect(options.length).toBeGreaterThan(shortlist.length);
    expect(options.slice(0, shortlist.length).map(zone => zone.id))
      .toEqual(shortlist.map(zone => zone.id));
    expect(options.map(zone => zone.id)).toContain('America/Bogota');
    // Intl.supportedValuesOf omits UTC on this runtime; the picker must
    // still offer it (#1199).
    expect(options.map(zone => zone.id)).toContain('UTC');
    expect(options.every(zone => typeof zone.id === 'string'
      && typeof zone.city === 'string' && zone.city.length > 0)).toBe(true);
  });

  it('searches the full zone list in the settings picker and caps the idle list (#1199)', () => {
    setupClocks();
    const picker = document.getElementById('timezone-picker');

    picker.value = 'bogota';
    picker.dispatchEvent(new Event('input'));
    const option = document.querySelector('#timezone-options button[data-zone="America/Bogota"]');
    expect(option).not.toBeNull();
    expect(option.textContent).toContain('Bogota');
    // One match fits the cap, so no truncation hint is shown.
    expect(document.querySelector('#timezone-options .timezone-options-more')).toBeNull();

    option.click();
    document.getElementById('add-timezone-btn').click();
    expect(window.showToast).not.toHaveBeenCalled();
    expect(clockChips().length).toBe(1);
    expect(clockChips()[0].dataset.zone).toBe('America/Bogota');
    expect(JSON.parse(localStorage.getItem('extraTimeZones'))).toEqual(['America/Bogota']);

    picker.value = '';
    picker.dispatchEvent(new Event('focus'));
    const idleOptions = document.querySelectorAll('#timezone-options button');
    expect(idleOptions.length).toBeGreaterThan(0);
    expect(idleOptions.length).toBeLessThanOrEqual(40);
    expect(document.querySelector('#timezone-options button[data-zone="America/Chicago"]')).not.toBeNull();
    // The idle list is capped below the full set, so the hint says how many
    // zones are hidden instead of letting the list look complete (#1199).
    const hint = document.querySelector('#timezone-options .timezone-options-more');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe(window.i18n.t('timezoneMoreResults', {
      shown: idleOptions.length,
      total: window.getTimeZoneOptions().length
    }));
  });

  it('adds a typed zone id that the picker list omits (#1199)', () => {
    setupClocks();
    const picker = document.getElementById('timezone-picker');
    const addBtn = document.getElementById('add-timezone-btn');

    // Etc/GMT+8 is accepted by Intl but missing from
    // Intl.supportedValuesOf, so it never appears as an option; typing it
    // must still enable Add.
    picker.value = 'Etc/GMT+8';
    picker.dispatchEvent(new Event('input'));
    expect(addBtn.disabled).toBe(false);
    addBtn.click();
    expect(window.showToast).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('extraTimeZones'))).toEqual(['Etc/GMT+8']);
    expect(clockChips().length).toBe(1);
    expect(clockChips()[0].dataset.zone).toBe('Etc/GMT+8');

    // Non-canonical spellings and plain prose never enable Add.
    picker.value = 'america/new_york';
    picker.dispatchEvent(new Event('input'));
    expect(addBtn.disabled).toBe(true);

    picker.value = 'not a zone';
    picker.dispatchEvent(new Event('input'));
    expect(addBtn.disabled).toBe(true);
  });

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
    // #1199 caps the idle list at 40, so "full" now means the whole corpus
    // up to that cap rather than exactly the curated shortlist.
    expect(optionsList.querySelectorAll('button[data-zone]').length)
      .toBe(Math.min(window.getTimeZoneOptions().length, 40));
    expect(optionsList.querySelector('button[data-zone="America/Chicago"]')).not.toBeNull();
  });

  // #1200 follow-up: refocus must select the display label so the first
  // keystroke replaces it instead of appending to it (which would filter
  // against a label that never matches and empty the dropdown).
  it('selects the display label on focus so the first keystroke replaces it (#1200)', () => {
    setupClocks();
    selectChicago();

    const picker = document.getElementById('timezone-picker');
    const optionsList = document.getElementById('timezone-options');
    expect(picker.value).toContain('Chicago');

    picker.dispatchEvent(new Event('focus'));

    expect(picker.selectionStart).toBe(0);
    expect(picker.selectionEnd).toBe(picker.value.length);

    picker.value = 'L';
    picker.dispatchEvent(new Event('input'));

    expect(optionsList.hidden).toBe(false);
    expect(optionsList.querySelectorAll('button[data-zone]').length).toBeGreaterThan(0);
    // The keystroke filters on "L" alone: London matches, Chicago (the
    // selected label's zone) does not — proving the label was replaced.
    expect(optionsList.querySelector('button[data-zone="Europe/London"]')).not.toBeNull();
    expect(optionsList.querySelector('button[data-zone="America/Chicago"]')).toBeNull();
  });

  // #1200 follow-up: refocus must not discard an in-progress search — the
  // input keeps showing the query, so the reopened list has to stay filtered.
  it('keeps an in-progress search filtered when the picker regains focus (#1200)', () => {
    setupClocks();

    const picker = document.getElementById('timezone-picker');
    const optionsList = document.getElementById('timezone-options');

    picker.dispatchEvent(new Event('focus'));
    picker.value = 'Chicago';
    picker.dispatchEvent(new Event('input'));

    const filteredCount = optionsList.querySelectorAll('button[data-zone]').length;
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(window.POPULAR_ZONES.length);

    picker.dispatchEvent(new Event('focus'));

    expect(picker.value).toBe('Chicago');
    expect(optionsList.hidden).toBe(false);
    expect(optionsList.querySelectorAll('button[data-zone]').length).toBe(filteredCount);
  });
});
