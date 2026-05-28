import { beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// ------------------------------------------------------------------
// requestAnimationFrame / cancelAnimationFrame polyfills for jsdom
// ------------------------------------------------------------------
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => {
    return setTimeout(cb, 0);
  };
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = (id) => {
    clearTimeout(id);
  };
}

// ------------------------------------------------------------------
// chrome API mock
// ------------------------------------------------------------------
const createEvent = () => {
  const listeners = new Set();

  return {
    addListener(listener) {
      listeners.add(listener);
    },

    removeListener(listener) {
      listeners.delete(listener);
    },

    hasListener(listener) {
      return listeners.has(listener);
    },

    _emit(...args) {
      listeners.forEach((listener) => {
        listener(...args);
      });
    }
  };
};

const createStorageArea = () => {
  let store = {};

  return {
    get(keys, callback) {
      let result = {};

      if (keys === null) {
        result = { ...store };
      } else if (typeof keys === 'string') {
        result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          result[key] = store[key];
        });
      } else if (typeof keys === 'object') {
        result = { ...keys };
        Object.keys(keys).forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) {
            result[key] = store[key];
          }
        });
      }

      if (callback) {
        callback(result);
      }

      return Promise.resolve(result);
    },

    set(items, callback) {
      const changes = {};
      Object.keys(items).forEach((key) => {
        changes[key] = {
          oldValue: Object.prototype.hasOwnProperty.call(store, key) ? store[key] : undefined,
          newValue: items[key]
        };
      });

      store = { ...store, ...items };

      if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged._emit(changes, 'local');
      }

      if (callback) {
        callback();
      }

      return Promise.resolve();
    },

    remove(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};

      list.forEach((key) => {
        changes[key] = {
          oldValue: Object.prototype.hasOwnProperty.call(store, key) ? store[key] : undefined,
          newValue: undefined
        };
        delete store[key];
      });

      if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged._emit(changes, 'local');
      }

      if (callback) {
        callback();
      }

      return Promise.resolve();
    },

    clear(callback) {
      const changes = {};
      Object.keys(store).forEach((key) => {
        changes[key] = {
          oldValue: store[key],
          newValue: undefined
        };
      });

      store = {};

      if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged._emit(changes, 'local');
      }

      if (callback) {
        callback();
      }

      return Promise.resolve();
    }
  };
};

globalThis.chrome = {
  i18n: {
    getMessage(messageName, substitutions) {
      const messages = {
        todoReminderTitle: 'Todo Reminder',
        todoReminderMessage: '$1$ \u2014 due $2$'
      };
      let msg = messages[messageName] || messageName;
      if (substitutions && Array.isArray(substitutions)) {
        substitutions.forEach((sub, i) => {
          msg = msg.replace(new RegExp('\\$' + (i + 1) + '\\$', 'g'), sub);
        });
      }
      return msg;
    }
  },
  storage: {
    onChanged: createEvent(),
    local: createStorageArea(),
    sync: createStorageArea()
  },
  search: {
    query: async () => ({}) // no-op
  },
  alarms: {
    _alarms: {},
    create(name, opts) {
      chrome.alarms._alarms[name] = opts;
    },
    get(name, callback) {
      callback(chrome.alarms._alarms[name] || null);
    },
    clear(name, callback) {
      delete chrome.alarms._alarms[name];
      if (callback) callback(true);
    },
    clearAll(callback) {
      chrome.alarms._alarms = {};
      if (callback) callback(true);
    }
  },
  notifications: {
    _notifications: {},
    create(id, opts, callback) {
      chrome.notifications._notifications[id] = opts;
      if (callback) callback(id);
    },
    clear(id, callback) {
      delete chrome.notifications._notifications[id];
      if (callback) callback(true);
    },
    onClicked: {
      _listeners: [],
      addListener(fn) { chrome.notifications.onClicked._listeners.push(fn); },
      removeListener(fn) {
        chrome.notifications.onClicked._listeners = chrome.notifications.onClicked._listeners.filter(l => l !== fn);
      }
    }
  },
  runtime: {
    id: 'test-extension-id',
    _listeners: {},
    onInstalled: {
      addListener() {},
      removeListener() {}
    },
    onStartup: {
      addListener() {},
      removeListener() {}
    },
    onMessage: {
      _listeners: [],
      addListener(fn) { chrome.runtime.onMessage._listeners.push(fn); },
      removeListener(fn) {
        chrome.runtime.onMessage._listeners = chrome.runtime.onMessage._listeners.filter(l => l !== fn);
      }
    },
    sendMessage(msg, callback) {
      const listeners = chrome.runtime.onMessage._listeners;
      let handled = false;
      for (const fn of listeners) {
        const result = fn(msg, { tab: { id: 1 } }, () => {});
        if (result instanceof Promise) {
          result.catch(() => {});
        }
        handled = true;
      }
      if (callback) callback(handled ? { ok: true } : undefined);
      return Promise.resolve(handled ? { ok: true } : undefined);
    }
  },
  tabs: {
    create(opts) {}
  }
};

injectScript('src/core/storage.js');

// ------------------------------------------------------------------
// window.i18n mock
// ------------------------------------------------------------------
if (!globalThis.window) {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    writable: true,
    configurable: true
  });
}

const mockLanguages = [
  { code: 'en', flag: '\uD83C\uDDFA\uD83C\uDDF8', nativeName: 'English', nameKey: 'english' },
  { code: 'zh', flag: '\uD83C\uDDE8\uD83C\uDDF3', nativeName: '中文', nameKey: 'chinese' },
  { code: 'ja', flag: '\uD83C\uDDEF\uD83C\uDDF5', nativeName: '日本語', nameKey: 'japanese' },
  { code: 'ko', flag: '\uD83C\uDDF0\uD83C\uDDF7', nativeName: '한국어', nameKey: 'korean' },
  { code: 'es', flag: '\uD83C\uDDEA\uD83C\uDDF8', nativeName: 'Español', nameKey: 'spanish' },
  { code: 'fr', flag: '\uD83C\uDDEB\uD83C\uDDF7', nativeName: 'Français', nameKey: 'french' },
  { code: 'de', flag: '\uD83C\uDDE9\uD83C\uDDEA', nativeName: 'Deutsch', nameKey: 'german' },
  { code: 'pt', flag: '\uD83C\uDDE7\uD83C\uDDF7', nativeName: 'Português', nameKey: 'portuguese' },
  { code: 'ru', flag: '\uD83C\uDDF7\uD83C\uDDFA', nativeName: 'Русский', nameKey: 'russian' }
];

globalThis.window.i18n = {
  currentLanguage() {
    return 'en';
  },
  getSupportedLanguages() {
    return mockLanguages;
  },
  t(key, replacements) {
    // Provide minimal fallback strings for common keys
    const fallbacks = {
      dueDate: 'Due Date',
      clearDate: 'Clear',
      todayDate: 'Today',
      todoSetDate: 'Set date',
      todoEditTooltip: 'Edit Todo',
      todoDeleteTooltip: 'Delete Todo',
      notesPlaceholder: 'Type your note here...',
      notesDeleteTooltip: 'Delete Note',
      clearCompletedConfirmMessage: 'This will permanently remove all completed todos. This action cannot be undone.',
      cancel: 'Cancel',
      save: 'Save',
      january: 'January',
      february: 'February',
      march: 'March',
      april: 'April',
      may: 'May',
      june: 'June',
      july: 'July',
      august: 'August',
      september: 'September',
      october: 'October',
      november: 'November',
      december: 'December',
      sunday: 'Su',
      monday: 'Mo',
      tuesday: 'Tu',
      wednesday: 'We',
      thursday: 'Th',
      friday: 'Fr',
      saturday: 'Sa',
      addTodoPlaceholder: 'Add a todo...',
      simpleMode: 'Simple',
      searchPlaceholder: 'Search or enter URL...',
      recentSearches: 'Recent searches',
      clearSearchHistory: 'Clear history',
      newApp: 'New',
      filterAll: 'All',
      filterPending: 'Pending',
      filterCompleted: 'Completed',
      filterOverdue: 'Overdue',
      clearCompletedText: 'Clear Completed',
      emptyStateTitle: 'No todos yet. Add one above!',
      emptyStateDesc: 'Try adding due dates for better organization.',
      aiAssistant: 'AI Assistant',
      aiPlaceholder: 'Ask me anything...',
      aiNewChat: 'New Chat',
      aiSearchConversations: 'Search conversations...',
      aiConversations: 'Conversations',
      aiDeleteConfirmTitle: 'Delete Conversation?',
      aiDeleteConfirmMessage: 'This action cannot be undone. The entire conversation will be permanently removed.',
      aiCancel: 'Cancel',
      aiDelete: 'Delete',
      editTodo: 'Edit Todo',
      newAppTitle: 'Add New App',
      newAppDescription: 'Enter a website URL to add it to your apps',
      renameAppTitle: 'Rename App',
      renameAppDescription: 'Enter a new name for this app',
      changeThumbnailTitle: 'Change Thumbnail',
      changeThumbnailDescription: 'Enter an image URL for the app icon',
      general: 'General',
      background: 'Background',
      apps: 'Apps',
      clock: 'Clock',
      themes: 'Themes',
      language: 'Language',
      about: 'About',
      generalSettings: 'General',
      generalSettingsDesc: 'Configure basic app behavior',
      openNewTab: 'Open apps in a new tab',
      enableTodoList: 'Enable todo list',
      backgroundSettingsDesc: 'Choose your background image',
      liveBackground: 'Live Background',
      liveBackgroundSettingsDesc: 'Choose an animated background video',
      iconStyle: 'Icon Style',
      iconStyleDesc: 'Choose the shape and appearance of your app icons',
      iconSize: 'Icon Size',
      iconSizeDesc: 'Adjust the size of your app icons',
      size: 'Size',
      resetSize: 'Reset Size',
      clockSettings: 'Clock & Date Style',
      clockSettingsDesc: 'Customize the appearance of your clock and date display',
      color: 'Color',
      font: 'Font',
      clockFormat: 'Time Format',
      clockFormatAuto: 'Locale Default',
      clockFormat12Hour: '12-Hour',
      clockFormat24Hour: '24-Hour',
      resetStyle: 'Reset Style',
      dateSettings: 'Date Style',
      dateSettingsDesc: 'Customize the appearance of your date display',
      dateFormat: 'Date Format',
      dateFormatAuto: 'Locale Default',
      dateFormatLong: 'Long',
      dateFormatCompact: 'Compact',
      dateFormatNumeric: 'Numeric',
      themeSettings: 'Theme',
      themeSettingsDesc: 'Choose your preferred interface theme',
      dark: 'Dark',
      light: 'Light',
      languageSettings: 'Language',
      languageSettingsDesc: 'Choose your preferred language',
      english: 'English',
      chinese: '中文 (Chinese)',
      japanese: 'Japanese',
      korean: 'Korean',
      spanish: 'Spanish',
      french: 'French',
      german: 'German',
      portuguese: 'Portuguese',
      russian: 'Russian',
      aboutSettings: 'About',
      aboutSettingsDesc: 'About this extension',
      project: 'Project',
      createdBy: 'Created by',
      openSource: 'Open source project',
      versionLabel: 'Version',
      onboardingTour: 'Onboarding Tour',
      restartTour: 'Restart Tour',
      tourDesc: 'Take the tour again to learn about features',
      startTour: 'Start Tour',
      repository: 'Repository',
      viewSource: 'View source on GitHub',
      updates: 'Updates',
      enableUpdates: 'Enable update checks',
      checkNow: 'Check Now',
      checking: 'Checking...',
      updateDesc: 'Check for updates manually or enable automatic checks',
      copyMottoCopied: 'Copied',
      copyMottoFailed: 'Failed to copy',
      todoList: 'Todo List',
      clearCompletedConfirmTitle: 'Clear Completed Todos?',
      validationPleaseEnter: 'Please enter a URL or search query',
      validationInvalidAppears: 'This URL appears to be invalid. Press Enter to Create',
      validationMissingHostname: 'Invalid URL: missing hostname',
      validationInvalidChars: 'Invalid URL: hostname contains invalid characters',
      validationTldTooShort: 'Invalid URL: top-level domain too short',
      validationIncompleteDomain: 'Invalid URL: incomplete domain name',
      validationIpOutOfRange: 'Invalid URL: IP address out of range',
      validationValid: 'Valid URL',
      validationMalformed: 'Malformed URL',
      enableReminders: 'Enable reminders',
      reminderLeadTime: 'Remind before due',
      reminderLeadTimeAtDue: 'At due time',
      reminderLeadTime5min: '5 minutes before',
      reminderLeadTime15min: '15 minutes before',
      reminderLeadTime30min: '30 minutes before',
      reminderLeadTime1hour: '1 hour before',
      reminderLeadTime1day: '1 day before'
    };
    let message = fallbacks[key] || key;
    if (replacements && typeof replacements === 'object') {
      Object.entries(replacements).forEach(([placeholder, value]) => {
        message = message.replaceAll(`{${placeholder}}`, value);
      });
    }
    return message;
  },
  applyLanguage() {}
};

// ------------------------------------------------------------------
// Minimal DOM stubs for scripts that query the DOM on load
// ------------------------------------------------------------------
const createStubElement = (tag, id) => {
  const el = document.createElement(tag);
  if (id) el.id = id;
  return el;
};

// Pre-populate commonly queried DOM elements so scripts don't throw on load
document.body.appendChild(createStubElement('div', 'clock-time'));
document.body.appendChild(createStubElement('span', 'date'));
document.body.appendChild(createStubElement('div', 'motto-text'));
document.body.appendChild(createStubElement('div', 'motto-container'));
document.body.appendChild(createStubElement('div', 'todo-list'));
document.body.appendChild(createStubElement('div', 'empty-state'));
document.body.appendChild(createStubElement('div', 'progress-ring-fill'));
document.body.appendChild(createStubElement('span', 'progress-text'));
document.body.appendChild(createStubElement('span', 'badge-all'));
document.body.appendChild(createStubElement('span', 'badge-pending'));
document.body.appendChild(createStubElement('span', 'badge-completed'));
document.body.appendChild(createStubElement('span', 'badge-overdue'));
document.body.appendChild(createStubElement('span', 'todo-count'));

// Clear-completed dialog with required children
const clearDialog = document.createElement('div');
clearDialog.id = 'clear-completed-dialog';
clearDialog.innerHTML = `
  <div class="ai-confirm-overlay"></div>
  <div class="ai-confirm-content">
    <p class="ai-confirm-message"></p>
    <div class="ai-confirm-actions">
      <button class="ai-confirm-cancel">Cancel</button>
      <button id="clear-completed-confirm">Clear</button>
    </div>
  </div>
`;
document.body.appendChild(clearDialog);

// Import-todos dialog with required children
const importDialog = document.createElement('div');
importDialog.id = 'import-todos-dialog';
importDialog.innerHTML = `
  <div class="ai-confirm-overlay"></div>
  <div class="ai-confirm-content">
    <p class="ai-confirm-message"></p>
    <div class="ai-confirm-actions">
      <button class="ai-confirm-cancel">Cancel</button>
      <button id="import-merge-btn">Merge</button>
      <button id="import-replace-btn">Replace</button>
    </div>
  </div>
`;
document.body.appendChild(importDialog);

document.body.appendChild(createStubElement('div', 'settings-modal'));
document.body.appendChild(createStubElement('input', 'clock-color-picker'));
document.body.appendChild(createStubElement('select', 'clock-font-picker'));
document.body.appendChild(createStubElement('select', 'clock-format-picker'));
document.body.appendChild(createStubElement('input', 'date-color-picker'));
document.body.appendChild(createStubElement('select', 'date-font-picker'));
document.body.appendChild(createStubElement('select', 'date-format-picker'));
document.body.appendChild(createStubElement('input', 'todo-enabled-setting'));
document.body.appendChild(createStubElement('input', 'todo-reminder-enabled-setting'));
const leadTimeSelect = document.createElement('select');
leadTimeSelect.id = 'todo-reminder-lead-time';
document.body.appendChild(leadTimeSelect);
document.body.appendChild(createStubElement('div', 'background-container'));
document.body.appendChild(createStubElement('img', 'bg-thumbnail'));
document.body.appendChild(createStubElement('img', 'bg-full'));
document.body.appendChild(createStubElement('img', 'bg-transition-overlay'));
document.body.appendChild(createStubElement('video', 'bg-video'));

// Todo elements required for initTodo to run
document.body.appendChild(createStubElement('input', 'todo-input'));
document.body.appendChild(createStubElement('button', 'add-todo-btn'));
document.body.appendChild(createStubElement('select', 'filter-status'));
const todoFilters = document.createElement('div');
todoFilters.className = 'todo-filters';
document.body.appendChild(todoFilters);

// Notes elements required for initNotes to run
const notesSection = document.createElement('div');
notesSection.className = 'notes-section';
notesSection.innerHTML = `
  <div class="notes-header">
    <h3 class="notes-title">Notes</h3>
    <button id="add-note-btn" class="notes-add-btn">+</button>
  </div>
  <div class="notes-list" id="notes-list"></div>
  <div class="notes-empty" id="notes-empty"><p>No notes yet.</p></div>
`;
document.body.appendChild(notesSection);

// ------------------------------------------------------------------
// Reset between test files
// ------------------------------------------------------------------
beforeAll(() => {
  localStorage.clear();
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.toast-notification, .copy-notification, .search-validation-feedback, .inline-date-picker')
    .forEach(el => el.remove());
});
