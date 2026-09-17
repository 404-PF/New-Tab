import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

describe('storage bridge write generations', () => {
  it('reports stale write errors without rolling back the newer generation', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
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

      const failureEvents = [];
      dom.window.addEventListener('storageBridgeWriteError', (event) => {
        failureEvents.push(event.detail);
      });

      expect(dom.window.localStorage.setItem('testKey', 'first')).toBe(true);
      expect(dom.window.localStorage.setItem('testKey', 'second')).toBe(true);
      expect(setCallbacks).toHaveLength(2);

      dom.window.chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      setCallbacks[0]();
      dom.window.chrome.runtime.lastError = null;

      await Promise.resolve();

      expect(failureEvents).toHaveLength(1);
      expect(failureEvents[0]).toMatchObject({
        key: 'testKey',
        message: 'QUOTA_BYTES quota exceeded',
        operation: 'set',
        generation: 1,
        value: 'first'
      });
      expect(dom.window.localStorage.getItem('testKey')).toBe('second');

      setCallbacks[1]();
      await Promise.resolve();

      expect(failureEvents).toHaveLength(1);
      expect(dom.window.localStorage.getItem('testKey')).toBe('second');
    } finally {
      dom.window.close();
    }
  });
});
