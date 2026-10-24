import { describe, it, expect, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

// The SonarCloud quality gate on main fails on S4822 in pomodoro.js: the
// thenables returned by chrome.storage's promise-style get/set were consumed
// inside a `try` block instead of being observed by a dedicated handler, which
// the rule flags because a rejection there cannot be caught by that `try`.
//
// The refactor moved the normalisation into observeStoragePromise(), which is
// behaviour-preserving — the load and save still settle through whichever side
// (callback or promise) the storage area reports on. These tests pin that
// behaviour so a future rework of the try blocks cannot silently change it:
// a promise-style area that rejects without invoking its callback must still
// be reported and must still settle the pending load/save, while a
// callback-style area (which returns undefined) keeps settling through its
// callback rather than being raced by Promise.resolve(undefined).

const LOAD_ERROR = 'load rejected';
const SAVE_ERROR = 'save rejected';
const TIMER_STATE_KEY = 'pomodoro_state';

function createHarness({ mode }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    runScripts: 'dangerously'
  });

  const header = dom.window.document.createElement('div');
  header.className = 'todo-header';
  dom.window.document.body.appendChild(header);

  dom.window.i18n = { t: (key) => key };
  Object.defineProperty(dom.window.navigator, 'locks', {
    configurable: true,
    value: {
      request(name, callback) {
        return Promise.resolve().then(() => callback({ name }));
      }
    }
  });
  dom.window.VisibilityInterval = class {
    constructor(callback) {
      this.callback = callback;
    }

    destroy() {}
  };

  const warnings = [];
  dom.window.console.warn = (...args) => warnings.push(args.join(' '));

  dom.window.chrome = {
    runtime: { lastError: null },
    notifications: { create() {} },
    storage: {
      onChanged: { addListener() {} },
      local: {
        get(key, callback) {
          if (mode === 'rejecting-get') {
            return Promise.reject(new Error(LOAD_ERROR));
          }
          // Callback-style area: settles through the callback, returns undefined.
          callback({});
          return undefined;
        },
        set(items, callback) {
          if (mode === 'rejecting-set') {
            return Promise.reject(new Error(SAVE_ERROR));
          }
          callback();
          return undefined;
        }
      }
    }
  };

  injectScript('src/features/pomodoro.js', dom.getInternalVMContext());

  // The timer is disabled by default, so enable it before any start attempt.
  dom.window.savePomodoroDurations({ enabled: true, workDuration: 25 });
  return { dom, warnings };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function expectNoUnhandledRejection(action) {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    await action();
    await flush();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
  expect(unhandled).not.toHaveBeenCalled();
}

describe('Pomodoro chrome.storage promise rejections', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('settles a rejecting load to no saved state without an unhandled rejection', async () => {
    const { dom, warnings } = createHarness({ mode: 'rejecting-get' });
    try {
      await expectNoUnhandledRejection(async () => {
        // startTimer persists through the callback-style set; togglePause then
        // reads the persisted state back through the rejecting promise-style get.
        dom.window.startPomodoro('todo-1');
        await flush();
        await dom.window.togglePomodoroPause();
      });

      expect(warnings.join('\n')).toContain(LOAD_ERROR);
    } finally {
      dom.window.close();
    }
  });

  it('settles a rejecting save to false without an unhandled rejection', async () => {
    const { dom, warnings } = createHarness({ mode: 'rejecting-set' });
    try {
      await expectNoUnhandledRejection(async () => {
        dom.window.startPomodoro('todo-1');
        await flush();
      });

      expect(warnings.join('\n')).toContain(SAVE_ERROR);
    } finally {
      dom.window.close();
    }
  });

  it('keeps settling a callback-style storage area through its callback', async () => {
    const { dom } = createHarness({ mode: 'callback-only' });
    try {
      await expectNoUnhandledRejection(async () => {
        dom.window.startPomodoro('todo-1');
        await flush();
      });

      const persisted = JSON.parse(dom.window.localStorage.getItem(TIMER_STATE_KEY));
      expect(persisted.active).toBe(true);
      expect(persisted.timeRemaining).toBeGreaterThan(0);
    } finally {
      dom.window.close();
    }
  });
});
