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

describe('storage bridge promise rejections', () => {
  it('rolls back and reports a set whose promise rejects without a callback', async () => {
    const dom = await createHarness();
    try {
      const events = [];
      dom.window.addEventListener('storageBridgeWriteError', (event) => events.push(event.detail));

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
    const dom = await createHarness();
    try {
      const events = [];
      dom.window.addEventListener('storageBridgeWriteError', (event) => events.push(event.detail));

      dom.window.localStorage.removeItem('testKey');
      await flush();

      expect(dom.window.localStorage.getItem('testKey')).toBe('initial');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ key: 'testKey', operation: 'remove' });
    } finally {
      dom.window.close();
    }
  });
});
