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

  it('fires and records a reminder when a leadTime-0 check lands late within grace (issue #1090)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // The end-of-day due instant is 23:59:59.990; land ~30 s after it, the
    // routine MV3 late-fire case the hard cutoff used to drop silently.
    vi.setSystemTime(new Date(2026, 7, 12, 0, 0, 30));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'late', text: 'Pay rent', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    const notification = chrome.notifications._notifications['todo_reminder_late'];
    expect(notification).toBeTruthy();
    expect(notification.message).toContain('Pay rent');
    const data = await chrome.storage.local.get('todoReminderNotified');
    expect(data.todoReminderNotified['late_2026-08-11']).toBeGreaterThan(0);
  });

  it('does not re-notify a late reminder recorded within grace', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 12, 0, 0, 30));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: { 'late_2026-08-11': Date.now() },
      todos: JSON.stringify([
        { id: 'late', text: 'Pay rent', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    expect(chrome.notifications._notifications['todo_reminder_late']).toBeUndefined();
    expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);
  });

  it('still skips a leadTime-0 check beyond the grace window (issue #1090)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 2+ minutes past the due instant: well beyond the one-interval grace,
    // so the anti-stale guarantee must still win.
    vi.setSystemTime(new Date(2026, 7, 12, 0, 2, 0));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'stale', text: 'Pay rent', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    expect(chrome.notifications._notifications['todo_reminder_stale']).toBeUndefined();
    expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({ todoReminderNotified: {} });
  });

  it('still skips a leadTime-0 check 75 s after due, just past the one-interval grace (issue #1090)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 75 s past the end-of-day due instant: above the 60 s grace, below a 90 s grace.
    vi.setSystemTime(new Date(2026, 7, 12, 0, 1, 15));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'edge', text: 'Pay rent', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    expect(chrome.notifications._notifications['todo_reminder_edge']).toBeUndefined();
    expect(await chrome.storage.local.get('todoReminderNotified')).toEqual({ todoReminderNotified: {} });
  });

  it('retries a durable pending mark past the grace window (issue #1090 review)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 75 s past due: beyond the one-interval grace for fresh candidates, but
    // a durable PENDING_NOTIFIED_MARK whose confirmation never landed must
    // still be retried instead of being stranded un-retried forever.
    vi.setSystemTime(new Date(2026, 7, 12, 0, 1, 15));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: { 'stranded_2026-08-11': 'pending' },
      todos: JSON.stringify([
        { id: 'stranded', text: 'Pay rent', completed: false, dueDate: '2026-08-11' }
      ])
    });

    await checkReminders();

    const notification = chrome.notifications._notifications['todo_reminder_stranded'];
    expect(notification).toBeTruthy();
    expect(notification.message).toContain('Pay rent');
    const data = await chrome.storage.local.get('todoReminderNotified');
    expect(data.todoReminderNotified['stranded_2026-08-11']).toBeGreaterThan(0);
  });

  it('fires and records a dueTime todo late within grace (issue #1090)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // dueTime 23:00 pins the due instant to 23:00:00.000; land 30 s late.
    vi.setSystemTime(new Date(2026, 7, 11, 23, 0, 30));

    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '0',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'timed', text: 'Standup', completed: false, dueDate: '2026-08-11', dueTime: '23:00' }
      ])
    });

    await checkReminders();

    const notification = chrome.notifications._notifications['todo_reminder_timed'];
    expect(notification).toBeTruthy();
    expect(notification.message).toContain('Standup');
    const data = await chrome.storage.local.get('todoReminderNotified');
    expect(data.todoReminderNotified['timed_2026-08-11_23:00']).toBeGreaterThan(0);
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

  it('reports a queued syncTodos check failure instead of acking early', async () => {
    await seedDueTodo();
    chrome.runtime.onMessage._clearListeners();
    injectScript('backgrounds/service-worker.js');

    // Hang the leading check on its storage read so the syncTodos call below
    // is forced through the pending queue.
    let resolveFirstGet;
    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
    const getSpy = vi.spyOn(chrome.storage.local, 'get').mockImplementation((keys, callback) => {
      if (resolveFirstGet) {
        // Only the leading check hangs; later reads report lastError below.
        chrome.runtime.lastError = { message: 'storage unavailable' };
        try {
          if (callback) callback({});
        } finally {
          chrome.runtime.lastError = null;
        }
        return;
      }
      return new Promise((resolve) => {
        resolveFirstGet = () => {
          originalGet(keys, callback).then(resolve);
        };
      });
    });

    const firstPromise = checkReminders();

    const responses = [];
    const listener = chrome.runtime.onMessage._listeners[0];
    const keepsChannelOpen = listener(
      { type: 'syncTodos', todos: JSON.stringify([]), resetNotified: true },
      { tab: { id: 1 } },
      (response) => responses.push(response)
    );
    expect(keepsChannelOpen).toBe(true);

    try {
      // Flush microtasks: the queued check has not run, so no response may be
      // sent yet (the early-ack regression reported ok:true here).
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(responses).toHaveLength(0);

      resolveFirstGet();
      await firstPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The queued check's storage failure must reach sendResponse.
      expect(responses).toEqual([{ ok: false }]);
    } finally {
      getSpy.mockRestore();
    }
  });

  it('retries a reminder left pending when notification creation and the cleanup write both fail', async () => {
    await seedDueTodo();
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    let setCalls = 0;
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation((items, callback) => {
      setCalls += 1;
      if (setCalls === 1) {
        // Clone the notified map on the successful pre-persist so the
        // in-memory rollback below cannot mutate the durable copy (the shared
        // mock otherwise stores the live object).
        const cloned = {
          ...items,
          todoReminderNotified: items.todoReminderNotified
            ? { ...items.todoReminderNotified }
            : items.todoReminderNotified
        };
        return originalSet(cloned, callback);
      }
      failSetWrite(items, callback);
    });
    const createSpy = vi.spyOn(chrome.notifications, 'create')
      .mockRejectedValueOnce(new Error('Permission denied'));

    try {
      await expect(checkReminders()).rejects.toThrow('QUOTA_BYTES quota exceeded');
      expect(Object.keys(chrome.notifications._notifications)).toHaveLength(0);

      // The pre-persisted mark must stay retryable, not become a durable
      // timestamp that suppresses the reminder forever.
      const pendingData = await chrome.storage.local.get('todoReminderNotified');
      expect(pendingData.todoReminderNotified).toEqual({ 'due_2026-08-11': 'pending' });

      setSpy.mockRestore();
      createSpy.mockRestore();
      await checkReminders();

      expect(Object.keys(chrome.notifications._notifications)).toEqual(['todo_reminder_due']);
      const data = await chrome.storage.local.get('todoReminderNotified');
      expect(data.todoReminderNotified).toHaveProperty('due_2026-08-11');
      expect(typeof data.todoReminderNotified['due_2026-08-11']).toBe('number');
    } finally {
      setSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});
