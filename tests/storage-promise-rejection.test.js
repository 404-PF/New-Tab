import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

// A promise-returning chrome.storage implementation can reject without ever
// invoking the callback. The bridge must treat that as a failed write rather
// than leaving an unhandled rejection and a stale optimistic cache entry.

async function createHarness() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    runScripts: 'dangerously'
  });

  let resolveGet;
  dom.window.chrome = {
    runtime: { lastError: null },
    storage: {
      onChanged: { addListener() {}, removeListener() {}, hasListener() { return false; } },
      local: {
        get(keys, callback) {
          resolveGet = () => callback({ testKey: 'initial' });
        },
        set() {
          return Promise.reject(new Error('set rejected'));
        },
        remove() {
          return Promise.reject(new Error('remove rejected'));
        },
        clear(callback) { callback?.(); }
      }
    }
  };

  injectScript('src/core/storage.js', dom.getInternalVMContext());
  resolveGet();
  await dom.window.__storageBridgeReady;
  return dom;
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// Shared shape for every rejection case: run the write, then assert the
// optimistic cache rolled back and exactly one write-failure event fired.
// Returns whatever the write case resolved to so callers can add checks.
async function expectRolledBackAndReported(operation, write) {
  const dom = await createHarness();
  try {
    const events = [];
    dom.window.addEventListener('storageBridgeWriteError', (event) => events.push(event.detail));

    const writeResult = await write(dom.window);

    expect(dom.window.localStorage.getItem('testKey')).toBe('initial');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: 'testKey', operation });
    return writeResult;
  } finally {
    dom.window.close();
  }
}

describe('storage bridge promise rejections', () => {
  it('rolls back and reports a set whose promise rejects without a callback', async () => {
    await expectRolledBackAndReported('set', async (win) => {
      expect(win.localStorage.setItem('testKey', 'next')).toBe(true);
      await flush();
    });
  });

  it('restores and reports a remove whose promise rejects without a callback', async () => {
    await expectRolledBackAndReported('remove', async (win) => {
      win.localStorage.removeItem('testKey');
      await flush();
    });
  });

  it('settles setItemAsync false and rolls back when the set promise rejects without a callback', async () => {
    await expectRolledBackAndReported('set', async (win) => {
      const writePromise = win.localStorage.setItemAsync('testKey', 'next');
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
    });
  });
});
