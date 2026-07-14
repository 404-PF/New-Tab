import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/features/todo-stats.js');
});

beforeEach(() => {
  localStorage.removeItem('todoStats');
  localStorage.removeItem('todoStatsEnabled');
});

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Todo stats persistence', () => {
  it('loadTodoStats returns empty stats when localStorage is empty', () => {
    const stats = loadTodoStats();
    expect(stats).toEqual({ days: {}, currentStreak: 0, longestStreak: 0 });
  });

  it('saveTodoStats persists to localStorage', () => {
    const stats = { days: { [getToday()]: 3 }, currentStreak: 1, longestStreak: 1 };
    saveTodoStats(stats);
    const loaded = loadTodoStats();
    expect(loaded.days[getToday()]).toBe(3);
    expect(loaded.currentStreak).toBe(1);
    expect(loaded.longestStreak).toBe(1);
  });

  it('loadTodoStats handles corrupted data gracefully', () => {
    localStorage.setItem('todoStats', '{invalid json');
    const stats = loadTodoStats();
    expect(stats).toEqual({ days: {}, currentStreak: 0, longestStreak: 0 });
  });

  it('loadTodoStats handles non-object days gracefully', () => {
    localStorage.setItem('todoStats', JSON.stringify({ days: 'not-an-object' }));
    const stats = loadTodoStats();
    expect(stats).toEqual({ days: {}, currentStreak: 0, longestStreak: 0 });
  });
});

describe('Todo stats recording', () => {
  it('recordTodoCompletion increments today count', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    recordTodoCompletion();
    const stats = loadTodoStats();
    expect(stats.days[getToday()]).toBe(1);
  });

  it('recordTodoCompletion increments existing count', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    recordTodoCompletion();
    recordTodoCompletion();
    const stats = loadTodoStats();
    expect(stats.days[getToday()]).toBe(2);
  });

  it('recordTodoCompletion updates streaks', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    recordTodoCompletion();
    const stats = loadTodoStats();
    expect(stats.currentStreak).toBeGreaterThanOrEqual(1);
    expect(stats.longestStreak).toBeGreaterThanOrEqual(1);
  });
});

describe('Todo stats streak calculation', () => {
  it('calculates correct streak for consecutive days', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    const today = getToday();
    const yesterday = getDateDaysAgo(1);
    const stats = {
      days: { [today]: 1, [yesterday]: 1 },
      currentStreak: 0,
      longestStreak: 0
    };
    saveTodoStats(stats);
    recordTodoCompletion();
    const loaded = loadTodoStats();
    expect(loaded.currentStreak).toBe(2);
  });

  it('breaks streak when a day is missing', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    const today = getToday();
    const twoDaysAgo = getDateDaysAgo(2);
    const stats = {
      days: { [today]: 1, [twoDaysAgo]: 1 },
      currentStreak: 0,
      longestStreak: 0
    };
    saveTodoStats(stats);
    // Trigger recalculation by recording a completion
    recordTodoCompletion();
    const loaded = loadTodoStats();
    expect(loaded.currentStreak).toBe(1);
  });

  it('tracks longest streak correctly', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    const today = getToday();
    const d1 = getDateDaysAgo(1);
    const d2 = getDateDaysAgo(2);
    const d3 = getDateDaysAgo(3);
    const d4 = getDateDaysAgo(4);
    const stats = {
      days: { [today]: 1, [d1]: 1, [d2]: 1, [d3]: 1, [d4]: 1 },
      currentStreak: 0,
      longestStreak: 0
    };
    saveTodoStats(stats);
    // Trigger recalculation by recording a completion
    recordTodoCompletion();
    const loaded = loadTodoStats();
    expect(loaded.longestStreak).toBe(5);
    expect(loaded.currentStreak).toBe(5);
  });
});

describe('Todo stats weekly count', () => {
  it('getCompletedThisWeek returns 0 when no stats exist', () => {
    const count = getCompletedThisWeek();
    expect(count).toBe(0);
  });

  it('records multiple completions on same day', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    recordTodoCompletion();
    recordTodoCompletion();
    recordTodoCompletion();
    const count = getCompletedThisWeek();
    expect(count).toBe(3);
  });
});

describe('Todo stats clear', () => {
  it('clearTodoStats resets all data', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    recordTodoCompletion();
    recordTodoCompletion();
    clearTodoStats();
    const stats = loadTodoStats();
    expect(stats).toEqual({ days: {}, currentStreak: 0, longestStreak: 0 });
  });
});

describe('Todo stats heatmap', () => {
  it('renders heatmap cells when panel is visible', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    applyTodoStatsVisibility();
    renderTodoStats();
    const heatmap = document.getElementById('todo-stats-heatmap');
    expect(heatmap).toBeTruthy();
    expect(heatmap.children.length).toBe(30);
  });

  it('heatmap cells have level attributes', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    applyTodoStatsVisibility();
    renderTodoStats();
    const cells = document.querySelectorAll('.heatmap-cell');
    cells.forEach(cell => {
      expect(cell.dataset.level).toBeDefined();
    });
  });
});

describe('Todo stats visibility', () => {
  it('panel is hidden when stats are disabled', () => {
    localStorage.setItem('todoStatsEnabled', 'false');
    applyTodoStatsVisibility();
    const panel = document.getElementById('todo-stats-panel');
    expect(panel.style.display).toBe('none');
  });

  it('panel is visible when stats are enabled', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    applyTodoStatsVisibility();
    const panel = document.getElementById('todo-stats-panel');
    expect(panel.style.display).not.toBe('none');
  });

  it('toggle button is hidden when stats are disabled', () => {
    localStorage.setItem('todoStatsEnabled', 'false');
    applyTodoStatsVisibility();
    const toggle = document.getElementById('todo-stats-toggle');
    expect(toggle.style.display).toBe('none');
  });

  it('toggle button is visible when stats are enabled', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    applyTodoStatsVisibility();
    const toggle = document.getElementById('todo-stats-toggle');
    expect(toggle.style.display).not.toBe('none');
  });
});

describe('Todo stats setting', () => {
  it('loadTodoStatsEnabled returns false by default', () => {
    expect(loadTodoStatsEnabled()).toBe(false);
  });

  it('loadTodoStatsEnabled reads localStorage', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    expect(loadTodoStatsEnabled()).toBe(true);
  });

  it('loadTodoStatsEnabled returns false for non-true values', () => {
    localStorage.setItem('todoStatsEnabled', 'false');
    expect(loadTodoStatsEnabled()).toBe(false);
  });
});

describe('Todo completion event', () => {
  it('records completion when todoCompleted event is dispatched', () => {
    localStorage.setItem('todoStatsEnabled', 'true');
    const initialCount = getCompletedToday();
    window.dispatchEvent(new CustomEvent('todoCompleted', { detail: { id: 'test-id' } }));
    const updatedCount = getCompletedToday();
    expect(updatedCount).toBe(initialCount + 1);
  });
});
