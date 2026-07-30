import { describe, it, expect, beforeAll, afterEach } from 'vitest';
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