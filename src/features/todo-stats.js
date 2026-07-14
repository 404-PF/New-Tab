// src/features/todo-stats.js - Daily focus stats dashboard

(function () {
  'use strict';

  const STORAGE_KEY = 'todoStats';
  const HEATMAP_DAYS = 30;

  function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { days: {}, currentStreak: 0, longestStreak: 0 };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.days !== 'object') return { days: {}, currentStreak: 0, longestStreak: 0 };
      return parsed;
    } catch (e) {
      console.warn('Failed to load todo stats:', e);
      return { days: {}, currentStreak: 0, longestStreak: 0 };
    }
  }

  function saveStats(stats) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn('Failed to save todo stats:', e);
    }
  }

  function recalculateStreaks(stats) {
    let longest = 0;
    let streak = 0;
    const allDates = new Set(Object.keys(stats.days));

    // Calculate longest streak from all historical data
    const sortedDates = Object.keys(stats.days).sort();
    let prevDate = null;
    for (const dateStr of sortedDates) {
      if (stats.days[dateStr] > 0) {
        // Check if this date is consecutive to the previous date
        if (prevDate !== null) {
          const prev = new Date(prevDate);
          const curr = new Date(dateStr);
          prev.setDate(prev.getDate() + 1);
          const isConsecutive = prev.getFullYear() === curr.getFullYear() &&
                                prev.getMonth() === curr.getMonth() &&
                                prev.getDate() === curr.getDate();
          if (isConsecutive) {
            streak++;
          } else {
            streak = 1;
          }
        } else {
          streak = 1;
        }
        if (streak > longest) longest = streak;
        prevDate = dateStr;
      } else {
        streak = 0;
        prevDate = null;
      }
    }

    // Calculate current streak by walking backwards from today
    let current = 0;
    const d = new Date();
    while (true) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (allDates.has(dateStr) && stats.days[dateStr] > 0) {
        current++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    stats.currentStreak = current;
    stats.longestStreak = longest;
  }

  function recordCompletion() {
    if (!isStatsEnabled()) return;
    const stats = loadStats();
    const today = getToday();
    stats.days[today] = (stats.days[today] || 0) + 1;
    recalculateStreaks(stats);
    saveStats(stats);
    renderStats();
  }

  function getCompletedToday() {
    const stats = loadStats();
    return stats.days[getToday()] || 0;
  }

  function getCompletedThisWeek() {
    const stats = loadStats();
    let count = 0;
    const d = new Date();
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    for (let i = 0; i <= dayOfWeek; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      count += stats.days[dateStr] || 0;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function getHeatmapData() {
    const stats = loadStats();
    const data = [];
    const d = new Date();
    d.setDate(d.getDate() - (HEATMAP_DAYS - 1));
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      data.push({ date: dateStr, count: stats.days[dateStr] || 0 });
      d.setDate(d.getDate() + 1);
    }
    return data;
  }

  function getMaxHeatmapCount() {
    const data = getHeatmapData();
    let max = 0;
    for (const entry of data) {
      if (entry.count > max) max = entry.count;
    }
    return max;
  }

  function getHeatLevel(count, maxCount) {
    if (count === 0) return 0;
    if (maxCount <= 1) return 1;
    const ratio = count / maxCount;
    if (ratio <= 0.33) return 1;
    if (ratio <= 0.66) return 2;
    return 3;
  }

  function renderHeatmap() {
    const container = document.getElementById('todo-stats-heatmap');
    if (!container) return;

    container.innerHTML = '';
    const data = getHeatmapData();
    const maxCount = getMaxHeatmapCount();

    for (const entry of data) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.level = String(getHeatLevel(entry.count, maxCount));
      const titleTemplate = window.i18n?.heatmapCellTitle?.message || '$1$: $2$ completed';
      cell.title = titleTemplate.replace('$1$', entry.date).replace('$2$', String(entry.count));
      container.appendChild(cell);
    }
  }

  function renderStats() {
    if (!isStatsEnabled()) return;

    const stats = loadStats();
    recalculateStreaks(stats);
    saveStats(stats);

    const todayEl = document.getElementById('todo-stats-today');
    const weekEl = document.getElementById('todo-stats-week');
    const currentStreakEl = document.getElementById('todo-stats-current-streak');
    const longestStreakEl = document.getElementById('todo-stats-longest-streak');

    if (todayEl) todayEl.textContent = String(getCompletedToday());
    if (weekEl) weekEl.textContent = String(getCompletedThisWeek());
    if (currentStreakEl) currentStreakEl.textContent = String(stats.currentStreak);
    if (longestStreakEl) longestStreakEl.textContent = String(stats.longestStreak);

    renderHeatmap();
  }

  function isStatsEnabled() {
    return localStorage.getItem('todoStatsEnabled') === 'true';
  }

  function applyStatsVisibility() {
    const panel = document.getElementById('todo-stats-panel');
    const toggle = document.getElementById('todo-stats-toggle');
    const enabled = isStatsEnabled();
    if (panel) panel.style.display = enabled ? '' : 'none';
    if (toggle) toggle.style.display = enabled ? '' : 'none';
    if (enabled) renderStats();
  }

  function clearStats() {
    saveStats({ days: {}, currentStreak: 0, longestStreak: 0 });
    renderStats();
  }

  function initTodoStats() {
    applyStatsVisibility();

    const toggle = document.getElementById('todo-stats-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const panel = document.getElementById('todo-stats-panel');
        if (panel) {
          const isVisible = panel.style.display !== 'none';
          panel.style.display = isVisible ? 'none' : '';
          toggle.classList.toggle('active', !isVisible);
        }
      });
    }

    const clearBtn = document.getElementById('todo-stats-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearStats);
    }

    window.addEventListener('todoCompleted', recordCompletion);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTodoStats);
  } else {
    initTodoStats();
  }

  window.loadTodoStats = loadStats;
  window.saveTodoStats = saveStats;
  window.recordTodoCompletion = recordCompletion;
  window.clearTodoStats = clearStats;
  window.applyTodoStatsVisibility = applyStatsVisibility;
  window.renderTodoStats = renderStats;
  window.loadTodoStatsEnabled = function () {
    return localStorage.getItem('todoStatsEnabled') === 'true';
  };
  window.getCompletedToday = getCompletedToday;
  window.getCompletedThisWeek = getCompletedThisWeek;

})();
