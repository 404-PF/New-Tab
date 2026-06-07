// Regression test: New Tab must not stay blank when chrome.storage stalls.
// When chrome.storage.local.get() never calls back, the storage bridge timeout
// must resolve __storageBridgeReady so bootstrap proceeds.
//
// This test runs in the shared vitest+jsdom environment (where storage.js is
// already injected by setup.js). We simulate the stall by replacing
// chrome.storage.local with a version whose get() never invokes its callback,
// then re-inject storage.js and verify the timeout path.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

const STORAGE_JS_PATH = resolve(process.cwd(), 'src/core/storage.js');
const STORAGE_CODE = readFileSync(STORAGE_JS_PATH, 'utf-8');

describe('bootstrap with stalled chrome.storage', () => {
  it(
    'resolves __storageBridgeReady via timeout when chrome.storage.get never calls back',
    async () => {
      // Create an isolated JSDOM context for this test
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://example.com',
        runScripts: 'dangerously'
      });

      try {
        // Override chrome.storage.local with a get() that NEVER calls back.
        // This is the failure mode that causes the blank-new-tab bug.
        dom.window.chrome = {
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

        // Inject storage.js using the shared injectScript helper
        injectScript(STORAGE_CODE, dom.getInternalVMContext());

        // __storageBridgeReady should be a Promise
        expect(dom.window.__storageBridgeReady).toBeDefined();
        expect(typeof dom.window.__storageBridgeReady.then).toBe('function');

        // The bridge should be functional immediately (it uses the native
        // localStorage snapshot captured before the chrome.storage call)
        dom.window.localStorage.setItem('stallTest', 'bridge-works');
        expect(dom.window.localStorage.getItem('stallTest')).toBe('bridge-works');

        // Wait for the safety timeout to fire (3 seconds)
        await expect(dom.window.__storageBridgeReady).resolves.toBeUndefined();

        // After timeout resolution the bridge should still work
        expect(dom.window.localStorage.getItem('stallTest')).toBe('bridge-works');
      } finally {
        dom.window.close();
      }
    },
    7_000,
  );
});
