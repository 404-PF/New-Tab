import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  const header = document.createElement('div');
  header.className = 'todo-header';
  document.body.appendChild(header);

  window.VisibilityInterval = class {
    constructor() {}
    destroy() {}
  };

  injectScript('src/features/pomodoro.js');
});

afterEach(() => {
  if (typeof window.stopPomodoro === 'function') {
    window.stopPomodoro();
  }
  document.getElementById('pomodoro-widget')?.remove();
});

describe('Pomodoro bootstrap ordering', () => {
  it('loads Pomodoro before settings and todo consumers', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/core/bootstrap.js'), 'utf8');
    const pomodoroIndex = source.indexOf('src/features/pomodoro.js');
    const settingsIndex = source.indexOf('src/ui/settings.js');
    const todoIndex = source.indexOf('src/features/todo.js');

    expect(pomodoroIndex).toBeGreaterThanOrEqual(0);
    expect(pomodoroIndex).toBeLessThan(settingsIndex);
    expect(pomodoroIndex).toBeLessThan(todoIndex);
  });
});

describe('Pomodoro duration persistence', () => {
  it('persists a changed active duration before the next timer tick', () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');

    window.savePomodoroDurations({ workDuration: 10 });

    const persisted = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(persisted.timeRemaining).toBe(10 * 60);
  });
});

describe('Pomodoro pause -> reset/skip regression (issue #626)', () => {
  it('reset on a paused timer resumes countdown', () => {
    vi.useFakeTimers();
    const prevVI = window.VisibilityInterval;
    window.VisibilityInterval = null;
    try {
      window.savePomodoroDurations({ enabled: true, workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 });
      window.startPomodoro('todo-1');
      window.togglePomodoroPause();
      const pausedState = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(pausedState.paused).toBe(true);

      document.querySelector('.pomodoro-reset-btn').click();

      const afterReset = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterReset.paused).toBe(false);
      expect(afterReset.timeRemaining).toBe(25 * 60);

      vi.advanceTimersByTime(2100);

      const afterTick = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterTick.timeRemaining).toBeLessThan(25 * 60);
    } finally {
      window.VisibilityInterval = prevVI;
      vi.useRealTimers();
    }
  });

  it('skip on a paused timer resumes countdown on next phase', () => {
    vi.useFakeTimers();
    const prevVI = window.VisibilityInterval;
    window.VisibilityInterval = null;
    try {
      window.savePomodoroDurations({ enabled: true, workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 });
      window.startPomodoro('todo-1');
      window.togglePomodoroPause();
      const pausedState = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(pausedState.paused).toBe(true);
      expect(pausedState.phase).toBe('work');

      document.querySelector('.pomodoro-skip-btn').click();

      const afterSkip = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterSkip.paused).toBe(false);
      expect(afterSkip.phase).toBe('shortBreak');
      expect(afterSkip.timeRemaining).toBe(5 * 60);

      vi.advanceTimersByTime(2100);

      const afterTick = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterTick.timeRemaining).toBeLessThan(5 * 60);
    } finally {
      window.VisibilityInterval = prevVI;
      vi.useRealTimers();
    }
  });
});