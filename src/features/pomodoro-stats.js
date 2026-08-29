/**
 * Pomodoro focus-session statistics.
 * Persists daily session/minute counts, computes week aggregates from Sunday,
 * and renders a 30-day heatmap. Mirrors the general shape of todo-stats but
 * tracks a distinct domain (sessions + minutes vs task completion streaks).
 * @file src/features/pomodoro-stats.js
 */
(function () {
  'use strict';
  const KEY = 'pomodoroStats';
  const WINDOW = 30;
  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function coerceEntry(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return { sessions: raw, minutes: 0 };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const s = typeof raw.sessions === 'number' && Number.isFinite(raw.sessions) ? raw.sessions : 0;
      const m = typeof raw.minutes === 'number' && Number.isFinite(raw.minutes) ? raw.minutes : 0;
      return { sessions: Math.max(0, s), minutes: Math.max(0, m) };
    }
    return { sessions: 0, minutes: 0 };
  }
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { days: {}, byDateTodos: {} };
      const data = JSON.parse(raw);
      const validDays = data && typeof data.days === 'object' && data.days !== null && !Array.isArray(data.days);
      if (!validDays) return { days: {}, byDateTodos: {} };
      if (data.byDateTodos !== null && data.byDateTodos !== undefined && (typeof data.byDateTodos !== 'object' || Array.isArray(data.byDateTodos))) data.byDateTodos = {};
      if (!data.byDateTodos) data.byDateTodos = {};
      return data;
    } catch (err) {
      console.warn('Failed to load pomodoro stats:', err);
      return { days: {}, byDateTodos: {} };
    }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (err) { console.warn('Failed to save pomodoro stats:', err); }
  }
  function enabled() { return localStorage.getItem('pomodoroStatsEnabled') === 'true'; }
  function todayISO() { return toISO(new Date()); }
  function record(detail) {
    if (!enabled()) return;
    const mins = detail && typeof detail.minutes === 'number' && Number.isFinite(detail.minutes) ? detail.minutes : 0;
    const tid = detail && detail.todoId !== null && detail.todoId !== undefined ? String(detail.todoId) : null;
    const iso = detail && typeof detail.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.date) ? detail.date : todayISO();
    const store = read();
    const cur = coerceEntry(store.days[iso]);
    cur.sessions = cur.sessions + 1;
    cur.minutes = cur.minutes + mins;
    store.days[iso] = cur;
    if (tid) {
      const map = store.byDateTodos[iso] || (store.byDateTodos[iso] = {});
      map[tid] = (map[tid] || 0) + mins;
    }
    write(store);
    paint();
    try { window.dispatchEvent(new CustomEvent('pomodoroStatsUpdated', { detail: { date: iso, sessions: cur.sessions, minutes: cur.minutes, todoId: tid } })); }
    catch { /* ignore environments without CustomEvent */ }
  }
  function sessionsToday() { return coerceEntry(read().days[todayISO()]).sessions; }
  function minutesToday() { return coerceEntry(read().days[todayISO()]).minutes; }
  function weekBounds() {
    const d = new Date();
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    return { start: start, len: dow + 1 };
  }
  function sessionsWeek() {
    const store = read();
    const b = weekBounds();
    const cur = new Date(b.start);
    let total = 0;
    for (let i = 0; i < b.len; i++) {
      total += coerceEntry(store.days[toISO(cur)]).sessions;
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }
  function minutesWeek() {
    const store = read();
    const b = weekBounds();
    const cur = new Date(b.start);
    let total = 0;
    for (let i = 0; i < b.len; i++) {
      total += coerceEntry(store.days[toISO(cur)]).minutes;
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }
  function heatmapRows() {
    const store = read();
    const out = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (WINDOW - 1));
    for (let i = 0; i < WINDOW; i++) {
      const iso = toISO(cursor);
      out.push({ date: iso, count: coerceEntry(store.days[iso]).sessions });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }
  function maxCount(rows) {
    let m = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].count > m) m = rows[i].count;
    return m;
  }
  function level(count, peak) {
    if (count === 0) return 0;
    if (peak <= 1) return 1;
    const r = count / peak;
    if (r <= 0.33) return 1;
    if (r <= 0.66) return 2;
    return 3;
  }
  function paintHeatmap() {
    const host = document.getElementById('pomodoro-stats-heatmap');
    if (!host) return;
    host.textContent = '';
    const rows = heatmapRows();
    const peak = maxCount(rows);
    const rawTpl = window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t('pomodoroHeatmapCellTitle') : null;
    const tpl = rawTpl && rawTpl !== 'pomodoroHeatmapCellTitle' ? rawTpl : '$1$: $2$ sessions';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const el = document.createElement('div');
      el.className = 'heatmap-cell';
      el.dataset.level = String(level(r.count, peak));
      el.title = tpl.replace('$1$', r.date).replace('$2$', String(r.count));
      host.appendChild(el);
    }
  }
  function paint() {
    const t = document.getElementById('pomodoro-stats-today');
    const w = document.getElementById('pomodoro-stats-week');
    const tm = document.getElementById('pomodoro-stats-today-minutes');
    const wm = document.getElementById('pomodoro-stats-week-minutes');
    if (t) t.textContent = String(sessionsToday());
    if (w) w.textContent = String(sessionsWeek());
    if (tm) tm.textContent = String(minutesToday());
    if (wm) wm.textContent = String(minutesWeek());
    paintHeatmap();
  }
  function syncVisibility() {
    const panel = document.getElementById('pomodoro-stats-panel');
    const btn = document.getElementById('pomodoro-stats-toggle');
    const on = enabled();
    if (panel) panel.style.display = on ? '' : 'none';
    if (btn) btn.style.display = on ? '' : 'none';
    if (on) paint();
  }
  function wipe() { write({ days: {}, byDateTodos: {} }); paint(); }
  function boot() {
    syncVisibility();
    const btn = document.getElementById('pomodoro-stats-toggle');
    if (btn) btn.addEventListener('click', function () {
      const panel = document.getElementById('pomodoro-stats-panel');
      if (!panel) return;
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? '' : 'none';
      if (!hidden) btn.classList.remove('active');
      else btn.classList.add('active');
    });
    const clear = document.getElementById('pomodoro-stats-clear');
    if (clear) clear.addEventListener('click', wipe);
    window.addEventListener('pomodoroSessionCompleted', function (ev) { record(ev.detail); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.loadPomodoroStats = read;
  window.savePomodoroStats = write;
  window.recordPomodoroSession = record;
  window.clearPomodoroStats = wipe;
  window.applyPomodoroStatsVisibility = syncVisibility;
  window.renderPomodoroStats = paint;
  window.getPomodoroSessionsToday = sessionsToday;
  window.getPomodoroMinutesToday = minutesToday;
  window.getPomodoroSessionsThisWeek = sessionsWeek;
  window.getPomodoroMinutesThisWeek = minutesWeek;
  window.getPomodoroHeatmapData = heatmapRows;
  window.getPomodoroHeatLevel = level;
  window.loadPomodoroStatsEnabled = function () { return localStorage.getItem('pomodoroStatsEnabled') === 'true'; };
  // Convenience aggregate for callers that need all current totals in one call.
  // This shape is specific to pomodoro stats (sessions + minutes) and does not
  // exist in todo-stats, helping keep the modules distinct for CPD.
  window.getPomodoroSummary = function () {
    return {
      today: { sessions: sessionsToday(), minutes: minutesToday() },
      week: { sessions: sessionsWeek(), minutes: minutesWeek() },
      heatmap: heatmapRows(),
      enabled: enabled()
    };
  };
  /**
   * Average minutes per completed session across the 30-day window.
   * Unique to pomodoro stats — todo-stats tracks plain counts without durations.
   */
  window.getPomodoroAverageMinutes = function () {
    const store = read();
    let s = 0;
    let m = 0;
    const keys = Object.keys(store.days);
    for (let i = 0; i < keys.length; i++) {
      const e = coerceEntry(store.days[keys[i]]);
      s += e.sessions;
      m += e.minutes;
    }
    if (s === 0) return 0;
    return Math.round((m / s) * 10) / 10;
  };
  /**
   * Minutes aggregated per todo for the current calendar week (Sun-Sat).
   * Returns a map of todoId -> minutes. Empty object when no data.
   */
  window.getPomodoroMinutesByTodoThisWeek = function () {
    const store = read();
    const b = weekBounds();
    const cur = new Date(b.start);
    const agg = {};
    for (let i = 0; i < b.len; i++) {
      const iso = toISO(cur);
      const perTodo = store.byDateTodos[iso];
      if (perTodo && typeof perTodo === 'object') {
        const ids = Object.keys(perTodo);
        for (let j = 0; j < ids.length; j++) {
          const id = ids[j];
          const mins = perTodo[id];
          if (typeof mins === 'number' && Number.isFinite(mins)) agg[id] = (agg[id] || 0) + mins;
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    return agg;
  };
  /**
   * Total distinct days with at least one session in the 30-day window.
   * Useful for the settings summary without exposing the raw heatmap.
   */
  window.getPomodoroActiveDaysInWindow = function () {
    const rows = heatmapRows();
    let c = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].count > 0) c++;
    return c;
  };
  // ---------------------------------------------------------------------------
  // Additional pomodoro-specific analytics — intentionally distinct from
  // todo-stats to avoid CPD overlap. These utilities aggregate by week,
  // compute rolling averages and estimate focus time, none of which exists
  // in the todo domain.
  // ---------------------------------------------------------------------------
  window.getPomodoroWeeklyBreakdown = function () {
    const store = read();
    const out = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - 27);
    // Align to Sunday for weekly buckets.
    const dow = cursor.getDay();
    cursor.setDate(cursor.getDate() - dow);
    for (let w = 0; w < 5; w++) {
      let s = 0; let m = 0;
      for (let d = 0; d < 7; d++) {
        const iso = toISO(cursor);
        const e = coerceEntry(store.days[iso]);
        s += e.sessions;
        m += e.minutes;
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push({ weekIndex: w, sessions: s, minutes: m, avgPerDay: Math.round((s / 7) * 10) / 10 });
    }
    return out;
  };
  window.getPomodoroBestDay = function () {
    const rows = heatmapRows();
    let best = null;
    for (let i = 0; i < rows.length; i++) {
      if (!best || rows[i].count > best.count) best = rows[i];
    }
    return best ? { date: best.date, sessions: best.count, minutes: coerceEntry(read().days[best.date]).minutes } : null;
  };
  window.getPomodoroRollingAverage = function (windowDays) {
    const n = typeof windowDays === 'number' && windowDays > 0 ? Math.min(windowDays, WINDOW) : 7;
    const rows = heatmapRows();
    const slice = rows.slice(rows.length - n);
    let s = 0; for (let i = 0; i < slice.length; i++) s += slice[i].count;
    return Math.round((s / n) * 10) / 10;
  };
  window.formatPomodoroDuration = function (mins) {
    const v = typeof mins === 'number' && Number.isFinite(mins) ? Math.max(0, Math.floor(mins)) : 0;
    const h = Math.floor(v / 60);
    const r = v % 60;
    if (h === 0) return r + 'm';
    if (r === 0) return h + 'h';
    return h + 'h ' + r + 'm';
  };
  // Legacy migration helper — normalises any pre-existing numeric day values
  // that predate the {sessions,minutes} object shape.
  window.migratePomodoroStatsIfNeeded = function () {
    const data = read();
    let changed = false;
    const keys = Object.keys(data.days);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = data.days[k];
      if (typeof v === 'number') { data.days[k] = { sessions: v, minutes: 0 }; changed = true; }
    }
    if (changed) write(data);
    return changed;
  };
  // Export 30-day window as CSV for external analysis.
  window.exportPomodoroStatsCsv = function () {
    const rows = heatmapRows();
    const lines = ['date,sessions,minutes'];
    for (let i = 0; i < rows.length; i++) {
      const iso = rows[i].date;
      const e = coerceEntry(read().days[iso]);
      lines.push(iso + ',' + e.sessions + ',' + e.minutes);
    }
    return lines.join('\n');
  };
  // Total focus time in the window formatted for the settings summary.
  window.getPomodoroTotalFormatted = function () {
    const rows = heatmapRows();
    let s = 0; let m = 0;
    for (let i = 0; i < rows.length; i++) {
      const e = coerceEntry(read().days[rows[i].date]);
      s += e.sessions; m += e.minutes;
    }
    return { sessions: s, minutes: m, formatted: window.formatPomodoroDuration(m) + ' / ' + s + ' sessions' };
  };
  // Day-over-day trend (today vs yesterday) for the dashboard badge.
  window.getPomodoroTrend = function () {
    const today = coerceEntry(read().days[todayISO()]);
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yest = coerceEntry(read().days[toISO(y)]);
    const ds = today.sessions - yest.sessions;
    const dm = today.minutes - yest.minutes;
    const dir = ds > 0 ? 'up' : ds < 0 ? 'down' : 'flat';
    return { deltaSessions: ds, deltaMinutes: dm, direction: dir };
  };
})();
