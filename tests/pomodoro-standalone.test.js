import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Issue #1211: a standalone Pomodoro control starts a todo-less focus session
// without needing a todo row's focus button.

beforeAll(() => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request(name, callback) {
        return Promise.resolve().then(() => callback({ name }));
      }
    }
  });

  const header = document.createElement('div');
  header.className = 'todo-header';
  document.body.appendChild(header);

  window.VisibilityInterval = class {
    constructor() {}
    destroy() {}
  };

  injectScript('src/features/pomodoro.js');
});

beforeEach(() => {
  chrome.notifications._notifications = {};
});

afterEach(() => {
  if (typeof window.stopPomodoro === 'function') {
    window.stopPomodoro();
  }
  document.getElementById('pomodoro-widget')?.remove();
  document.querySelectorAll('.todo-focus-btn').forEach((btn) => btn.remove());
});

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getStandaloneControl() {
  return document.getElementById('pomodoro-standalone-start');
}

function createFocusButton(todoId) {
  const btn = document.createElement('button');
  btn.className = 'todo-focus-btn';
  btn.dataset.todoId = todoId;
  document.body.appendChild(btn);
  return btn;
}

describe('Standalone Pomodoro control (issue #1211)', () => {
  it('is created in the todo header and hidden while Pomodoro is disabled', () => {
    window.applyPomodoroEnabled();

    const btn = getStandaloneControl();
    expect(btn).toBeTruthy();
    expect(btn.closest('.todo-header')).toBeTruthy();
    expect(btn.style.display).toBe('none');
  });

  it('appears when enabled and starts a todo-less session', async () => {
    window.savePomodoroDurations({
      enabled: true,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      sessionsBeforeLongBreak: 4
    });
    window.applyPomodoroEnabled();

    const btn = getStandaloneControl();
    expect(btn.style.display).not.toBe('none');
    expect(btn.title).toBe(window.i18n.t('pomodoroStartFocus'));

    btn.click();
    await flush();

    const persisted = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(persisted.active).toBe(true);
    expect(persisted.todoId).toBeNull();

    expect(btn.title).toBe(window.i18n.t('pomodoroStopFocus'));
    expect(btn.classList.contains('active')).toBe(true);

    const widget = document.getElementById('pomodoro-widget');
    expect(widget).toBeTruthy();
    expect(widget.style.display).toBe('flex');
    expect(widget.querySelector('.pomodoro-time').textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('stops the todo-less session when clicked again', async () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.applyPomodoroEnabled();

    const btn = getStandaloneControl();
    btn.click();
    await flush();
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).active).toBe(true);

    btn.click();
    await flush();

    expect(JSON.parse(localStorage.getItem('pomodoro_state')).active).toBe(false);
    expect(btn.title).toBe(window.i18n.t('pomodoroStartFocus'));
    expect(btn.classList.contains('active')).toBe(false);
    expect(document.getElementById('pomodoro-widget').style.display).toBe('none');
  });

  it('hides the control when Pomodoro is disabled', () => {
    window.savePomodoroDurations({ enabled: true });
    window.applyPomodoroEnabled();
    const btn = getStandaloneControl();
    expect(btn.style.display).not.toBe('none');

    window.savePomodoroDurations({ enabled: false });
    window.applyPomodoroEnabled();
    expect(btn.style.display).toBe('none');
  });

  it('startPomodoro(null) persists a todo-less session', async () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.applyPomodoroEnabled();

    window.startPomodoro(null);
    await flush();

    const persisted = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(persisted.active).toBe(true);
    expect(persisted.todoId).toBeNull();
    expect(getStandaloneControl().title).toBe(window.i18n.t('pomodoroStopFocus'));
  });

  it('lets a per-todo focus button take over a running no-task session', async () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.applyPomodoroEnabled();

    getStandaloneControl().click();
    await flush();
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).todoId).toBeNull();

    const focusBtn = createFocusButton('todo-1');
    focusBtn.click();
    await flush();

    const persisted = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(persisted.active).toBe(true);
    expect(persisted.todoId).toBe('todo-1');
    expect(getStandaloneControl().title).toBe(window.i18n.t('pomodoroStartFocus'));
  });

  it('lets the standalone control take over a running per-todo session', async () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.applyPomodoroEnabled();

    window.startPomodoro('todo-1');
    await flush();
    expect(JSON.parse(localStorage.getItem('pomodoro_state')).todoId).toBe('todo-1');

    getStandaloneControl().click();
    await flush();

    const persisted = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(persisted.active).toBe(true);
    expect(persisted.todoId).toBeNull();
    expect(getStandaloneControl().title).toBe(window.i18n.t('pomodoroStopFocus'));
  });

  it('fires the no-task work-complete notification and completion event', async () => {
    vi.useFakeTimers();
    const prevVI = window.VisibilityInterval;
    window.VisibilityInterval = null;
    try {
      window.savePomodoroDurations({
        enabled: true,
        workDuration: 0.5,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4
      });
      window.applyPomodoroEnabled();

      const events = [];
      const onCompleted = (event) => events.push(event.detail);
      window.addEventListener('pomodoroSessionCompleted', onCompleted);

      try {
        getStandaloneControl().click();
        for (let i = 0; i < 10; i++) await Promise.resolve();

        const started = JSON.parse(localStorage.getItem('pomodoro_state'));
        expect(started.active).toBe(true);
        expect(started.todoId).toBeNull();

        await vi.advanceTimersByTimeAsync(31000);

        const notifications = Object.values(chrome.notifications._notifications);
        expect(
          notifications.some((n) => n.message === window.i18n.t('pomodoroWorkCompleteNoTaskBody'))
        ).toBe(true);
        expect(events.some((detail) => detail.todoId === null)).toBe(true);
      } finally {
        window.removeEventListener('pomodoroSessionCompleted', onCompleted);
      }
    } finally {
      window.VisibilityInterval = prevVI;
      vi.useRealTimers();
    }
  });
});
