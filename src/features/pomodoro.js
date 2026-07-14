// src/features/pomodoro.js - Pomodoro Focus Timer

(function () {
  'use strict';

  const SETTINGS_KEY = 'pomodoroSettings';
  const SESSION_KEY = 'pomodoroSession';

  const DEFAULT_SETTINGS = {
    enabled: false,
    work: 25,
    shortBreak: 5,
    longBreak: 15,
    sessionsBeforeLong: 4
  };

  let settings = { ...DEFAULT_SETTINGS };
  let session = null;
  let timer = null;
  let widgetElement = null;

  function toPositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  }

  function normalizeSettings(raw) {
    const source = raw || {};
    return {
      enabled: source.enabled !== undefined ? Boolean(source.enabled) : DEFAULT_SETTINGS.enabled,
      work: toPositiveInt(source.work, DEFAULT_SETTINGS.work),
      shortBreak: toPositiveInt(source.shortBreak, DEFAULT_SETTINGS.shortBreak),
      longBreak: toPositiveInt(source.longBreak, DEFAULT_SETTINGS.longBreak),
      sessionsBeforeLong: toPositiveInt(source.sessionsBeforeLong, DEFAULT_SETTINGS.sessionsBeforeLong)
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return normalizeSettings(parsed);
    } catch (err) {
      console.warn('Failed to load pomodoro settings', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(newSettings) {
    try {
      if (newSettings) {
        settings = normalizeSettings({ ...settings, ...newSettings });
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      console.warn('Failed to save pomodoro settings');
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.active) return null;
      const remaining = Number(parsed.remaining);
      const sessionsCompleted = Number(parsed.sessionsCompleted);
      return {
        active: true,
        todoId: parsed.todoId || null,
        phase: parsed.phase || 'work',
        remaining: Number.isFinite(remaining) && remaining >= 0 ? remaining : 0,
        sessionsCompleted: Number.isFinite(sessionsCompleted) && sessionsCompleted >= 0 ? Math.floor(sessionsCompleted) : 0,
        paused: parsed.paused !== undefined ? Boolean(parsed.paused) : false
      };
    } catch (err) {
      console.warn('Failed to load pomodoro session', err);
      return null;
    }
  }

  function saveSession() {
    try {
      if (session && session.active) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      console.warn('Failed to save pomodoro session');
    }
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function getPhaseDuration(phase) {
    switch (phase) {
      case 'work': return settings.work * 60;
      case 'shortBreak': return settings.shortBreak * 60;
      case 'longBreak': return settings.longBreak * 60;
      default: return settings.work * 60;
    }
  }

  function getPhaseLabel(phase) {
    const i18n = window.i18n;
    switch (phase) {
      case 'work': return i18n ? i18n.t('pomodoroWork') : 'Focus';
      case 'shortBreak': return i18n ? i18n.t('pomodoroShortBreak') : 'Short Break';
      case 'longBreak': return i18n ? i18n.t('pomodoroLongBreak') : 'Long Break';
      default: return i18n ? i18n.t('pomodoroWork') : 'Focus';
    }
  }

  function getNextPhase(currentPhase, sessionsCompleted) {
    if (currentPhase === 'work') {
      if (sessionsCompleted > 0 && sessionsCompleted % settings.sessionsBeforeLong === 0) {
        return 'longBreak';
      }
      return 'shortBreak';
    }
    return 'work';
  }

  function sendNotification(phase, sessionsCompleted) {
    try {
      const i18n = window.i18n;
      let titleKey, messageKey;
      if (phase === 'work') {
        titleKey = 'pomodoroWorkCompleteTitle';
        messageKey = 'pomodoroWorkCompleteMessage';
      } else if (phase === 'shortBreak') {
        titleKey = 'pomodoroShortBreakCompleteTitle';
        messageKey = 'pomodoroShortBreakCompleteMessage';
      } else {
        titleKey = 'pomodoroLongBreakCompleteTitle';
        messageKey = 'pomodoroLongBreakCompleteMessage';
      }
      const title = i18n ? i18n.t(titleKey) : 'Focus Session Complete';
      const message = i18n ? i18n.t(messageKey, { sessions: String(sessionsCompleted) }) : sessionsCompleted + ' sessions completed';
      chrome.runtime.sendMessage({
        type: 'pomodoroComplete',
        phase: phase,
        title: title,
        message: message
      }).catch((err) => {
        console.warn('Failed to send Pomodoro notification message', err);
      });
    } catch {
      // Service worker may not be available in tests
    }
  }

  function tick() {
    if (!session || !session.active || session.paused) return;

    session.remaining -= 1;
    saveSession();

    if (session.remaining <= 0) {
      onPhaseComplete();
    } else {
      renderWidget();
    }
  }

  function onPhaseComplete() {
    const completedPhase = session.phase;
    if (completedPhase === 'work') {
      session.sessionsCompleted += 1;
    }

    sendNotification(completedPhase, session.sessionsCompleted);

    const nextPhase = getNextPhase(completedPhase, session.sessionsCompleted);
    session.phase = nextPhase;
    session.remaining = getPhaseDuration(nextPhase);
    session.paused = false;

    saveSession();
    buildWidget();
  }

  function startTimer() {
    stopTimer();
    if (window.VisibilityInterval) {
      timer = new window.VisibilityInterval(tick, 1000);
    } else {
      timer = setInterval(tick, 1000);
    }
  }

  function stopTimer() {
    if (timer) {
      if (typeof timer.destroy === 'function') {
        timer.destroy();
      } else {
        clearInterval(timer);
      }
      timer = null;
    }
  }

  function startFocus(todoId) {
    settings = loadSettings();
    if (!settings.enabled) return;

    session = {
      active: true,
      todoId: todoId || null,
      phase: 'work',
      remaining: getPhaseDuration('work'),
      sessionsCompleted: 0,
      paused: false
    };

    saveSession();
    startTimer();
    showWidget();
    highlightFocusedTodo();
  }

  function pause() {
    if (!session || !session.active) return;
    session.paused = true;
    saveSession();
    if (widgetRefs) {
      updatePlayPauseBtn(widgetRefs.playPauseBtn, true, window.i18n);
    }
  }

  function resume() {
    if (!session || !session.active) return;
    session.paused = false;
    saveSession();
    if (widgetRefs) {
      updatePlayPauseBtn(widgetRefs.playPauseBtn, false, window.i18n);
    }
  }

  function togglePause() {
    if (!session || !session.active) return;
    if (session.paused) {
      resume();
    } else {
      pause();
    }
  }

  function skip() {
    if (!session || !session.active) return;
    onPhaseComplete();
  }

  function reset() {
    session = null;
    stopTimer();
    saveSession();
    hideWidget();
    clearFocusHighlight();
  }

  function endSession() {
    reset();
  }

  function showWidget() {
    widgetElement = document.getElementById('pomodoro-widget');
    if (widgetElement) {
      widgetElement.style.display = '';
      buildWidget();
    }
  }

  function hideWidget() {
    widgetElement = document.getElementById('pomodoro-widget');
    if (widgetElement) {
      widgetElement.style.display = 'none';
      widgetElement.innerHTML = '';
    }
    widgetRefs = null;
  }

  let widgetRefs = null;

  function buildWidget() {
    if (!session || !session.active) return;
    const container = document.getElementById('pomodoro-widget');
    if (!container) return;

    const i18n = window.i18n;
    const phaseLabel = getPhaseLabel(session.phase);
    const timeStr = formatTime(Math.max(0, session.remaining));
    const isPaused = session.paused;

    container.innerHTML = '';

    const timerEl = document.createElement('div');
    timerEl.className = 'pomodoro-timer';

    const phaseEl = document.createElement('span');
    phaseEl.className = 'pomodoro-phase-label';
    phaseEl.textContent = phaseLabel;
    timerEl.appendChild(phaseEl);

    const timeEl = document.createElement('span');
    timeEl.className = 'pomodoro-time';
    timeEl.textContent = timeStr;
    timerEl.appendChild(timeEl);

    const sessionsEl = document.createElement('span');
    sessionsEl.className = 'pomodoro-sessions';
    const total = settings.sessionsBeforeLong;
    const completedInCycle = session.sessionsCompleted % total;
    const displayCompleted = session.phase === 'longBreak' && completedInCycle === 0 && session.sessionsCompleted > 0
      ? total
      : completedInCycle;
    sessionsEl.textContent = displayCompleted + '/' + total;
    timerEl.appendChild(sessionsEl);

    container.appendChild(timerEl);

    const controls = document.createElement('div');
    controls.className = 'pomodoro-controls';

    const playPauseBtn = document.createElement('button');
    playPauseBtn.className = 'pomodoro-btn pomodoro-play-pause';
    updatePlayPauseBtn(playPauseBtn, isPaused, i18n);
    playPauseBtn.addEventListener('click', togglePause);
    controls.appendChild(playPauseBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'pomodoro-btn pomodoro-skip';
    skipBtn.title = i18n ? i18n.t('pomodoroSkip') : 'Skip';
    skipBtn.setAttribute('aria-label', i18n ? i18n.t('pomodoroSkip') : 'Skip');
    skipBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,4 15,12 5,20" fill="currentColor"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>';
    skipBtn.addEventListener('click', skip);
    controls.appendChild(skipBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'pomodoro-btn pomodoro-reset';
    resetBtn.title = i18n ? i18n.t('pomodoroEnd') : 'End Session';
    resetBtn.setAttribute('aria-label', i18n ? i18n.t('pomodoroEnd') : 'End Session');
    resetBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>';
    resetBtn.addEventListener('click', endSession);
    controls.appendChild(resetBtn);

    container.appendChild(controls);

    widgetRefs = { timeEl, phaseEl, sessionsEl, playPauseBtn };
  }

  function updatePlayPauseBtn(btn, isPaused, i18n) {
    if (!btn) return;
    const label = isPaused
      ? (i18n ? i18n.t('pomodoroResume') : 'Resume')
      : (i18n ? i18n.t('pomodoroPause') : 'Pause');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = isPaused
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"></polygon></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  }

  function renderWidget() {
    if (!session || !session.active) return;
    if (!widgetRefs) {
      buildWidget();
      return;
    }
    widgetRefs.timeEl.textContent = formatTime(Math.max(0, session.remaining));
  }

  function highlightFocusedTodo() {
    clearFocusHighlight();
    if (!session || !session.todoId) return;
    const todoItem = document.querySelector('.todo-item[data-id="' + CSS.escape(session.todoId) + '"]');
    if (todoItem) {
      todoItem.classList.add('pomodoro-focused');
    }
  }

  function clearFocusHighlight() {
    document.querySelectorAll('.todo-item.pomodoro-focused').forEach(function (el) {
      el.classList.remove('pomodoro-focused');
    });
  }

  function initPomodoro() {
    settings = loadSettings();
    session = loadSession();

    if (session && session.active && settings.enabled) {
      startTimer();
      showWidget();
      highlightFocusedTodo();
    }

    if (settings.enabled) {
      document.querySelectorAll('.todo-focus-btn').forEach(function (btn) {
        btn.style.display = '';
      });
    } else {
      document.querySelectorAll('.todo-focus-btn').forEach(function (btn) {
        btn.style.display = 'none';
      });
    }
  }

  function applyPomodoroSettings() {
    settings = loadSettings();

    const enabledCheckbox = document.getElementById('pomodoro-enabled');
    if (enabledCheckbox) enabledCheckbox.checked = settings.enabled;

    const workInput = document.getElementById('pomodoro-work-duration');
    if (workInput) workInput.value = settings.work;

    const shortInput = document.getElementById('pomodoro-short-duration');
    if (shortInput) shortInput.value = settings.shortBreak;

    const longInput = document.getElementById('pomodoro-long-duration');
    if (longInput) longInput.value = settings.longBreak;

    const sessionsInput = document.getElementById('pomodoro-sessions-before-long');
    if (sessionsInput) sessionsInput.value = settings.sessionsBeforeLong;

    document.querySelectorAll('.todo-focus-btn').forEach(function (btn) {
      btn.style.display = settings.enabled ? '' : 'none';
    });

    if (!settings.enabled && session && session.active) {
      reset();
    }
  }

  function loadPomodoroEnabled() {
    return loadSettings().enabled;
  }

  try {
    window.PomodoroTimer = {
      startFocus: startFocus,
      pause: pause,
      resume: resume,
      togglePause: togglePause,
      skip: skip,
      reset: reset,
      endSession: endSession,
      initPomodoro: initPomodoro,
      loadSettings: loadSettings,
      saveSettings: saveSettings,
      loadSession: loadSession,
      formatTime: formatTime,
      applyPomodoroSettings: applyPomodoroSettings,
      loadPomodoroEnabled: loadPomodoroEnabled,
      renderWidget: renderWidget,
      get session() { return session; },
      get settings() { return settings; }
    };
  } catch {
    // If window isn't writable in some test harnesses
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPomodoro);
  } else {
    initPomodoro();
  }
})();
