import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

const CLEAR_ERROR = 'Failed to clear storage';
const WRITE_ERROR = 'Failed to persist theme to chrome.storage';
const REMOVE_ERROR = 'Failed to remove language from chrome.storage';
const NATIVE_CLEAR_ERROR = 'Failed to clear native localStorage mirror';

function seedNativeStorage(nativeStorage, initialStore) {
  Object.entries(initialStore).forEach(([key, value]) => {
    nativeStorage.setItem(key, String(value));
  });
}

function createHarness(
  initialStore,
  {
    clearBehavior = 'pending',
    getBehavior = 'immediate',
    setBehavior = 'immediate',
    removeBehavior = 'immediate',
    storageAvailable = true
  } = {}
) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    runScripts: 'dangerously'
  });

  const store = { ...initialStore };
  const clearCallbacks = [];
  const getCallbacks = [];
  const setCallbacks = [];
  const removeCallbacks = [];
  const changeListeners = [];
  const nativeStorage = dom.window.localStorage;
  seedNativeStorage(nativeStorage, initialStore);

  const storage = {
    onChanged: {
      addListener(listener) {
        changeListeners.push(listener);
      },
      removeListener(listener) {
        const index = changeListeners.indexOf(listener);
        if (index >= 0) {
          changeListeners.splice(index, 1);
        }
      },
      hasListener(listener) {
        return changeListeners.includes(listener);
      }
    }
  };

  if (storageAvailable) {
    storage.local = {
      get(keys, callback) {
        if (getBehavior === 'pending') {
          getCallbacks.push(callback);
          return;
        }

        callback({ ...store });
      },
      set(items, callback) {
        if (setBehavior === 'pending') {
          setCallbacks.push({ items, callback });
          return Promise.resolve();
        }

        Object.assign(store, items);
        callback?.();
        return Promise.resolve();
      },
      remove(keys, callback) {
        if (removeBehavior === 'pending') {
          removeCallbacks.push({ keys, callback });
          return Promise.resolve();
        }

        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((key) => delete store[key]);
        callback?.();
        return Promise.resolve();
      },
      clear(callback) {
        if (clearBehavior === 'throw') {
          throw new Error(CLEAR_ERROR);
        }

        clearCallbacks.push(callback);
        return Promise.resolve();
      }
    };
  }

  dom.window.chrome = {
    runtime: { lastError: null },
    storage
  };

  injectScript('src/core/storage.js', dom.getInternalVMContext());

  return {
    dom,
    nativeStorage,
    store,
    clearCallbacks,
    getCallbacks,
    setCallbacks,
    removeCallbacks,
    emitChange(changes, areaName = 'local') {
      Object.entries(changes).forEach(([key, change]) => {
        if (change?.newValue === null || typeof change?.newValue === 'undefined') {
          delete store[key];
        } else {
          store[key] = String(change.newValue);
        }
      });

      changeListeners.forEach((listener) => listener(changes, areaName));
    }
  };
}

async function failPendingClear(harness, index = 0) {
  harness.dom.window.chrome.runtime.lastError = { message: CLEAR_ERROR };
  harness.clearCallbacks[index]();
  harness.dom.window.chrome.runtime.lastError = null;
  await Promise.resolve();
}

async function succeedPendingClear(harness, index = 0) {
  Object.keys(harness.store).forEach((key) => delete harness.store[key]);
  harness.dom.window.chrome.runtime.lastError = null;
  harness.clearCallbacks[index]();
  await Promise.resolve();
}

async function failPendingSet(harness, index = 0) {
  harness.dom.window.chrome.runtime.lastError = { message: WRITE_ERROR };
  harness.setCallbacks[index].callback();
  harness.dom.window.chrome.runtime.lastError = null;
  await Promise.resolve();
}

async function failPendingRemove(harness, index = 0) {
  harness.dom.window.chrome.runtime.lastError = { message: REMOVE_ERROR };
  harness.removeCallbacks[index].callback();
  harness.dom.window.chrome.runtime.lastError = null;
  await Promise.resolve();
}

function snapshotNativeStorage(nativeStorage) {
  const snapshot = {};
  for (let index = 0; index < nativeStorage.length; index += 1) {
    const key = nativeStorage.key(index);
    if (key !== null) {
      snapshot[key] = nativeStorage.getItem(key);
    }
  }
  return snapshot;
}

describe('storage bridge clear rollback', () => {
  it('restores cache and native storage after an asynchronous clear failure', async () => {
    const harness = createHarness({ theme: 'light', language: 'zh' });

    try {
      const failurePromise = new Promise((resolveFailure) => {
        harness.dom.window.addEventListener('storageBridgeWriteError', resolveFailure, { once: true });
      });

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');

      harness.dom.window.localStorage.clear();

      expect(harness.dom.window.localStorage.length).toBe(0);
      expect(harness.nativeStorage.length).toBe(0);
      expect(harness.clearCallbacks).toHaveLength(1);

      await failPendingClear(harness);

      const failureEvent = await failurePromise;
      expect(failureEvent.detail).toMatchObject({
        key: null,
        message: CLEAR_ERROR,
        operation: 'clear',
        generation: expect.any(Number)
      });
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('light');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('rolls back and clears the pending state when an asynchronous clear never calls back', async () => {
    vi.useFakeTimers();

    const harness = createHarness({ theme: 'light', language: 'zh' });
    try {
      const failures = [];
      harness.dom.window.addEventListener('storageBridgeWriteError', (event) => {
        failures.push(event.detail);
      });

      harness.dom.window.localStorage.clear();
      expect(harness.dom.window.localStorage.length).toBe(0);
      expect(harness.nativeStorage.length).toBe(0);

      vi.advanceTimersByTime(3000);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        key: null,
        operation: 'clear',
        generation: expect.any(Number)
      });
      expect(failures[0].message).toContain('did not respond within 3 s');

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('light');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });

      harness.dom.window.localStorage.setItem('theme', 'dark');
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');

      harness.dom.window.localStorage.clear();
      expect(harness.clearCallbacks).toHaveLength(2);

      await failPendingClear(harness, 1);

      expect(failures).toHaveLength(2);
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('dark');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'dark', language: 'zh' });
    } finally {
      harness.dom.window.close();
      vi.useRealTimers();
    }
  });

  it('restores cache and native storage after a synchronous clear throw', () => {
    const harness = createHarness({ theme: 'light', language: 'zh' }, { clearBehavior: 'throw' });

    try {
      const failures = [];
      harness.dom.window.addEventListener('storageBridgeWriteError', (event) => {
        failures.push(event.detail);
      });

      harness.dom.window.localStorage.clear();

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        key: null,
        message: CLEAR_ERROR,
        operation: 'clear',
        generation: expect.any(Number)
      });
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('light');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
    } finally {
      harness.dom.window.close();
    }
  });

  it('restores a clear issued during hydration when the clear throws synchronously', () => {
    const harness = createHarness(
      { theme: 'light', language: 'zh' },
      { clearBehavior: 'throw', getBehavior: 'pending' }
    );

    try {
      expect(harness.getCallbacks).toHaveLength(1);
      harness.dom.window.localStorage.clear();

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');

      harness.getCallbacks[0]({ ...harness.store });

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.dom.window.localStorage.length).toBe(2);
    } finally {
      harness.dom.window.close();
    }
  });

  it('allows an older clear to roll back after a newer write fails', async () => {
    const harness = createHarness(
      { theme: 'light', language: 'zh' },
      { setBehavior: 'pending' }
    );

    try {
      harness.dom.window.localStorage.clear();
      harness.dom.window.localStorage.setItem('theme', 'dark');

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');
      expect(harness.setCallbacks).toHaveLength(1);

      await failPendingSet(harness);
      expect(harness.dom.window.localStorage.getItem('theme')).toBeNull();

      await failPendingClear(harness);

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('light');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('allows an older clear to roll back after a newer remove fails', async () => {
    const harness = createHarness(
      { theme: 'light', language: 'zh' },
      { removeBehavior: 'pending' }
    );

    try {
      harness.dom.window.localStorage.clear();
      const removal = harness.dom.window.localStorage.removeItemAsync('language');

      expect(harness.dom.window.localStorage.getItem('language')).toBeNull();
      expect(harness.removeCallbacks).toHaveLength(1);

      await failPendingRemove(harness);
      await removal;

      expect(harness.dom.window.localStorage.getItem('language')).toBeNull();

      await failPendingClear(harness);

      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('preserves a newer external storage mutation when the clear later fails', async () => {
    const harness = createHarness({ theme: 'light', language: 'zh' });

    try {
      harness.dom.window.localStorage.clear();
      harness.emitChange({ theme: { oldValue: 'light', newValue: 'dark' } });

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');
      expect(harness.dom.window.localStorage.getItem('language')).toBeNull();

      await failPendingClear(harness);

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('dark');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'dark', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('does not resurrect data after a newer clear succeeds', async () => {
    const harness = createHarness({ theme: 'light', language: 'zh' });

    try {
      harness.dom.window.localStorage.clear();
      harness.dom.window.localStorage.clear();

      expect(harness.clearCallbacks).toHaveLength(2);

      await failPendingClear(harness, 0);
      expect(harness.dom.window.localStorage.length).toBe(0);

      await succeedPendingClear(harness, 1);

      expect(harness.dom.window.localStorage.length).toBe(0);
      expect(harness.nativeStorage.length).toBe(0);
      expect(harness.store).toEqual({});
    } finally {
      harness.dom.window.close();
    }
  });

  it('restores the original snapshot when overlapping clears both fail', async () => {
    const harness = createHarness({ theme: 'light', language: 'zh' });

    try {
      harness.dom.window.localStorage.clear();
      harness.dom.window.localStorage.clear();

      await failPendingClear(harness, 0);
      expect(harness.dom.window.localStorage.length).toBe(0);

      await failPendingClear(harness, 1);

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('light');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('rolls back a failed native-only clear and reports the failure', () => {
    const harness = createHarness(
      { theme: 'light', language: 'zh' },
      { storageAvailable: false }
    );

    try {
      const failures = [];
      harness.dom.window.addEventListener('storageBridgeWriteError', (event) => {
        failures.push(event.detail);
      });

      const originalRemoveItem = harness.nativeStorage.removeItem.bind(harness.nativeStorage);
      let shouldFail = true;
      harness.nativeStorage.removeItem = (key) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error(NATIVE_CLEAR_ERROR);
        }
        originalRemoveItem(key);
      };

      harness.dom.window.localStorage.clear();

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        key: null,
        message: 'Failed to clear native localStorage mirror',
        operation: 'clear',
        generation: expect.any(Number)
      });
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('defers a failed clear rollback until a newer async mutation settles', async () => {
    vi.useFakeTimers();

    const harness = createHarness(
      { theme: 'light', language: 'zh' },
      { setBehavior: 'pending' }
    );

    try {
      const failures = [];
      harness.dom.window.addEventListener('storageBridgeWriteError', (event) => {
        failures.push(event.detail);
      });

      harness.dom.window.localStorage.clear();
      harness.dom.window.localStorage.setItem('theme', 'dark');

      vi.advanceTimersByTime(3000);

      expect(failures).toHaveLength(1);
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');
      expect(harness.nativeStorage.getItem('theme')).toBeNull();

      await failPendingSet(harness);

      expect(failures).toHaveLength(2);
      expect(harness.dom.window.localStorage.getItem('theme')).toBe('light');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('light');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'light', language: 'zh' });
    } finally {
      harness.dom.window.close();
      vi.useRealTimers();
    }
  });

  it('restores every failed clear snapshot in generation order', async () => {
    const harness = createHarness({ theme: 'light', language: 'zh' });

    try {
      harness.dom.window.localStorage.clear();
      harness.dom.window.localStorage.setItem('theme', 'dark');
      harness.dom.window.localStorage.clear();

      expect(harness.clearCallbacks).toHaveLength(2);

      await failPendingClear(harness, 0);
      expect(harness.dom.window.localStorage.getItem('theme')).toBeNull();

      await failPendingClear(harness, 1);

      expect(harness.dom.window.localStorage.getItem('theme')).toBe('dark');
      expect(harness.dom.window.localStorage.getItem('language')).toBe('zh');
      expect(harness.nativeStorage.getItem('theme')).toBe('dark');
      expect(harness.nativeStorage.getItem('language')).toBe('zh');
      expect(harness.store).toEqual({ theme: 'dark', language: 'zh' });
    } finally {
      harness.dom.window.close();
    }
  });

  it('keeps the reloaded view consistent with the restored native mirror', async () => {
    const harness = createHarness({ theme: 'light', language: 'zh' });

    try {
      harness.dom.window.localStorage.clear();
      await failPendingClear(harness);

      const restoredNativeSnapshot = snapshotNativeStorage(harness.nativeStorage);
      expect(restoredNativeSnapshot).toEqual({ theme: 'light', language: 'zh' });

      const reloaded = createHarness(restoredNativeSnapshot);
      try {
        expect(reloaded.dom.window.localStorage.getItem('theme')).toBe(
          harness.dom.window.localStorage.getItem('theme')
        );
        expect(reloaded.dom.window.localStorage.getItem('language')).toBe(
          harness.dom.window.localStorage.getItem('language')
        );
        expect(reloaded.dom.window.localStorage.length).toBe(
          harness.dom.window.localStorage.length
        );
      } finally {
        reloaded.dom.window.close();
      }
    } finally {
      harness.dom.window.close();
    }
  });
});
