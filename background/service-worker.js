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

async function runReminderCheck(todosJson, options = {}) {
  const keys = ['todoReminderEnabled', 'todoReminderLeadTime', 'todoReminderNotified', 'warnedInvalidDueDates'];
  if (!todosJson) keys.push('todos');
  const data = await getFromStorage(keys);
  let todos;
  if (todosJson) {
    try { todos = JSON.parse(todosJson); } catch (e) { console.warn('Skipping todo reminder check: corrupt todos payload', e); todos = null; }
  } else {
    try { todos = JSON.parse(data.todos); } catch (e) { console.warn('Skipping todo reminder check: corrupt todos payload', e); todos = null; }
  }
  const parsedLeadTime = parseInt(data.todoReminderLeadTime, 10);
  const leadTime = isNaN(parsedLeadTime) ? 30 : parsedLeadTime;
  let notified = data.todoReminderNotified || {};
  // When invoked via syncTodos with resetNotified / todoId, apply those
  // mutations inside this same read-modify-write cycle so a concurrent alarm
  // check cannot overwrite the result with its stale copy.
  let resetApplied = false;
  if (options.resetNotified) {
    const ids = new Set();
    for (const key of Object.keys(notified)) {
      const idx = key.lastIndexOf('_');
      ids.add(idx !== -1 ? key.slice(0, idx) : key);
    }
    for (const id of ids) {
      chrome.notifications.clear('todo_reminder_' + id);
    }
    notified = {};
    resetApplied = true;
  }
  if (options.todoId) {
    let todoUpdated = false;
    for (const key of Object.keys(notified)) {
      if (key.startsWith(options.todoId + '_')) {
        chrome.notifications.clear('todo_reminder_' + options.todoId);
        delete notified[key];
        todoUpdated = true;
      }
    }
    if (todoUpdated) resetApplied = true;
  }
  if (String(data.todoReminderEnabled) !== 'true') {
    if (resetApplied) {
      await setToStorage({ todoReminderNotified: notified });
    }
    return;
  }
  // Track invalid dueDates we've already warned about (keyed by item id + raw
  // dueDate) so a persistent malformed item doesn't re-print the same warning on
  // every alarm check. A changed dueDate gets a fresh key, so it warns anew.
  // This lives in storage rather than module state because MV3 service workers
  // are suspended after short idle periods: an in-memory Set would be emptied on
  // every wake, re-printing the warning on each 1-minute alarm check.
  const warnedInvalidDueDates = data.warnedInvalidDueDates || {};

  if (!Array.isArray(todos)) {
    if (resetApplied) {
      await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
    }
    return;
  }

  // Remove notified entries for todos that are completed, no longer have a due date,
  // or have a changed due date, and clear the corresponding desktop notification.
  const validKeys = new Set(
    todos
      .filter(t => !t.completed && t.dueDate)
      .map(t => t.id + '_' + t.dueDate)
  );
  let updated = false;
  for (const key of Object.keys(notified)) {
    if (!validKeys.has(key)) {
      const underscoreIdx = key.lastIndexOf('_');
      const todoId = underscoreIdx !== -1 ? key.slice(0, underscoreIdx) : key;
      chrome.notifications.clear('todo_reminder_' + todoId);
      delete notified[key];
      updated = true;
    }
  }

  // Prune warned-invalid entries whose item is no longer malformed (fixed,
  // completed, deleted, or date changed) so a future malformed value warns again
  // instead of being swallowed by stale state.
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

  if (todos.length === 0) {
    if (updated || warnedUpdated || resetApplied) {
      await setToStorage({ todoReminderNotified: notified, warnedInvalidDueDates });
    }
    return;
  }

  const now = new Date();

  for (const todo of todos) {
    if (todo.completed) continue;
    if (todo.dueDate === null || todo.dueDate === undefined) continue;
    const warnedKey = invalidDueDateKey(todo);
    if (warnedKey) {
      if (!warnedInvalidDueDates[warnedKey]) {
        warnedInvalidDueDates[warnedKey] = true;
        warnedUpdated = true;
        console.warn('Skipping todo reminder: invalid dueDate', todo.id, todo.dueDate);
      }
      continue;
    }
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
  if (updated || warnedUpdated || resetApplied) {
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
