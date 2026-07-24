// src/features/pomodoro.js - Pomodoro focus timer

(function () {
  'use strict';

  const STORAGE_KEY = 'pomodoro';
  const PHASES = { WORK: 'work', SHORT_BREAK: 'shortBreak', LONG_BREAK: 'longBreak' };

  const DEFAULTS = {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 4,
    enabled: false
  };

  let state = {
    active: false,
    phase: PHASES.WORK,
    todoId: null,
    timeRemaining: 0,
    sessionsCompleted: 0,
    paused: false
  };

  let _timerInterval = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        workDuration: typeof parsed.workDuration === 'number' ? parsed.workDuration : DEFAULTS.workDuration,
        shortBreakDuration: typeof parsed.shortBreakDuration === 'number' ? parsed.shortBreakDuration : DEFAULTS.shortBreakDuration,
        longBreakDuration: typeof parsed.longBreakDuration === 'number' ? parsed.longBreakDuration : DEFAULTS.longBreakDuration,
        sessionsBeforeLongBreak: typeof parsed.sessionsBeforeLongBreak === 'number' ? parsed.sessionsBeforeLongBreak : DEFAULTS.sessionsBeforeLongBreak,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled
      };
    } catch (_e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function loadTimerState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY + '_state');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.active && typeof parsed.timeRemaining === 'number') {
        return parsed;
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  function saveTimerState() {
    try {
      localStorage.setItem(STORAGE_KEY + '_state', JSON.stringify(state));
    } catch (_e) { /* ignore */ }
  }

  function clearTimerState() {
    try {
      localStorage.removeItem(STORAGE_KEY + '_state');
    } catch (_e) { /* ignore */ }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getPhaseLabel(phase) {
    const labels = {
      work: 'Focus',
      shortBreak: 'Short Break',
      longBreak: 'Long Break'
    };
    return labels[phase] || phase;
  }

  function getPhaseDuration(phase) {
    const settings = loadSettings();
    switch (phase) {
      case PHASES.WORK: return settings.workDuration * 60;
      case PHASES.SHORT_BREAK: return settings.shortBreakDuration * 60;
      case PHASES.LONG_BREAK: return settings.longBreakDuration * 60;
      default: return settings.workDuration * 60;
    }
  }

  function getNextPhase() {
    const settings = loadSettings();
    if (state.phase === PHASES.WORK) {
      state.sessionsCompleted++;
      if (state.sessionsCompleted >= settings.sessionsBeforeLongBreak) {
        state.sessionsCompleted = 0;
        return PHASES.LONG_BREAK;
      }
      return PHASES.SHORT_BREAK;
    }
    return PHASES.WORK;
  }

  function createTimerWidget() {
    const header = document.querySelector('.todo-header');
    if (!header) return null;

    let widget = document.getElementById('pomodoro-widget');
    if (widget) return widget;

    widget = document.createElement('div');
    widget.id = 'pomodoro-widget';
    widget.className = 'pomodoro-widget';

    const display = document.createElement('div');
    display.className = 'pomodoro-display';
    const phaseEl = document.createElement('span');
    phaseEl.className = 'pomodoro-phase';
    const timeEl = document.createElement('span');
    timeEl.className = 'pomodoro-time';
    const sessionsEl = document.createElement('span');
    sessionsEl.className = 'pomodoro-sessions';
    display.appendChild(phaseEl);
    display.appendChild(timeEl);
    display.appendChild(sessionsEl);

    const controls = document.createElement('div');
    controls.className = 'pomodoro-controls';

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'pomodoro-btn pomodoro-pause-btn';
    pauseBtn.title = 'Pause';
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'pomodoro-btn pomodoro-skip-btn';
    skipBtn.title = 'Skip';
    skipBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/></svg>';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'pomodoro-btn pomodoro-reset-btn';
    resetBtn.title = 'Reset';
    resetBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>';

    controls.appendChild(pauseBtn);
    controls.appendChild(skipBtn);
    controls.appendChild(resetBtn);

    widget.appendChild(display);
    widget.appendChild(controls);
    header.appendChild(widget);
    return widget;
  }

  function updateWidget() {
    const widget = document.getElementById('pomodoro-widget');
    if (!widget) return;

    if (!state.active) {
      widget.style.display = 'none';
      return;
    }

    widget.style.display = 'flex';

    const phaseEl = widget.querySelector('.pomodoro-phase');
    const timeEl = widget.querySelector('.pomodoro-time');
    const sessionsEl = widget.querySelector('.pomodoro-sessions');
    const pauseBtn = widget.querySelector('.pomodoro-pause-btn');

    if (phaseEl) phaseEl.textContent = getPhaseLabel(state.phase);
    if (timeEl) timeEl.textContent = formatTime(state.timeRemaining);
    if (sessionsEl) sessionsEl.textContent = 'Session ' + (state.sessionsCompleted + 1);
    if (pauseBtn) {
      pauseBtn.innerHTML = state.paused
        ? '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5,3 19,12 5,21"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      pauseBtn.title = state.paused ? 'Resume' : 'Pause';
    }

    widget.classList.toggle('pomodoro-work', state.phase === PHASES.WORK);
    widget.classList.toggle('pomodoro-break', state.phase !== PHASES.WORK);
  }

  function sendNotification(title, message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
        chrome.notifications.create('pomodoro-' + Date.now(), {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: title,
          message: message
        });
      }
    } catch (_e) { /* ignore */ }
  }

  function tick() {
    if (!state.active || state.paused) return;

    state.timeRemaining--;
    saveTimerState();

    if (state.timeRemaining <= 0) {
      onPhaseComplete();
      return;
    }

    updateWidget();
  }

  function onPhaseComplete() {
    const isWork = state.phase === PHASES.WORK;
    const todoText = getTodoText(state.todoId);

    if (isWork) {
      sendNotification('Focus session complete!', todoText ? 'Task: ' + todoText : 'Time for a break.');
    } else {
      sendNotification('Break over!', 'Ready to focus again?');
    }

    const nextPhase = getNextPhase();
    state.phase = nextPhase;
    state.timeRemaining = getPhaseDuration(nextPhase);
    saveTimerState();
    updateWidget();
  }

  function getTodoText(todoId) {
    if (!todoId) return '';
    try {
      const raw = localStorage.getItem('todos');
      if (!raw) return '';
      const todos = JSON.parse(raw);
      if (!Array.isArray(todos)) return '';
      const todo = todos.find(function (t) { return t.id === todoId; });
      return todo ? todo.text : '';
    } catch (_e) {
      return '';
    }
  }

  function startTimer(todoId) {
    if (!loadSettings().enabled) return;

    stopTimer();

    state.active = true;
    state.phase = PHASES.WORK;
    state.todoId = todoId;
    state.timeRemaining = getPhaseDuration(PHASES.WORK);
    state.paused = false;

    createTimerWidget();
    updateWidget();
    saveTimerState();
    startInterval();
  }

  function stopTimer() {
    state.active = false;
    state.phase = PHASES.WORK;
    state.todoId = null;
    state.timeRemaining = 0;
    state.sessionsCompleted = 0;
    state.paused = false;
    stopInterval();
    clearTimerState();
    updateWidget();
  }

  function togglePause() {
    if (!state.active) return;
    state.paused = !state.paused;
    saveTimerState();
    updateWidget();
  }

  function skipPhase() {
    if (!state.active) return;
    onPhaseComplete();
  }

  function startInterval() {
    stopInterval();
    if (window.VisibilityInterval) {
      _timerInterval = new VisibilityInterval(tick, 1000);
    } else {
      _timerInterval = setInterval(tick, 1000);
    }
  }

  function stopInterval() {
    if (_timerInterval) {
      if (_timerInterval.destroy) _timerInterval.destroy();
      else clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  function addFocusButtonToTodoActions(todoActions, todoId) {
    const settings = loadSettings();
    if (!settings.enabled) return;

    const focusBtn = document.createElement('button');
    focusBtn.className = 'todo-focus-btn';
    focusBtn.dataset.todoId = todoId;
    focusBtn.title = 'Start Focus';
    focusBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>';
    todoActions.appendChild(focusBtn);
  }

  function handleTodoClick(e) {
    const focusBtn = e.target.closest('.todo-focus-btn');
    if (focusBtn) {
      e.stopPropagation();
      const todoId = focusBtn.dataset.todoId;
      if (state.active && state.todoId === todoId) {
        stopTimer();
      } else {
        startTimer(todoId);
      }
    }
  }

  function handleWidgetClick(e) {
    const pauseBtn = e.target.closest('.pomodoro-pause-btn');
    if (pauseBtn) {
      togglePause();
      return;
    }
    const skipBtn = e.target.closest('.pomodoro-skip-btn');
    if (skipBtn) {
      skipPhase();
      return;
    }
    const resetBtn = e.target.closest('.pomodoro-reset-btn');
    if (resetBtn) {
      stopTimer();
    }
  }

  function initPomodoro() {
    const saved = loadTimerState();
    if (saved) {
      state = saved;
      createTimerWidget();
      updateWidget();
      if (state.active && !state.paused) {
        startInterval();
      }
    }

    document.addEventListener('click', handleTodoClick);
    document.addEventListener('click', handleWidgetClick);
  }

  function loadPomodoroEnabled() {
    return loadSettings().enabled;
  }

  function applyPomodoroEnabled() {
    if (!loadSettings().enabled && state.active) {
      stopTimer();
    }
  }

  function loadPomodoroDurations() {
    return loadSettings();
  }

  function savePomodoroDurations(durations) {
    const settings = loadSettings();
    Object.assign(settings, durations);
    saveSettings(settings);
    if (state.active) {
      state.timeRemaining = getPhaseDuration(state.phase);
      updateWidget();
    }
  }

  window.startPomodoro = startTimer;
  window.stopPomodoro = stopTimer;
  window.togglePomodoroPause = togglePause;
  window.loadPomodoroEnabled = loadPomodoroEnabled;
  window.applyPomodoroEnabled = applyPomodoroEnabled;
  window.loadPomodoroDurations = loadPomodoroDurations;
  window.savePomodoroDurations = savePomodoroDurations;
  window.addFocusButtonToTodoActions = addFocusButtonToTodoActions;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPomodoro);
  } else {
    initPomodoro();
  }
})();
