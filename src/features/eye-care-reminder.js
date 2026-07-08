(function () {
  'use strict';

  const STORAGE_KEY = 'eyeCareReminder';
  const REMINDER_DURATION_SECONDS = 20;
  const CHECK_INTERVAL_MS = 1000;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RING_CIRCUMFERENCE = 113.097;
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

  function getDefaultState() {
    return {
      enabled: false,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: null
    };
  }

  function loadState() {
    if (typeof window.loadEyeCareReminderState === 'function') {
      return window.loadEyeCareReminderState();
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      return {
        ...getDefaultState(),
        ...JSON.parse(raw)
      };
    } catch (error) {
      console.warn('Failed to parse eye-care reminder state:', error);
      return getDefaultState();
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
    bannerEl.hidden = true;

    const content = document.createElement('div');
    content.className = 'eye-care-reminder-content';

    const ring = createRing();
    progressEl = ring.progress;

    const summary = document.createElement('div');
    summary.className = 'eye-care-reminder-summary';

    const title = document.createElement('h3');
    title.className = 'eye-care-reminder-title';
    title.textContent = t('eyeCareReminderTitle', 'Eye-care break');

    statusEl = document.createElement('p');
    statusEl.className = 'eye-care-reminder-text';

    const actions = document.createElement('div');
    actions.className = 'eye-care-reminder-actions';

    skipButtonEl = document.createElement('button');
    skipButtonEl.type = 'button';
    skipButtonEl.className = 'eye-care-reminder-btn eye-care-reminder-btn-secondary';
    skipButtonEl.textContent = t('eyeCareReminderSkip', 'Skip');
    skipButtonEl.addEventListener('click', dismissReminder);

    doneButtonEl = document.createElement('button');
    doneButtonEl.type = 'button';
    doneButtonEl.className = 'eye-care-reminder-btn eye-care-reminder-btn-primary';
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
    saveState({ lastReminder: Date.now() });
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
      iconUrl: 'assets/logo.png',
      title: t('eyeCareReminderTitle', 'Eye-care break'),
      message: t('eyeCareReminderNotificationBody', 'Look at something 20 feet away for 20 seconds.')
    })).catch(function (error) {
      console.warn('Failed to create eye-care reminder notification:', error);
    });
  }

  function showReminder() {
    if (reminderActive) return;

    ensureBanner();
    reminderActive = true;
    remainingSeconds = REMINDER_DURATION_SECONDS;
    bannerEl.hidden = false;
    updateCountdownUi();
    showBrowserNotification();

    stopCountdown();
    countdownTimer = createTimer(handleCountdownTick, CHECK_INTERVAL_MS);
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
    if (typeof state.lastReminder !== 'number') return false;
    return now - state.lastReminder >= state.intervalMinutes * 60 * 1000;
  }

  function evaluateReminder() {
    const state = loadState();
    if (!state.enabled) {
      dismissActiveWithoutPersist();
      return;
    }

    if (state.lastReminder === null) {
      saveState({ lastReminder: Date.now() });
      return;
    }

    if (shouldShowReminder(state, Date.now())) {
      showReminder();
    }
  }

  function dismissActiveWithoutPersist() {
    stopCountdown();
    reminderActive = false;
    remainingSeconds = REMINDER_DURATION_SECONDS;
    if (bannerEl) bannerEl.hidden = true;
  }

  function refreshEyeCareReminder() {
    const state = loadState();

    if (!state.enabled) {
      dismissActiveWithoutPersist();
    } else if (state.lastReminder === null) {
      saveState({ lastReminder: Date.now() });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEyeCareReminder);
  } else {
    initEyeCareReminder();
  }

  window.initEyeCareReminder = initEyeCareReminder;
  window.refreshEyeCareReminder = refreshEyeCareReminder;
})();
