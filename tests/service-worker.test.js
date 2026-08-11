import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('background/service-worker.js');
});

beforeEach(async () => {
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

  it('silently skips todos without a due date', async () => {
    await chrome.storage.local.set({
      todoReminderEnabled: 'true',
      todoReminderLeadTime: '30',
      todoReminderNotified: {},
      todos: JSON.stringify([
        { id: 'null-date', text: 'Null', completed: false, dueDate: null },
        { id: 'no-date', text: 'Undefined', completed: false },
        { id: 'empty-date', text: 'Empty', completed: false, dueDate: '' }
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
