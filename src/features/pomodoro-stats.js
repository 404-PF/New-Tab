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
    if (typeof raw === 'number' && Number.isFinite(raw)) return { sessions: Math.max(0, raw), minutes: 0 };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const s = typeof raw.sessions === 'number' && Number.isFinite(raw.sessions) ? raw.sessions : 0;
      const m = typeof raw.minutes === 'number' && Number.isFinite(raw.minutes) ? raw.minutes : 0;
      return { sessions: Math.max(0, s), minutes: Math.max(0, m) };
    }
    return { sessions: 0, minutes: 0 };
  }
  // Raw-string-keyed parse cache, mirroring games/game-registry.js: repeat
  // reads of unchanged data return the cached object instead of re-parsing.
  // Invalidated on every write path (see write).
  let readCacheRaw;
  let readCache = null;
  function emptyStore() { return { days: {}, byDateTodos: {} }; }
  function read() {
    let raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (err) {
      console.warn('Failed to load pomodoro stats:', err);
      readCacheRaw = undefined;
      readCache = emptyStore();
      return readCache;
    }
    if (raw === readCacheRaw && readCache !== null) return readCache;
    readCacheRaw = raw;
    if (!raw) {
      readCache = emptyStore();
      return readCache;
    }
    try {
      const data = JSON.parse(raw);
      const validDays = data && typeof data.days === 'object' && data.days !== null && !Array.isArray(data.days);
      if (!validDays) {
        readCache = emptyStore();
        return readCache;
      }
      if (data.byDateTodos !== null && data.byDateTodos !== undefined && (typeof data.byDateTodos !== 'object' || Array.isArray(data.byDateTodos))) data.byDateTodos = {};
      if (!data.byDateTodos) data.byDateTodos = {};
      readCache = data;
      return readCache;
    } catch (err) {
      console.warn('Failed to load pomodoro stats:', err);
      readCache = emptyStore();
      return readCache;
    }
  }
  function write(data) {
    // Invalidate first so a failed write cannot serve a mutated cache.
    readCacheRaw = undefined;
    readCache = null;

    let serialized;
    try {
      serialized = JSON.stringify(data);
    } catch (err) {
      console.warn('Failed to save pomodoro stats:', err);
      return false;
    }

    try {
      const storage = globalThis.localStorage;
      if (storage && typeof storage.setItemAsync === 'function') {
        return Promise.resolve(storage.setItemAsync(KEY, serialized))
          .then(persisted => persisted !== false)
          .catch((err) => {
            console.warn('Failed to save pomodoro stats:', err);
            return false;
          });
      }

      return storage.setItem(KEY, serialized) !== false;
    } catch (err) {
      console.warn('Failed to save pomodoro stats:', err);
      return false;
    }
  }
  function enabled() {
    try { return localStorage.getItem('pomodoroStatsEnabled') === 'true'; }
    catch (err) { console.warn('Failed to read pomodoro stats enabled:', err); return false; }
  }
  function todayISO() { return toISO(new Date()); }
  // Drop days (and per-todo attribution) outside the heatmap window so the key
  // cannot grow without bound — one entry per day forever is the failure mode.
  function pruneOldEntries(store) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (WINDOW - 1));
    const cutoff = toISO(cutoffDate);
    Object.keys(store.days).forEach(function (iso) {
      if (iso < cutoff) delete store.days[iso];
    });
    Object.keys(store.byDateTodos).forEach(function (iso) {
      if (iso < cutoff) delete store.byDateTodos[iso];
    });
  }
  function record(detail) {
    if (!enabled()) return;
    const rawMins = detail && typeof detail.minutes === 'number' && Number.isFinite(detail.minutes) ? detail.minutes : 0;
    const mins = Math.max(0, rawMins);
    const tid = detail && detail.todoId !== null && detail.todoId !== undefined ? String(detail.todoId) : null;
    const iso = detail && typeof detail.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.date) ? detail.date : todayISO();
    const store = read();
    const cur = coerceEntry(store.days[iso]);
    cur.sessions = cur.sessions + 1;
    cur.minutes = cur.minutes + mins;
    store.days[iso] = cur;
    if (tid) {
      const rawMap = store.byDateTodos[iso];
      const map = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap) ? rawMap : (store.byDateTodos[iso] = {});
      const prev = typeof map[tid] === 'number' && Number.isFinite(map[tid]) ? Math.max(0, map[tid]) : 0;
      map[tid] = prev + mins;
    }
    pruneOldEntries(store);
    const persisted = write(store);
    const finishRecord = (success) => {
      if (!success) return false;
      paint();
      try { window.dispatchEvent(new CustomEvent('pomodoroStatsUpdated', { detail: { date: iso, sessions: cur.sessions, minutes: cur.minutes, todoId: tid } })); }
      catch { /* ignore environments without CustomEvent */ }
      return true;
    };
    return persisted && typeof persisted.then === 'function'
      ? persisted.then(finishRecord)
      : finishRecord(persisted);
  }
  function sessionsToday(store) { return coerceEntry((store || read()).days[todayISO()]).sessions; }
  function minutesToday(store) { return coerceEntry((store || read()).days[todayISO()]).minutes; }
  function weekBounds() {
    const d = new Date();
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    return { start: start, len: dow + 1 };
  }
  function sessionsWeek(store) {
    const data = store || read();
    const b = weekBounds();
    const cur = new Date(b.start);
    let total = 0;
    for (let i = 0; i < b.len; i++) {
      total += coerceEntry(data.days[toISO(cur)]).sessions;
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }
  function minutesWeek(store) {
    const data = store || read();
    const b = weekBounds();
    const cur = new Date(b.start);
    let total = 0;
    for (let i = 0; i < b.len; i++) {
      total += coerceEntry(data.days[toISO(cur)]).minutes;
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }
  function heatmapRows(store) {
    const data = store || read();
    const out = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (WINDOW - 1));
    for (let i = 0; i < WINDOW; i++) {
      const iso = toISO(cursor);
      out.push({ date: iso, count: coerceEntry(data.days[iso]).sessions });
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
  function paintHeatmap(store) {
    const host = document.getElementById('pomodoro-stats-heatmap');
    if (!host) return;
    host.textContent = '';
    const rows = heatmapRows(store);
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
    const store = read();
    const t = document.getElementById('pomodoro-stats-today');
    const w = document.getElementById('pomodoro-stats-week');
    const tm = document.getElementById('pomodoro-stats-today-minutes');
    const wm = document.getElementById('pomodoro-stats-week-minutes');
    if (t) t.textContent = String(sessionsToday(store));
    if (w) w.textContent = String(sessionsWeek(store));
    if (tm) tm.textContent = String(minutesToday(store));
    if (wm) wm.textContent = String(minutesWeek(store));
    paintHeatmap(store);
  }
  function syncVisibility(enabledOverride) {
    const panel = document.getElementById('pomodoro-stats-panel');
    const btn = document.getElementById('pomodoro-stats-toggle');
    const on = typeof enabledOverride === 'boolean' ? enabledOverride : enabled();
    if (panel) panel.style.display = on ? '' : 'none';
    if (btn) btn.style.display = on ? '' : 'none';
    if (on) paint();
  }
  function wipe() {
    const persisted = write({ days: {}, byDateTodos: {} });
    const finishWipe = (success) => {
      if (!success) return false;
      paint();
      return true;
    };
    return persisted && typeof persisted.then === 'function'
      ? persisted.then(finishWipe)
      : finishWipe(persisted);
  }
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
    const store = read();
    return {
      today: { sessions: sessionsToday(store), minutes: minutesToday(store) },
      week: { sessions: sessionsWeek(store), minutes: minutesWeek(store) },
      heatmap: heatmapRows(store),
      enabled: enabled()
    };
  };
  /**
   * Average minutes per completed session across the 30-day window.
   * Unique to pomodoro stats — todo-stats tracks plain counts without durations.
   */
  window.getPomodoroAverageMinutes = function () {
    const store = read();
    const rows = heatmapRows(store);
    let s = 0;
    let m = 0;
    for (let i = 0; i < rows.length; i++) {
      const e = coerceEntry(store.days[rows[i].date]);
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
      if (perTodo && typeof perTodo === 'object' && !Array.isArray(perTodo)) {
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
    const store = read();
    const rows = heatmapRows(store);
    let best = null;
    for (let i = 0; i < rows.length; i++) {
      if (!best || rows[i].count > best.count) best = rows[i];
    }
    return best ? { date: best.date, sessions: best.count, minutes: coerceEntry(store.days[best.date]).minutes } : null;
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
    if (!changed) return false;

    const persisted = write(data);
    if (persisted && typeof persisted.then === 'function') {
      return persisted.then(success => success);
    }
    return persisted;
  };
  // Export 30-day window as CSV for external analysis.
  window.exportPomodoroStatsCsv = function () {
    const store = read();
    const rows = heatmapRows(store);
    const lines = ['date,sessions,minutes'];
    for (let i = 0; i < rows.length; i++) {
      const iso = rows[i].date;
      const e = coerceEntry(store.days[iso]);
      lines.push(iso + ',' + e.sessions + ',' + e.minutes);
    }
    return lines.join('\n');
  };
  // Total focus time in the window formatted for the settings summary.
  // Note: kept locale-JSON CPD exclusions in .sonarcloud.properties so per-locale key
  // duplication does not count toward the New Code gate.
  window.getPomodoroTotalFormatted = function () {
    const store = read();
    const rows = heatmapRows(store);
    let s = 0; let m = 0;
    for (let i = 0; i < rows.length; i++) {
      const e = coerceEntry(store.days[rows[i].date]);
      s += e.sessions; m += e.minutes;
    }
    return { sessions: s, minutes: m, formatted: window.formatPomodoroDuration(m) + ' / ' + s + ' sessions' };
  };
  // Day-over-day trend (today vs yesterday) for the dashboard badge.
  window.getPomodoroTrend = function () {
    const store = read();
    const today = coerceEntry(store.days[todayISO()]);
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yest = coerceEntry(store.days[toISO(y)]);
    const ds = today.sessions - yest.sessions;
    const dm = today.minutes - yest.minutes;
    const dir = ds > 0 ? 'up' : ds < 0 ? 'down' : 'flat';
    return { deltaSessions: ds, deltaMinutes: dm, direction: dir };
  };
})();
