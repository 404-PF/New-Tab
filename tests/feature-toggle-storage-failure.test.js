import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

// #969: the storage bridge's setItem returns false instead of throwing on a
// rejected write, so every feature toggle must check the return value, show
// shared error feedback, and re-apply the rolled-back state.

const SAVE_ERROR_MESSAGE = 'Failed to save this setting. Your last action was not saved.';

const TOGGLE_STORAGE_KEYS = [
  'simpleMode',
  'focusMode',
  'todoEnabled',
  'notesEnabled',
  'notesSemanticEnabled',
  'mottoEnabled',
  'eyeCareReminder',
  'customShortcuts',
  'openAppsInNewTab',
  'iconSize',
  'appsButtonCurvature'
];

const restorers = [];

// DOM stubs tests/setup.js does not pre-create; the modules bind their change
// handlers at injection time, so these must exist before beforeAll runs.
['simple-mode-checkbox', 'simple-mode-toggle', 'notes-enabled-setting'].forEach((id) => {
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.id = id;
  document.body.appendChild(el);
});

// #1149: settings-modal controls bound by settings.js at injection time, so
// these must also exist before beforeAll runs. Color/font/format pickers and
// the games/pomodoro checkboxes already come from tests/setup.js.
['dark', 'light', 'system'].forEach((value) => {
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'theme';
  radio.value = value;
  document.body.appendChild(radio);
});
['video-autoplay-setting', 'video-muted-setting', 'video-pause-hidden-setting'].forEach((id) => {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  document.body.appendChild(checkbox);
});
[['clock', [60, 80, 100]], ['date', [20, 24, 30]]].forEach(([group, sizes]) => {
  const container = document.createElement('div');
  container.setAttribute('data-size-group', group);
  sizes.forEach((size) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'size-choice-button';
    button.dataset.size = String(size);
    container.appendChild(button);
  });
  document.body.appendChild(container);
});
['bg-overlay-dim', 'bg-overlay-blur', 'bg-tint-strength', 'bg-tint-color'].forEach((id) => {
  const input = document.createElement('input');
  input.id = id;
  document.body.appendChild(input);
});
// Font/format selects ship without options in tests/setup.js; give them the
// options the tests exercise so value round-trips work like the real page.
const FONT_DEFAULT = '\'Times New Roman\', Times, serif';
[['clock-font-picker', [FONT_DEFAULT, 'Arial']],
  ['date-font-picker', [FONT_DEFAULT, 'Arial']],
  ['clock-format-picker', ['auto', '12h', '24h']],
  ['date-format-picker', ['auto', 'long', 'compact', 'numeric']]].forEach(([id, values]) => {
  const select = document.getElementById(id);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    select.appendChild(option);
  });
});

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
  injectScript('src/core/toast.js');
  injectScript('src/features/simple-mode.js');
  injectScript('src/features/focus-mode.js');
  injectScript('src/features/shortcuts.js');
  // The todo-enabled checkbox handler and window.applyTodoEnabled moved from
  // settings.js into the Todo app module (#1066).
  injectScript('src/features/todo-app.js');
});

beforeEach(() => {
  TOGGLE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  document.body.classList.remove('simple-mode', 'focus-mode');
  document.body.removeAttribute('data-focus-mode');

  const checkboxIds = [
    'simple-mode-checkbox',
    'focus-mode-setting',
    'todo-enabled-setting',
    'notes-enabled-setting',
    'motto-enabled-setting',
    'eye-care-enabled-setting',
    'eye-care-browser-notification-setting'
  ];
  checkboxIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const intervalSetting = document.getElementById('eye-care-interval-setting');
  if (intervalSetting) intervalSetting.value = '20';

  window.showToast = vi.fn();
  window.refreshEyeCareReminder = vi.fn();
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
  delete window.showToast;
  delete window.refreshEyeCareReminder;
});

function failWriteFor(key, mode) {
  const restore = failStorageWritesFor(key, mode);
  restorers.push(restore);
  return restore;
}

function seedEyeCareState(extra) {
  localStorage.setItem('eyeCareReminder', JSON.stringify({
    enabled: false,
    intervalMinutes: 20,
    browserNotification: false,
    lastReminder: null,
    elapsedVisibleMs: 0,
    lastVisibleAt: null,
    activeReminderAt: null,
    activeElapsedVisibleMs: 0,
    activeLastVisibleAt: null,
    visibilityPaused: false,
    ...extra
  }));
}

describe('keyboard feature toggles report rejected writes (#969)', () => {
  it('toggleTodo keeps the persisted value, restores the control, and toasts', () => {
    localStorage.setItem('todoEnabled', 'true');
    failWriteFor('todoEnabled');

    window.Shortcuts.executeAction('toggleTodo');

    expect(localStorage.getItem('todoEnabled')).toBe('true');
    expect(document.getElementById('todo-enabled-setting').checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('toggleTodo persists an accepted write without toasting', () => {
    localStorage.setItem('todoEnabled', 'true');

    window.Shortcuts.executeAction('toggleTodo');

    expect(localStorage.getItem('todoEnabled')).toBe('false');
    expect(document.getElementById('todo-enabled-setting').checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('toggleTodo resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('todoEnabled', 'true');
    failWriteFor('todoEnabled', 'async');

    window.Shortcuts.executeAction('toggleTodo');

    // The bridge accepted the write optimistically; the failure only arrives
    // through runtime.lastError in the chrome.storage callback.
    expect(localStorage.getItem('todoEnabled')).toBe('false');
    expect(document.getElementById('todo-enabled-setting').checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('todoEnabled')).toBe('true');
    expect(document.getElementById('todo-enabled-setting').checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('toggleNotes keeps the persisted value, restores the control, and toasts', () => {
    localStorage.setItem('notesEnabled', 'true');
    failWriteFor('notesEnabled');

    window.Shortcuts.executeAction('toggleNotes');

    expect(localStorage.getItem('notesEnabled')).toBe('true');
    expect(document.getElementById('notes-enabled-setting').checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('toggleNotes persists an accepted write without toasting', () => {
    localStorage.setItem('notesEnabled', 'true');

    window.Shortcuts.executeAction('toggleNotes');

    expect(localStorage.getItem('notesEnabled')).toBe('false');
    expect(document.getElementById('notes-enabled-setting').checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('toggleSimpleMode keeps the persisted value, restores the checkbox, and toasts', () => {
    localStorage.setItem('simpleMode', 'false');
    window.applySimpleMode();
    failWriteFor('simpleMode');

    window.Shortcuts.executeAction('toggleSimpleMode');

    expect(localStorage.getItem('simpleMode')).toBe('false');
    expect(document.getElementById('simple-mode-checkbox').checked).toBe(false);
    expect(document.body.classList.contains('simple-mode')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('toggleSimpleMode persists an accepted write without toasting', () => {
    window.Shortcuts.executeAction('toggleSimpleMode');

    expect(localStorage.getItem('simpleMode')).toBe('true');
    expect(document.getElementById('simple-mode-checkbox').checked).toBe(true);
    expect(document.body.classList.contains('simple-mode')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('the toggleFocusMode fallback keeps the persisted value and toasts', () => {
    const originalToggleFocusMode = window.toggleFocusMode;
    delete window.toggleFocusMode;
    restorers.push(() => {
      window.toggleFocusMode = originalToggleFocusMode;
    });

    localStorage.setItem('focusMode', 'false');
    failWriteFor('focusMode');

    window.Shortcuts.executeAction('toggleFocusMode');

    expect(localStorage.getItem('focusMode')).toBe('false');
    expect(document.getElementById('focus-mode-setting').checked).toBe(false);
    expect(document.body.classList.contains('focus-mode')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('the toggleFocusMode fallback persists an accepted write without toasting', () => {
    const originalToggleFocusMode = window.toggleFocusMode;
    delete window.toggleFocusMode;
    restorers.push(() => {
      window.toggleFocusMode = originalToggleFocusMode;
    });

    window.Shortcuts.executeAction('toggleFocusMode');

    expect(localStorage.getItem('focusMode')).toBe('true');
    expect(document.getElementById('focus-mode-setting').checked).toBe(true);
    expect(document.body.classList.contains('focus-mode')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });
});

describe('setFocusMode reports rejected writes (#969)', () => {
  it('keeps the persisted value, restores the checkbox, and toasts', () => {
    localStorage.setItem('focusMode', 'false');
    failWriteFor('focusMode');

    window.setFocusMode(true);

    expect(localStorage.getItem('focusMode')).toBe('false');
    expect(document.getElementById('focus-mode-setting').checked).toBe(false);
    expect(document.body.classList.contains('focus-mode')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('persists an accepted write without toasting', () => {
    window.setFocusMode(true);

    expect(localStorage.getItem('focusMode')).toBe('true');
    expect(document.getElementById('focus-mode-setting').checked).toBe(true);
    expect(document.body.classList.contains('focus-mode')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('focusMode', 'false');
    failWriteFor('focusMode', 'async');

    window.setFocusMode(true);

    expect(localStorage.getItem('focusMode')).toBe('true');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('focusMode')).toBe('false');
    expect(document.getElementById('focus-mode-setting').checked).toBe(false);
    expect(document.body.classList.contains('focus-mode')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});

describe('settings checkboxes report rejected writes (#969)', () => {
  it('simple-mode checkbox keeps the value, restores the checkbox, and toasts', () => {
    localStorage.setItem('simpleMode', 'false');
    window.applySimpleMode();
    failWriteFor('simpleMode');

    const checkbox = document.getElementById('simple-mode-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('simpleMode')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('simple-mode checkbox persists an accepted write without toasting', () => {
    const checkbox = document.getElementById('simple-mode-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('simpleMode')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('todo-enabled checkbox keeps the value, restores the checkbox, and toasts', () => {
    localStorage.setItem('todoEnabled', 'true');
    failWriteFor('todoEnabled');

    const checkbox = document.getElementById('todo-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('todoEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('todo-enabled checkbox persists an accepted write without toasting', () => {
    const checkbox = document.getElementById('todo-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('todoEnabled')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('notes-enabled checkbox keeps the value, restores the checkbox, and toasts', () => {
    localStorage.setItem('notesEnabled', 'true');
    failWriteFor('notesEnabled');

    const checkbox = document.getElementById('notes-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('notesEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('notes-enabled checkbox persists an accepted write without toasting', () => {
    const checkbox = document.getElementById('notes-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('notesEnabled')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('motto-enabled checkbox keeps the value, restores the checkbox, and toasts', () => {
    localStorage.setItem('mottoEnabled', 'true');
    failWriteFor('mottoEnabled');

    const checkbox = document.getElementById('motto-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('mottoEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('motto-enabled checkbox persists an accepted write without toasting', () => {
    const checkbox = document.getElementById('motto-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('mottoEnabled')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(document.getElementById('motto-container').style.display).toBe('none');
    expect(window.showToast).not.toHaveBeenCalled();
  });
});

describe('async runtime.lastError rollback restores controls (#969)', () => {
  it('todo-enabled checkbox resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('todoEnabled', 'true');
    failWriteFor('todoEnabled', 'async');

    const checkbox = document.getElementById('todo-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('todoEnabled')).toBe('false');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('todoEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('notes-enabled checkbox resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('notesEnabled', 'true');
    failWriteFor('notesEnabled', 'async');

    const checkbox = document.getElementById('notes-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('notesEnabled')).toBe('false');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('notesEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('motto-enabled checkbox resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('mottoEnabled', 'true');
    failWriteFor('mottoEnabled', 'async');

    const checkbox = document.getElementById('motto-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('mottoEnabled')).toBe('false');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('mottoEnabled')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(document.getElementById('motto-container').style.display).not.toBe('none');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('simple-mode checkbox resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('simpleMode', 'false');
    window.applySimpleMode();
    failWriteFor('simpleMode', 'async');

    const checkbox = document.getElementById('simple-mode-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('simpleMode')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('simpleMode')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(document.body.classList.contains('simple-mode')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('eye-care enabled checkbox resyncs, refreshes, and toasts after an async lastError rollback', async () => {
    seedEyeCareState({ enabled: false });
    failWriteFor('eyeCareReminder', 'async');

    const checkbox = document.getElementById('eye-care-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    // The optimistic save path already refreshed once; the rollback resync
    // refreshes again so the reminder drops the rolled-back enable.
    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).enabled).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).enabled).toBe(false);
    expect(checkbox.checked).toBe(false);
    expect(window.refreshEyeCareReminder).toHaveBeenCalledTimes(2);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});

describe('saveEyeCareReminderState reports rejected writes (#969)', () => {
  it('returns false and leaves the stored state untouched', () => {
    seedEyeCareState({ enabled: true, intervalMinutes: 20 });
    failWriteFor('eyeCareReminder');

    const result = window.saveEyeCareReminderState({ intervalMinutes: 30 });

    expect(result).toBe(false);
    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).intervalMinutes).toBe(20);
  });

  it('returns the merged state when the write is accepted', () => {
    seedEyeCareState({ enabled: true, intervalMinutes: 20 });

    const result = window.saveEyeCareReminderState({ intervalMinutes: 30 });

    expect(result).toMatchObject({ enabled: true, intervalMinutes: 30 });
    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).intervalMinutes).toBe(30);
  });
});

describe('eye-care settings checkboxes report rejected writes (#969)', () => {
  it('enabled checkbox keeps the value, restores the control, and toasts', () => {
    seedEyeCareState({ enabled: false });
    failWriteFor('eyeCareReminder');

    const checkbox = document.getElementById('eye-care-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).enabled).toBe(false);
    expect(checkbox.checked).toBe(false);
    expect(window.refreshEyeCareReminder).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('enabled checkbox persists an accepted write and refreshes without toasting', () => {
    seedEyeCareState({ enabled: false });

    const checkbox = document.getElementById('eye-care-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).enabled).toBe(true);
    expect(window.refreshEyeCareReminder).toHaveBeenCalledTimes(1);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('interval select keeps the value, restores the control, and toasts', () => {
    seedEyeCareState({ enabled: true, intervalMinutes: 20 });
    failWriteFor('eyeCareReminder');

    const select = document.getElementById('eye-care-interval-setting');
    select.value = '30';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).intervalMinutes).toBe(20);
    expect(select.value).toBe('20');
    expect(window.refreshEyeCareReminder).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('interval select persists an accepted write and refreshes without toasting', () => {
    seedEyeCareState({ enabled: true, intervalMinutes: 20 });

    const select = document.getElementById('eye-care-interval-setting');
    select.value = '30';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).intervalMinutes).toBe(30);
    expect(window.refreshEyeCareReminder).toHaveBeenCalledTimes(1);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('browser notification checkbox keeps the value and toasts', () => {
    seedEyeCareState({ enabled: true, browserNotification: false });
    failWriteFor('eyeCareReminder');

    const checkbox = document.getElementById('eye-care-browser-notification-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).browserNotification).toBe(false);
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});

describe('toggle handlers tolerate a missing toast.js helper (#969)', () => {
  it('simple-mode checkbox still saves via the fallback when persistFeatureToggle is unavailable', () => {
    const originalPersist = window.persistFeatureToggle;
    const originalReport = window.showFeatureToggleSaveError;
    delete window.persistFeatureToggle;
    delete window.showFeatureToggleSaveError;
    restorers.push(() => {
      window.persistFeatureToggle = originalPersist;
      window.showFeatureToggleSaveError = originalReport;
    });

    const checkbox = document.getElementById('simple-mode-checkbox');
    checkbox.checked = true;
    expect(() => {
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }).not.toThrow();

    expect(localStorage.getItem('simpleMode')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('setFocusMode still saves via the fallback when persistFeatureToggle is unavailable', () => {
    const originalPersist = window.persistFeatureToggle;
    const originalReport = window.showFeatureToggleSaveError;
    delete window.persistFeatureToggle;
    delete window.showFeatureToggleSaveError;
    restorers.push(() => {
      window.persistFeatureToggle = originalPersist;
      window.showFeatureToggleSaveError = originalReport;
    });

    expect(() => {
      window.setFocusMode(true);
    }).not.toThrow();

    expect(localStorage.getItem('focusMode')).toBe('true');
    expect(document.getElementById('focus-mode-setting').checked).toBe(true);
  });

  it('toggleTodo still saves via the fallback when persistFeatureToggle is unavailable', () => {
    const originalPersist = window.persistFeatureToggle;
    const originalReport = window.showFeatureToggleSaveError;
    delete window.persistFeatureToggle;
    delete window.showFeatureToggleSaveError;
    restorers.push(() => {
      window.persistFeatureToggle = originalPersist;
      window.showFeatureToggleSaveError = originalReport;
    });

    localStorage.setItem('todoEnabled', 'true');
    document.getElementById('todo-enabled-setting').checked = true;

    expect(() => {
      window.Shortcuts.executeAction('toggleTodo');
    }).not.toThrow();

    expect(localStorage.getItem('todoEnabled')).toBe('false');
    expect(document.getElementById('todo-enabled-setting').checked).toBe(false);
  });
});

describe('app-grid Settings > Apps writes report rejected writes (#1142)', () => {
  beforeAll(() => {
    // The Settings > Apps controls must exist before app-manager.js binds
    // its change handlers at injection time.
    const openNewTab = document.createElement('input');
    openNewTab.type = 'checkbox';
    openNewTab.id = 'open-new-tab-setting';
    document.body.appendChild(openNewTab);

    const iconSizeGroup = document.createElement('div');
    iconSizeGroup.setAttribute('data-size-group', 'icon');
    [48, 60, 72].forEach((size) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'size-choice-button';
      button.dataset.size = String(size);
      iconSizeGroup.appendChild(button);
    });
    document.body.appendChild(iconSizeGroup);

    [8, 15, 20, 50].forEach((value) => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'curvature';
      radio.value = String(value);
      document.body.appendChild(radio);
    });

    const iconSizeReset = document.createElement('button');
    iconSizeReset.type = 'button';
    iconSizeReset.id = 'icon-size-reset';
    document.body.appendChild(iconSizeReset);

    // app-manager registers through window.onDomReady and reads
    // window.__appGridState at injection; report the grid as already
    // rendered so the deferred render path stays out of these storage tests.
    window.onDomReady = (callback) => callback();
    window.__appGridState = { phase: 'rendered', setPhase: vi.fn() };
    injectScript('src/ui/app-manager.js');
  });

  beforeEach(() => {
    // The file-level hook cleared the keys; snap the controls back to their
    // defaults so every test starts from a known state.
    window.applyOpenNewTabSetting();
    window.applyIconSize();
    window.applyCurvature();
  });

  const getOpenNewTabCheckbox = () => document.getElementById('open-new-tab-setting');
  const getSizeButton = (size) =>
    document.querySelector(`[data-size-group="icon"] .size-choice-button[data-size="${size}"]`);
  const getCurvatureRadio = (value) =>
    document.querySelector(`input[name="curvature"][value="${value}"]`);

  it('open-in-new-tab checkbox keeps the value, restores the checkbox, and toasts', () => {
    localStorage.setItem('openAppsInNewTab', 'false');
    window.applyOpenNewTabSetting();
    failWriteFor('openAppsInNewTab');

    const checkbox = getOpenNewTabCheckbox();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('openAppsInNewTab')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('open-in-new-tab checkbox persists an accepted write without toasting', () => {
    const checkbox = getOpenNewTabCheckbox();
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('openAppsInNewTab')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('open-in-new-tab checkbox resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('openAppsInNewTab', 'false');
    window.applyOpenNewTabSetting();
    failWriteFor('openAppsInNewTab', 'async');

    const checkbox = getOpenNewTabCheckbox();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    // The bridge accepted the write optimistically; the failure only arrives
    // through runtime.lastError in the chrome.storage callback.
    expect(localStorage.getItem('openAppsInNewTab')).toBe('true');
    expect(checkbox.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('openAppsInNewTab')).toBe('false');
    expect(checkbox.checked).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('icon-size button keeps the value, restores the active button, and toasts', () => {
    localStorage.setItem('iconSize', '48');
    window.applyIconSize();
    failWriteFor('iconSize');

    getSizeButton(72).click();

    expect(localStorage.getItem('iconSize')).toBe('48');
    expect(getSizeButton(48).classList.contains('active')).toBe(true);
    expect(getSizeButton(72).classList.contains('active')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('icon-size button persists an accepted write without toasting', () => {
    getSizeButton(72).click();

    expect(localStorage.getItem('iconSize')).toBe('72');
    expect(getSizeButton(72).classList.contains('active')).toBe(true);
    expect(getSizeButton(48).classList.contains('active')).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('icon-size button resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('iconSize', '48');
    window.applyIconSize();
    failWriteFor('iconSize', 'async');

    getSizeButton(72).click();

    expect(localStorage.getItem('iconSize')).toBe('72');
    expect(getSizeButton(72).classList.contains('active')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('iconSize')).toBe('48');
    expect(getSizeButton(48).classList.contains('active')).toBe(true);
    expect(getSizeButton(72).classList.contains('active')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('two rapid rejected icon-size writes resync to the last accepted value', async () => {
    localStorage.setItem('iconSize', '48');
    window.applyIconSize();
    failWriteFor('iconSize', 'async');

    getSizeButton(72).click();
    getSizeButton(60).click();

    // The second write is serialized behind the first, so storage still
    // holds the first write's optimistic value and nothing has toasted yet.
    expect(localStorage.getItem('iconSize')).toBe('72');
    expect(getSizeButton(72).classList.contains('active')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    // Both writes were rejected: the control must show the last accepted
    // value (48), never the intermediate optimistic 72.
    expect(localStorage.getItem('iconSize')).toBe('48');
    expect(getSizeButton(48).classList.contains('active')).toBe(true);
    expect(getSizeButton(72).classList.contains('active')).toBe(false);
    expect(getSizeButton(60).classList.contains('active')).toBe(false);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('curvature radio keeps the value, restores the radio, and toasts', () => {
    localStorage.setItem('appsButtonCurvature', '20');
    window.applyCurvature();
    failWriteFor('appsButtonCurvature');

    const radio = getCurvatureRadio('50');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('appsButtonCurvature')).toBe('20');
    expect(radio.checked).toBe(false);
    expect(getCurvatureRadio('20').checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('curvature radio persists an accepted write without toasting', () => {
    const radio = getCurvatureRadio('50');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('appsButtonCurvature')).toBe('50');
    expect(radio.checked).toBe(true);
    expect(getCurvatureRadio('20').checked).toBe(false);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('curvature radio resyncs and toasts after an async lastError rollback', async () => {
    localStorage.setItem('appsButtonCurvature', '20');
    window.applyCurvature();
    failWriteFor('appsButtonCurvature', 'async');

    const radio = getCurvatureRadio('50');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('appsButtonCurvature')).toBe('50');
    expect(radio.checked).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('appsButtonCurvature')).toBe('20');
    expect(radio.checked).toBe(false);
    expect(getCurvatureRadio('20').checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('icon-size Reset removes the key and snaps the buttons back to the default', async () => {
    localStorage.setItem('iconSize', '48');
    window.applyIconSize();
    expect(getSizeButton(48).classList.contains('active')).toBe(true);

    document.getElementById('icon-size-reset').click();
    // The removal is optimistic: the cache drops the key immediately.
    expect(localStorage.getItem('iconSize')).toBeNull();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('iconSize')).toBeNull();
    expect(getSizeButton(48).classList.contains('active')).toBe(false);
    expect(getSizeButton(60).classList.contains('active')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('icon-size Reset is not undone by a selection queued before it (#1142 review)', async () => {
    getSizeButton(72).click();
    // Queued behind the in-flight 72 write; Reset must queue behind both so
    // the queued selection can never re-add the key after the removal.
    getSizeButton(48).click();
    document.getElementById('icon-size-reset').click();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('iconSize')).toBeNull();
    expect(getSizeButton(72).classList.contains('active')).toBe(false);
    expect(getSizeButton(48).classList.contains('active')).toBe(false);
    expect(getSizeButton(60).classList.contains('active')).toBe(true);
    expect(window.showToast).not.toHaveBeenCalled();
  });
});

describe('settings modal reports rejected writes (#1149)', () => {
  const STORAGE_KEYS_1149 = [
    'theme',
    'clockColor', 'clockFont', 'clockSize', 'clockFormat',
    'dateColor', 'dateFont', 'dateSize', 'dateFormat',
    'videoAutoplay', 'videoMuted', 'videoPauseHidden',
    'homepageBg',
    'bgOverlayOpacity', 'bgOverlayBlur', 'bgTint', 'bgTintStrength',
    'pomodoroStatsEnabled',
    'games_enabled', 'games_keymap', 'games_fps_enabled'
  ];

  beforeEach(() => {
    // Snap every control back to its stored default so each test starts
    // from a known state.
    STORAGE_KEYS_1149.forEach((key) => localStorage.removeItem(key));
    window.applyTheme();
    window.applyVideoPlaybackSettings();
    window.applyGamesEnabled();
    window.applyGamesKeymap();
    window.applyGamesFps();
    window.applyPomodoroStatsEnabled();
    window.resyncClockDateStyle();
    window.applyBg();
  });

  const getThemeRadio = (value) =>
    document.querySelector(`input[name="theme"][value="${value}"]`);
  const getClockSizeButton = (size) =>
    document.querySelector(`[data-size-group="clock"] .size-choice-button[data-size="${size}"]`);
  const getDateSizeButton = (size) =>
    document.querySelector(`[data-size-group="date"] .size-choice-button[data-size="${size}"]`);

  function makeBgThumb(id) {
    const thumb = document.createElement('div');
    thumb.className = 'bg-thumb';
    thumb.setAttribute('data-bg', id);
    document.body.appendChild(thumb);
    return thumb;
  }

  describe('theme (regression: already fixed via commitTheme)', () => {
    it('keeps the stored theme, restores the radio, and toasts', () => {
      localStorage.setItem('theme', 'dark');
      window.applyTheme();
      failWriteFor('theme');

      const radio = getThemeRadio('light');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('theme')).toBe('dark');
      expect(getThemeRadio('dark').checked).toBe(true);
      expect(getThemeRadio('light').checked).toBe(false);
      expect(document.body.classList.contains('light-theme')).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('persists an accepted write without toasting', () => {
      const radio = getThemeRadio('light');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('theme')).toBe('light');
      expect(radio.checked).toBe(true);
      expect(document.body.classList.contains('light-theme')).toBe(true);
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('resyncs and toasts after an async lastError rollback', async () => {
      localStorage.setItem('theme', 'dark');
      window.applyTheme();
      failWriteFor('theme', 'async');

      const radio = getThemeRadio('light');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('theme')).toBe('light');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('theme')).toBe('dark');
      expect(getThemeRadio('dark').checked).toBe(true);
      expect(getThemeRadio('light').checked).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('clock color', () => {
    it('keeps the stored color, restores the picker, and toasts', () => {
      localStorage.setItem('clockColor', '#ffffff');
      failWriteFor('clockColor');

      const picker = document.getElementById('clock-color-picker');
      picker.value = '#000000';
      picker.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('clockColor')).toBe('#ffffff');
      expect(picker.value).toBe('#ffffff');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('persists an accepted write without toasting', () => {
      const picker = document.getElementById('clock-color-picker');
      picker.value = '#000000';
      picker.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('clockColor')).toBe('#000000');
      expect(picker.value).toBe('#000000');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('resyncs and toasts after an async lastError rollback', async () => {
      localStorage.setItem('clockColor', '#ffffff');
      failWriteFor('clockColor', 'async');

      const picker = document.getElementById('clock-color-picker');
      picker.value = '#000000';
      picker.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('clockColor')).toBe('#000000');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('clockColor')).toBe('#ffffff');
      expect(picker.value).toBe('#ffffff');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('video autoplay', () => {
    it('keeps the stored value, restores the checkbox, and toasts', () => {
      failWriteFor('videoAutoplay');

      const checkbox = document.getElementById('video-autoplay-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('videoAutoplay')).toBeNull();
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('persists an accepted write without toasting', () => {
      const checkbox = document.getElementById('video-autoplay-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('videoAutoplay')).toBe('false');
      expect(checkbox.checked).toBe(false);
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('resyncs and toasts after an async lastError rollback', async () => {
      failWriteFor('videoAutoplay', 'async');

      const checkbox = document.getElementById('video-autoplay-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('videoAutoplay')).toBe('false');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('videoAutoplay')).toBeNull();
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('games enabled', () => {
    it('keeps the stored value, restores the checkbox, and toasts', () => {
      failWriteFor('games_enabled');

      const checkbox = document.getElementById('games-enabled-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_enabled')).toBeNull();
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('persists an accepted write without toasting', () => {
      const checkbox = document.getElementById('games-enabled-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_enabled')).toBe('false');
      expect(checkbox.checked).toBe(false);
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('resyncs and toasts after an async lastError rollback', async () => {
      failWriteFor('games_enabled', 'async');

      const checkbox = document.getElementById('games-enabled-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_enabled')).toBe('false');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('games_enabled')).toBeNull();
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('remaining clock/date controls', () => {
    it('clock font keeps the value, restores the picker, and toasts', () => {
      localStorage.setItem('clockFont', 'Arial');
      failWriteFor('clockFont');

      const picker = document.getElementById('clock-font-picker');
      picker.value = FONT_DEFAULT;
      picker.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('clockFont')).toBe('Arial');
      expect(picker.value).toBe('Arial');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('clock font persists an accepted write without toasting', () => {
      const picker = document.getElementById('clock-font-picker');
      picker.value = 'Arial';
      picker.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('clockFont')).toBe('Arial');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('clock size keeps the value, restores the buttons, and toasts', () => {
      localStorage.setItem('clockSize', '60');
      failWriteFor('clockSize');

      getClockSizeButton(100).click();

      expect(localStorage.getItem('clockSize')).toBe('60');
      expect(getClockSizeButton(60).classList.contains('active')).toBe(true);
      expect(getClockSizeButton(100).classList.contains('active')).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('clock size persists an accepted write without toasting', () => {
      getClockSizeButton(100).click();

      expect(localStorage.getItem('clockSize')).toBe('100');
      expect(getClockSizeButton(100).classList.contains('active')).toBe(true);
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('clock format keeps the value, restores the picker, and toasts', () => {
      localStorage.setItem('clockFormat', 'auto');
      failWriteFor('clockFormat');

      const picker = document.getElementById('clock-format-picker');
      picker.value = '24h';
      picker.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('clockFormat')).toBe('auto');
      expect(picker.value).toBe('auto');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('clock format persists an accepted write without toasting', () => {
      const picker = document.getElementById('clock-format-picker');
      picker.value = '24h';
      picker.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('clockFormat')).toBe('24h');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('date color keeps the value, restores the picker, and toasts', () => {
      localStorage.setItem('dateColor', '#ffffff');
      failWriteFor('dateColor');

      const picker = document.getElementById('date-color-picker');
      picker.value = '#000000';
      picker.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('dateColor')).toBe('#ffffff');
      expect(picker.value).toBe('#ffffff');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('date color persists an accepted write without toasting', () => {
      const picker = document.getElementById('date-color-picker');
      picker.value = '#000000';
      picker.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('dateColor')).toBe('#000000');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('date font keeps the value, restores the picker, and toasts', () => {
      localStorage.setItem('dateFont', 'Arial');
      failWriteFor('dateFont');

      const picker = document.getElementById('date-font-picker');
      picker.value = FONT_DEFAULT;
      picker.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('dateFont')).toBe('Arial');
      expect(picker.value).toBe('Arial');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('date size keeps the value, restores the buttons, and toasts', () => {
      localStorage.setItem('dateSize', '20');
      failWriteFor('dateSize');

      getDateSizeButton(30).click();

      expect(localStorage.getItem('dateSize')).toBe('20');
      expect(getDateSizeButton(20).classList.contains('active')).toBe(true);
      expect(getDateSizeButton(30).classList.contains('active')).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('date format keeps the value, restores the picker, and toasts', () => {
      localStorage.setItem('dateFormat', 'auto');
      failWriteFor('dateFormat');

      const picker = document.getElementById('date-format-picker');
      picker.value = 'long';
      picker.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('dateFormat')).toBe('auto');
      expect(picker.value).toBe('auto');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('remaining video, background and overlay controls', () => {
    it('video muted keeps the value, restores the checkbox, and toasts', () => {
      failWriteFor('videoMuted');

      const checkbox = document.getElementById('video-muted-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('videoMuted')).toBeNull();
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('video muted persists an accepted write without toasting', () => {
      const checkbox = document.getElementById('video-muted-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('videoMuted')).toBe('false');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('video pause-hidden keeps the value, restores the checkbox, and toasts', () => {
      failWriteFor('videoPauseHidden');

      const checkbox = document.getElementById('video-pause-hidden-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('videoPauseHidden')).toBeNull();
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('homepage background keeps the value, restores the selection, and toasts', () => {
      localStorage.setItem('homepageBg', 'Water Beside Forest');
      window.applyBg();
      failWriteFor('homepageBg');

      const thumb = makeBgThumb('Bamboo Forest');
      try {
        thumb.click();

        expect(localStorage.getItem('homepageBg')).toBe('Water Beside Forest');
        expect(document.body.getAttribute('data-bg')).toBe('Water Beside Forest');
        expect(window.showToast).toHaveBeenCalledTimes(1);
        expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
      } finally {
        thumb.remove();
      }
    });

    it('homepage background persists an accepted write without toasting', () => {
      const thumb = makeBgThumb('Bamboo Forest');
      try {
        thumb.click();

        expect(localStorage.getItem('homepageBg')).toBe('Bamboo Forest');
        expect(document.body.getAttribute('data-bg')).toBe('Bamboo Forest');
        expect(window.showToast).not.toHaveBeenCalled();
      } finally {
        thumb.remove();
      }
    });

    it('homepage background resyncs and toasts after an async lastError rollback', async () => {
      localStorage.setItem('homepageBg', 'Water Beside Forest');
      window.applyBg();
      failWriteFor('homepageBg', 'async');

      const thumb = makeBgThumb('Bamboo Forest');
      try {
        thumb.click();

        expect(localStorage.getItem('homepageBg')).toBe('Bamboo Forest');
        expect(window.showToast).not.toHaveBeenCalled();

        await flushDeferredFailureSync();
        await flushDeferredFailureSync();

        expect(localStorage.getItem('homepageBg')).toBe('Water Beside Forest');
        expect(document.body.getAttribute('data-bg')).toBe('Water Beside Forest');
        expect(window.showToast).toHaveBeenCalledTimes(1);
        expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
      } finally {
        thumb.remove();
      }
    });

    it('overlay dim keeps the value, restores the slider, and toasts', () => {
      failWriteFor('bgOverlayOpacity');

      const input = document.getElementById('bg-overlay-dim');
      input.value = '40';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('bgOverlayOpacity')).toBeNull();
      expect(input.value).toBe('0');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('overlay dim persists an accepted write without toasting', () => {
      const input = document.getElementById('bg-overlay-dim');
      input.value = '40';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('bgOverlayOpacity')).toBe('40');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('overlay dim resyncs and toasts after an async lastError rollback', async () => {
      failWriteFor('bgOverlayOpacity', 'async');

      const input = document.getElementById('bg-overlay-dim');
      input.value = '40';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('bgOverlayOpacity')).toBe('40');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('bgOverlayOpacity')).toBeNull();
      expect(input.value).toBe('0');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('overlay blur keeps the value, restores the slider, and toasts', () => {
      failWriteFor('bgOverlayBlur');

      const input = document.getElementById('bg-overlay-blur');
      input.value = '6';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('bgOverlayBlur')).toBeNull();
      expect(input.value).toBe('0');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('overlay tint keeps the value, restores the picker, and toasts', () => {
      localStorage.setItem('bgTint', '#ff0000');
      window.applyBgOverlaySettings();
      failWriteFor('bgTint');

      const input = document.getElementById('bg-tint-color');
      input.value = '#00ff00';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('bgTint')).toBe('#ff0000');
      expect(input.value).toBe('#ff0000');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('tint strength keeps the value, restores the slider, and toasts', () => {
      failWriteFor('bgTintStrength');

      const input = document.getElementById('bg-tint-strength');
      input.value = '25';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(localStorage.getItem('bgTintStrength')).toBeNull();
      expect(input.value).toBe('0');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('pomodoro stats and games preferences', () => {
    it('pomodoro stats keeps the value, restores the checkbox, and toasts', () => {
      failWriteFor('pomodoroStatsEnabled');

      const checkbox = document.getElementById('pomodoro-stats-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('pomodoroStatsEnabled')).toBeNull();
      expect(checkbox.checked).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('pomodoro stats persists an accepted write without toasting', () => {
      const checkbox = document.getElementById('pomodoro-stats-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('pomodoroStatsEnabled')).toBe('true');
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('pomodoro stats resyncs and toasts after an async lastError rollback', async () => {
      failWriteFor('pomodoroStatsEnabled', 'async');

      const checkbox = document.getElementById('pomodoro-stats-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('pomodoroStatsEnabled')).toBe('true');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('pomodoroStatsEnabled')).toBeNull();
      expect(checkbox.checked).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('games keymap keeps the value, restores the select, and toasts', () => {
      localStorage.setItem('games_keymap', 'wasd');
      failWriteFor('games_keymap');

      const select = document.getElementById('games-keymap-setting');
      select.value = 'ijkl';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_keymap')).toBe('wasd');
      expect(select.value).toBe('wasd');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('games keymap persists an accepted write without toasting', () => {
      const select = document.getElementById('games-keymap-setting');
      select.value = 'numpad';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_keymap')).toBe('numpad');
      expect(select.value).toBe('numpad');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('games fps keeps the value, restores the checkbox, and toasts', () => {
      failWriteFor('games_fps_enabled');

      const checkbox = document.getElementById('games-fps-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_fps_enabled')).toBeNull();
      expect(checkbox.checked).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });

    it('games fps persists an accepted write without toasting', () => {
      const checkbox = document.getElementById('games-fps-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_fps_enabled')).toBe('true');
      expect(checkbox.checked).toBe(true);
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('games fps resyncs and toasts after an async lastError rollback', async () => {
      failWriteFor('games_fps_enabled', 'async');

      const checkbox = document.getElementById('games-fps-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_fps_enabled')).toBe('true');
      expect(window.showToast).not.toHaveBeenCalled();

      await flushDeferredFailureSync();
      await flushDeferredFailureSync();

      expect(localStorage.getItem('games_fps_enabled')).toBeNull();
      expect(checkbox.checked).toBe(false);
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    });
  });

  describe('games keymap with helpers loaded (#1149)', () => {
    beforeAll(() => {
      injectScript('src/features/games/shared.js');
    });

    afterAll(() => {
      delete window.gamesHelpers;
    });

    it('reports a rejected write, rolls back the live map, and toasts', () => {
      localStorage.setItem('games_keymap', 'wasd');
      window.gamesHelpers.setKeymap('wasd');
      failWriteFor('games_keymap');

      // The rejection resync must be write-free: no second setItem for the
      // value storage already holds (#1149 review).
      const originalSetKeymap = window.gamesHelpers.setKeymap;
      const setKeymapSpy = vi.fn((id) => originalSetKeymap(id));
      window.gamesHelpers.setKeymap = setKeymapSpy;
      try {
        const select = document.getElementById('games-keymap-setting');
        select.value = 'numpad';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        expect(setKeymapSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('games_keymap')).toBe('wasd');
        expect(select.value).toBe('wasd');
        expect(window.gamesHelpers.getKeymap()).toBe('wasd');
        expect(window.showToast).toHaveBeenCalledTimes(1);
        expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
      } finally {
        window.gamesHelpers.setKeymap = originalSetKeymap;
      }
    });

    it('persists an accepted write and applies the live map without toasting', () => {
      const select = document.getElementById('games-keymap-setting');
      select.value = 'ijkl';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('games_keymap')).toBe('ijkl');
      expect(select.value).toBe('ijkl');
      expect(window.gamesHelpers.getKeymap()).toBe('ijkl');
      expect(window.showToast).not.toHaveBeenCalled();
    });

    it('resyncs and toasts after an async lastError rollback without a second write', async () => {
      localStorage.setItem('games_keymap', 'wasd');
      window.gamesHelpers.applyKeymap('wasd');
      failWriteFor('games_keymap', 'async');

      // The rejection resync must be write-free: no second setItem for the
      // value storage already holds (#1149 review). Spying on setKeymap
      // alone would miss a direct setItem during rollback, so count the
      // bridged chrome.storage.local.set calls for this key as well.
      const storageArea = chrome.storage.local;
      const failingSet = storageArea.set;
      let keymapStorageWrites = 0;
      storageArea.set = function (items, callback) {
        if (Object.prototype.hasOwnProperty.call(items, 'games_keymap')) {
          keymapStorageWrites += 1;
        }
        return failingSet.call(storageArea, items, callback);
      };
      restorers.push(() => { storageArea.set = failingSet; });
      const originalSetKeymap = window.gamesHelpers.setKeymap;
      const setKeymapSpy = vi.fn((id) => originalSetKeymap(id));
      window.gamesHelpers.setKeymap = setKeymapSpy;
      try {
        const select = document.getElementById('games-keymap-setting');
        select.value = 'numpad';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        expect(localStorage.getItem('games_keymap')).toBe('numpad');
        expect(window.showToast).not.toHaveBeenCalled();

        await flushDeferredFailureSync();
        await flushDeferredFailureSync();

        expect(localStorage.getItem('games_keymap')).toBe('wasd');
        expect(select.value).toBe('wasd');
        expect(window.gamesHelpers.getKeymap()).toBe('wasd');
        expect(setKeymapSpy).toHaveBeenCalledTimes(1);
        expect(keymapStorageWrites).toBe(1);
        expect(window.showToast).toHaveBeenCalledTimes(1);
        expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
      } finally {
        window.gamesHelpers.setKeymap = originalSetKeymap;
      }
    });
  });
});
