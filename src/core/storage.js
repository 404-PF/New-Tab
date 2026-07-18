(function () {
  const nativeLocalStorage = globalThis.localStorage;
  const cache = new Map();
  let hydrationStarted = false;
  let hydrationFinished = false;
  let hydrationClearRequested = false;
  const hydrationMutations = new Map();
  let resolveStorageBridge;
  let storageBridgeResolved = false;
  let storageBridgeTimeoutId = null;
  const STORAGE_BRIDGE_TIMEOUT_MS = 3000;
  const storageReady = new Promise((resolve) => {
    resolveStorageBridge = resolve;
  });

  globalThis.__storageBridgeReady = storageReady;

  // Safety timeout: if chrome.storage.local.get() never calls back (e.g. extension
  // reload, context invalidation, transient API failure), resolve the bridge after
  // 3 seconds so bootstrap proceeds and the page renders. Without this the New Tab
  // stalls permanently — all scripts wait on __storageBridgeReady.
  storageBridgeTimeoutId = setTimeout(function () {
    console.warn(
      `[storage] chrome.storage.local.get() did not respond within ${STORAGE_BRIDGE_TIMEOUT_MS / 1000} s. ` +
      'Proceeding with native localStorage snapshot. Settings saved this session ' +
      'will still be written to chrome.storage when the API becomes available.'
    );
    resolveStorageReady();
  }, STORAGE_BRIDGE_TIMEOUT_MS);

  // Wrap resolveStorageBridge so it clears the timeout and is idempotent
  function resolveStorageReady() {
    if (storageBridgeResolved) return;
    storageBridgeResolved = true;
    hydrationFinished = true;
    if (storageBridgeTimeoutId) {
      clearTimeout(storageBridgeTimeoutId);
      storageBridgeTimeoutId = null;
    }
    resolveStorageBridge();
  }

  function getStorageArea() {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
      return null;
    }

    return chrome.storage.local;
  }

  function readNativeSnapshot() {
    const snapshot = {};

    try {
      if (!nativeLocalStorage || typeof nativeLocalStorage.getItem !== 'function' || typeof nativeLocalStorage.key !== 'function') {
        return snapshot;
      }

      for (let index = 0; index < nativeLocalStorage.length; index += 1) {
        const key = nativeLocalStorage.key(index);
        if (key !== null) {
          snapshot[key] = nativeLocalStorage.getItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to read localStorage snapshot before storage bridge initialization:', error);
    }

    return snapshot;
  }

  function writeNativeSnapshot(snapshot) {
    if (!nativeLocalStorage || typeof nativeLocalStorage.setItem !== 'function' ||
        typeof nativeLocalStorage.key !== 'function' || typeof nativeLocalStorage.removeItem !== 'function') {
      return;
    }

    try {
      const snapshotKeys = Object.keys(snapshot);
      snapshotKeys.forEach((key) => {
        nativeLocalStorage.setItem(key, snapshot[key]);
      });

      const expectedKeys = new Set(snapshotKeys);
      for (let index = nativeLocalStorage.length - 1; index >= 0; index -= 1) {
        const key = nativeLocalStorage.key(index);
        if (key !== null && !expectedKeys.has(key)) {
          nativeLocalStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to mirror chrome.storage data to localStorage:', error);
    }
  }

  function applySnapshot(snapshot) {
    cache.clear();
    Object.keys(snapshot).forEach((key) => {
      cache.set(key, String(snapshot[key]));
    });
  }

  function beginHydrationMutationTracking() {
    hydrationFinished = false;
    hydrationClearRequested = false;
    hydrationMutations.clear();
  }

  function trackHydrationMutation(key, value) {
    if (!hydrationStarted || hydrationFinished) {
      return;
    }

    hydrationMutations.set(key, value === null ? null : String(value));
  }

  function mergeHydrationSnapshot(nativeSnapshot, storageSnapshot) {
    const mergedSnapshot = hydrationClearRequested ? {} : { ...nativeSnapshot };

    // Apply chrome.storage values, but skip any keys that were already mutated
    // during this hydration cycle.  Session-written values (e.g. appOrder
    // repaired by renderAllApps) are authoritative over the persisted snapshot.
    Object.keys(storageSnapshot).forEach((key) => {
      if (!hydrationClearRequested && !hydrationMutations.has(key)) {
        mergedSnapshot[key] = storageSnapshot[key];
      }
    });

    hydrationMutations.forEach((value, key) => {
      if (value === null) {
        delete mergedSnapshot[key];
        return;
      }

      mergedSnapshot[key] = value;
    });

    return mergedSnapshot;
  }

  function snapshotToObject() {
    const snapshot = {};
    cache.forEach((value, key) => {
      snapshot[key] = value;
    });
    return snapshot;
  }

  function isMatchingHydrationMutation(change, mutationValue) {
    const changeValue = !change || change.newValue === null || typeof change.newValue === 'undefined'
      ? null
      : String(change.newValue);

    return changeValue === mutationValue;
  }

  function hydrateFromChromeStorage() {
    if (hydrationStarted) {
      return;
    }

    hydrationStarted = true;
    beginHydrationMutationTracking();

    const storageArea = getStorageArea();
    if (!storageArea) {
      hydrationFinished = true;
      resolveStorageReady();
      return;
    }

    const nativeSnapshot = readNativeSnapshot();

    try {
      storageArea.get(null, (items) => {
        if (hydrationFinished) {
          return;
        }

        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('Failed to read chrome.storage during initialization:', chrome.runtime.lastError.message);
          hydrationFinished = true;
          resolveStorageReady();
          return;
        }

        const storageSnapshot = items || {};
        const mergedSnapshot = mergeHydrationSnapshot(nativeSnapshot, storageSnapshot);

        if (Object.keys(storageSnapshot).length === 0 && Object.keys(nativeSnapshot).length > 0) {
          applySnapshot(mergedSnapshot);
          writeNativeSnapshot(snapshotToObject());

          try {
            storageArea.set(mergedSnapshot, () => {
              if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('Failed to migrate localStorage data to chrome.storage:', chrome.runtime.lastError.message);
              }
              hydrationFinished = true;
              resolveStorageReady();
            });
          } catch (error) {
            console.warn('Failed to migrate localStorage data to chrome.storage:', error);
            hydrationFinished = true;
            resolveStorageReady();
          }

          return;
        }

        applySnapshot(mergedSnapshot);
        writeNativeSnapshot(snapshotToObject());
        hydrationFinished = true;
        resolveStorageReady();
      });
    } catch (error) {
      console.warn('Failed to initialize chrome.storage bridge:', error);
      hydrationFinished = true;
      resolveStorageReady();
    }
  }

  function subscribeToChromeStorageChanges() {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.onChanged || typeof chrome.storage.onChanged.addListener !== 'function') {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' && areaName !== 'sync') {
        return;
      }

      let changed = false;

      Object.keys(changes || {}).forEach((key) => {
        const change = changes[key];

        if (hydrationMutations.has(key)) {
          if (!hydrationFinished) {
            return;
          }

          const mutationValue = hydrationMutations.get(key);
          hydrationMutations.delete(key);

          if (isMatchingHydrationMutation(change, mutationValue)) {
            return;
          }
        }

        if (!change || change.newValue === null || typeof change.newValue === 'undefined') {
          cache.delete(key);
          trackHydrationMutation(key, null);
          changed = true;
          return;
        }

        cache.set(key, String(change.newValue));
        trackHydrationMutation(key, change.newValue);
        changed = true;
      });

      if (changed) {
        writeNativeSnapshot(snapshotToObject());
      }
    });
  }

  function persistSet(key, value) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return;
    }

    try {
      storageArea.set({ [key]: value }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn(`Failed to persist ${key} to chrome.storage:`, chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.warn(`Failed to persist ${key} to chrome.storage:`, error);
    }
  }

  function persistRemove(key) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return;
    }

    try {
      storageArea.remove(key, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn(`Failed to remove ${key} from chrome.storage:`, chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.warn(`Failed to remove ${key} from chrome.storage:`, error);
    }
  }

  function persistClear() {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return;
    }

    try {
      storageArea.clear(() => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('Failed to clear chrome.storage:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.warn('Failed to clear chrome.storage:', error);
    }
  }

  const storageBridge = {
    get length() {
      return cache.size;
    },

    getItem(key) {
      if (cache.has(key)) {
        return cache.get(key);
      }

      return null;
    },

    setItem(key, value) {
      const stringValue = String(value);
      cache.set(key, stringValue);
      trackHydrationMutation(key, stringValue);

      if (!getStorageArea()) {
        writeNativeSnapshot(snapshotToObject());
        return;
      }

      persistSet(key, stringValue);
    },

    removeItem(key) {
      cache.delete(key);
      trackHydrationMutation(key, null);

      if (!getStorageArea()) {
        writeNativeSnapshot(snapshotToObject());
        return;
      }

      persistRemove(key);
    },

    clear() {
      cache.clear();
      if (hydrationStarted && !hydrationFinished) {
        hydrationClearRequested = true;
        hydrationMutations.clear();
      }

      if (!getStorageArea()) {
        writeNativeSnapshot({});
        return;
      }

      persistClear();
    },

    key(index) {
      if (index < 0 || index >= cache.size) {
        return null;
      }

      return Array.from(cache.keys())[index];
    }
  };

  applySnapshot(readNativeSnapshot());
  hydrateFromChromeStorage();
  subscribeToChromeStorageChanges();

  if (!getStorageArea()) {
    resolveStorageReady();
  }

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageBridge,
      configurable: true,
      enumerable: true,
      writable: true
    });
  } catch {
    globalThis.localStorage = storageBridge;
  }
})();
