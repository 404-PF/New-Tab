const CHECK_INTERVAL_MINUTES = 1;
const ALARM_NAME = 'todoReminderCheck';

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
  const data = await getFromStorage(['todos', 'todoReminderEnabled', 'todoReminderLeadTime', 'todoReminderNotified']);
  if (String(data.todoReminderEnabled) !== 'true') return;
  let todos;
  try { todos = JSON.parse(data.todos); } catch { todos = []; }
  if (!Array.isArray(todos) || todos.length === 0) return;
  const leadTime = parseInt(data.todoReminderLeadTime, 10) || 30;
  const notified = data.todoReminderNotified || {};

  const now = new Date();
  let updated = false;

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
      await showTodoNotification(todo.text, dueDisplay);
      notified[notifiedKey] = Date.now();
      updated = true;
    }
  }
  if (updated) {
    await setToStorage({ todoReminderNotified: notified });
  }
}

async function showTodoNotification(text, dueDisplay) {
  const id = 'todo_reminder_' + Date.now();
  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Todo Reminder',
    message: text + ' — due ' + dueDisplay,
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

chrome.runtime.onInstalled.addListener(handleStartup);
chrome.runtime.onStartup.addListener(handleStartup);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkReminders();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('todo_reminder_')) {
    chrome.tabs.create({ url: 'New-Tab.html' });
    chrome.notifications.clear(notificationId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'syncTodos') {
    checkReminders().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});
