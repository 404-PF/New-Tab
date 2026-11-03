import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

// #1129: the storage bridge reports a rejected pomodoro settings write by
// returning false (sync) or by rolling the cache back and dispatching
// storageBridgeWriteError (async). Both paths must surface the shared error
// toast and snap the Focus Timer controls — and the live phase — back to the
// persisted settings instead of silently reverting on reload.

const SAVE_ERROR_MESSAGE = 'Failed to save this setting. Your last action was not saved.';

const DURATION_INPUT_IDS = [
  'pomodoro-work-duration',
  'pomodoro-short-break-duration',
  'pomodoro-long-break-duration',
  'pomodoro-sessions-before-long'
];

const restorers = [];

// DOM stubs settings.js binds its change handlers to at injection time, so
// they must exist before beforeAll runs.
const todoHeader = document.createElement('div');
todoHeader.className = 'todo-header';
document.body.appendChild(todoHeader);

const enabledSetting = document.createElement('input');
enabledSetting.type = 'checkbox';
enabledSetting.id = 'pomodoro-enabled-setting';
document.body.appendChild(enabledSetting);

const durationSettings = document.createElement('div');
durationSettings.id = 'pomodoro-duration-settings';
document.body.appendChild(durationSettings);

DURATION_INPUT_IDS.forEach((id) => {
  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  document.body.appendChild(input);
});

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  // pomodoro.js must register loadPomodoroEnabled before settings.js binds
  // the Focus Timer handlers (same order as bootstrap.js scriptSources).
  injectScript('src/features/pomodoro.js');
  injectScript('src/ui/settings.js');
  injectScript('src/core/toast.js');
});

beforeEach(() => {
  window.showToast = vi.fn();

  document.getElementById('pomodoro-enabled-setting').checked = false;
  document.getElementById('pomodoro-duration-settings').style.display = '';
  DURATION_INPUT_IDS.forEach((id) => {
    document.getElementById(id).value = '';
  });
});

afterEach(async () => {
  if (typeof window.stopPomodoro === 'function') {
    window.stopPomodoro();
  }
  // Drain the deferred enable-apply and any storageBridgeWriteError resync
  // timers so they cannot fire against the next test's reset DOM/storage.
  await flushDeferredFailureSync();
  await flushDeferredFailureSync();
  while (restorers.length > 0) {
    const restore = restorers.pop();
    restore();
  }
  delete window.showToast;
});

function seedSettings(extra) {
  localStorage.setItem('pomodoro', JSON.stringify({
    enabled: true,
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 4,
    ...extra
  }));
}

function failWriteFor(key, mode) {
  const restore = failStorageWritesFor(key, mode);
  restorers.push(restore);
  return restore;
}

// Deliver the rejection two macrotasks after the write, so it lands after the
// enable-apply's own deferral instead of racing ahead of it (#1134).
function failWriteLate(key) {
  const area = chrome.storage.local;
  const originalSet = area.set;
  area.set = function (items, callback) {
    if (!Object.prototype.hasOwnProperty.call(items, key)) {
      return originalSet.call(area, items, callback);
    }
    setTimeout(() => {
      setTimeout(() => {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        try {
          if (typeof callback === 'function') callback();
        } finally {
          chrome.runtime.lastError = null;
        }
      }, 0);
    }, 0);
    return undefined;
  };
  restorers.push(() => { area.set = originalSet; });
}

function changeDurationInput(value) {
  const input = document.getElementById('pomodoro-work-duration');
  input.value = String(value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return input;
}

describe('Pomodoro settings writes report rejections (#1129)', () => {
  it('savePomodoroDurations returns false and leaves the stored settings untouched', () => {
    seedSettings();
    failWriteFor('pomodoro');

    const result = window.savePomodoroDurations({ workDuration: 10 });

    expect(result).toBe(false);
    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(25);
  });

  it('savePomodoroDurations returns true when the write is accepted', () => {
    seedSettings();

    const result = window.savePomodoroDurations({ workDuration: 10 });

    expect(result).toBe(true);
    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(10);
  });

  it('does not re-derive the live phase when the bridge rejects the write synchronously', async () => {
    seedSettings({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');
    // The timer state is persisted by the async leadership claim.
    await flushDeferredFailureSync();
    failWriteFor('pomodoro');

    const result = window.savePomodoroDurations({ workDuration: 10 });

    expect(result).toBe(false);
    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(25);
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).timeRemaining).toBe(25 * 60);
  });
});

describe('Focus Timer settings controls report rejected writes (#1129)', () => {
  it('work-duration input keeps the persisted value, restores the input, and toasts once', async () => {
    seedSettings();
    failWriteFor('pomodoro');

    const input = changeDurationInput(30);

    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(25);
    expect(input.value).toBe('25');

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    // The bridge also dispatched storageBridgeWriteError; the desync check
    // must not report the already-restored input a second time.
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    expect(input.value).toBe('25');
  });

  it('work-duration input persists an accepted write without toasting', async () => {
    seedSettings();

    const input = changeDurationInput(30);

    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(30);
    expect(input.value).toBe('30');

    await flushDeferredFailureSync();

    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('enabled checkbox keeps the persisted value, restores the control, and toasts', async () => {
    seedSettings({ enabled: true });
    failWriteFor('pomodoro');

    const checkbox = document.getElementById('pomodoro-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('pomodoro')).enabled).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(document.getElementById('pomodoro-duration-settings').style.display).toBe('block');

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('enabled checkbox persists an accepted write without toasting', async () => {
    seedSettings({ enabled: false });
    const checkbox = document.getElementById('pomodoro-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('pomodoro')).enabled).toBe(true);
    expect(checkbox.checked).toBe(true);

    await flushDeferredFailureSync();

    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('work-duration input resyncs and toasts after an async lastError rollback', async () => {
    seedSettings();
    failWriteFor('pomodoro', 'async');

    const input = changeDurationInput(30);

    // The bridge accepted the write optimistically; the failure only arrives
    // through runtime.lastError in the chrome.storage callback.
    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(30);
    expect(input.value).toBe('30');
    expect(window.showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(25);
    expect(input.value).toBe('25');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('rolls the live timer phase back to the persisted duration after an async rejection', async () => {
    seedSettings({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');
    // The timer state is persisted by the async leadership claim.
    await flushDeferredFailureSync();
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).timeRemaining).toBe(25 * 60);

    failWriteFor('pomodoro', 'async');
    changeDurationInput(30);

    // The accepted write re-derived the live phase to 30 minutes.
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).timeRemaining).toBe(30 * 60);

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(JSON.parse(localStorage.getItem('pomodoro')).workDuration).toBe(25);
    const timerState = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(timerState.active).toBe(true);
    expect(timerState.timeRemaining).toBe(25 * 60);
    expect(timerState.appliedPhaseDuration).toBe(25 * 60);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('keeps a running countdown when an async rejection rolls the enable write back', async () => {
    seedSettings({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');
    // The timer state is persisted by the async leadership claim.
    await flushDeferredFailureSync();
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).timeRemaining).toBe(25 * 60);

    failWriteFor('pomodoro', 'async');
    const checkbox = document.getElementById('pomodoro-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem('pomodoro')).enabled).toBe(false);
    expect(checkbox.checked).toBe(false);

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(JSON.parse(localStorage.getItem('pomodoro')).enabled).toBe(true);
    expect(checkbox.checked).toBe(true);
    const timerState = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(timerState.active).toBe(true);
    expect(timerState.timeRemaining).toBe(25 * 60);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('holds the running countdown until a rejection that lands after the apply deferral settles (#1134)', async () => {
    seedSettings({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');
    // The timer state is persisted by the async leadership claim.
    await flushDeferredFailureSync();
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).timeRemaining).toBe(25 * 60);

    failWriteLate('pomodoro');
    const checkbox = document.getElementById('pomodoro-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    // The write is accepted optimistically; nothing may stop the timer yet.
    expect(JSON.parse(localStorage.getItem('pomodoro')).enabled).toBe(false);
    expect(checkbox.checked).toBe(false);

    // Hop 1 is where a fixed one-task delay would have applied the optimistic
    // "disabled" value; hop 2 delivers the rejection and the rollback; hop 3
    // lets the rollback resync run.
    await flushDeferredFailureSync();
    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(JSON.parse(localStorage.getItem('pomodoro')).enabled).toBe(true);
    expect(checkbox.checked).toBe(true);
    const timerState = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(timerState).not.toBeNull();
    expect(timerState.active).toBe(true);
    expect(timerState.timeRemaining).toBe(25 * 60);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});
