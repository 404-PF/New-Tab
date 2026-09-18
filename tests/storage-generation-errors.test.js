import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

const QUOTA_ERROR = 'QUOTA_BYTES quota exceeded';

async function createHarness() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    runScripts: 'dangerously'
  });

  let resolveGet;
  const setCallbacks = [];

  dom.window.chrome = {
    runtime: { lastError: null },
    storage: {
      onChanged: {
        addListener() {},
        removeListener() {},
        hasListener() { return false; }
      },
      local: {
        get(keys, callback) {
          resolveGet = () => callback({ testKey: 'initial' });
        },
        set(items, callback) {
          setCallbacks.push(callback);
          return Promise.resolve();
        },
        remove(keys, callback) { callback?.(); return Promise.resolve(); },
        clear(callback) { callback?.(); return Promise.resolve(); }
      }
    }
  };

  injectScript('src/core/storage.js', dom.getInternalVMContext());
  resolveGet();
  await dom.window.__storageBridgeReady;

  return { dom, setCallbacks, failureEvents: [] };
}

async function failWrite(harness, callbackIndex) {
  harness.dom.window.chrome.runtime.lastError = { message: QUOTA_ERROR };
  harness.setCallbacks[callbackIndex]();
  harness.dom.window.chrome.runtime.lastError = null;
  await Promise.resolve();
}

function expectQuotaFailure(event, generation, value) {
  expect(event).toMatchObject({
    key: 'testKey',
    message: QUOTA_ERROR,
    operation: 'set',
    generation,
    value
  });
}

describe('storage bridge write generations', () => {
  it('reports stale write errors without rolling back the newer generation', async () => {
    const harness = await createHarness();

    try {
      harness.dom.window.addEventListener('storageBridgeWriteError', (event) => {
        harness.failureEvents.push(event.detail);
      });

      expect(harness.dom.window.localStorage.setItem('testKey', 'first')).toBe(true);
      expect(harness.dom.window.localStorage.setItem('testKey', 'second')).toBe(true);
      expect(harness.setCallbacks).toHaveLength(2);

      await failWrite(harness, 0);
      expect(harness.failureEvents).toHaveLength(1);
      expectQuotaFailure(harness.failureEvents[0], 1, 'first');
      expect(harness.dom.window.localStorage.getItem('testKey')).toBe('second');

      await failWrite(harness, 1);
      expect(harness.failureEvents).toHaveLength(2);
      expectQuotaFailure(harness.failureEvents[1], 2, 'second');
      expect(harness.dom.window.localStorage.getItem('testKey')).toBe('first');
    } finally {
      harness.dom.window.close();
    }
  });

  it('keeps a reentrant write generation pending during error reporting', async () => {
    const harness = await createHarness();

    try {
      harness.dom.window.addEventListener('storageBridgeWriteError', (event) => {
        harness.failureEvents.push(event.detail);
        if (event.detail.generation === 2) {
          expect(harness.dom.window.localStorage.setItem('testKey', 'third')).toBe(true);
        }
      });

      expect(harness.dom.window.localStorage.setItem('testKey', 'first')).toBe(true);
      expect(harness.dom.window.localStorage.setItem('testKey', 'second')).toBe(true);
      expect(harness.setCallbacks).toHaveLength(2);

      await failWrite(harness, 1);
      expect(harness.setCallbacks).toHaveLength(3);
      expect(harness.failureEvents).toHaveLength(1);
      expectQuotaFailure(harness.failureEvents[0], 2, 'second');
      expect(harness.dom.window.localStorage.getItem('testKey')).toBe('third');

      await failWrite(harness, 2);
      expect(harness.failureEvents).toHaveLength(2);
      expectQuotaFailure(harness.failureEvents[1], 3, 'third');
      expect(harness.dom.window.localStorage.getItem('testKey')).toBe('second');
    } finally {
      harness.dom.window.close();
    }
  });
});
