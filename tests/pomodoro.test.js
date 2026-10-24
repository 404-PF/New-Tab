import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request(name, callback) {
        return Promise.resolve().then(() => callback({ name }));
      }
    }
  });

  const header = document.createElement('div');
  header.className = 'todo-header';
  document.body.appendChild(header);

  window.VisibilityInterval = class {
    constructor() {}
    destroy() {}
  };

  injectScript('src/features/pomodoro.js');
});

afterEach(() => {
  if (typeof window.stopPomodoro === 'function') {
    window.stopPomodoro();
  }
  document.getElementById('pomodoro-widget')?.remove();
});

describe('Pomodoro bootstrap ordering', () => {
  it('loads Pomodoro before settings and todo consumers', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/core/bootstrap.js'), 'utf8');
    const pomodoroIndex = source.indexOf('src/features/pomodoro.js');
    const settingsIndex = source.indexOf('src/ui/settings.js');
    const todoIndex = source.indexOf('src/features/todo.js');

    expect(pomodoroIndex).toBeGreaterThanOrEqual(0);
    expect(pomodoroIndex).toBeLessThan(settingsIndex);
    expect(pomodoroIndex).toBeLessThan(todoIndex);
  });
});

describe('Pomodoro duration persistence', () => {
  it('persists a changed active duration before the next timer tick', () => {
    window.savePomodoroDurations({ enabled: true, workDuration: 25 });
    window.startPomodoro('todo-1');

    window.savePomodoroDurations({ workDuration: 10 });

    const persisted = JSON.parse(localStorage.getItem('pomodoro_state'));
    expect(persisted.timeRemaining).toBe(10 * 60);
  });
});

describe('Pomodoro pause -> reset/skip regression (issue #626)', () => {
  it('reset on a paused timer resumes countdown', async () => {
    vi.useFakeTimers();
    const prevVI = window.VisibilityInterval;
    window.VisibilityInterval = null;
    try {
      window.savePomodoroDurations({ enabled: true, workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 });
      window.startPomodoro('todo-1');
      await window.togglePomodoroPause();
      const pausedState = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(pausedState.paused).toBe(true);

      document.querySelector('.pomodoro-reset-btn').click();
      for (let index = 0; index < 8; index++) {
        await Promise.resolve();
      }

      const afterReset = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterReset.paused).toBe(false);
      expect(afterReset.timeRemaining).toBe(25 * 60);

      await vi.advanceTimersByTimeAsync(2100);

      const afterTick = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterTick.timeRemaining).toBeLessThan(25 * 60);
    } finally {
      window.VisibilityInterval = prevVI;
      vi.useRealTimers();
    }
  });

  it('skip on a paused timer resumes countdown on next phase', async () => {
    vi.useFakeTimers();
    const prevVI = window.VisibilityInterval;
    window.VisibilityInterval = null;
    try {
      window.savePomodoroDurations({ enabled: true, workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 });
      window.startPomodoro('todo-1');
      await window.togglePomodoroPause();
      const pausedState = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(pausedState.paused).toBe(true);
      expect(pausedState.phase).toBe('work');

      document.querySelector('.pomodoro-skip-btn').click();
      for (let index = 0; index < 8; index++) {
        await Promise.resolve();
      }

      const afterSkip = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterSkip.paused).toBe(false);
      expect(afterSkip.phase).toBe('shortBreak');
      expect(afterSkip.timeRemaining).toBe(5 * 60);

      await vi.advanceTimersByTimeAsync(2100);

      const afterTick = JSON.parse(localStorage.getItem('pomodoro_state'));
      expect(afterTick.timeRemaining).toBeLessThan(5 * 60);
    } finally {
      window.VisibilityInterval = prevVI;
      vi.useRealTimers();
    }
  });
});

describe('Pomodoro leadership election regression (issue #763)', () => {
  function createSharedStorage() {
    const values = new Map();
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
      clear() {
        values.clear();
      },
      snapshot() {
        return new Map(values);
      }
    };
  }

  function createTabStorage(sharedStorage) {
    const values = sharedStorage.snapshot();
    return {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
      clear() {
        values.clear();
      }
    };
  }

  function createLockManager() {
    let locked = false;
    const queue = [];

    async function pump() {
      if (locked || queue.length === 0) return;
      locked = true;
      const { callback, resolve, reject } = queue.shift();
      try {
        resolve(await callback({ name: 'pomodoro-leadership' }));
      } catch (error) {
        reject(error);
      } finally {
        locked = false;
        void pump();
      }
    }

    return {
      request(_name, callback) {
        return new Promise((resolve, reject) => {
          queue.push({ callback, resolve, reject });
          void pump();
        });
      }
    };
  }

  function createTab(sharedStorage, locks, tabId, intervals) {
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://new-tab.test/'
    });
    const { window } = dom;
    const header = window.document.createElement('div');
    header.className = 'todo-header';
    window.document.body.appendChild(header);

    const localStorage = createTabStorage(sharedStorage);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorage
    });
    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: locks
    });
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      value: {
        randomUUID() {
          return tabId;
        },
        getRandomValues(bytes) {
          bytes.fill(1);
          return bytes;
        }
      }
    });

    window.i18n = {
      t(key) {
        return key;
      }
    };
    window.chrome = {
      notifications: {
        create() {}
      },
      storage: {
        local: {
          get(key, callback) {
            const result = {};
            const value = sharedStorage.getItem(key);
            if (value !== null) {
              result[key] = value;
            }
            if (callback) callback(result);
            return Promise.resolve(result);
          },
          set(items, callback) {
            Object.entries(items).forEach(([key, value]) => {
              sharedStorage.setItem(key, value);
            });
            if (callback) callback();
            return Promise.resolve();
          }
        },
        onChanged: {
          addListener() {}
        }
      },
      runtime: {}
    };
    window.setInterval = function () {
      return { noop: true };
    };
    window.clearInterval = function () {};
    window.VisibilityInterval = class {
      constructor(callback, interval) {
        this.callback = callback;
        this.interval = interval;
        this.destroyed = false;
        intervals.push(this);
      }

      destroy() {
        this.destroyed = true;
      }
    };

    injectScript('src/features/pomodoro.js', dom.getInternalVMContext());
    return dom;
  }

  async function waitForSettledLeader(sharedStorage) {
    let previousOwner = null;
    return vi.waitFor(() => {
      const persisted = JSON.parse(sharedStorage.getItem('pomodoro_state'));
      expect(['pomodoro-tab-a', 'pomodoro-tab-b']).toContain(persisted?.ownerId);
      const ownerId = persisted.ownerId;
      if (previousOwner === null || ownerId !== previousOwner) {
        previousOwner = ownerId;
        throw new Error('Leadership owner is still settling');
      }
      return persisted;
    }, { interval: 0 });
  }

  it('serializes two contenders so exactly one starts a leader interval', async () => {
    const sharedStorage = createSharedStorage();
    const locks = createLockManager();
    const intervalsA = [];
    const intervalsB = [];
    const now = Date.now();

    sharedStorage.setItem('pomodoro', JSON.stringify({
      enabled: true,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      sessionsBeforeLongBreak: 4
    }));
    sharedStorage.setItem('pomodoro_state', JSON.stringify({
      active: true,
      phase: 'work',
      todoId: 'todo-1',
      timeRemaining: 120,
      deadline: now + 120000,
      sessionsCompleted: 0,
      paused: false,
      pauseReason: null,
      ownerId: 'expired-tab',
      ownerLeaseExpiresAt: now - 1
    }));

    const tabA = createTab(sharedStorage, locks, 'tab-a', intervalsA);
    const tabB = createTab(sharedStorage, locks, 'tab-b', intervalsB);

    const persisted = await waitForSettledLeader(sharedStorage);
    // The losing contender legitimately keeps its 5000 ms coordination poll
    // (issue #929), so only the 1000 ms leader tick intervals count here.
    const activeIntervals = [
      ...intervalsA.filter(interval => !interval.destroyed && interval.interval === 1000).map(() => 'tab-a'),
      ...intervalsB.filter(interval => !interval.destroyed && interval.interval === 1000).map(() => 'tab-b')
    ];

    expect(activeIntervals).toHaveLength(1);
    expect(persisted.ownerId).toBe('pomodoro-' + activeIntervals[0]);
    expect(['pomodoro-tab-a', 'pomodoro-tab-b']).toContain(persisted.ownerId);

    tabA.window.close();
    tabB.window.close();
  });
});

describe('Pomodoro coordination poll (issue #929)', () => {
  function nonLeaderTimerState() {
    return JSON.stringify({
      active: true,
      phase: 'work',
      todoId: 'todo-1',
      timeRemaining: 120,
      deadline: Date.now() + 120000,
      sessionsCompleted: 0,
      paused: false,
      pauseReason: null,
      ownerId: 'other-tab',
      ownerLeaseExpiresAt: Date.now() + 5000
    });
  }

  function dispatchTimerStateChange(newValue) {
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: 'pomodoro_state' });
    Object.defineProperty(event, 'newValue', { value: newValue });
    window.dispatchEvent(event);
  }

  it('polls on a VisibilityInterval at the lease cadence and destroys it on stop', () => {
    const prevVI = window.VisibilityInterval;
    const destroy = vi.fn();
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy };
    });
    window.VisibilityInterval = VisibilityIntervalMock;

    try {
      dispatchTimerStateChange(nonLeaderTimerState());
      expect(VisibilityIntervalMock).toHaveBeenCalledTimes(1);
      expect(VisibilityIntervalMock).toHaveBeenCalledWith(expect.any(Function), 5000);
    } finally {
      dispatchTimerStateChange(null);
      window.VisibilityInterval = prevVI;
    }

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain setInterval at the lease cadence when VisibilityInterval is unavailable', () => {
    const prevVI = window.VisibilityInterval;
    window.VisibilityInterval = null;
    const originalSetInterval = globalThis.setInterval;
    const delays = [];
    globalThis.setInterval = function (callback, delay) {
      delays.push(delay);
      return originalSetInterval(callback, delay);
    };

    try {
      dispatchTimerStateChange(nonLeaderTimerState());
      expect(delays).toEqual([5000]);
    } finally {
      dispatchTimerStateChange(null);
      globalThis.setInterval = originalSetInterval;
      window.VisibilityInterval = prevVI;
    }
  });

  // A second window hosting a persisted-but-not-owned timer is the hidden-tab
  // poller from the issue, so these cases run the real VisibilityInterval
  // against a tracked setInterval instead of a stubbed constructor.
  async function createCoordinationTab() {
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://new-tab.test/'
    });
    const { window } = dom;

    await new Promise((resolve) => {
      if (window.document.readyState !== 'loading') {
        resolve();
        return;
      }
      window.document.addEventListener('DOMContentLoaded', () => resolve());
    });

    // jsdom reports document.hidden as true by default, which would leave the
    // visibility manager (and therefore VisibilityInterval) dormant.
    Object.defineProperty(window.document, 'hidden', { configurable: true, value: false });

    const header = window.document.createElement('div');
    header.className = 'todo-header';
    window.document.body.appendChild(header);

    const timers = [];
    window.setInterval = function (callback, delay) {
      const handle = { callback, delay, active: true };
      timers.push(handle);
      return handle;
    };
    window.clearInterval = function (handle) {
      if (handle && typeof handle === 'object') handle.active = false;
    };

    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: {
        request(name, callback) {
          return Promise.resolve().then(() => callback({ name }));
        }
      }
    });
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      value: {
        randomUUID() {
          return 'pomodoro-coordination-tab';
        },
        getRandomValues(bytes) {
          bytes.fill(1);
          return bytes;
        }
      }
    });

    window.i18n = { t(key) { return key; } };
    window.chrome = {
      notifications: { create() {} },
      storage: {
        local: {
          get(key, callback) {
            const result = {};
            const value = window.localStorage.getItem(key);
            if (value !== null) result[key] = value;
            if (callback) callback(result);
            return Promise.resolve(result);
          },
          set(items, callback) {
            Object.entries(items).forEach(([key, value]) => {
              window.localStorage.setItem(key, value);
            });
            if (callback) callback();
            return Promise.resolve();
          }
        },
        onChanged: { addListener() {} }
      },
      runtime: {}
    };

    window.localStorage.setItem('pomodoro', JSON.stringify({
      enabled: true,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      sessionsBeforeLongBreak: 4
    }));
    window.localStorage.setItem('pomodoro_state', nonLeaderTimerState());

    injectScript('src/core/utils.js', dom.getInternalVMContext());
    injectScript('src/features/pomodoro.js', dom.getInternalVMContext());

    return { dom, timers };
  }

  async function flushTab(tab) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    tab.dom.window.close();
  }

  it('runs the coordination poll at the lease cadence and stops it while hidden', async () => {
    const tab = await createCoordinationTab();
    try {
      expect(tab.timers).toHaveLength(1);
      expect(tab.timers[0].delay).toBe(5000);
      expect(tab.timers[0].active).toBe(true);

      Object.defineProperty(tab.dom.window.document, 'hidden', { configurable: true, value: true });
      tab.dom.window.document.dispatchEvent(new tab.dom.window.Event('visibilitychange'));

      expect(tab.timers.filter(timer => timer.active)).toHaveLength(0);
      expect(tab.timers).toHaveLength(1);
    } finally {
      await flushTab(tab);
    }
  });

  it('destroys the coordination poll on pagehide', async () => {
    const tab = await createCoordinationTab();
    try {
      const subscribed = tab.dom.window.visibilityManager.callbacks;
      expect(tab.timers[0].active).toBe(true);
      expect(subscribed).toHaveLength(1);

      tab.dom.window.dispatchEvent(new tab.dom.window.Event('pagehide'));

      expect(tab.timers[0].active).toBe(false);
      expect(subscribed).toHaveLength(0);
    } finally {
      await flushTab(tab);
    }
  });
});
