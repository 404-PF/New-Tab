import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/features/pomodoro-stats.js');
});

beforeEach(() => {
  localStorage.clear();
});

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


describe('Pomodoro stats persistence', () => {
  it('loadPomodoroStats returns empty stats when localStorage is empty', () => {
    const stats = loadPomodoroStats();
    expect(stats).toEqual({ days: {}, byDateTodos: {} });
  });

  it('savePomodoroStats persists to localStorage', () => {
    const today = getToday();
    const stats = { days: { [today]: { sessions: 2, minutes: 50 } }, byDateTodos: {} };
    savePomodoroStats(stats);
    const loaded = loadPomodoroStats();
    expect(loaded.days[today].sessions).toBe(2);
    expect(loaded.days[today].minutes).toBe(50);
  });

  it('loadPomodoroStats handles corrupted data gracefully', () => {
    localStorage.setItem('pomodoroStats', '{invalid json');
    const stats = loadPomodoroStats();
    expect(stats).toEqual({ days: {}, byDateTodos: {} });
  });

  it('loadPomodoroStats handles non-object days gracefully', () => {
    localStorage.setItem('pomodoroStats', JSON.stringify({ days: 'not-an-object' }));
    const stats = loadPomodoroStats();
    expect(stats).toEqual({ days: {}, byDateTodos: {} });
  });

  it('loadPomodoroStats handles non-object byDateTodos gracefully', () => {
    localStorage.setItem('pomodoroStats', JSON.stringify({ days: {}, byDateTodos: 'bad' }));
    const stats = loadPomodoroStats();
    expect(stats.byDateTodos).toEqual({});
  });
});

describe('Pomodoro stats recording', () => {
  it('recordPomodoroSession increments today sessions and minutes', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    recordPomodoroSession({ minutes: 25 });
    const stats = loadPomodoroStats();
    expect(stats.days[getToday()].sessions).toBe(1);
    expect(stats.days[getToday()].minutes).toBe(25);
  });

  it('recordPomodoroSession increments existing count', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    recordPomodoroSession({ minutes: 25 });
    recordPomodoroSession({ minutes: 25 });
    const stats = loadPomodoroStats();
    expect(stats.days[getToday()].sessions).toBe(2);
    expect(stats.days[getToday()].minutes).toBe(50);
  });

  it('does not record when disabled', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'false');
    recordPomodoroSession({ minutes: 25 });
    const stats = loadPomodoroStats();
    expect(stats.days[getToday()]).toBeUndefined();
  });

  it('records byDateTodos attribution when todoId provided', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    recordPomodoroSession({ minutes: 25, todoId: 'todo-123' });
    const stats = loadPomodoroStats();
    expect(stats.byDateTodos[getToday()]['todo-123']).toBe(25);
  });

  it('accumulates byDateTodos minutes for same todo', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    recordPomodoroSession({ minutes: 25, todoId: 'todo-123' });
    recordPomodoroSession({ minutes: 25, todoId: 'todo-123' });
    const stats = loadPomodoroStats();
    expect(stats.byDateTodos[getToday()]['todo-123']).toBe(50);
  });
});

describe('Pomodoro stats getters', () => {
  it('getPomodoroSessionsToday returns 0 when no stats exist', () => {
    expect(getPomodoroSessionsToday()).toBe(0);
    expect(getPomodoroMinutesToday()).toBe(0);
  });

  it('getPomodoroSessionsThisWeek sums sessions from Sunday', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    recordPomodoroSession({ minutes: 25 });
    recordPomodoroSession({ minutes: 25 });
    expect(getPomodoroSessionsThisWeek()).toBe(2);
    expect(getPomodoroMinutesThisWeek()).toBe(50);
  });

  it('handles legacy numeric day entries', () => {
    const today = getToday();
    savePomodoroStats({ days: { [today]: 3 }, byDateTodos: {} });
    expect(getPomodoroSessionsToday()).toBe(3);
  });
});

describe('Pomodoro stats clear', () => {
  it('clearPomodoroStats resets all data', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    recordPomodoroSession({ minutes: 25 });
    recordPomodoroSession({ minutes: 25 });
    clearPomodoroStats();
    const stats = loadPomodoroStats();
    expect(stats).toEqual({ days: {}, byDateTodos: {} });
  });
});

describe('Pomodoro stats heatmap', () => {
  it('renders heatmap cells when panel is visible', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    applyPomodoroStatsVisibility();
    renderPomodoroStats();
    const heatmap = document.getElementById('pomodoro-stats-heatmap');
    expect(heatmap).toBeTruthy();
    expect(heatmap.children.length).toBe(30);
  });

  it('heatmap cells have level attributes', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    applyPomodoroStatsVisibility();
    renderPomodoroStats();
    const cells = document.querySelectorAll('#pomodoro-stats-heatmap .heatmap-cell');
    cells.forEach(cell => {
      expect(cell.dataset.level).toBeDefined();
    });
  });

  it('getPomodoroHeatLevel buckets correctly', () => {
    expect(getPomodoroHeatLevel(0, 5)).toBe(0);
    expect(getPomodoroHeatLevel(1, 1)).toBe(1);
    expect(getPomodoroHeatLevel(1, 10)).toBe(1);
    expect(getPomodoroHeatLevel(5, 10)).toBe(2);
    expect(getPomodoroHeatLevel(9, 10)).toBe(3);
  });
});

describe('Pomodoro stats visibility', () => {
  it('panel is hidden when stats are disabled', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'false');
    applyPomodoroStatsVisibility();
    const panel = document.getElementById('pomodoro-stats-panel');
    expect(panel.style.display).toBe('none');
  });

  it('panel is visible when stats are enabled', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    applyPomodoroStatsVisibility();
    const panel = document.getElementById('pomodoro-stats-panel');
    expect(panel.style.display).not.toBe('none');
  });

  it('toggle button is hidden when stats are disabled', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'false');
    applyPomodoroStatsVisibility();
    const toggle = document.getElementById('pomodoro-stats-toggle');
    expect(toggle.style.display).toBe('none');
  });

  it('toggle button is visible when stats are enabled', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    applyPomodoroStatsVisibility();
    const toggle = document.getElementById('pomodoro-stats-toggle');
    expect(toggle.style.display).not.toBe('none');
  });
});

describe('Pomodoro stats setting', () => {
  it('loadPomodoroStatsEnabled returns false by default', () => {
    expect(loadPomodoroStatsEnabled()).toBe(false);
  });

  it('loadPomodoroStatsEnabled reads localStorage', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    expect(loadPomodoroStatsEnabled()).toBe(true);
  });

  it('loadPomodoroStatsEnabled returns false for non-true values', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'false');
    expect(loadPomodoroStatsEnabled()).toBe(false);
  });
});

describe('Pomodoro completion event', () => {
  it('records session when pomodoroSessionCompleted event is dispatched', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    const before = getPomodoroSessionsToday();
    window.dispatchEvent(new CustomEvent('pomodoroSessionCompleted', { detail: { minutes: 25 } }));
    expect(getPomodoroSessionsToday()).toBe(before + 1);
  });

  it('dispatches pomodoroStatsUpdated when session recorded', () => {
    localStorage.setItem('pomodoroStatsEnabled', 'true');
    let updated = false;
    const handler = () => { updated = true; };
    window.addEventListener('pomodoroStatsUpdated', handler);
    recordPomodoroSession({ minutes: 25 });
    window.removeEventListener('pomodoroStatsUpdated', handler);
    expect(updated).toBe(true);
  });
});
