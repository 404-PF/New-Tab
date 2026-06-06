// Regression test: New Tab must not stay blank when chrome.storage stalls.
// When chrome.storage.local.get() never calls back, the storage bridge timeout
// must resolve __storageBridgeReady so bootstrap proceeds.
//
// This test runs in the shared vitest+jsdom environment (where storage.js is
// already injected by setup.js). We simulate the stall by replacing
// chrome.storage.local with a version whose get() never invokes its callback,
// then re-inject storage.js and verify the timeout path.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const STORAGE_JS_PATH = resolve(process.cwd(), 'src/core/storage.js');
const STORAGE_CODE = readFileSync(STORAGE_JS_PATH, 'utf-8');

// Save the original chrome mock so we can restore it after the stall test
let originalChrome = null;

describe('bootstrap with stalled chrome.storage', () => {
  beforeAll(() => {
    // Save the chrome mock installed by setup.js before we override it
    originalChrome = globalThis.chrome;
  });

  afterAll(() => {
    // Restore the original chrome mock for other tests
    globalThis.chrome = originalChrome;
  });

  it(
    'resolves __storageBridgeReady via timeout when chrome.storage.get never calls back',
    async () => {
      // Override chrome.storage.local with a get() that NEVER calls back.
      // This is the failure mode that causes the blank-new-tab bug.
      globalThis.chrome = {
        runtime: { id: 'test-extension-id' },
        storage: {
          onChanged: {
            addListener: () => {},
            removeListener: () => {},
            hasListener: () => false,
          },
          local: {
            // Intentionally NEVER invokes the callback — this is the
            // failure mode the safety timeout is designed to handle.
            get(_keys, _callback) { /* no-op — never calls back */ },
            set(_items, callback) { callback?.(); return Promise.resolve(); },
            remove(_keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); },
          },
        },
      };

      // Re-inject storage.js so it picks up the stalling chrome.storage
      (0, eval)(STORAGE_CODE);

      // __storageBridgeReady should be a Promise
      expect(globalThis.__storageBridgeReady).toBeDefined();
      expect(typeof globalThis.__storageBridgeReady.then).toBe('function');

      // The bridge should be functional immediately (it uses the native
      // localStorage snapshot captured before the chrome.storage call)
      globalThis.localStorage.setItem('stallTest', 'bridge-works');
      expect(globalThis.localStorage.getItem('stallTest')).toBe('bridge-works');

      // Wait for the safety timeout to fire (3 seconds)
      await expect(globalThis.__storageBridgeReady).resolves.toBeUndefined();

      // After timeout resolution the bridge should still work
      expect(globalThis.localStorage.getItem('stallTest')).toBe('bridge-works');
    },
    5_000,
  );
});
