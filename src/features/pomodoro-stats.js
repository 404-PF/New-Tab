// src/features/pomodoro-stats.js - Pomodoro focus-session statistics

(function () {
  'use strict';

  const STORAGE_KEY = 'pomodoroStats';
  const HEATMAP_DAYS = 30;

  function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function normalizeDayEntry(entry) {
    if (typeof entry === 'number') return { sessions: entry, minutes: 0 };
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return {
        sessions: typeof entry.sessions === 'number' ? entry.sessions : 0,
        minutes: typeof entry.minutes === 'number' ? entry.minutes : 0
      };
    }
    return { sessions: 0, minutes: 0 };
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { days: {}, byDateTodos: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.days !== 'object' || parsed.days === null || Array.isArray(parsed.days)) return { days: {}, byDateTodos: {} };
      if (parsed.byDateTodos !== undefined && (typeof parsed.byDateTodos !== 'object' || parsed.byDateTodos === null || Array.isArray(parsed.byDateTodos))) {
        parsed.byDateTodos = {};
      }
      if (!parsed.byDateTodos) parsed.byDateTodos = {};
      return parsed;
    } catch (e) {
      console.warn('Failed to load pomodoro stats:', e);
      return { days: {}, byDateTodos: {} };
    }
  }

  function saveStats(stats) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn('Failed to save pomodoro stats:', e);
    }
  }

  function isStatsEnabled() {
    return localStorage.getItem('pomodoroStatsEnabled') === 'true';
  }

  function recordSession(detail) {
    if (!isStatsEnabled()) return;
    const minutes = detail && typeof detail.minutes === 'number' ? detail.minutes : 0;
    const todoId = detail && detail.todoId ? String(detail.todoId) : null;
    const today = (detail && typeof detail.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.date)) ? detail.date : getToday();
    const stats = loadStats();

    const current = normalizeDayEntry(stats.days[today]);
    current.sessions += 1;
    current.minutes += minutes;
    stats.days[today] = current;

    if (todoId) {
      stats.byDateTodos[today] = stats.byDateTodos[today] || {};
      stats.byDateTodos[today][todoId] = (stats.byDateTodos[today][todoId] || 0) + minutes;
    }

    saveStats(stats);
    renderStats();
    try {
      window.dispatchEvent(new CustomEvent('pomodoroStatsUpdated', { detail: { date: today, sessions: current.sessions, minutes: current.minutes, todoId } }));
    } catch { /* ignore */ }
  }

  function getSessionsToday() {
    const stats = loadStats();
    return normalizeDayEntry(stats.days[getToday()]).sessions;
  }

  function getMinutesToday() {
    const stats = loadStats();
    return normalizeDayEntry(stats.days[getToday()]).minutes;
  }

  function getSessionsThisWeek() {
    const stats = loadStats();
    let count = 0;
    const d = new Date();
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    for (let i = 0; i <= dayOfWeek; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      count += normalizeDayEntry(stats.days[dateStr]).sessions;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function getMinutesThisWeek() {
    const stats = loadStats();
    let count = 0;
    const d = new Date();
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    for (let i = 0; i <= dayOfWeek; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      count += normalizeDayEntry(stats.days[dateStr]).minutes;
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
      data.push({ date: dateStr, count: normalizeDayEntry(stats.days[dateStr]).sessions });
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
    const container = document.getElementById('pomodoro-stats-heatmap');
    if (!container) return;

    container.innerHTML = '';
    const data = getHeatmapData();
    const maxCount = getMaxHeatmapCount();

    for (const entry of data) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.level = String(getHeatLevel(entry.count, maxCount));
      const titleTemplate = (window.i18n && typeof window.i18n.t === 'function')
        ? window.i18n.t('pomodoroHeatmapCellTitle')
        : '$1$: $2$ sessions';
      // pomodoroHeatmapCellTitle may return key itself if missing; fallback
      const template = titleTemplate && titleTemplate !== 'pomodoroHeatmapCellTitle' ? titleTemplate : '$1$: $2$ sessions';
      cell.title = template.replace('$1$', entry.date).replace('$2$', String(entry.count));
      container.appendChild(cell);
    }
  }

  function renderStats() {
    const stats = loadStats();

    const todayEl = document.getElementById('pomodoro-stats-today');
    const weekEl = document.getElementById('pomodoro-stats-week');
    const todayMinutesEl = document.getElementById('pomodoro-stats-today-minutes');
    const weekMinutesEl = document.getElementById('pomodoro-stats-week-minutes');

    if (todayEl) todayEl.textContent = String(getSessionsToday());
    if (weekEl) weekEl.textContent = String(getSessionsThisWeek());
    if (todayMinutesEl) todayMinutesEl.textContent = String(getMinutesToday());
    if (weekMinutesEl) weekMinutesEl.textContent = String(getMinutesThisWeek());

    // keep streak-like storage tidy if previously migrated
    if (stats.days) {
      // ensure normalization already applied via getters; no recalc needed
    }

    renderHeatmap();
  }

  function applyStatsVisibility() {
    const panel = document.getElementById('pomodoro-stats-panel');
    const toggle = document.getElementById('pomodoro-stats-toggle');
    const enabled = isStatsEnabled();
    if (panel) panel.style.display = enabled ? '' : 'none';
    if (toggle) toggle.style.display = enabled ? '' : 'none';
    if (enabled) renderStats();
  }

  function clearStats() {
    saveStats({ days: {}, byDateTodos: {} });
    renderStats();
  }

  function initPomodoroStats() {
    applyStatsVisibility();

    const toggle = document.getElementById('pomodoro-stats-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        const panel = document.getElementById('pomodoro-stats-panel');
        if (panel) {
          const isVisible = panel.style.display !== 'none';
          panel.style.display = isVisible ? 'none' : '';
          toggle.classList.toggle('active', !isVisible);
        }
      });
    }

    const clearBtn = document.getElementById('pomodoro-stats-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearStats);
    }

    window.addEventListener('pomodoroSessionCompleted', function (e) {
      recordSession(e.detail);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPomodoroStats);
  } else {
    initPomodoroStats();
  }

  window.loadPomodoroStats = loadStats;
  window.savePomodoroStats = saveStats;
  window.recordPomodoroSession = recordSession;
  window.clearPomodoroStats = clearStats;
  window.applyPomodoroStatsVisibility = applyStatsVisibility;
  window.renderPomodoroStats = renderStats;
  window.getPomodoroSessionsToday = getSessionsToday;
  window.getPomodoroMinutesToday = getMinutesToday;
  window.getPomodoroSessionsThisWeek = getSessionsThisWeek;
  window.getPomodoroMinutesThisWeek = getMinutesThisWeek;
  window.getPomodoroHeatmapData = getHeatmapData;
  window.getPomodoroHeatLevel = getHeatLevel;
  window.loadPomodoroStatsEnabled = function () {
    return localStorage.getItem('pomodoroStatsEnabled') === 'true';
  };

})();
