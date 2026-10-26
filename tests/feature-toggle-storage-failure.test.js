import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor } from './helpers/storage-write-failures.js';

// #969: the storage bridge's setItem returns false instead of throwing on a
// rejected write, so every feature toggle must check the return value, show
// shared error feedback, and re-apply the rolled-back state.

const SAVE_ERROR_MESSAGE = 'Failed to save this setting. Your last action was not saved.';

const TOGGLE_STORAGE_KEYS = [
  'simpleMode',
  'focusMode',
  'todoEnabled',
  'notesEnabled',
  'eyeCareReminder',
  'customShortcuts'
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

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
  injectScript('src/core/toast.js');
  injectScript('src/features/simple-mode.js');
  injectScript('src/features/focus-mode.js');
  injectScript('src/features/shortcuts.js');
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

afterEach(() => {
  while (restorers.length > 0) {
    const restore = restorers.pop();
    restore();
  }
  delete window.showToast;
  delete window.refreshEyeCareReminder;
});

function failWriteFor(key) {
  const restore = failStorageWritesFor(key);
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
