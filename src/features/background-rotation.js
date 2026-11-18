// src/features/background-rotation.js - Background rotation/scheduling

(function () {
  'use strict';

  const ROTATION_ENABLED_KEY = 'bgRotationEnabled';
  const ROTATION_INTERVAL_KEY = 'bgRotationInterval';
  const ROTATION_SELECTION_KEY = 'bgRotationSelection';
  // 'Time of day' cadence (issue #1234): sentinel interval value, not a
  // millisecond cadence — the swap is driven by boundary crossings.
  const TOD_INTERVAL_KEY = 'tod';
  const TOD_DAY_TIME_KEY = 'bgRotationDayTime';
  const TOD_NIGHT_TIME_KEY = 'bgRotationNightTime';
  const TOD_DAY_SELECTION_KEY = 'bgRotationDaySelection';
  const TOD_NIGHT_SELECTION_KEY = 'bgRotationNightSelection';
  const TOD_CHECK_INTERVAL_MS = 30 * 1000;
  const DEFAULT_DAY_TIME = '07:00';
  const DEFAULT_NIGHT_TIME = '19:00';

  const INTERVAL_OPTIONS = {
    '5min': 5 * 60 * 1000,
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1hour': 60 * 60 * 1000,
    'hourly': 60 * 60 * 1000, // cadence after the clock-aligned first run
    'daily': 24 * 60 * 60 * 1000,
  };

  const ROTATION_STORAGE_KEYS = new Set([
    ROTATION_ENABLED_KEY,
    ROTATION_INTERVAL_KEY,
    ROTATION_SELECTION_KEY,
    TOD_DAY_TIME_KEY,
    TOD_NIGHT_TIME_KEY,
    TOD_DAY_SELECTION_KEY,
    TOD_NIGHT_SELECTION_KEY,
  ]);
  const ROTATION_SAVE_ERROR_FALLBACK = 'Failed to save background rotation settings. Your last action was not saved.';

  let rotationTimer = null;
  // Last day/night side the 'tod' cadence applied, so a boundary check
  // only swaps on an actual crossing (mirrors auto-theme's
  // lastScheduledTheme).
  let lastScheduledSide = null;
  // The 'newtab' cadence advances the pool once per fresh document load.
  // init() consumes this flag (except while the pool is still empty
  // awaiting the async upload cache, where the custombackgroundschanged
  // retry consumes it); applyRotation()/startRotation() re-run for
  // settings changes, picker edits, and post-import refreshes but never
  // reach the load path, so those defer the advance to the next load. No
  // focus/visibility/pageshow listener exists, so returning to an existing
  // tab never advances (#788).
  let loadAdvanceConsumed = false;

  function loadEnabled() {
    try {
      return localStorage.getItem(ROTATION_ENABLED_KEY) === 'true';
    } catch (err) {
      console.warn('loadEnabled localStorage error:', err);
      return false;
    }
  }

  function loadInterval() {
    try {
      return localStorage.getItem(ROTATION_INTERVAL_KEY) || '30min';
    } catch (err) {
      console.warn('loadInterval localStorage error:', err);
      return '30min';
    }
  }

  function loadStoredSelection(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Keep an empty array distinct from "never configured" (null): an
      // explicit empty selection means rotate nothing, not rotate everything.
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch (err) {
      console.warn('loadSelection parse error:', err);
      return null;
    }
  }

  function loadSelection() {
    return loadStoredSelection(ROTATION_SELECTION_KEY);
  }

  function loadDaySelection() {
    return loadStoredSelection(TOD_DAY_SELECTION_KEY);
  }

  function loadNightSelection() {
    return loadStoredSelection(TOD_NIGHT_SELECTION_KEY);
  }

  function loadDayTime() {
    try {
      return localStorage.getItem(TOD_DAY_TIME_KEY) || DEFAULT_DAY_TIME;
    } catch (err) {
      console.warn('loadDayTime localStorage error:', err);
      return DEFAULT_DAY_TIME;
    }
  }

  function loadNightTime() {
    try {
      return localStorage.getItem(TOD_NIGHT_TIME_KEY) || DEFAULT_NIGHT_TIME;
    } catch (err) {
      console.warn('loadNightTime localStorage error:', err);
      return DEFAULT_NIGHT_TIME;
    }
  }

  function getRotationSaveErrorMessage() {
    if (!window.i18n || typeof window.i18n.t !== 'function') {
      return ROTATION_SAVE_ERROR_FALLBACK;
    }

    const message = window.i18n.t('bgRotationSaveError');
    return message && message !== 'bgRotationSaveError' ? message : ROTATION_SAVE_ERROR_FALLBACK;
  }

  function showRotationSaveError() {
    const message = getRotationSaveErrorMessage();
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
      return;
    }
    console.warn(message);
  }

  // The storage bridge's setItem returns false for a rejected write; the
  // native Storage API returns undefined. Only an explicit false is a failure.
  function isWriteAccepted(result) {
    return result !== false;
  }

  function saveEnabled(value) {
    try {
      return isWriteAccepted(localStorage.setItem(ROTATION_ENABLED_KEY, value ? 'true' : 'false'));
    } catch (err) {
      console.warn('saveEnabled localStorage error:', err);
      return false;
    }
  }

  function saveInterval(value) {
    try {
      return isWriteAccepted(localStorage.setItem(ROTATION_INTERVAL_KEY, value));
    } catch (err) {
      console.warn('saveInterval localStorage error:', err);
      return false;
    }
  }

  function saveStoredSelection(key, ids) {
    try {
      return isWriteAccepted(localStorage.setItem(key, JSON.stringify(ids)));
    } catch (err) {
      console.warn('saveSelection localStorage error:', err);
      return false;
    }
  }

  function saveSelection(ids) {
    return saveStoredSelection(ROTATION_SELECTION_KEY, ids);
  }

  function saveDaySelection(ids) {
    return saveStoredSelection(TOD_DAY_SELECTION_KEY, ids);
  }

  function saveNightSelection(ids) {
    return saveStoredSelection(TOD_NIGHT_SELECTION_KEY, ids);
  }

  function saveDayTime(value) {
    try {
      return isWriteAccepted(localStorage.setItem(TOD_DAY_TIME_KEY, value));
    } catch (err) {
      console.warn('saveDayTime localStorage error:', err);
      return false;
    }
  }

  function saveNightTime(value) {
    try {
      return isWriteAccepted(localStorage.setItem(TOD_NIGHT_TIME_KEY, value));
    } catch (err) {
      console.warn('saveNightTime localStorage error:', err);
      return false;
    }
  }

  function saveHomepageBg(id) {
    try {
      return isWriteAccepted(localStorage.setItem('homepageBg', id));
    } catch (err) {
      console.warn('saveHomepageBg localStorage error:', err);
      return false;
    }
  }

  function readHomepageBg() {
    try {
      return localStorage.getItem('homepageBg');
    } catch (err) {
      console.warn('readHomepageBg localStorage error:', err);
      return null;
    }
  }

  function getAllBackgrounds() {
    const builtin = Array.isArray(window._backgrounds) ? window._backgrounds : [];
    const customApi = window._customBackgrounds;
    const custom = customApi && typeof customApi.getCachedList === 'function'
      ? customApi.getCachedList()
      : [];
    return builtin.concat(custom);
  }

  function getUploadsLabel() {
    try {
      if (window.i18n && typeof window.i18n.t === 'function') {
        const translated = window.i18n.t('bgRotationUploads');
        // t() returns the raw key when no locale defines it
        if (translated && translated !== 'bgRotationUploads') return translated;
      }
    } catch (err) {
      console.warn('i18n lookup failed for bgRotationUploads:', err);
    }
    return 'Your uploads';
  }

  function filterBySelection(all, selection) {
    if (selection) {
      return all.filter(function (bg) { return selection.indexOf(bg.id) !== -1; });
    }
    return all;
  }

  function getRotatableBackgrounds() {
    return filterBySelection(getAllBackgrounds(), loadSelection());
  }

  function getSideBackgrounds(side) {
    const selection = side === 'day' ? loadDaySelection() : loadNightSelection();
    return filterBySelection(getAllBackgrounds(), selection);
  }

  // Pool the next advance draws from: the day/night side pool under the
  // 'tod' cadence, the regular rotation selection otherwise.
  function getActivePool() {
    if (loadInterval() === TOD_INTERVAL_KEY) {
      return getSideBackgrounds(getScheduledSide());
    }
    return getRotatableBackgrounds();
  }

  // Parse "HH:MM" into minutes since midnight (mirrors auto-theme.js;
  // kept local so the two modules stay independent).
  function parseTimeMinutes(timeStr) {
    const parts = String(timeStr).split(':');
    if (parts.length !== 2) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  }

  // Which pool is scheduled now: 'day' between day-time and night-time,
  // 'night' otherwise — including inverted schedules (e.g. day 19:00,
  // night 07:00), the same boundary model auto-theme uses.
  function getScheduledSide() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const dayMinutes = parseTimeMinutes(loadDayTime());
    const nightMinutes = parseTimeMinutes(loadNightTime());

    if (dayMinutes < nightMinutes) {
      return (currentMinutes >= dayMinutes && currentMinutes < nightMinutes) ? 'day' : 'night';
    }
    if (dayMinutes > nightMinutes) {
      return (currentMinutes >= nightMinutes && currentMinutes < dayMinutes) ? 'night' : 'day';
    }
    return 'night';
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const randomValue = new Uint32Array(1);
      const range = i + 1;
      const maxUnbiasedValue = Math.floor(0x100000000 / range) * range;
      do {
        crypto.getRandomValues(randomValue);
      } while (randomValue[0] >= maxUnbiasedValue);
      const j = randomValue[0] % range;
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  let shuffledPool = [];
  let poolIndex = 0;
  // The rotation advance whose homepageBg write has not settled yet, plus the
  // storage value it replaced so a later failure can be attributed to that
  // exact write. Async bridge failures use this to tell a rotation advance
  // apart from settings, custom-background, and import writers that share the
  // homepageBg key, so only rotation failures rewind the pool. The record is
  // independent of the timer lifecycle: a write issued before the rotation
  // was stopped or restarted must still settle when its failure arrives.
  let pendingAdvance = null;

  function getNextBackground() {
    const pool = getActivePool();
    if (pool.length === 0) return null;

    if (shuffledPool.length === 0 || poolChanged(pool)) {
      shuffledPool = shuffleArray(pool);
      poolIndex = 0;
    }

    const bg = shuffledPool[poolIndex];
    poolIndex = (poolIndex + 1) % shuffledPool.length;
    return bg;
  }

  function poolChanged(currentPool) {
    if (shuffledPool.length !== currentPool.length) return true;
    const currentIds = new Set(currentPool.map(function (p) { return p.id; }));
    for (let i = 0; i < shuffledPool.length; i++) {
      if (!currentIds.has(shuffledPool[i].id)) return true;
    }
    return false;
  }

  // Rewind the pool so the next advance retries the entry whose write failed.
  // indexOf guards the async path: the pool may have been reshuffled between
  // the advance and the failure being reported.
  function restorePoolIndexFor(bg) {
    const index = shuffledPool.indexOf(bg);
    if (index !== -1) {
      poolIndex = index;
    }
  }

  function applyBackgroundUI() {
    if (typeof window.applyBg === 'function') {
      window.applyBg();
    }
    if (typeof window.applyBgOverlaySettings === 'function') {
      window.applyBgOverlaySettings();
    }
  }

  // The optional side tags a time-of-day boundary advance so a failed write
  // can un-consume the boundary it was applying. Returns whether the write was
  // accepted (an async failure is handled by handleHomepageBgSaveFailure).
  function advanceBackground(side) {
    const bg = getNextBackground();
    if (!bg) return false;
    pendingAdvance = { bg: bg, previous: readHomepageBg(), side: side || null };
    const accepted = saveHomepageBg(bg.id);
    if (!accepted) {
      // Synchronous rejection: roll back now. The bridge also dispatches
      // storageBridgeWriteError for this write, but its deferred handler
      // finds pendingAdvance cleared and stays silent, so the toast fires
      // exactly once.
      pendingAdvance = null;
      restorePoolIndexFor(bg);
      showRotationSaveError();
    }
    applyBackgroundUI();
    return accepted;
  }

  // Apply the active side's background unless the displayed one already
  // belongs to that side's pool. Runs whenever the 'tod' cadence (re)starts
  // — fresh load, enable, settings change, import — so a background from
  // the wrong side is corrected without waiting for the next boundary.
  // Returns 'skipped' when no write was needed, 'accepted' for a successful
  // write, or 'rejected' for a write the storage bridge refused. The side is
  // tagged on the write so an async failure can un-consume the boundary.
  function applyActiveSideBackground(side) {
    const pool = getActivePool();
    if (pool.length === 0) return 'skipped';
    const current = readHomepageBg();
    if (current && pool.some(function (bg) { return bg.id === current; })) return 'skipped';
    return advanceBackground(side) ? 'accepted' : 'rejected';
  }

  // Force the next advance past the background already on screen: the two
  // pools may overlap across a boundary, so the (re)shuffled head can land
  // on the displayed entry. Returns true when the caller can commit the
  // boundary — either a write was accepted, or the side has an empty pool
  // and there is nothing to write. A rejected write returns false so the
  // boundary stays available for a later retry.
  function advancePastShownBackground(side) {
    const pool = getActivePool();
    if (pool.length === 0) return true;
    if (shuffledPool.length === 0 || poolChanged(pool)) {
      shuffledPool = shuffleArray(pool);
      poolIndex = 0;
    }
    skipShownBackgroundOnNextAdvance();
    return advanceBackground(side);
  }

  // Boundary check for the 'tod' cadence: swap into the newly scheduled
  // side's pool exactly once per crossing (the auto-theme model).
  function checkTodSide() {
    if (!loadEnabled() || loadInterval() !== TOD_INTERVAL_KEY) return;
    const side = getScheduledSide();
    if (side === lastScheduledSide) return;
    // Commit the boundary when the crossing is observed: an empty side has
    // nothing to write, while a rejected write stays retryable.
    if (!advancePastShownBackground(side)) return;
    lastScheduledSide = side;
  }

  function startTodRotation() {
    const side = getScheduledSide();
    // Record the side only after the startup write is accepted, or when no
    // write was needed. A rejected write leaves the boundary open so a later
    // check can retry; an async failure clears it in handleHomepageBgSaveFailure.
    const startupResult = applyActiveSideBackground(side);
    if (startupResult !== 'rejected') {
      lastScheduledSide = side;
    }
    // A lone background shared by both sides can never produce a swap, but
    // an explicit empty side still needs the timer to put the other side's
    // single background on screen when the boundary is crossed. When a
    // startup write was attempted, keep the timer as the retry path even in
    // the shared-singleton case, so a failed write can still be corrected.
    const dayPool = getSideBackgrounds('day');
    const nightPool = getSideBackgrounds('night');
    const ids = new Set();
    dayPool.forEach(function (bg) { ids.add(bg.id); });
    nightPool.forEach(function (bg) { ids.add(bg.id); });
    const noSwapPossible = ids.size === 0 || (ids.size === 1 && dayPool.length > 0 && nightPool.length > 0);
    if (startupResult === 'skipped' && noSwapPossible) return;
    if (window.VisibilityInterval) {
      rotationTimer = new window.VisibilityInterval(function () {
        checkTodSide();
      }, TOD_CHECK_INTERVAL_MS);
    } else {
      rotationTimer = setInterval(function () {
        checkTodSide();
      }, TOD_CHECK_INTERVAL_MS);
    }
  }

  function startRotation() {
    stopRotation();
    if (!loadEnabled()) return;

    const intervalKey = loadInterval();

    if (intervalKey === TOD_INTERVAL_KEY) {
      startTodRotation();
      return;
    }

    const pool = getRotatableBackgrounds();
    if (pool.length <= 1) return;

    if (intervalKey === 'newtab') {
      // Cadence with no timer: prime the pool for advanceBackground() and
      // arm nothing. The advance happens once per document load in
      // advanceOnceOnLoad(), never here — startRotation() also runs for
      // settings changes, picker edits, and imports, which must not
      // advance until the next load.
      shuffledPool = shuffleArray(pool);
      poolIndex = 0;
      return;
    }

    const intervalMs = INTERVAL_OPTIONS[intervalKey] || INTERVAL_OPTIONS['30min'];

    if (intervalKey === 'hourly') {
      // Special case: align to top of the hour
      const now = new Date();
      const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
      const initialDelay = nextHour.getTime() - now.getTime();

      // Use setTimeout for initial delay, then setInterval for subsequent runs
      rotationTimer = setTimeout(function () {
        advanceBackground();
        rotationTimer = window.VisibilityInterval
          ? new window.VisibilityInterval(function () { advanceBackground(); }, intervalMs, false, false)
          : setInterval(function () { advanceBackground(); }, intervalMs);
      }, initialDelay);
    } else {
      if (window.VisibilityInterval) {
        rotationTimer = new window.VisibilityInterval(function () {
          advanceBackground();
        }, intervalMs, false, false);
      } else {
        rotationTimer = setInterval(function () {
          advanceBackground();
        }, intervalMs);
      }
    }

    shuffledPool = shuffleArray(pool);
    poolIndex = 0;
  }

  function stopRotation() {
    if (rotationTimer) {
      if (typeof rotationTimer.destroy === 'function') {
        rotationTimer.destroy();
      } else {
        clearTimeout(rotationTimer);
        clearInterval(rotationTimer);
      }
      rotationTimer = null;
    }
    shuffledPool = [];
    poolIndex = 0;
    lastScheduledSide = null;
    // pendingAdvance deliberately survives: a homepageBg write issued before
    // this stop can still fail, and its rollback must repaint the background
    // even though the timer that started it is gone.
  }

  function applyRotation() {
    if (loadEnabled()) {
      startRotation();
    } else {
      stopRotation();
    }
  }

  // Point the next advance past the background that is already displayed,
  // so a fresh tab visibly changes even when the shuffled head matches
  // homepageBg. startRotation() has just primed the pool for the 'newtab'
  // cadence, so poolIndex marks the entry getNextBackground() will return.
  function skipShownBackgroundOnNextAdvance() {
    if (shuffledPool.length <= 1) return;
    const current = readHomepageBg();
    if (!current) return;
    if (shuffledPool[poolIndex] && shuffledPool[poolIndex].id === current) {
      poolIndex = (poolIndex + 1) % shuffledPool.length;
    }
  }

  // Advance exactly once for the 'newtab' cadence, gated to the first
  // apply of this document. init() and the custom-background cache retry
  // call this: settings changes, picker edits, and imports re-enter
  // applyRotation()/startRotation() but never the load path, so they defer
  // the advance to the next load.
  function advanceOnceOnLoad() {
    if (loadAdvanceConsumed) return;
    if (!loadEnabled() || loadInterval() !== 'newtab') {
      loadAdvanceConsumed = true;
      return;
    }
    const pool = getRotatableBackgrounds();
    // An empty pool can mean the async custom-background cache has not
    // landed yet for an upload-only selection. Stay unconsumed so the
    // custombackgroundschanged retry can still complete this load advance;
    // a persisted empty selection simply never reaches that path.
    if (pool.length === 0) return;
    loadAdvanceConsumed = true;
    // startRotation() skips a pool of one; mirror that so a single
    // background never churns homepageBg.
    if (pool.length <= 1) return;
    skipShownBackgroundOnNextAdvance();
    advanceBackground();
  }

  // Show/hide the cadence-specific controls from persisted state: the
  // interval select and picker follow the toggle, while the time-of-day
  // schedule card and the regular picker swap with the selected cadence.
  function updateRotationVisibility() {
    const enabled = loadEnabled();
    const isTod = loadInterval() === TOD_INTERVAL_KEY;
    const optionsEl = document.getElementById('bg-rotation-options');
    const pickerWrap = document.getElementById('bg-rotation-picker-wrap');
    const todEl = document.getElementById('bg-rotation-tod');
    if (optionsEl) optionsEl.hidden = !enabled;
    if (pickerWrap) pickerWrap.hidden = !enabled || isTod;
    if (todEl) todEl.hidden = !enabled || !isTod;
  }

  function syncRotationUI() {
    const toggle = document.getElementById('bg-rotation-toggle');
    const intervalSelect = document.getElementById('bg-rotation-interval');
    const dayInput = document.getElementById('bg-rotation-day-time');
    const nightInput = document.getElementById('bg-rotation-night-time');

    if (toggle) {
      toggle.checked = loadEnabled();
    }
    if (intervalSelect) {
      intervalSelect.value = loadInterval();
    }
    if (dayInput) {
      dayInput.value = loadDayTime();
    }
    if (nightInput) {
      nightInput.value = loadNightTime();
    }
    updateRotationVisibility();
    renderBackgroundPicker();
  }

  function getEffectiveSelection(selection) {
    return selection || getAllBackgrounds().map(function (bg) { return bg.id; });
  }

  // True when a picker's checkboxes disagree with the selection it
  // persists (null selection = every background checked).
  function pickerDiffersFromStorage(containerId, selection) {
    const picker = document.getElementById(containerId);
    if (!picker) return false;
    const shown = [];
    const rendered = new Set();
    picker.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      rendered.add(cb.value);
      if (cb.checked) shown.push(cb.value);
    });
    const stored = getEffectiveSelection(selection).filter(function (id) {
      return rendered.has(id);
    });
    if (shown.length !== stored.length) return true;
    for (const id of shown) {
      if (!stored.includes(id)) return true;
    }
    return false;
  }

  // True when a rotation control shows a value that differs from storage,
  // i.e. a failed write left the UI ahead of the persisted state.
  function rotationUIDiffersFromStorage() {
    const toggle = document.getElementById('bg-rotation-toggle');
    if (toggle && toggle.checked !== loadEnabled()) return true;

    const intervalSelect = document.getElementById('bg-rotation-interval');
    if (intervalSelect && intervalSelect.value !== loadInterval()) return true;

    const dayInput = document.getElementById('bg-rotation-day-time');
    if (dayInput && dayInput.value !== loadDayTime()) return true;

    const nightInput = document.getElementById('bg-rotation-night-time');
    if (nightInput && nightInput.value !== loadNightTime()) return true;

    if (pickerDiffersFromStorage('bg-rotation-picker', loadSelection())) return true;
    if (pickerDiffersFromStorage('bg-rotation-day-picker', loadDaySelection())) return true;
    if (pickerDiffersFromStorage('bg-rotation-night-picker', loadNightSelection())) return true;
    return false;
  }

  // A synchronous bridge failure both dispatches storageBridgeWriteError and
  // makes setItem return false, so this can be reached twice for one failed
  // write. Only act when the UI is actually out of sync with storage: the
  // first call resyncs, the second finds nothing to do. This also keeps a
  // superseded async failure (no rollback happened) silent.
  function handleRotationSaveFailure() {
    if (!rotationUIDiffersFromStorage()) {
      return;
    }
    syncRotationUI();
    applyRotation();
    showRotationSaveError();
  }

  // True when a homepageBg failure belongs to the pending rotation advance.
  // Exposed so the generic toast.js async resync can stay silent for
  // rotation-owned writes and leave the error to this module's
  // rotation-specific handler (otherwise one failed advance toasts twice).
  // Mirrors handleHomepageBgSaveFailure's value attribution without
  // retiring the record.
  function ownsPendingHomepageBgWrite(value) {
    const pending = pendingAdvance;
    if (!pending) {
      return false;
    }
    if (typeof value === 'string' && value !== pending.bg.id) {
      return false;
    }
    return true;
  }

  // Async homepageBg failures: the write was optimistically accepted and the
  // new background may already be painted, so re-apply the rolled-back value.
  // Only react when the failure belongs to a rotation advance — settings,
  // custom-background, and import writers share the homepageBg key and must
  // not rewind the pool. Attribution uses the failed write the bridge reports:
  // its value must be the advance's, and storage must now hold exactly the
  // value the advance replaced — the bridge restores only that for the write
  // it actually failed. Either outcome retires the record: a matching value
  // means the write it tracked has settled.
  function handleHomepageBgSaveFailure(detail) {
    const pending = pendingAdvance;
    if (!pending) {
      return;
    }
    if (typeof detail?.value === 'string' && detail.value !== pending.bg.id) {
      return;
    }
    pendingAdvance = null;
    // A boundary advance whose write failed never reached the new side;
    // un-consume it so a later check can retry the swap.
    if (pending.side && lastScheduledSide === pending.side) {
      lastScheduledSide = null;
    }
    if (readHomepageBg() !== pending.previous) {
      return;
    }
    restorePoolIndexFor(pending.bg);
    applyBackgroundUI();
    showRotationSaveError();
  }

  // Async bridge failures: persistSet() optimistically returns true and only
  // reports runtime.lastError here, after which the bridge rolls its cache
  // back. Defer the UI/timer resync so it reads the rolled-back state.
  window.addEventListener('storageBridgeWriteError', function (event) {
    const key = event.detail?.key;
    if (key === 'homepageBg') {
      setTimeout(function () { handleHomepageBgSaveFailure(event.detail); }, 0);
      return;
    }
    if (!ROTATION_STORAGE_KEYS.has(key)) {
      return;
    }
    setTimeout(handleRotationSaveFailure, 0);
  });

  function renderPickerInto(container, selection) {
    if (!container) return;

    container.innerHTML = '';
    const all = getAllBackgrounds();
    let uploadsDivider = null;

    all.forEach(function (bg) {
      const isCustom = !!(window._customBackgrounds &&
        typeof window._customBackgrounds.isCustom === 'function' &&
        window._customBackgrounds.isCustom(bg.id));

      if (isCustom && !uploadsDivider) {
        const header = document.createElement('div');
        header.className = 'bg-rotation-pick-divider';
        header.textContent = getUploadsLabel();
        container.appendChild(header);
        uploadsDivider = header;
      }

      const label = document.createElement('label');
      label.className = 'bg-rotation-pick-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = bg.id;
      checkbox.checked = selection ? selection.indexOf(bg.id) !== -1 : true;

      const img = document.createElement('img');
      img.className = 'bg-rotation-pick-thumb';
      img.src = bg.thumb;
      img.alt = bg.title;
      img.loading = 'lazy';

      let thumbEl = img;
      if (isCustom) {
        img.dataset.custom = 'true';
        if (bg.type === 'video') {
          // Wrap in a span: <img> is a replaced element, so the ::after
          // play badge on .bg-thumb-video would never render on it.
          thumbEl = document.createElement('span');
          thumbEl.className = 'bg-rotation-pick-thumb-wrap bg-thumb-video';
          thumbEl.appendChild(img);
        }
      }

      const name = document.createElement('span');
      name.className = 'bg-rotation-pick-name';
      name.textContent = bg.title;

      label.appendChild(checkbox);
      label.appendChild(thumbEl);
      label.appendChild(name);
      container.appendChild(label);
    });
  }

  function renderBackgroundPicker() {
    renderPickerInto(document.getElementById('bg-rotation-picker'), loadSelection());
    renderPickerInto(document.getElementById('bg-rotation-day-picker'), loadDaySelection());
    renderPickerInto(document.getElementById('bg-rotation-night-picker'), loadNightSelection());
  }

  // Persist one picker's checkbox state and restart the schedule so a
  // changed pool is re-evaluated (the active side may now mismatch).
  function bindPickerChange(containerId, saveFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('change', function (e) {
      if (e.target.matches && e.target.matches('.bg-rotation-pick-item input[type="checkbox"]')) {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        const selected = [];
        checkboxes.forEach(function (cb) {
          if (cb.checked) selected.push(cb.value);
        });
        if (!saveFn(selected)) {
          handleRotationSaveFailure();
          return;
        }
        if (loadEnabled()) startRotation();
      }
    });
  }

  function bindTimeChange(inputId, saveFn, defaultValue) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', function () {
      // A cleared time input reports '' while load*Time() falls back to
      // the default, so normalize first to keep the UI and storage in sync.
      if (!input.value) input.value = defaultValue;
      if (!saveFn(input.value)) {
        handleRotationSaveFailure();
        return;
      }
      // A boundary may have moved with the edited time; apply it now
      // instead of waiting up to one check interval (auto-theme does the
      // same immediate re-evaluation on a time change).
      checkTodSide();
    });
  }

  function initRotationUI() {
    const toggle = document.getElementById('bg-rotation-toggle');
    const intervalSelect = document.getElementById('bg-rotation-interval');
    const nextBtn = document.getElementById('bg-rotation-next');

    if (toggle) {
      toggle.addEventListener('change', function () {
        if (!saveEnabled(toggle.checked)) {
          handleRotationSaveFailure();
          return;
        }
        updateRotationVisibility();
        applyRotation();
      });
    }

    if (intervalSelect) {
      intervalSelect.addEventListener('change', function () {
        if (!saveInterval(intervalSelect.value)) {
          handleRotationSaveFailure();
          return;
        }
        updateRotationVisibility();
        if (loadEnabled()) startRotation();
      });
    }

    // Seeding (toggle, interval, time inputs, visibility, pickers) comes from
    // the same storage read as a later sync, so a fresh load and a refresh
    // can never show different persisted values.
    syncRotationUI();

    bindPickerChange('bg-rotation-picker', saveSelection);
    bindPickerChange('bg-rotation-day-picker', saveDaySelection);
    bindPickerChange('bg-rotation-night-picker', saveNightSelection);
    bindTimeChange('bg-rotation-day-time', saveDayTime, DEFAULT_DAY_TIME);
    bindTimeChange('bg-rotation-night-time', saveNightTime, DEFAULT_NIGHT_TIME);

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        advanceBackground();
      });
    }
  }

  function init() {
    initRotationUI();
    applyRotation();
    // After applyRotation(): for 'newtab' it has already primed the pool,
    // so the load advance picks from it instead of reshuffling.
    advanceOnceOnLoad();

    // Keep the picker in sync when the upload metadata cache lands or
    // changes (upload/delete paths dispatch this after re-rendering).
    // applyRotation() re-evaluates the pool: a persisted upload-only
    // selection starts only once the async cache fills, and crossing the
    // one-background threshold on upload/delete must start/stop the timer.
    document.addEventListener('custombackgroundschanged', function () {
      renderBackgroundPicker();
      applyRotation();
      // The cache may have just resolved an upload-only selection: retry
      // the load advance that advanceOnceOnLoad() deferred while the pool
      // was still empty (still gated by its one-time flag).
      advanceOnceOnLoad();
    });

    // Re-render so the uploads divider follows the active language.
    window.addEventListener('languageChanged', function () {
      renderBackgroundPicker();
    });

    // Prime the upload metadata cache so uploaded backgrounds are part of
    // the rotation pool without requiring a visit to the settings page.
    const customApi = window._customBackgrounds;
    if (customApi && typeof customApi.refresh === 'function') {
      customApi.refresh().catch(function (err) {
        console.warn('Custom background metadata unavailable for rotation:', err);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BackgroundRotation = {
    apply: applyRotation,
    syncUI: syncRotationUI,
    advance: advanceBackground,
    isEnabled: loadEnabled,
    getInterval: loadInterval,
    getSelection: loadSelection,
    getDayTime: loadDayTime,
    getNightTime: loadNightTime,
    getDaySelection: loadDaySelection,
    getNightSelection: loadNightSelection,
    start: startRotation,
    stop: stopRotation,
    renderPicker: renderBackgroundPicker,
    initUI: initRotationUI,
    ownsPendingHomepageBgWrite: ownsPendingHomepageBgWrite,
  };
})();
