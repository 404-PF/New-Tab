const CHECK_INTERVAL_MINUTES = 1;
// SYNC: This alarm name must match the hardcoded string in src/features/todo.js fallback
const ALARM_NAME = 'todoReminderCheck';
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
function parseDueDate(dueDate) {
  if (typeof dueDate !== 'string' || !DUE_DATE_PATTERN.test(dueDate)) return null;
  const [year, month, day] = dueDate.split('-').map(Number);
  // new Date(y, m-1, d) silently rolls invalid calendar dates forward (e.g.
  // 2026-02-30 -> March 2) and maps years 0-99 to 1900+year; reject those by
  // round-tripping the components.
  const date = new Date(year, month - 1, day, 23, 59, 59);
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
  if (parseDueDate(todo.dueDate)) return null;
  return todo.id + '_' + todo.dueDate;
}

async function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

async function setToStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

async function checkReminders(todosJson, options = {}) {
  if (reminderCheckInProgress) {
    reminderCheckPendingQueue.push({ todosJson, options });
    return;
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
        } catch (e) {
          console.warn('Queued reminder check failed:', e);
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
  const idx = key.lastIndexOf('_');
  return idx !== -1 ? key.slice(0, idx) : key;
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
      .map((t) => t.id + '_' + t.dueDate)
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

async function evaluateDueReminders(todos, notified, warnedInvalidDueDates, leadTime) {
  let updated = false;
  let warnedUpdated = false;
  const now = new Date();
  for (const todo of todos) {
    if (todo.completed || todo.dueDate === null || todo.dueDate === undefined) continue;
    const invalid = handleInvalidDueDate(todo, warnedInvalidDueDates);
    if (invalid.warnedUpdated) warnedUpdated = true;
    if (invalid.skip) continue;
    const due = parseDueDate(todo.dueDate);
    // A positive lead time opens the window [due - leadTime, due]. "At due
    // time" (leadTime 0) must not collapse that window to a single end-of-day
    // instant — a once-a-minute check would have to land exactly on
    // 23:59:59.000 to fire, so it would never actually go off. Keep the window
    // at least one check interval wide so the check scheduled for the due
    // instant always lands inside it.
    const reminderTime = new Date(due.getTime() - Math.max(leadTime, CHECK_INTERVAL_MINUTES) * 60 * 1000);
    if (now >= reminderTime && now <= due) {
      const notifiedKey = todo.id + '_' + todo.dueDate;
      if (notified[notifiedKey]) continue;
      const dueDisplay = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      await showTodoNotification(todo, dueDisplay);
      notified[notifiedKey] = Date.now();
      updated = true;
    }
  }
  return { updated, warnedUpdated };
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
  if (reminderResult.updated || staleNotifiedUpdated || staleWarnedUpdated || reminderResult.warnedUpdated || resetApplied) {
    await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
  }
}

async function showTodoNotification(todo, dueDisplay) {
  const id = 'todo_reminder_' + todo.id;
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: chrome.i18n.getMessage('todoReminderTitle'),
      message: chrome.i18n.getMessage('todoReminderMessage', [todo.text, dueDisplay])
    });
  } catch (e) {
    console.warn('Failed to create todo reminder notification:', e);
  }
}

function handleStartup() {
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
