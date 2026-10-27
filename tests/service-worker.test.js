import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('backgrounds/service-worker.js');
});

beforeEach(async () => {
  // The invalid-dueDate warning dedup lives in chrome.storage.local (see
  // warnedInvalidDueDates in service-worker.js), so clearing storage also
  // isolates the warning-state assertions between tests.
  await chrome.storage.local.clear();
  chrome.notifications._notifications = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe('service worker todo reminders', () => {
  it('warns and skips todos with a malformed dueDate', async () => {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'slash', text: 'Slash date', completed: false, dueDate: '12/31/2026' },
        { id: 'iso', text: 'ISO datetime', completed: false, dueDate: '2026-08-11T12:00:00' },
        { id: 'partial', text: 'Partial date', completed: false, dueDate: '2026-08' },
        { id: 'rollover', text: 'Rollover date', completed: false, dueDate: '2026-02-30' }
      ])
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await checkReminders();

      const warned = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid dueDate'));
      expect(warned).toHaveLength(4);
      expect(warned.map((call) => call[1])).toEqual(['slash', 'iso', 'partial', 'rollover']);
      expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
      expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({ todoReminderNotified: {} });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns only once for a persistent malformed dueDate across checks', async () => {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'persist', text: 'Broken', completed: false, dueDate: '2026-02-30' }
      ])
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await checkReminders();
      await checkReminders();

      const warned = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid dueDate'));
      expect(warned).toHaveLength(1);
      expect(warned.map((call) => call[1])).toEqual(['persist']);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not re-warn after a service-worker restart (warned state is persisted)', async () => {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'reboot', text: 'Broken', completed: false, dueDate: '2026-02-30' }
      ])
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await checkReminders();
      const warnedOnce = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid dueDate'));
      expect(warnedOnce).toHaveLength(1);
      expect(await chrome.storage.local.get('warnedInvalidDueDates')).toEqual({
        warnedInvalidDueDates: { 'reboot_2026-02-30': true }
      });

      // Simulate an MV3 worker suspension: re-evaluating the module resets all
      // in-memory state, but chrome.storage.local persists across the restart.
      // Drop the listeners the previous evaluation registered so the shared
      // chrome mocks don't accumulate a second copy of each handler.
      chrome.notifications.onClicked._clearListeners();
      chrome.runtime.onMessage._clearListeners();
      injectScript('backgrounds/service-worker.js');
      expect(chrome.notifications.onClicked._listeners).toHaveLength(1);
      expect(chrome.runtime.onMessage._listeners).toHaveLength(1);

      warnSpy.mockClear();
      await checkReminders();

      const warnedAfterRestart = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid dueDate'));
      expect(warnedAfterRestart).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns again when a malformed dueDate value changes', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await chrome.storage.local.set({
        todoReminderEnabled: 'true',
        todoReminderLeadTime: '30',
        todoReminderNotified: {},
        todos: JSON.stringify([
          { id: 'flip', text: 'Broken', completed: false, dueDate: '2026-02-30' }
        ])
      });
      await checkReminders();
      await chrome.storage.local.set({
        todos: JSON.stringify([
          { id: 'flip', text: 'Broken', completed: false, dueDate: '2026-13-01' }
        ])
      });
      await checkReminders();

      const warned = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid dueDate'));
      expect(warned).toHaveLength(2);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('silently skips todos without a due date', async () => {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'null-date', text: 'Null', completed: false, dueDate: null },
        { id: 'no-date', text: 'Undefined', completed: false }
      ])
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await checkReminders();

      expect(warnSpy).not.toHaveBeenCalled();
      expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns for an empty-string dueDate and does not notify', async () => {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'empty-date', text: 'Empty', completed: false, dueDate: '' }
      ])
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await checkReminders();

      const warned = warnSpy.mock.calls.filter((call) => String(call[0]).includes('invalid dueDate'));
      expect(warned).toHaveLength(1);
      expect(warned.map((call) => call[1])).toEqual(['empty-date']);
      expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
      expect(await chrome.storage.local.get('warnedInvalidDueDates')).toEqual({
        warnedInvalidDueDates: { 'empty-date_': true }
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('fires a reminder for a dueDate inside the lead-time window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 11, 23, 50, 0));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'due', text: 'Finish report', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    const notification = chrome.notifications._notifications['todo_reminder_due'];
    expect(notification).toBeTruthy();
    expect(notification.message).toContain('Finish report');
    expect(notification.message).toContain('due');
  });

  /**
   * Verifies that a failed reminder notification remains retryable.
   */
  async function verifyReminderRetryAfterNotificationFailure() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 11, 23, 50, 0));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'retry', text: 'Retry reminder', completed: false, dueDate: '2026-08-11' }
      ])
    });

    const createSpy = vi.spyOn(chrome.notifications, 'create')
      .mockRejectedValueOnce(new Error('Permission denied'));

    try {
      await checkReminders();

      expect(chrome.notifications._notifications['todo_reminder_retry']).toBeUndefined();
      expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({
        todoReminderNotified: {}
      });

      await checkReminders();

      expect(chrome.notifications._notifications['todo_reminder_retry']).toBeTruthy();
      expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({
        todoReminderNotified: {
          'retry_2026-08-11': expect.any(Number)
        }
      });
      expect(createSpy).toHaveBeenCalledTimes(2);
    } finally {
      createSpy.mockRestore();
    }
  }

  it('does not mark a reminder as notified when notification creation fails', verifyReminderRetryAfterNotificationFailure);

  it('fires a reminder at due time with "At due time" (leadTime = 0)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 30s before the end-of-day due instant: with leadTime 0 the window must be
    // at least one check interval wide (not a zero-width instant at
    // 23:59:59.000), or this check would fall before it and never fire.
    vi.setSystemTime(new Date(2026, 7, 11, 23, 59, 30));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'due-now', text: 'Pay rent', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    const notification = chrome.notifications._notifications['todo_reminder_due-now'];
    expect(notification).toBeTruthy();
    expect(notification.message).toContain('Pay rent');
    expect(notification.message).toContain('due');
  });

  it('does not fire before the due date with "At due time" (leadTime = 0)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 10, 23, 59, 30));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'due-tomorrow', text: 'Book flight', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    expect(chrome.notifications._notifications['todo_reminder_due-tomorrow']).toBeUndefined();
    expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({ todoReminderNotified: {} });
  });

  it('does not fire for a dueDate outside the lead-time window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 11, 10, 0, 0));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'later', text: 'Not due yet', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    expect(chrome.notifications._notifications['todo_reminder_later']).toBeUndefined();
    expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({ todoReminderNotified: {} });
  });
});

describe('service worker toolbar action (issue #944)', () => {
  beforeAll(() => {
    // Prior tests in this file may have re-injected the worker (each injection
    // registers another copy of every listener), so drop the accumulated
    // action listeners and evaluate a single fresh copy.
    chrome.action.onClicked._clearListeners();
    injectScript('backgrounds/service-worker.js');
  });

  it('registers exactly one chrome.action.onClicked listener', () => {
    expect(chrome.action.onClicked._listeners).toHaveLength(1);
  });

  it('opens New-Tab.html when the toolbar icon is clicked', () => {
    const tabsSpy = vi.spyOn(chrome.tabs, 'create');

    try {
      const listener = chrome.action.onClicked._listeners[0];
      expect(listener).toBeDefined();
      listener({ id: 7, url: 'https://example.com/' });

      expect(tabsSpy).toHaveBeenCalledTimes(1);
      expect(tabsSpy).toHaveBeenCalledWith({ url: 'New-Tab.html' });
    } finally {
      tabsSpy.mockRestore();
    }
  });

  it('skips registration without throwing when chrome.action is unavailable', () => {
    const originalAction = chrome.action;

    try {
      chrome.action = undefined;
      expect(() => injectScript('backgrounds/service-worker.js')).not.toThrow();
    } finally {
      chrome.action = originalAction;
      chrome.action.onClicked._clearListeners();
      injectScript('backgrounds/service-worker.js');
    }

    expect(chrome.action.onClicked._listeners).toHaveLength(1);
  });
});

describe('service worker storage lastError handling (issue #994)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 11, 23, 50, 0));
  });

  // Deliberately does not seed todoReminderNotified: the chrome.storage.local
  // mock hands out the live stored object from get, so seeding {} would let
  // the in-memory notified mark leak into storage even when the write fails
  // and would mask the failed-write path this suite covers.
  async function seedDueTodo() {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todos: JSON.stringify([
        { id: 'due', text: 'Finish report', completed: false, dueDate: '2026-08-11' }
      ])
    });
  }

  function failSetWrite(items, callback) {
    chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
    try {
      if (callback) callback();
    } finally {
      chrome.runtime.lastError = null;
    }
  }

  it('fails the check and skips the notification when the notified-map write reports lastError', async () => {
    await seedDueTodo();
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation(failSetWrite);

    try {
      await expect(checkReminders()).rejects.toThrow('QUOTA_BYTES quota exceeded');
      await expect(checkReminders()).rejects.toThrow('QUOTA_BYTES quota exceeded');

      // The reminder must not fire while its notified mark cannot be written,
      // otherwise every alarm check would repeat it.
      expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
      const data = await chrome.storage.local.get('todoReminderNotified');
      expect(data.todoReminderNotified).toBeUndefined();
    } finally {
      setSpy.mockRestore();
    }
  });

  it('notifies exactly once when only the first notified-map write fails', async () => {
    await seedDueTodo();
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    let failNext = true;
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation((items, callback) => {
      if (failNext) {
        failNext = false;
        failSetWrite(items, callback);
        return;
      }
      return originalSet(items, callback);
    });

    try {
      await expect(checkReminders()).rejects.toThrow('QUOTA_BYTES quota exceeded');
      expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);

      await checkReminders();

      expect(Object.keys(chrome.notifications._notifications)).toEqual(['todo_reminder_due']);
      const data = await chrome.storage.local.get('todoReminderNotified');
      expect(data.todoReminderNotified).toHaveProperty('due_2026-08-11');
    } finally {
      setSpy.mockRestore();
    }
  });

  it('fails the check when the storage read reports lastError', async () => {
    const getSpy = vi.spyOn(chrome.storage.local, 'get').mockImplementation((keys, callback) => {
      chrome.runtime.lastError = { message: 'storage unavailable' };
      try {
        if (callback) callback({});
      } finally {
        chrome.runtime.lastError = null;
      }
    });

    try {
      // A failed read must reject instead of resolving like an empty result.
      await expect(checkReminders()).rejects.toThrow('storage unavailable');
    } finally {
      getSpy.mockRestore();
    }
  });

  it('fails the sync reset when the notified-map write reports lastError', async () => {
    await chrome.storage.local.set({ todoReminderEnabled: 'false' });
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementationOnce(failSetWrite);

    try {
      await expect(checkReminders(JSON.stringify([]), { resetNotified: true }))
        .rejects.toThrow('QUOTA_BYTES quota exceeded');
    } finally {
      setSpy.mockRestore();
    }
  });
});
