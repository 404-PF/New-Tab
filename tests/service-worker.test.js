import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('background/service-worker.js');
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
      injectScript('background/service-worker.js');
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
