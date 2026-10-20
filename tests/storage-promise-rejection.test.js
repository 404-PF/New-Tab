import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

// A promise-returning chrome.storage implementation can reject without ever
// invoking the callback. The bridge must treat that as a failed write rather than
// leaving an unhandled rejection and a stale optimistic cache entry.

const SET_ERROR = 'set rejected';
const REMOVE_ERROR = 'remove rejected';
const CLEAR_ERROR = 'clear rejected';

async function createHarness({ clearRejects = false, rejectSets = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    runScripts: 'dangerously'
  });

  let resolveGet;
  const setCalls = [];
  dom.window.chrome = {
    runtime: { lastError: null },
    storage: {
      onChanged: {
        addListener() {},
        removeListener() {},
        hasListener() {
          return false;
        }
      },
      local: {
        get(keys, callback) {
          resolveGet = () => callback({ testKey: 'initial' });
        },
        set(items, callback) {
          setCalls.push(items);
          if (!rejectSets) {
            // Callback-style: settles through the callback, never rejects.
            callback();
            return;
          }

          return Promise.reject(new Error(SET_ERROR));
        },
        remove() {
          return Promise.reject(new Error(REMOVE_ERROR));
        },
        clear() {
          if (clearRejects) {
            return Promise.reject(new Error(CLEAR_ERROR));
          }

          return Promise.resolve();
        }
      }
    }
  };

  injectScript('src/core/storage.js', dom.getInternalVMContext());
  resolveGet();
  await dom.window.__storageBridgeReady;
  return { dom, setCalls };
}

function collectWriteErrors(dom) {
  const events = [];
  dom.window.addEventListener('storageBridgeWriteError', (event) => events.push(event.detail));
  return events;
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('storage bridge promise rejections', () => {
  it('rolls back and reports a set whose promise rejects without a callback', async () => {
    const { dom } = await createHarness();

    try {
      const events = collectWriteErrors(dom);

      expect(dom.window.localStorage.setItem('testKey', 'next')).toBe(true);
      await flush();

      expect(dom.window.localStorage.getItem('testKey')).toBe('initial');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ key: 'testKey', operation: 'set' });
    } finally {
      dom.window.close();
    }
  });

  it('restores and reports a remove whose promise rejects without a callback', async () => {
    const { dom } = await createHarness();

    try {
      const events = collectWriteErrors(dom);

      dom.window.localStorage.removeItem('testKey');
      await flush();

      expect(dom.window.localStorage.getItem('testKey')).toBe('initial');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ key: 'testKey', operation: 'remove' });
    } finally {
      dom.window.close();
    }
  });

  it('settles setItemAsync false and rolls back when the set promise rejects without a callback', async () => {
    const { dom } = await createHarness();

    try {
      const events = collectWriteErrors(dom);

      const writePromise = dom.window.localStorage.setItemAsync('testKey', 'next');
      // Pre-fix the operation promise never settles when a promise-only
      // storage rejects without invoking the callback, so race it against a
      // timeout to fail fast instead of hanging the suite.
      const outcome = await Promise.race([
        writePromise.then(
          (value) => ({ settled: true, value }),
          () => ({ settled: true, rejected: true })
        ),
        new Promise((resolve) => setTimeout(() => resolve({ settled: false }), 100))
      ]);

      expect(outcome).toMatchObject({ settled: true });
      expect(outcome.value).toBe(false);
      expect(dom.window.localStorage.getItem('testKey')).toBe('initial');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ key: 'testKey', operation: 'set' });
    } finally {
      dom.window.close();
    }
  });

  it('reports a clear whose promise rejects without a callback', async () => {
    const { dom } = await createHarness({ clearRejects: true });

    try {
      const events = collectWriteErrors(dom);

      dom.window.localStorage.clear();
      await flush();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ operation: 'clear' });
    } finally {
      dom.window.close();
    }
  });

  it('keeps a newer write from being rolled back by an older write on the same key', async () => {
    const { dom } = await createHarness();

    try {
      const events = collectWriteErrors(dom);

      // Both writes reject. 'first' becomes the previous value the second write
      // must restore to, so exactly one of the two rollbacks must win and the
      // surviving value must be 'first' — the value the cache held when the
      // last write was issued.
      dom.window.localStorage.setItem('testKey', 'first');
      dom.window.localStorage.setItem('testKey', 'second');
      await flush();

      expect(events).toHaveLength(2);
      expect(dom.window.localStorage.getItem('testKey')).toBe('first');
    } finally {
      dom.window.close();
    }
  });
});
