(function () {
  'use strict';

  const STORAGE_KEY = 'eyeCareReminder';
  const REMINDER_DURATION_SECONDS = 20;
  const CHECK_INTERVAL_MS = 1000;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RING_RADIUS = 18;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  let bannerEl = null;
  let statusEl = null;
  let progressEl = null;
  let skipButtonEl = null;
  let doneButtonEl = null;
  let checkTimer = null;
  let countdownTimer = null;
  let reminderActive = false;
  let remainingSeconds = REMINDER_DURATION_SECONDS;

  function createTimer(callback, interval) {
    if (window.VisibilityInterval) {
      return new window.VisibilityInterval(callback, interval);
    }

    const intervalId = window.setInterval(callback, interval);
    return {
      destroy: function () {
        window.clearInterval(intervalId);
      }
    };
  }

  function createCountdownTimer(callback, interval) {
    if (!window.VisibilityInterval || !window.visibilityManager) {
      let intervalId = null;
      const start = function () {
        if (intervalId === null && !document.hidden) {
          intervalId = window.setInterval(callback, interval);
        }
      };
      const stop = function () {
        if (intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      };
      const handleVisibilityChange = function () {
        if (document.hidden) stop();
        else start();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      start();

      return {
        destroy: function () {
          stop();
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      };
    }

    let skipResumeTick = false;
    const unsubscribe = window.visibilityManager.onChange(function (visible) {
      if (visible) skipResumeTick = true;
    });
    const timer = new window.VisibilityInterval(function () {
      if (skipResumeTick) {
        skipResumeTick = false;
        return;
      }
      callback();
    }, interval);

    return {
      destroy: function () {
        timer.destroy();
        unsubscribe();
      }
    };
  }

  function loadState() {
    if (typeof window.loadEyeCareReminderState === 'function') {
      return window.loadEyeCareReminderState();
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { enabled: false };
      return { enabled: false, ...JSON.parse(raw) };
    } catch (error) {
      console.warn('Failed to parse eye-care reminder state:', error);
      return { enabled: false };
    }
  }

  function saveState(updates) {
    if (typeof window.saveEyeCareReminderState === 'function') {
      return window.saveEyeCareReminderState(updates);
    }

    const next = {
      ...loadState(),
      ...updates
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function t(key, fallback) {
    if (!window.i18n || typeof window.i18n.t !== 'function') return fallback;
    const translated = window.i18n.t(key);
    return translated && translated !== key ? translated : fallback;
  }

  function createRing() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('class', 'eye-care-ring');

    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'eye-care-ring-track');
    track.setAttribute('cx', '24');
    track.setAttribute('cy', '24');
    track.setAttribute('r', '18');

    const progress = document.createElementNS(SVG_NS, 'circle');
    progress.setAttribute('class', 'eye-care-ring-progress');
    progress.setAttribute('cx', '24');
    progress.setAttribute('cy', '24');
    progress.setAttribute('r', '18');
    progress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    progress.style.strokeDashoffset = '0';

    svg.appendChild(track);
    svg.appendChild(progress);
    return {
      svg,
      progress
    };
  }

  function ensureBanner() {
    if (bannerEl) return bannerEl;

    bannerEl = document.createElement('section');
    bannerEl.className = 'eye-care-reminder';
    bannerEl.setAttribute('role', 'status');
    bannerEl.setAttribute('aria-live', 'polite');
    bannerEl.hidden = true;

    const content = document.createElement('div');
    content.className = 'eye-care-reminder-content';

    const ring = createRing();
    progressEl = ring.progress;

    const summary = document.createElement('div');
    summary.className = 'eye-care-reminder-summary';

    const title = document.createElement('h3');
    title.className = 'eye-care-reminder-title';
    title.setAttribute('data-i18n', 'eyeCareReminderTitle');
    title.textContent = t('eyeCareReminderTitle', 'Eye-care break');

    statusEl = document.createElement('p');
    statusEl.className = 'eye-care-reminder-text';

    const actions = document.createElement('div');
    actions.className = 'eye-care-reminder-actions';

    skipButtonEl = document.createElement('button');
    skipButtonEl.type = 'button';
    skipButtonEl.className = 'eye-care-reminder-btn eye-care-reminder-btn-secondary';
    skipButtonEl.setAttribute('data-i18n', 'eyeCareReminderSkip');
    skipButtonEl.textContent = t('eyeCareReminderSkip', 'Skip');
    skipButtonEl.addEventListener('click', dismissReminder);

    doneButtonEl = document.createElement('button');
    doneButtonEl.type = 'button';
    doneButtonEl.className = 'eye-care-reminder-btn eye-care-reminder-btn-primary';
    doneButtonEl.setAttribute('data-i18n', 'eyeCareReminderDone');
    doneButtonEl.textContent = t('eyeCareReminderDone', 'Done');
    doneButtonEl.hidden = true;
    doneButtonEl.addEventListener('click', dismissReminder);

    actions.appendChild(skipButtonEl);
    actions.appendChild(doneButtonEl);
    summary.appendChild(title);
    summary.appendChild(statusEl);
    content.appendChild(ring.svg);
    content.appendChild(summary);
    content.appendChild(actions);
    bannerEl.appendChild(content);
    document.body.appendChild(bannerEl);

    return bannerEl;
  }

  function updateCountdownUi() {
    if (!statusEl || !progressEl || !skipButtonEl || !doneButtonEl) return;

    if (remainingSeconds > 0) {
      statusEl.textContent = t('eyeCareReminderCountdown', 'Look at something 20 feet away for 20 seconds')
        + ' (' + remainingSeconds + 's)';
      skipButtonEl.hidden = false;
      doneButtonEl.hidden = true;
    } else {
      statusEl.textContent = t('eyeCareReminderFinished', 'Break complete. Ready when you are.');
      skipButtonEl.hidden = true;
      doneButtonEl.hidden = false;
    }

    const progress = (REMINDER_DURATION_SECONDS - remainingSeconds) / REMINDER_DURATION_SECONDS;
    progressEl.style.strokeDashoffset = String(progress * RING_CIRCUMFERENCE);
  }

  function clearExpiredActiveReminder(state, now) {
    if (typeof state.activeReminderAt !== 'number') {
      return state;
    }

    const activeElapsedMs = state.activeElapsedVisibleMs + (
      !document.hidden && typeof state.activeLastVisibleAt === 'number'
        ? Math.max(0, now - state.activeLastVisibleAt)
        : 0
    );

    if (activeElapsedMs < REMINDER_DURATION_SECONDS * 1000) {
      return state;
    }

    const recoveredState = {
      ...state,
      activeReminderAt: null,
      activeElapsedVisibleMs: 0,
      activeLastVisibleAt: null,
      elapsedVisibleMs: 0,
      lastReminder: now,
      lastVisibleAt: now
    };

    saveState(recoveredState);
    return recoveredState;
  }

  function stopCountdown() {
    if (countdownTimer && typeof countdownTimer.destroy === 'function') {
      countdownTimer.destroy();
    }
    countdownTimer = null;
  }

  function stopCheckTimer() {
    if (checkTimer && typeof checkTimer.destroy === 'function') {
      checkTimer.destroy();
    }
    checkTimer = null;
  }

  function dismissReminder() {
    stopCountdown();
    reminderActive = false;
    remainingSeconds = REMINDER_DURATION_SECONDS;
    if (bannerEl) bannerEl.hidden = true;
    saveState({
      lastReminder: Date.now(),
      elapsedVisibleMs: 0,
      lastVisibleAt: Date.now(),
      activeReminderAt: null,
      activeElapsedVisibleMs: 0,
      activeLastVisibleAt: null
    });
  }

  function showBrowserNotification() {
    const state = loadState();
    if (
      !state.browserNotification ||
      typeof chrome === 'undefined' ||
      !chrome.notifications ||
      typeof chrome.notifications.create !== 'function'
    ) {
      return;
    }

    Promise.resolve(chrome.notifications.create('eye-care-reminder', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: t('eyeCareReminderTitle', 'Eye-care break'),
      message: t('eyeCareReminderNotificationBody', 'Look at something 20 feet away for 20 seconds.')
    })).catch(function (error) {
      console.warn('Failed to create eye-care reminder notification:', error);
    });
  }

  function showReminder() {
    if (reminderActive) return;

    const now = Date.now();
    saveState({
      activeReminderAt: now,
      activeElapsedVisibleMs: 0,
      activeLastVisibleAt: now,
      lastReminder: now,
      elapsedVisibleMs: 0,
      lastVisibleAt: null
    });

    ensureBanner();
    reminderActive = true;
    remainingSeconds = REMINDER_DURATION_SECONDS;
    bannerEl.hidden = false;
    updateCountdownUi();
    showBrowserNotification();

    stopCountdown();
    countdownTimer = createCountdownTimer(handleCountdownTick, CHECK_INTERVAL_MS);
  }

  function restoreActiveReminder(state, now) {
    if (typeof state.activeReminderAt !== 'number') {
      return false;
    }

    const elapsedMs = state.activeElapsedVisibleMs + (
      !document.hidden && typeof state.activeLastVisibleAt === 'number'
        ? Math.max(0, now - state.activeLastVisibleAt)
        : 0
    );
    if (elapsedMs >= REMINDER_DURATION_SECONDS * 1000) {
      return false;
    }

    ensureBanner();
    if (!document.hidden) {
      saveState({
        activeElapsedVisibleMs: elapsedMs,
        activeLastVisibleAt: now
      });
    }
    reminderActive = true;
    remainingSeconds = Math.max(
      0,
      REMINDER_DURATION_SECONDS - Math.floor(elapsedMs / 1000)
    );
    bannerEl.hidden = false;
    updateCountdownUi();

    stopCountdown();
    countdownTimer = createCountdownTimer(handleCountdownTick, CHECK_INTERVAL_MS);
    return true;
  }

  function handleCountdownTick() {
    if (!reminderActive) return;
    if (remainingSeconds > 0) {
      remainingSeconds -= 1;
      updateCountdownUi();
      return;
    }

    stopCountdown();
    updateCountdownUi();
  }

  function shouldShowReminder(state, now) {
    if (!state.enabled || reminderActive) return false;
    if (typeof state.activeReminderAt === 'number') return false;
    return state.elapsedVisibleMs >= state.intervalMinutes * 60 * 1000;
  }

  function syncVisibleElapsed(state, now) {
    if (!state.enabled || reminderActive) {
      return state;
    }

    if (document.hidden) {
      return state;
    }

    if (typeof state.activeReminderAt === 'number') {
      return {
        ...state,
        elapsedVisibleMs: 0,
        lastVisibleAt: null,
        visibilityPaused: false
      };
    }

    if (state.visibilityPaused) {
      const resumedState = {
        ...state,
        lastVisibleAt: now,
        visibilityPaused: false
      };
      saveState({
        lastVisibleAt: now,
        visibilityPaused: false
      });
      return resumedState;
    }

    if (typeof state.lastVisibleAt !== 'number') {
      const initialized = {
        ...state,
        elapsedVisibleMs: Math.max(
          state.elapsedVisibleMs,
          Math.max(0, now - state.lastReminder)
        ),
        lastVisibleAt: now
      };
      saveState({
        elapsedVisibleMs: initialized.elapsedVisibleMs,
        lastVisibleAt: now
      });
      return initialized;
    }

    const elapsed = Math.max(0, now - state.lastVisibleAt);
    if (elapsed === 0) {
      return state;
    }

    const nextState = {
      ...state,
      elapsedVisibleMs: state.elapsedVisibleMs + elapsed,
      lastVisibleAt: now
    };

    return nextState;
  }

  function evaluateReminder() {
    const now = Date.now();
    let state = clearExpiredActiveReminder(loadState(), now);
    if (!state.enabled) {
      if (
        reminderActive ||
        state.activeReminderAt !== null ||
        state.lastVisibleAt !== null ||
        state.activeElapsedVisibleMs > 0 ||
        state.activeLastVisibleAt !== null ||
        state.visibilityPaused
      ) {
        clearActiveReminderState();
      }
      return;
    }

    if (state.lastReminder === null) {
      saveState({
        lastReminder: now,
        lastVisibleAt: now,
        elapsedVisibleMs: 0,
        activeReminderAt: null,
        activeElapsedVisibleMs: 0,
        activeLastVisibleAt: null
      });
      return;
    }

    state = syncVisibleElapsed(state, now);

    if (shouldShowReminder(state, now)) {
      showReminder();
    }
  }

  function clearActiveReminderState() {
    stopCountdown();
    reminderActive = false;
    remainingSeconds = REMINDER_DURATION_SECONDS;
    if (bannerEl) bannerEl.hidden = true;
    saveState({
      lastVisibleAt: null,
      activeReminderAt: null,
      visibilityPaused: false,
      activeElapsedVisibleMs: 0,
      activeLastVisibleAt: null
    });
  }

  function refreshEyeCareReminder() {
    const now = Date.now();
    const state = clearExpiredActiveReminder(loadState(), now);

    if (!state.enabled) {
      if (
        reminderActive ||
        state.activeReminderAt !== null ||
        state.lastVisibleAt !== null ||
        state.activeElapsedVisibleMs > 0 ||
        state.activeLastVisibleAt !== null ||
        state.visibilityPaused
      ) {
        clearActiveReminderState();
      }
    } else if (state.lastReminder === null) {
      saveState({
        lastReminder: now,
        lastVisibleAt: now,
        elapsedVisibleMs: 0,
        activeReminderAt: null
      });
    } else if (!restoreActiveReminder(state, now)) {
      stopCountdown();
      reminderActive = false;
      remainingSeconds = REMINDER_DURATION_SECONDS;
      if (bannerEl) bannerEl.hidden = true;
    }

    if (typeof window.applyEyeCareReminderSettings === 'function') {
      window.applyEyeCareReminderSettings();
    }

    evaluateReminder();
  }

  function initEyeCareReminder() {
    stopCheckTimer();
    ensureBanner();
    refreshEyeCareReminder();
    checkTimer = createTimer(evaluateReminder, CHECK_INTERVAL_MS);
  }

  function handleVisibilityChange(visible) {
    const state = loadState();
    const now = Date.now();

    if (!visible) {
      const elapsed = state.enabled && !reminderActive && typeof state.lastVisibleAt === 'number'
        ? Math.max(0, now - state.lastVisibleAt)
        : 0;
      const activeElapsed = state.enabled && typeof state.activeReminderAt === 'number'
        && typeof state.activeLastVisibleAt === 'number'
        ? Math.max(0, now - state.activeLastVisibleAt)
        : 0;
      saveState({
        elapsedVisibleMs: state.elapsedVisibleMs + elapsed,
        lastVisibleAt: null,
        visibilityPaused: true,
        activeElapsedVisibleMs: state.activeElapsedVisibleMs + activeElapsed,
        activeLastVisibleAt: null
      });
      return;
    }

    if (state.visibilityPaused) {
      saveState({
        lastVisibleAt: now,
        activeLastVisibleAt: typeof state.activeReminderAt === 'number' ? now : null,
        visibilityPaused: false
      });
    }

    if (visible && !reminderActive && typeof state.activeReminderAt === 'number') {
      refreshEyeCareReminder();
    }
  }

  if (window.visibilityManager && typeof window.visibilityManager.onChange === 'function') {
    window.visibilityManager.onChange(handleVisibilityChange);
  } else {
    document.addEventListener('visibilitychange', function () {
      handleVisibilityChange(!document.hidden);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEyeCareReminder);
  } else {
    initEyeCareReminder();
  }

  window.addEventListener('languageChanged', function () {
    if (!bannerEl || bannerEl.hidden) return;
    updateCountdownUi();
  });

  window.initEyeCareReminder = initEyeCareReminder;
  window.refreshEyeCareReminder = refreshEyeCareReminder;
})();
