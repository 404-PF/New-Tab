const CHECK_INTERVAL_MINUTES = 1;
// SYNC: This alarm name must match the hardcoded string in src/features/todo.js fallback
const ALARM_NAME = 'todoReminderCheck';
let reminderCheckInProgress = false;
let reminderCheckPendingData = null;

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

async function checkReminders(todosJson) {
  if (reminderCheckInProgress) {
    reminderCheckPendingData = todosJson;
    return;
  }
  reminderCheckInProgress = true;
  reminderCheckPendingData = null;
  try {
    await runReminderCheck(todosJson);
  } finally {
    reminderCheckInProgress = false;
  }
  if (reminderCheckPendingData !== null) {
    const nextTodos = reminderCheckPendingData;
    reminderCheckPendingData = null;
    await checkReminders(nextTodos).catch((e) => {
      console.warn('Recursive reminder check failed:', e);
    });
  }
}

async function runReminderCheck(todosJson) {
  const keys = ['todoReminderEnabled', 'todoReminderLeadTime', 'todoReminderNotified'];
  if (!todosJson) keys.push('todos');
  const data = await getFromStorage(keys);
  if (String(data.todoReminderEnabled) !== 'true') return;
  let todos;
  if (todosJson) {
    try { todos = JSON.parse(todosJson); } catch { todos = []; }
  } else {
    try { todos = JSON.parse(data.todos); } catch { todos = []; }
  }
  const parsedLeadTime = parseInt(data.todoReminderLeadTime, 10);
  const leadTime = isNaN(parsedLeadTime) ? 30 : parsedLeadTime;
  const notified = data.todoReminderNotified || {};

  if (!Array.isArray(todos)) return;

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

  if (todos.length === 0) {
    if (updated) await setToStorage({ todoReminderNotified: notified });
    return;
  }

  const now = new Date();

  for (const todo of todos) {
    if (todo.completed) continue;
    if (!todo.dueDate) continue;
    const dueDate = new Date(todo.dueDate + 'T23:59:59');
    if (isNaN(dueDate.getTime())) continue;
    const reminderTime = new Date(dueDate.getTime() - leadTime * 60 * 1000);
    if (now >= reminderTime && now <= dueDate) {
      const notifiedKey = todo.id + '_' + todo.dueDate;
      if (notified[notifiedKey]) continue;
      const dueDisplay = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      await showTodoNotification(todo, dueDisplay);
      notified[notifiedKey] = Date.now();
      updated = true;
    }
  }
  if (updated) {
    await setToStorage({ todoReminderNotified: notified });
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

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(handleStartup);
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
      // Relies on message.todos being a valid JSON string from the caller's in-memory state.
      // If absent/malformed, falls back to chrome.storage.local which may lag behind
      // due to the async localStorage bridge.
      const run = (message.resetNotified
        ? (async () => {
            const data = await getFromStorage('todoReminderNotified');
            const notified = data.todoReminderNotified || {};
            const ids = new Set();
            for (const key of Object.keys(notified)) {
              const idx = key.lastIndexOf('_');
              const todoId = idx !== -1 ? key.slice(0, idx) : key;
              ids.add(todoId);
            }
            for (const id of ids) {
              chrome.notifications.clear('todo_reminder_' + id);
            }
            await setToStorage({ todoReminderNotified: {} });
          })()
        : Promise.resolve())
        .then(() => {
          if (message.todoId) {
            return getFromStorage('todoReminderNotified').then(data => {
              const notified = data.todoReminderNotified || {};
              let updated = false;
              for (const key of Object.keys(notified)) {
                if (key.startsWith(message.todoId + '_')) {
                  chrome.notifications.clear('todo_reminder_' + message.todoId);
                  delete notified[key];
                  updated = true;
                }
              }
              if (updated) {
                return setToStorage({ todoReminderNotified: notified });
              }
            });
          }
        })
        .then(() => checkReminders(message.todos));
      run.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
  });
}
