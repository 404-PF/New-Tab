const CHECK_INTERVAL_MINUTES = 1;
const ALARM_NAME = 'todoReminderCheck';
let reminderCheckInProgress = false;
let reminderCheckPending = false;

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

async function checkReminders() {
  if (reminderCheckInProgress) {
    reminderCheckPending = true;
    return;
  }
  reminderCheckInProgress = true;
  reminderCheckPending = false;
  try {
    await runReminderCheck();
  } finally {
    reminderCheckInProgress = false;
  }
  if (reminderCheckPending) {
    reminderCheckPending = false;
    await checkReminders();
  }
}

async function runReminderCheck() {
  const data = await getFromStorage(['todos', 'todoReminderEnabled', 'todoReminderLeadTime', 'todoReminderNotified']);
  if (String(data.todoReminderEnabled) !== 'true') return;
  let todos;
  try { todos = JSON.parse(data.todos); } catch { todos = []; }
  const leadTime = parseInt(data.todoReminderLeadTime, 10) || 30;
  const notified = data.todoReminderNotified || {};

  if (!Array.isArray(todos)) return;

  // Remove notified entries for todos that are completed, no longer have a due date,
  // or have a changed due date.
  const validKeys = new Set(
    todos
      .filter(t => !t.completed && t.dueDate)
      .map(t => t.id + '_' + t.dueDate)
  );
  let updated = false;
  for (const key of Object.keys(notified)) {
    if (!validKeys.has(key)) {
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
  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Todo Reminder',
    message: todo.text + ' — due ' + dueDisplay,
    contextMessage: 'New Tab Todo List',
    priority: 1
  });
}

function handleStartup() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
    }
  });
}

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(handleStartup);
  chrome.runtime.onStartup.addListener(handleStartup);
}

if (chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      checkReminders();
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
      const run = message.todoId
        ? getFromStorage('todoReminderNotified').then(data => {
            const notified = data.todoReminderNotified || {};
            let updated = false;
            for (const key of Object.keys(notified)) {
              if (key.startsWith(message.todoId + '_')) {
                delete notified[key];
                updated = true;
              }
            }
            if (updated) {
              return setToStorage({ todoReminderNotified: notified });
            }
          }).then(() => checkReminders())
        : checkReminders();
      run.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
  });
}
