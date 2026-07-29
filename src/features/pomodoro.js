// src/features/pomodoro.js - Pomodoro focus timer

(function () {
  'use strict';

  const STORAGE_KEY = 'pomodoro';
  const TIMER_STATE_KEY = STORAGE_KEY + '_state';
  const LEASE_DURATION_MS = 5000;
  const TAB_ID = 'pomodoro-' + Math.random().toString(36).slice(2);
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
    deadline: 0,
    sessionsCompleted: 0,
    paused: false
  };

  let _timerInterval = null;
  let _coordinationInterval = null;
  let _isLeader = false;

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
    } catch (error) {
      console.warn('Failed to load Pomodoro settings from localStorage:', error);
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
      const raw = localStorage.getItem(TIMER_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.active && typeof parsed.timeRemaining === 'number') {
        if (!parsed.deadline) {
          parsed.deadline = Date.now() + parsed.timeRemaining * 1000;
        }
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to load Pomodoro timer state from localStorage:', error);
    }
    return null;
  }

  function saveTimerState() {
    try {
      localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(state));
    } catch (_e) { /* ignore */ }
  }

  function clearTimerState() {
    try {
      localStorage.removeItem(TIMER_STATE_KEY);
    } catch (_e) { /* ignore */ }
  }

  function updateFocusButtons() {
    const i18n = window.i18n;
    document.querySelectorAll('.todo-focus-btn').forEach(function (focusBtn) {
      const isActive = state.active && state.todoId === focusBtn.dataset.todoId;
      focusBtn.classList.toggle('active', isActive);
      focusBtn.title = isActive
        ? (i18n ? i18n.t('pomodoroStopFocus') : 'Stop Focus')
        : (i18n ? i18n.t('pomodoroStartFocus') : 'Start Focus');
    });
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getPhaseLabel(phase) {
    const i18n = window.i18n;
    const labels = {
      work: i18n ? i18n.t('pomodoroPhaseWork') : 'Focus',
      shortBreak: i18n ? i18n.t('pomodoroPhaseShortBreak') : 'Short Break',
      longBreak: i18n ? i18n.t('pomodoroPhaseLongBreak') : 'Long Break'
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
    pauseBtn.title = window.i18n ? window.i18n.t('pomodoroPause') : 'Pause';
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'pomodoro-btn pomodoro-skip-btn';
    skipBtn.title = window.i18n ? window.i18n.t('pomodoroSkip') : 'Skip';
    skipBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/></svg>';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'pomodoro-btn pomodoro-reset-btn';
    resetBtn.title = window.i18n ? window.i18n.t('pomodoroReset') : 'Reset';
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
    updateFocusButtons();

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
    if (sessionsEl) sessionsEl.textContent = window.i18n ? window.i18n.t('pomodoroSessionLabel', { number: String(state.sessionsCompleted + 1) }) : 'Session ' + (state.sessionsCompleted + 1);
    if (pauseBtn) {
      pauseBtn.innerHTML = state.paused
        ? '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5,3 19,12 5,21"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      pauseBtn.title = state.paused ? (window.i18n ? window.i18n.t('pomodoroResume') : 'Resume') : (window.i18n ? window.i18n.t('pomodoroPause') : 'Pause');
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
    if (!state.active || state.paused || !_isLeader) return;

    const persisted = loadTimerState();
    if (persisted && persisted.ownerId !== TAB_ID && persisted.ownerLeaseExpiresAt > Date.now()) {
      applyTimerState(persisted);
      return;
    }

    if (persisted && persisted.ownerId === TAB_ID) state = persisted;

    if (state.deadline) {
      state.timeRemaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    } else {
      state.timeRemaining--;
    }

    if (state.timeRemaining <= 0) {
      onPhaseComplete();
      return;
    }

    state.ownerId = TAB_ID;
    state.ownerLeaseExpiresAt = Date.now() + LEASE_DURATION_MS;
    saveTimerState();
    updateWidget();
  }

  function onPhaseComplete() {
    if (!state.active || !_isLeader) return;
    const isWork = state.phase === PHASES.WORK;
    const todoText = getTodoText(state.todoId);
    const i18n = window.i18n;

    if (isWork) {
      sendNotification(
        i18n ? i18n.t('pomodoroWorkComplete') : 'Focus session complete!',
        todoText ? (i18n ? i18n.t('pomodoroWorkCompleteBody', { task: todoText }) : 'Task: ' + todoText) : (i18n ? i18n.t('pomodoroBreakCompleteBody') : 'Time for a break.')
      );
    } else {
      sendNotification(
        i18n ? i18n.t('pomodoroBreakComplete') : 'Break over!',
        i18n ? i18n.t('pomodoroBreakCompleteBody') : 'Ready to focus again?'
      );
    }

    const nextPhase = getNextPhase();
    state.phase = nextPhase;
    state.timeRemaining = getPhaseDuration(nextPhase);
    state.deadline = Date.now() + state.timeRemaining * 1000;
    state.ownerId = TAB_ID;
    state.ownerLeaseExpiresAt = Date.now() + LEASE_DURATION_MS;
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
    state.deadline = Date.now() + state.timeRemaining * 1000;
    state.paused = false;
    state.ownerId = TAB_ID;
    state.ownerLeaseExpiresAt = Date.now() + LEASE_DURATION_MS;
    _isLeader = true;

    createTimerWidget();
    updateWidget();
    saveTimerState();
    startCoordinationInterval();
    startInterval();
  }

  function stopTimer() {
    state.active = false;
    state.phase = PHASES.WORK;
    state.todoId = null;
    state.timeRemaining = 0;
    state.deadline = 0;
    state.sessionsCompleted = 0;
    state.paused = false;
    state.ownerId = null;
    state.ownerLeaseExpiresAt = 0;
    _isLeader = false;
    stopInterval();
    stopCoordinationInterval();
    clearTimerState();
    updateWidget();
  }

  function togglePause() {
    if (!state.active) return;

    if (state.paused) {
      if (!claimLeadership(true)) return;
      state.paused = false;
      if (state.timeRemaining > 0) {
        state.deadline = Date.now() + state.timeRemaining * 1000;
      }
      state.ownerId = TAB_ID;
      state.ownerLeaseExpiresAt = Date.now() + LEASE_DURATION_MS;
      startInterval();
    } else {
      state.paused = true;
      if (state.deadline) {
        state.timeRemaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
      }
      state.deadline = 0;
      state.ownerId = null;
      state.ownerLeaseExpiresAt = 0;
      _isLeader = false;
      stopInterval();
    }

    saveTimerState();
    updateWidget();
  }

  function skipPhase() {
    if (!state.active) return;
    if (!_isLeader && !claimLeadership(true)) return;
    onPhaseComplete();
  }

  function startInterval() {
    stopInterval();
    if (!state.active || state.paused || !_isLeader) return;
    _timerInterval = setInterval(tick, 1000);
  }

  function stopInterval() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  function startCoordinationInterval() {
    if (_coordinationInterval || !state.active) return;
    _coordinationInterval = setInterval(reconcileTimerState, 1000);
  }

  function stopCoordinationInterval() {
    if (_coordinationInterval) {
      clearInterval(_coordinationInterval);
      _coordinationInterval = null;
    }
  }

  function applyTimerState(nextState) {
    if (!nextState || !nextState.active) {
      _isLeader = false;
      stopInterval();
      stopCoordinationInterval();
      state = {
        active: false,
        phase: PHASES.WORK,
        todoId: null,
        timeRemaining: 0,
        deadline: 0,
        sessionsCompleted: 0,
        paused: false
      };
      updateWidget();
      return;
    }

    const wasLeader = _isLeader;
    state = nextState;
    if (!state.deadline && state.timeRemaining > 0 && !state.paused) {
      state.deadline = Date.now() + state.timeRemaining * 1000;
    }
    startCoordinationInterval();
    if (state.ownerId === TAB_ID && !state.paused) {
      _isLeader = true;
      if (!wasLeader || !_timerInterval) startInterval();
    } else {
      _isLeader = false;
      stopInterval();
    }
    updateWidget();
  }

  function claimLeadership(allowPaused) {
    const persisted = loadTimerState();
    if (!persisted || !persisted.active || (persisted.paused && !allowPaused)) return false;

    const leaseIsActive = persisted.ownerId && persisted.ownerId !== TAB_ID &&
      persisted.ownerLeaseExpiresAt > Date.now();
    if (leaseIsActive) {
      applyTimerState(persisted);
      return false;
    }

    state = persisted;
    if (!state.deadline && state.timeRemaining > 0 && !state.paused) {
      state.deadline = Date.now() + state.timeRemaining * 1000;
    }
    state.ownerId = TAB_ID;
    state.ownerLeaseExpiresAt = Date.now() + LEASE_DURATION_MS;
    _isLeader = true;
    if (!(allowPaused && persisted.paused)) saveTimerState();
    updateWidget();
    startCoordinationInterval();
    startInterval();
    return true;
  }

  function reconcileTimerState() {
    const persisted = loadTimerState();
    if (!persisted) {
      if (state.active) applyTimerState(null);
      return;
    }

    const ownsLease = persisted.ownerId === TAB_ID;
    const leaseIsActive = persisted.ownerId && !ownsLease && persisted.ownerLeaseExpiresAt > Date.now();
    if (leaseIsActive) {
      applyTimerState(persisted);
      return;
    }
    if (_isLeader && ownsLease) {
      state = persisted;
      updateWidget();
      return;
    }
    if (!_isLeader && persisted.active && !persisted.paused) {
      claimLeadership();
      return;
    }
    applyTimerState(persisted);
  }

  function handleTimerStateChange(newValue) {
    if (!newValue) {
      applyTimerState(null);
      return;
    }
    try {
      const parsed = JSON.parse(newValue);
      if (parsed && parsed.active && typeof parsed.timeRemaining === 'number') {
        applyTimerState(parsed);
      }
    } catch (error) {
      console.warn('Failed to reconcile Pomodoro timer state change:', error);
    }
  }

  function subscribeToTimerStateChanges() {
    window.addEventListener('storage', function (event) {
      if (event.key === TIMER_STATE_KEY) handleTimerStateChange(event.newValue);
    });

    if (window.chrome && window.chrome.storage && window.chrome.storage.onChanged &&
        typeof window.chrome.storage.onChanged.addListener === 'function') {
      window.chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName === 'local' && changes[TIMER_STATE_KEY]) {
          handleTimerStateChange(changes[TIMER_STATE_KEY].newValue);
        }
      });
    }
  }

  function addFocusButtonToTodoActions(todoActions, todoId) {
    const settings = loadSettings();
    if (!settings.enabled) return;

    const focusBtn = document.createElement('button');
    focusBtn.className = 'todo-focus-btn';
    focusBtn.dataset.todoId = todoId;
    const isActive = state.active && state.todoId === todoId;
    focusBtn.classList.toggle('active', isActive);
    const i18n = window.i18n;
    focusBtn.title = isActive
      ? (i18n ? i18n.t('pomodoroStopFocus') : 'Stop Focus')
      : (i18n ? i18n.t('pomodoroStartFocus') : 'Start Focus');
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
    subscribeToTimerStateChanges();

    const saved = loadTimerState();
    if (saved) {
      state = saved;
      createTimerWidget();
      updateWidget();
      if (state.active) {
        startCoordinationInterval();
        if (!state.paused) claimLeadership();
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.active && _isLeader && !state.paused) {
        if (state.deadline) {
          state.timeRemaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
          if (state.timeRemaining <= 0) {
            onPhaseComplete();
            return;
          }
          saveTimerState();
          updateWidget();
        }
      }
    });

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
    const previousDuration = state.active ? getPhaseDuration(state.phase) : null;
    Object.assign(settings, durations);
    saveSettings(settings);
    if (state.active) {
      const newDuration = getPhaseDuration(state.phase);
      if (newDuration !== previousDuration) {
        state.timeRemaining = newDuration;
        state.deadline = Date.now() + newDuration * 1000;
        saveTimerState();
        updateWidget();
      }
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
