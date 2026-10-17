import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Regression for the SonarCloud S9383 findings in pomodoro.js. The click
// handlers fired async timer actions without handling rejections, so a
// failing Web Locks request became an unhandled promise rejection.

let rejectLocks = false;

beforeAll(() => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request(name, callback) {
        if (rejectLocks) return Promise.reject(new Error('lock request failed'));
        return Promise.resolve().then(() => callback({ name }));
      }
    }
  });
  const header = document.createElement('div');
  header.className = 'todo-header';
  document.body.appendChild(header);

  window.VisibilityInterval = class {
    destroy() {}
  };
  injectScript('src/features/pomodoro.js');
});

afterEach(() => {
  rejectLocks = false;
  vi.restoreAllMocks();
  window.stopPomodoro?.();
  document.getElementById('pomodoro-widget')?.remove();
});

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createFocusButton(todoId) {
  const btn = document.createElement('button');
  btn.className = 'todo-focus-btn';
  btn.dataset.todoId = todoId;
  document.body.appendChild(btn);
  return btn;
}

async function expectClickLogsFailure(action, { startTodoId, getTarget }) {
  window.savePomodoroDurations({ enabled: true, workDuration: 25 });
  if (startTodoId) {
    window.startPomodoro(startTodoId);
    await flush();
  }

  const target = getTarget();
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    rejectLocks = true;
    target.click();
    await flush();
  } finally {
    process.off('unhandledRejection', unhandled);
    if (target.classList.contains('todo-focus-btn')) target.remove();
  }

  expect(unhandled).not.toHaveBeenCalled();
  expect(errorSpy).toHaveBeenCalledWith(`Pomodoro ${action} action failed:`, expect.any(Error));
}

describe('Pomodoro click handlers surface async failures', () => {
  it.each([
    ['pause', '.pomodoro-pause-btn'],
    ['skip', '.pomodoro-skip-btn'],
    ['reset', '.pomodoro-reset-btn']
  ])('logs a failed %s widget action', (action, selector) =>
    expectClickLogsFailure(action, {
      startTodoId: 'todo-1',
      getTarget: () => document.querySelector(selector)
    }));

  it('logs a failed start action from a todo focus button', () =>
    expectClickLogsFailure('start', { getTarget: () => createFocusButton('todo-2') }));

  it('logs a failed stop action from the active todo focus button', () =>
    expectClickLogsFailure('stop', {
      startTodoId: 'todo-3',
      getTarget: () => createFocusButton('todo-3')
    }));
});
