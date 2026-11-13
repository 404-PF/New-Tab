// src/features/todo-stats.js - Daily focus stats dashboard

(function () {
  'use strict';

  const STORAGE_KEY = 'todoStats';
  const HEATMAP_DAYS = 30;
  const RETENTION_DAYS = 90;

  // Raw-string-keyed parse cache, mirroring games/game-registry.js: repeat
  // reads of unchanged data return the cached object instead of re-parsing.
  // Invalidated on every write path (see saveStats).
  let statsCacheRaw;
  let statsCache = null;

  function emptyStats() {
    return { days: {}, currentStreak: 0, longestStreak: 0 };
  }

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getToday() {
    return formatDate(new Date());
  }

  function loadStats() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to load todo stats:', e);
      statsCacheRaw = undefined;
      statsCache = emptyStats();
      return statsCache;
    }
    if (raw === statsCacheRaw && statsCache !== null) return statsCache;
    statsCacheRaw = raw;
    if (!raw) {
      statsCache = emptyStats();
      return statsCache;
    }
    try {
      const parsed = JSON.parse(raw);
      statsCache = (parsed && typeof parsed.days === 'object' && parsed.days !== null && !Array.isArray(parsed.days))
        ? parsed
        : emptyStats();
    } catch (e) {
      console.warn('Failed to load todo stats:', e);
      statsCache = emptyStats();
    }
    return statsCache;
  }

  function saveStats(stats) {
    // Invalidate first so a failed write cannot serve a mutated cache.
    statsCacheRaw = undefined;
    statsCache = null;
    try {
      return localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save todo stats:', e);
      return false;
    }
  }

  function showStatsSaveError() {
    if (typeof window.showToast === 'function') {
      window.showToast(window.i18n ? window.i18n.t('todoSaveError') : 'Failed to save todo changes. Your last action was not saved.', 'error');
    } else {
      console.warn('showToast unavailable: failed to save todo stats');
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
          const [py, pm, pd] = prevDate.split('-').map(Number);
          const [cy, cm, cd] = dateStr.split('-').map(Number);
          const prev = new Date(py, pm - 1, pd);
          const curr = new Date(cy, cm - 1, cd);
          prev.setDate(prev.getDate() + 1);
          const isConsecutive = prev.getTime() === curr.getTime();
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
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Grace period: if today has no completions, start checking from yesterday
    if (!allDates.has(todayStr) || stats.days[todayStr] === 0) {
      d.setDate(d.getDate() - 1);
    }

    while (true) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (allDates.has(dateStr) && stats.days[dateStr] > 0) {
        current++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    // Keep the best streak ever observed: pruned history can no longer prove
    // a longest streak that ran longer than the retention window.
    stats.currentStreak = current;
    stats.longestStreak = Math.max(longest, Number.isFinite(stats.longestStreak) ? stats.longestStreak : 0);
  }

  // Drop days outside the retention window so the key cannot grow forever.
  // An active streak longer than the window keeps its own days so the current
  // streak walk never breaks mid-streak.
  function pruneOldDays(stats) {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - (RETENTION_DAYS - 1));
    let cutoff = formatDate(retentionDate);
    const streakDate = new Date();
    streakDate.setDate(streakDate.getDate() - (stats.currentStreak || 0));
    const streakCutoff = formatDate(streakDate);
    if (streakCutoff < cutoff) cutoff = streakCutoff;
    Object.keys(stats.days).forEach(function (dateStr) {
      if (dateStr < cutoff) delete stats.days[dateStr];
    });
  }

  function recordCompletion(event) {
    if (!isStatsEnabled()) return;
    const stats = loadStats();
    const today = getToday();

    // Deduplicate per-todo so re-checking the same todo on the same day does
    // not inflate the daily/weekly counts or the heatmap.
    const id = event && event.detail && event.detail.id;
    if (id) {
      stats.completedIds = stats.completedIds || {};
      const todaysIds = stats.completedIds[today] || (stats.completedIds[today] = []);
      Object.keys(stats.completedIds).forEach(function (d) {
        if (d !== today) delete stats.completedIds[d];
      });
      if (todaysIds.indexOf(id) !== -1) {
        renderStats();
        return;
      }
      todaysIds.push(id);
    }

    stats.days[today] = (stats.days[today] || 0) + 1;
    recalculateStreaks(stats);
    pruneOldDays(stats);
    const saved = saveStats(stats);
    renderStats();
    if (!saved) showStatsSaveError();
  }

  function getCompletedToday(stats) {
    const data = stats || loadStats();
    return data.days[getToday()] || 0;
  }

  function getCompletedThisWeek(stats) {
    const data = stats || loadStats();
    let count = 0;
    const d = new Date();
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    for (let i = 0; i <= dayOfWeek; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      count += data.days[dateStr] || 0;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function getHeatmapData(stats) {
    const data = stats || loadStats();
    const rows = [];
    const d = new Date();
    d.setDate(d.getDate() - (HEATMAP_DAYS - 1));
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      rows.push({ date: dateStr, count: data.days[dateStr] || 0 });
      d.setDate(d.getDate() + 1);
    }
    return rows;
  }

  function getMaxHeatmapCount(stats) {
    const data = getHeatmapData(stats);
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

  // Summary helpers over the 30-day heatmap window (issue #1225). Day values
  // are plain completion counts, unlike pomodoro's {sessions, minutes} rows.
  function getTodoStatsTotal(stats) {
    const rows = getHeatmapData(stats);
    let total = 0;
    for (const row of rows) total += row.count;
    return total;
  }

  function getTodoStatsTrend(stats) {
    const data = stats || loadStats();
    const today = data.days[getToday()] || 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const delta = today - (data.days[formatDate(yesterday)] || 0);
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return { deltaCompletions: delta, direction: direction };
  }

  // Compact day-over-day trend for the summary card: arrow plus signed
  // completion delta (e.g. "↑ +2"), language-neutral so no translation is
  // needed. Mirrors pomodoro-stats.js formatTrend.
  function formatTodoStatsTrend(trend) {
    const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
    const delta = trend.deltaCompletions;
    return arrow + ' ' + (delta > 0 ? '+' + delta : String(delta));
  }

  function getTodoStatsBestDay(stats) {
    const rows = getHeatmapData(stats);
    let best = null;
    for (const row of rows) {
      if (!best || row.count > best.count) best = row;
    }
    return best;
  }

  function formatTodoStatsBestDay(stats) {
    const best = getTodoStatsBestDay(stats);
    return best && best.count > 0 ? best.date + ' (' + best.count + ')' : '—';
  }

  function getTodoStatsRollingAverage(windowDays, stats) {
    const n = typeof windowDays === 'number' && windowDays > 0 ? Math.min(windowDays, HEATMAP_DAYS) : 7;
    const rows = getHeatmapData(stats);
    const slice = rows.slice(rows.length - n);
    let total = 0;
    for (const row of slice) total += row.count;
    return Math.round((total / n) * 10) / 10;
  }

  function renderHeatmap(stats) {
    const container = document.getElementById('todo-stats-heatmap');
    if (!container) return;

    container.innerHTML = '';
    const data = getHeatmapData(stats);
    const maxCount = getMaxHeatmapCount(stats);

    for (const entry of data) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.level = String(getHeatLevel(entry.count, maxCount));
      const titleTemplate = (window.i18n && typeof window.i18n.t === 'function')
        ? window.i18n.t('heatmapCellTitle')
        : '$1$: $2$ completed';
      cell.title = titleTemplate.replace('$1$', entry.date).replace('$2$', String(entry.count));
      container.appendChild(cell);
    }
  }

  // Summary row below the heatmap: 30-day total, day-over-day trend, best
  // day and 7-day average completions per day (issue #1225).
  function paintSummary(stats) {
    const data = stats || loadStats();
    const total = document.getElementById('todo-stats-total');
    const trend = document.getElementById('todo-stats-trend');
    const best = document.getElementById('todo-stats-best-day');
    const avg = document.getElementById('todo-stats-rolling-avg');
    if (total) total.textContent = String(getTodoStatsTotal(data));
    if (trend) trend.textContent = formatTodoStatsTrend(getTodoStatsTrend(data));
    if (best) best.textContent = formatTodoStatsBestDay(data);
    if (avg) avg.textContent = String(getTodoStatsRollingAverage(7, data));
  }

  function renderStats() {
    if (!isStatsEnabled()) return;

    const stats = loadStats();
    // Read-only render: recalculate in memory for display, never persist here.
    recalculateStreaks(stats);

    const todayEl = document.getElementById('todo-stats-today');
    const weekEl = document.getElementById('todo-stats-week');
    const currentStreakEl = document.getElementById('todo-stats-current-streak');
    const longestStreakEl = document.getElementById('todo-stats-longest-streak');

    if (todayEl) todayEl.textContent = String(getCompletedToday(stats));
    if (weekEl) weekEl.textContent = String(getCompletedThisWeek(stats));
    if (currentStreakEl) currentStreakEl.textContent = String(stats.currentStreak);
    if (longestStreakEl) longestStreakEl.textContent = String(stats.longestStreak);

    renderHeatmap(stats);
    paintSummary(stats);
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
    const saved = saveStats({ days: {}, currentStreak: 0, longestStreak: 0 });
    renderStats();
    if (!saved) showStatsSaveError();
  }

  // Download the 30-day window (the same rows as the heatmap) as a
  // date,count CSV file. Follows the Blob/anchor pattern from
  // pomodoro-stats.js (issue #1225).
  function exportTodoStatsCsv() {
    const rows = getHeatmapData();
    const lines = ['date,count'];
    for (const row of rows) lines.push(row.date + ',' + row.count);
    return lines.join('\n');
  }

  function exportCsv() {
    const blob = new Blob([exportTodoStatsCsv()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'todo-stats-' + getToday() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    if (typeof window.showToast === 'function') {
      const raw = window.i18n && typeof window.i18n.t === 'function'
        ? window.i18n.t('todoStatsExportSuccess')
        : null;
      window.showToast(raw && raw !== 'todoStatsExportSuccess' ? raw : 'Todo stats download started.', 'success');
    }
  }

  // A synchronous bridge failure both dispatches storageBridgeWriteError and
  // makes setItem return false, so the save caller has already repainted from
  // the rolled-back store and toasted. Only an async rejection (setItem
  // returned true) leaves the panel showing the rejected value, so compare
  // before repainting and notify just for that — same pattern as todo.js.
  function statsPanelDesynced() {
    if (!isStatsEnabled()) return false;
    const stats = loadStats();
    recalculateStreaks(stats);
    const expected = [
      ['todo-stats-today', getCompletedToday(stats)],
      ['todo-stats-week', getCompletedThisWeek(stats)],
      ['todo-stats-current-streak', stats.currentStreak],
      ['todo-stats-longest-streak', stats.longestStreak],
      ['todo-stats-total', getTodoStatsTotal(stats)],
      ['todo-stats-trend', formatTodoStatsTrend(getTodoStatsTrend(stats))],
      ['todo-stats-best-day', formatTodoStatsBestDay(stats)],
      ['todo-stats-rolling-avg', String(getTodoStatsRollingAverage(7, stats))]
    ];
    return expected.some(function (entry) {
      const el = document.getElementById(entry[0]);
      return Boolean(el) && el.textContent !== String(entry[1]);
    });
  }

  window.addEventListener('storageBridgeWriteError', (event) => {
    if (event?.detail?.key !== STORAGE_KEY) return;
    setTimeout(() => {
      const desynced = statsPanelDesynced();
      renderStats();
      if (desynced) showStatsSaveError();
    }, 0);
  });

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

    const exportBtn = document.getElementById('todo-stats-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCsv);
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
  window.getTodoStatsTotal = getTodoStatsTotal;
  window.getTodoStatsTrend = getTodoStatsTrend;
  window.getTodoStatsBestDay = getTodoStatsBestDay;
  window.getTodoStatsRollingAverage = getTodoStatsRollingAverage;
  window.exportTodoStatsCsv = exportTodoStatsCsv;

})();
