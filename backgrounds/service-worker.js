const CHECK_INTERVAL_MINUTES = 1;
// MV3 periodInMinutes alarms are best-effort and routinely fire slightly late
// (battery saver, batching). A check landing up to one interval past `due`
// still counts as current, so a late alarm delivers instead of silently
// dropping the reminder (#1090). Anything beyond this stays skipped to keep
// the anti-stale-banner guarantee.
const REMINDER_LATE_GRACE_MINUTES = CHECK_INTERVAL_MINUTES;
// SYNC: This alarm name must match the hardcoded string in src/features/todo.js fallback
const ALARM_NAME = 'todoReminderCheck';
// SYNC: These two migration constants must match the ones in
// src/features/migrate-legacy.js. Registering the uninstall redirect here (on
// install/startup) means uninstalls of the legacy listing land on the current
// listing even if the user never opens a new tab, where the page module would
// otherwise be the only place to set it.
const MIGRATION_ENABLED = false;
const MIGRATION_LISTING_URL =
  'https://chromewebstore.google.com/detail/new-tab/maifjidpfffffeapgephnpdhomkocncd';
// Durable placeholder written between the notified-map pre-persist and the
// confirmation write. A 'pending' value means the reminder was durably claimed
// but never confirmed as shown (creation or cleanup write failed), so the next
// check retries it instead of treating it as already notified.
const PENDING_NOTIFIED_MARK = 'pending';
let reminderCheckInProgress = false;
const reminderCheckPendingQueue = [];

// dueDate is written as a local YYYY-MM-DD string, but
// legacy or hand-edited todos may hold other shapes. Accept only that format and
// parse it as a local-time Date at end-of-day so the reminder window fires on the
// due date itself. Returns null for any malformed value (including calendar
// rollovers like 2026-13-45) so callers can warn instead of silently skipping.
// SYNC: keep this validation (pattern + calendar round-trip) in sync with the
// dueDate check in validateTodoData.
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DUE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
function parseDueDate(dueDate, dueTime) {
  if (typeof dueDate !== 'string' || !DUE_DATE_PATTERN.test(dueDate)) return null;
  const [year, month, day] = dueDate.split('-').map(Number);
  let hours = 23;
  let minutes = 59;
  let seconds = 59;
  let milliseconds = 999;
  if (typeof dueTime === 'string' && DUE_TIME_PATTERN.test(dueTime)) {
    const [h, m] = dueTime.split(':').map(Number);
    hours = h;
    minutes = m;
    seconds = 0;
    milliseconds = 0;
  }
  // new Date(y, m-1, d) silently rolls invalid calendar dates forward (e.g.
  // 2026-02-30 -> March 2) and maps years 0-99 to 1900+year; reject those by
  // round-tripping the components.
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  date.setMilliseconds(milliseconds);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

// Dedup key for an item whose dueDate is present but malformed, or null when the
// item should be silently skipped (completed, or no dueDate) or its dueDate
// parses cleanly. Shared by the reminder loop's warning dedup and the stale
// state pruning below so the "is this malformed" rule (and the key shape) only
// lives in one place. Note that an empty-string dueDate counts as malformed,
// while null/undefined means "no date" and is skipped silently.
function invalidDueDateKey(todo) {
  if (todo.completed) return null;
  if (todo.dueDate === null || todo.dueDate === undefined) return null;
  if (parseDueDate(todo.dueDate, todo.dueTime)) return null;
  const timePart = todo.dueTime ? '_' + todo.dueTime : '';
  return todo.id + '_' + todo.dueDate + timePart;
}

// The MV3 callback API reports failed reads/writes through
// chrome.runtime.lastError instead of rejecting, so both wrappers inspect it
// inside the callback and reject. Without that guard a failed write resolves
// as success and callers cannot tell a durable result from a lost one. A
// promise-style storage area can instead reject without ever invoking the
// callback, so each wrapper also observes the returned promise's rejection;
// otherwise that failure escapes as an unhandled rejection and the wrapper
// never settles.
async function getFromStorage(keys) {
  return new Promise((resolve, reject) => {
    const result = chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items);
    });
    Promise.resolve(result).catch(reject);
  });
}

async function setToStorage(items) {
  return new Promise((resolve, reject) => {
    const result = chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
    Promise.resolve(result).catch(reject);
  });
}

async function checkReminders(todosJson, options = {}) {
  if (reminderCheckInProgress) {
    // Hand back a promise that settles with the queued run itself, so callers
    // (notably the syncTodos message handler) report the real outcome instead
    // of acking success before the check has even started.
    return new Promise((resolve, reject) => {
      reminderCheckPendingQueue.push({ todosJson, options, resolve, reject });
    });
  }
  reminderCheckInProgress = true;
  try {
    try {
      await runReminderCheck(todosJson, options);
    } finally {
      while (reminderCheckPendingQueue.length > 0) {
        const next = reminderCheckPendingQueue.shift();
        try {
          await runReminderCheck(next.todosJson, next.options);
          next.resolve();
        } catch (e) {
          next.reject(e);
        }
      }
    }
  } finally {
    reminderCheckInProgress = false;
  }
}

function parseTodosPayload(todosJson, fallbackJson) {
  const raw = todosJson || fallbackJson;
  if (raw === undefined || raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Skipping todo reminder check: corrupt todos payload', e);
    return null;
  }
}

function getLeadTime(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? 30 : parsed;
}

function getTodoIdFromKey(key) {
  // notifiedKey is id_YYYY-MM-DD or id_YYYY-MM-DD_HH:mm; id may contain underscores.
  // Strip optional time suffix first, then strip date suffix to recover id.
  let base = key;
  const lastUnderscore = base.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const suffix = base.slice(lastUnderscore + 1);
    if (DUE_TIME_PATTERN.test(suffix)) {
      base = base.slice(0, lastUnderscore);
    }
  }
  const idx = base.lastIndexOf('_');
  return idx !== -1 ? base.slice(0, idx) : base;
}

function clearAllNotified(notified) {
  const ids = new Set();
  for (const key of Object.keys(notified)) ids.add(getTodoIdFromKey(key));
  for (const id of ids) chrome.notifications.clear('todo_reminder_' + id);
  return {};
}

function clearEntriesForTodo(notified, todoId) {
  let updated = false;
  for (const key of Object.keys(notified)) {
    if (key.startsWith(todoId + '_')) {
      delete notified[key];
      updated = true;
    }
  }
  return updated;
}

function applySyncMutations(notified, options) {
  let result = notified;
  let resetApplied = false;
  if (options.resetNotified) {
    result = clearAllNotified(result);
    resetApplied = true;
  }
  if (options.todoId) {
    // Clear the desktop notification unconditionally so a diverged Chrome /
    // storage state (e.g. failed prior write) does not leave a stale banner.
    chrome.notifications.clear('todo_reminder_' + options.todoId);
    if (clearEntriesForTodo(result, options.todoId)) resetApplied = true;
  }
  return { notified: result, resetApplied };
}

function pruneStaleNotified(notified, todos) {
  const validKeys = new Set(
    todos
      .filter((t) => !t.completed && t.dueDate)
      .map((t) => {
        const timePart = t.dueTime && DUE_TIME_PATTERN.test(t.dueTime) ? '_' + t.dueTime : '';
        return t.id + '_' + t.dueDate + timePart;
      })
  );
  let updated = false;
  for (const key of Object.keys(notified)) {
    if (!validKeys.has(key)) {
      chrome.notifications.clear('todo_reminder_' + getTodoIdFromKey(key));
      delete notified[key];
      updated = true;
    }
  }
  return updated;
}

function pruneStaleWarned(warnedInvalidDueDates, todos) {
  const currentInvalidKeys = new Set(
    todos.map(invalidDueDateKey).filter((key) => key !== null)
  );
  let warnedUpdated = false;
  for (const key of Object.keys(warnedInvalidDueDates)) {
    if (!currentInvalidKeys.has(key)) {
      delete warnedInvalidDueDates[key];
      warnedUpdated = true;
    }
  }
  return warnedUpdated;
}

function handleInvalidDueDate(todo, warnedInvalidDueDates) {
  const warnedKey = invalidDueDateKey(todo);
  if (!warnedKey) return { skip: false, warnedUpdated: false };
  let warnedUpdated = false;
  if (!warnedInvalidDueDates[warnedKey]) {
    warnedInvalidDueDates[warnedKey] = true;
    warnedUpdated = true;
    console.warn('Skipping todo reminder: invalid dueDate', todo.id, todo.dueDate);
  }
  return { skip: true, warnedUpdated };
}

/**
 * Decides whether a todo is eligible for a reminder on this check.
 *
 * Returns a skip decision, or a candidate carrying the notified key and due
 * display text. Fresh candidates are bounded by [reminderTime, graceEnd]
 * (one check interval of late tolerance per #1090); a durable
 * PENDING_NOTIFIED_MARK whose confirmation never landed stays retryable even
 * past graceEnd so a failed notification/cleanup near due cannot strand it.
 */
function getDueReminderCandidate(todo, notified, warnedInvalidDueDates, now, leadTime) {
  if (todo.completed || todo.dueDate === null || todo.dueDate === undefined) {
    return { skip: true, warnedUpdated: false };
  }
  const invalid = handleInvalidDueDate(todo, warnedInvalidDueDates);
  if (invalid.skip) {
    return { skip: true, warnedUpdated: invalid.warnedUpdated };
  }
  const due = parseDueDate(todo.dueDate, todo.dueTime);
  const reminderTime = new Date(due.getTime() - Math.max(leadTime, CHECK_INTERVAL_MINUTES) * 60 * 1000);
  const graceEnd = new Date(due.getTime() + REMINDER_LATE_GRACE_MINUTES * 60 * 1000);
  const timePart = todo.dueTime && DUE_TIME_PATTERN.test(todo.dueTime) ? '_' + todo.dueTime : '';
  const notifiedKey = todo.id + '_' + todo.dueDate + timePart;
  // A PENDING_NOTIFIED_MARK is a claim whose confirmation never landed, so it
  // stays retryable instead of suppressing the reminder forever. It must be
  // detected before the late cutoff, or a failed notification/cleanup near the
  // due time would strand the durable mark un-retried past the grace window.
  const pendingRetry = notified[notifiedKey] === PENDING_NOTIFIED_MARK;
  // #1090: tolerate checks up to one interval past `due` (MV3 alarms fire
  // late routinely) so a late-but-recent check still delivers; the notified
  // key is recorded below either way, so the grace path never repeats.
  if (now < reminderTime || (now > graceEnd && !pendingRetry)) {
    return { skip: true, warnedUpdated: false };
  }
  if (notified[notifiedKey] && !pendingRetry) {
    return { skip: true, warnedUpdated: false };
  }
  let dueDisplay = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (todo.dueTime && DUE_TIME_PATTERN.test(todo.dueTime)) {
    dueDisplay += ' ' + due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return { skip: false, warnedUpdated: false, notifiedKey, dueDisplay };
}

/**
 * Evaluates due todos and records each reminder only after its notified mark
 * is durable. The notified map is persisted before the notification is shown
 * so a failed write (chrome.runtime.lastError) rolls the marks back, fails
 * the check, and skips the notification — otherwise the next alarm check would
 * reload the stale map and repeat the reminder on every interval (#994).
 * Marks are pre-persisted as PENDING_NOTIFIED_MARK and confirmed with a
 * timestamp only after the notification is created: a failed creation is
 * rolled back so the final persist in runReminderCheck keeps the reminder
 * retryable (#743), and if even that cleanup write fails the durable
 * PENDING_NOTIFIED_MARK is retried by the next check instead of suppressing
 * the reminder forever.
 */
async function evaluateDueReminders(todos, notified, warnedInvalidDueDates, leadTime) {
  let warnedUpdated = false;
  const now = new Date();
  const pending = [];
  for (const todo of todos) {
    const candidate = getDueReminderCandidate(todo, notified, warnedInvalidDueDates, now, leadTime);
    if (candidate.warnedUpdated) warnedUpdated = true;
    if (candidate.skip) continue;
    pending.push({ todo, candidate });
  }
  if (pending.length > 0) {
    for (const { candidate } of pending) {
      notified[candidate.notifiedKey] = PENDING_NOTIFIED_MARK;
    }
    try {
      await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
    } catch (e) {
      for (const { candidate } of pending) {
        delete notified[candidate.notifiedKey];
      }
      throw e;
    }
    for (const { todo, candidate } of pending) {
      const notificationCreated = await showTodoNotification(todo, candidate.dueDisplay);
      if (notificationCreated) {
        notified[candidate.notifiedKey] = Date.now();
      } else {
        delete notified[candidate.notifiedKey];
      }
    }
  }
  return { updated: pending.length > 0, warnedUpdated };
}

async function runReminderCheck(todosJson, options = {}) {
  const keys = ['todoReminderEnabled', 'todoReminderLeadTime', 'todoReminderNotified', 'warnedInvalidDueDates'];
  if (!todosJson) keys.push('todos');
  const data = await getFromStorage(keys);
  const todos = parseTodosPayload(todosJson, data.todos);
  const leadTime = getLeadTime(data.todoReminderLeadTime);
  const syncResult = applySyncMutations(data.todoReminderNotified || {}, options);
  let notified = syncResult.notified;
  let resetApplied = syncResult.resetApplied;

  if (String(data.todoReminderEnabled) !== 'true') {
    if (resetApplied) {
      await setToStorage({ todoReminderNotified: notified });
    }
    return;
  }
  const warnedInvalidDueDates = data.warnedInvalidDueDates || {};
  if (!Array.isArray(todos)) {
    if (resetApplied) {
      await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
    }
    return;
  }

  const staleNotifiedUpdated = pruneStaleNotified(notified, todos);
  const staleWarnedUpdated = pruneStaleWarned(warnedInvalidDueDates, todos);

  if (todos.length === 0) {
    if (staleNotifiedUpdated || staleWarnedUpdated || resetApplied) {
      await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
    }
    return;
  }

  const reminderResult = await evaluateDueReminders(todos, notified, warnedInvalidDueDates, leadTime);
  // A failed write rejects here on purpose: a check whose notified map could
  // not be persisted has failed, and the callers (alarm listener, queued path,
  // sync response) already surface that rejection. When candidates were
  // attempted, this write confirms the PENDING_NOTIFIED_MARK of every shown
  // notification and stores any marks rolled back after a failed creation,
  // keeping those reminders retryable; if the write itself fails, the durable
  // PENDING_NOTIFIED_MARK still retries them on the next check.
  if (reminderResult.updated || staleNotifiedUpdated || staleWarnedUpdated || reminderResult.warnedUpdated || resetApplied) {
    await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
  }
}

/**
 * Creates a todo reminder notification and reports whether creation succeeded.
 */
async function showTodoNotification(todo, dueDisplay) {
  const id = 'todo_reminder_' + todo.id;
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: chrome.i18n.getMessage('todoReminderTitle'),
      message: chrome.i18n.getMessage('todoReminderMessage', [todo.text, dueDisplay])
    });
    return true;
  } catch (e) {
    console.warn('Failed to create todo reminder notification:', e);
    return false;
  }
}

function handleStartup() {
  // Point any uninstalls of the old item at the new listing (legacy-publisher
  // build only). No extra permission required.
  if (MIGRATION_ENABLED && chrome?.runtime?.setUninstallURL) {
    try {
      chrome.runtime.setUninstallURL(MIGRATION_LISTING_URL);
    } catch (e) {
      console.warn('Failed to set migration uninstall URL:', e);
    }
  }
  try {
    chrome.alarms.get(ALARM_NAME, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
      }
    });
  } catch (e) {
    console.warn('Failed to initialize alarm:', e);
  }
}

// Persist the onInstalled reason so the release-notes feature (which runs in
// the page context) can tell a fresh install ('install') apart from an upgrade
// ('update'). Prior releases never wrote lastSeenVersion, so a page-only check
// cannot distinguish a brand-new user from an existing user who just upgraded
// into release-notes support. The page reads this marker via localStorage
// (mirrored from chrome.storage.local by the storage bridge).
function persistInstallReason(details) {
  try {
    const reason = details && details.reason ? details.reason : 'unknown';
    chrome.storage.local.set({ releaseNotesInstallReason: reason }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to persist install reason:', chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.warn('Failed to persist install reason:', e);
  }
}

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    persistInstallReason(details);
    handleStartup();
  });
}
if (chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(handleStartup);
}

if (chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      checkReminders().catch((e) => {
        console.warn('Reminder check failed:', e);
      });
    }
  });
}

if (chrome?.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith('todo_reminder_')) {
      chrome.tabs.create({ url: 'New-Tab.html' });
      chrome.notifications.clear(notificationId);
    }
  });
}

// The toolbar action in manifest.json declares only default_icon (no
// default_popup), so this click handler is what makes the button do
// anything. MV3 treats the two as mutually exclusive: adding
// default_popup would suppress chrome.action.onClicked entirely.
if (chrome?.action?.onClicked) {
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: 'New-Tab.html' });
  });
}

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'syncTodos') {
      // Route all todoReminderNotified mutations through the same serialized
      // checkReminders critical section so a concurrent alarm check cannot
      // overwrite the handler's results with its stale copy.
      const run = checkReminders(message.todos, {
        resetNotified: !!message.resetNotified,
        todoId: message.todoId || null
      });
      run.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
  });
}
