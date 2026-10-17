import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Regression for the SonarCloud S9383 findings in pomodoro.js: the click
// handlers fired async timer actions without handling rejections, so a
// failing Web Locks request surfaced as an unhandled promise rejection.

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
}

describe('Pomodoro click handlers surface async failures', () => {
  it.each([
    ['pause', '.pomodoro-pause-btn'],
    ['skip', '.pomodoro-skip-btn'],
    ['reset', '.pomodoro-reset-btn']
  ])('logs a failed %s action instead of leaving an unhandled rejection', async (name, selector) => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');
    await flush();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      rejectLocks = true;
      document.querySelector(selector).click();
      await flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(`Pomodoro ${name} action failed:`, expect.any(Error));
  });

  it('logs a failed start action from a todo focus button', async () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    const btn = document.createElement('button');
    btn.className = 'todo-focus-btn';
    btn.dataset.todoId = 'todo-2';
    document.body.appendChild(btn);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectLocks = true;
    btn.click();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    btn.remove();

    expect(errorSpy).toHaveBeenCalledWith('Pomodoro start action failed:', expect.any(Error));
  });

  it('logs a failed stop action from the active todo focus button', async () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-3');
    await flush();
    const btn = document.createElement('button');
    btn.className = 'todo-focus-btn';
    btn.dataset.todoId = 'todo-3';
    document.body.appendChild(btn);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectLocks = true;
    btn.click();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    btn.remove();

    expect(errorSpy).toHaveBeenCalledWith('Pomodoro stop action failed:', expect.any(Error));
  });
});
