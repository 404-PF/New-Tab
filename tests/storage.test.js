import { beforeEach, describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { injectScript } from './helpers/inject-script.js';

beforeEach(() => {
  localStorage.clear();
});

describe('storage bridge', () => {
  it('persists localStorage writes to chrome.storage.local', async () => {
    localStorage.setItem('theme', 'light');

    const stored = await chrome.storage.local.get('theme');
    expect(stored.theme).toBe('light');
  });

  it('reflects direct chrome.storage.local writes back into localStorage', async () => {
    await chrome.storage.local.set({ language: 'zh' });

    expect(localStorage.getItem('language')).toBe('zh');
  });

  it('clears chrome.storage.local when localStorage.clear is called', async () => {
    localStorage.setItem('language', 'zh');
    localStorage.clear();

    const stored = await chrome.storage.local.get(null);
    expect(stored.language).toBeUndefined();
  });

  it('exposes length and key ordering', () => {
    localStorage.setItem('first', '1');
    localStorage.setItem('second', '2');

    expect(localStorage.length).toBe(2);
    expect(localStorage.key(0)).toBe('first');
    expect(localStorage.key(1)).toBe('second');
  });

  it('returns empty-string keys without coercing them to null', () => {
    localStorage.setItem('', 'empty');

    expect(localStorage.key(0)).toBe('');
  });

  it('keeps the captured native snapshot when chrome.storage hydration fails', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      dom.window.localStorage.setItem('theme', 'light');

      let resolveGet;
      let getCalled = false;

      dom.window.chrome = {
        runtime: {
          lastError: null
        },
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
              getCalled = true;
              resolveGet = () => {
                dom.window.chrome.runtime.lastError = { message: 'boom' };
                callback({});
                dom.window.chrome.runtime.lastError = null;
              };
            },
            set(items, callback) {
              callback?.();
              return Promise.resolve();
            },
            remove(keys, callback) {
              callback?.();
              return Promise.resolve();
            },
            clear(callback) {
              callback?.();
              return Promise.resolve();
            }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      expect(getCalled).toBe(true);
      dom.window.localStorage.setItem('bridge-write', 'kept');
      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('theme')).toBe('light');
      expect(dom.window.localStorage.getItem('bridge-write')).toBe('kept');
      expect(dom.window.localStorage.length).toBe(2);
    } finally {
      dom.window.close();
    }
  });

  it('merges local mutations made while chrome.storage hydration is pending', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      dom.window.localStorage.setItem('theme', 'dark');
      dom.window.localStorage.setItem('stale', 'keep-me');

      let resolveGet;
      let getCalled = false;

      dom.window.chrome = {
        runtime: {
          lastError: null
        },
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
              getCalled = true;
              resolveGet = () => {
                callback({
                  theme: 'server-theme',
                  stale: 'server-stale',
                  hydrated: 'from-storage'
                });
              };
            },
            set(items, callback) {
              callback?.();
              return Promise.resolve();
            },
            remove(keys, callback) {
              callback?.();
              return Promise.resolve();
            },
            clear(callback) {
              callback?.();
              return Promise.resolve();
            }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      expect(getCalled).toBe(true);

      dom.window.localStorage.setItem('theme', 'light');
      dom.window.localStorage.removeItem('stale');
      dom.window.localStorage.setItem('bridge-write', 'kept');
      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('theme')).toBe('light');
      expect(dom.window.localStorage.getItem('stale')).toBeNull();
      expect(dom.window.localStorage.getItem('bridge-write')).toBe('kept');
      expect(dom.window.localStorage.getItem('hydrated')).toBe('from-storage');
      expect(dom.window.localStorage.length).toBe(3);
    } finally {
      dom.window.close();
    }
  });

  it('syncs native localStorage with chrome.storage after hydration', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let resolveGet;

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
              resolveGet = () => {
                callback({ theme: 'light', language: 'zh' });
              };
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('theme')).toBe('light');
      expect(dom.window.localStorage.getItem('language')).toBe('zh');
    } finally {
      dom.window.close();
    }
  });

  it('persists settings across simulated restart via native localStorage', async () => {
    const storageData = { theme: 'light', simpleMode: 'true' };

    const createDom = () => new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    let dom = createDom();
    try {
      let resolveGet;

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
              resolveGet = () => callback({ ...storageData });
            },
            set(items, callback) {
              Object.assign(storageData, items);
              callback?.();
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

      expect(dom.window.localStorage.getItem('theme')).toBe('light');
      expect(dom.window.localStorage.getItem('simpleMode')).toBe('true');
    } finally {
      dom.window.close();
    }

    dom = createDom();
    try {
      let resolveGet;

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
              resolveGet = () => callback({ ...storageData });
            },
            set(items, callback) {
              Object.assign(storageData, items);
              callback?.();
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

      expect(dom.window.localStorage.getItem('theme')).toBe('light');
      expect(dom.window.localStorage.getItem('simpleMode')).toBe('true');
    } finally {
      dom.window.close();
    }
  });

  it('preserves mutations made while hydration callback is delayed', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let resolveGet;

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
              resolveGet = () => {
                callback({ theme: 'dark' });
              };
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      dom.window.localStorage.setItem('theme', 'light');
      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('theme')).toBe('light');
    } finally {
      dom.window.close();
    }
  });

  it('deletes key from cache when chrome.storage removes an item (newValue is null)', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let changeListener;
      let resolveGet;

      dom.window.chrome = {
        runtime: { lastError: null },
        storage: {
          onChanged: {
            addListener(fn) { changeListener = fn; },
            removeListener() {},
            hasListener() { return false; }
          },
          local: {
            get(keys, callback) {
              resolveGet = () => callback({ testKey: 'hello' });
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('testKey')).toBe('hello');

      changeListener({ testKey: { oldValue: 'hello', newValue: null } }, 'local');

      expect(dom.window.localStorage.getItem('testKey')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('script writes survive when chrome.storage.get responds after bridge timeout', async () => {
    const code = readFileSync(resolve(process.cwd(), 'src/core/storage.js'), 'utf-8');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let lateCallback;

      dom.window.chrome = {
        runtime: { lastError: null },
        storage: {
          onChanged: {
            addListener() {},
            removeListener() {},
            hasListener() { return false; }
          },
          local: {
            get(_keys, callback) {
              lateCallback = () => {
                callback({ serverSetting: 'from-server' });
              };
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      injectScript(code, dom.getInternalVMContext());

      expect(dom.window.__storageBridgeReady).toBeDefined();

      // Wait for the 3 s bridge timeout to fire
      await dom.window.__storageBridgeReady;

      // Simulate scripts writing values after the timeout
      dom.window.localStorage.setItem('appOrder', '["app1","app2"]');
      dom.window.localStorage.setItem('theme', 'dark');
      expect(dom.window.localStorage.getItem('appOrder')).toBe('["app1","app2"]');
      expect(dom.window.localStorage.getItem('theme')).toBe('dark');

      // Now chrome.storage.local.get finally responds (late callback).
      // Before the fix this would call applySnapshot() and clobber the
      // script-persisted values. After the fix the callback exits early
      // because hydrationFinished was set when the timeout fired.
      lateCallback();

      expect(dom.window.localStorage.getItem('appOrder')).toBe('["app1","app2"]');
      expect(dom.window.localStorage.getItem('theme')).toBe('dark');
    } finally {
      dom.window.close();
    }
  }, 10_000);

  it('preserves writes that land between get callback and applySnapshot', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let resolveGet;
      let getCalled = false;

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
              getCalled = true;
              resolveGet = () => {
                callback({ serverKey: 'server-val' });
              };
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      expect(getCalled).toBe(true);

      dom.window.localStorage.setItem('userKey', 'user-val');
      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('userKey')).toBe('user-val');
      expect(dom.window.localStorage.getItem('serverKey')).toBe('server-val');
    } finally {
      dom.window.close();
    }
  });

  it('preserves hydration-tracked writes when onChanged fires after applySnapshot', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let resolveGet;
      let changeListener;

      dom.window.chrome = {
        runtime: { lastError: null },
        storage: {
          onChanged: {
            addListener(fn) { changeListener = fn; },
            removeListener() {},
            hasListener() { return false; }
          },
          local: {
            get(keys, callback) {
              resolveGet = () => {
                callback({ shared: 'server-shared' });
              };
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      dom.window.localStorage.setItem('shared', 'user-shared');
      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('shared')).toBe('user-shared');

      changeListener({ shared: { oldValue: 'server-shared', newValue: 'changed-shared' } }, 'local');

      expect(dom.window.localStorage.getItem('shared')).toBe('user-shared');
    } finally {
      dom.window.close();
    }
  });

  it('preserves writes for a key present in both native and server snapshots', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      let resolveGet;
      let getCalled = false;

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
              getCalled = true;
              resolveGet = () => {
                callback({ theme: 'server-theme', extra: 'server-extra' });
              };
            },
            set(items, callback) { callback?.(); return Promise.resolve(); },
            remove(keys, callback) { callback?.(); return Promise.resolve(); },
            clear(callback) { callback?.(); return Promise.resolve(); }
          }
        }
      };

      dom.window.localStorage.setItem('theme', 'native-theme');

      injectScript('src/core/storage.js', dom.getInternalVMContext());

      expect(getCalled).toBe(true);

      dom.window.localStorage.setItem('theme', 'user-theme');
      resolveGet();
      await dom.window.__storageBridgeReady;

      expect(dom.window.localStorage.getItem('theme')).toBe('user-theme');
      expect(dom.window.localStorage.getItem('extra')).toBe('server-extra');
    } finally {
      dom.window.close();
    }
  });
});
