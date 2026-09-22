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
  const STORAGE_WRITE_ERROR_EVENT = 'storageBridgeWriteError';
  let writeSequence = 0;
  const pendingWriteGenerations = new Map();
  const pendingRemoveRollbackSnapshots = new Map();
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

  function reportStorageWriteError(key, error, extra) {
    if (typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') {
      return;
    }

    const message = error?.message ? error.message : String(error || 'Unknown storage error');

    const detail = {
      key,
      message,
      operation: extra?.operation || 'set'
    };
    if (typeof extra?.generation === 'number') {
      detail.generation = extra.generation;
    }
    if (typeof extra?.value === 'string') {
      detail.value = extra.value;
    }
    if (extra?.error && extra.error !== error) {
      detail.error = extra.error;
    }

    globalThis.dispatchEvent(new globalThis.CustomEvent(STORAGE_WRITE_ERROR_EVENT, {
      detail
    }));
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

  function writeNativeSnapshot(snapshot, failureKey) {
    if (!nativeLocalStorage || typeof nativeLocalStorage.setItem !== 'function' ||
        typeof nativeLocalStorage.key !== 'function' || typeof nativeLocalStorage.removeItem !== 'function') {
      if (failureKey) {
        reportStorageWriteError(failureKey, new Error('Native localStorage is unavailable'));
      }
      return false;
    }

    try {
      const snapshotKeys = Object.keys(snapshot);
      const expectedKeys = new Set(snapshotKeys);
      for (let index = nativeLocalStorage.length - 1; index >= 0; index -= 1) {
        const key = nativeLocalStorage.key(index);
        if (key !== null && !expectedKeys.has(key)) {
          nativeLocalStorage.removeItem(key);
        }
      }

      snapshotKeys.forEach((key) => {
        nativeLocalStorage.setItem(key, snapshot[key]);
      });
      return true;
    } catch (error) {
      console.warn('Failed to mirror chrome.storage data to localStorage:', error);
      if (failureKey) {
        reportStorageWriteError(failureKey, error);
      }
      return false;
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

  function persistSet(key, value, hadPreviousValue, previousValue) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return false;
    }

    pendingRemoveRollbackSnapshots.delete(key);
    const generation = ++writeSequence;
    pendingWriteGenerations.set(key, generation);

    try {
      storageArea.set({ [key]: value }, () => {
        const lastError = chrome.runtime?.lastError;

        if (lastError) {
          const message = lastError?.message ? lastError.message : String(lastError);
          console.warn(`Failed to persist ${key} to chrome.storage:`, message);
          reportStorageWriteError(key, lastError, { generation, value });

          if (pendingWriteGenerations.get(key) === generation &&
              cache.get(key) === value) {
            if (hadPreviousValue) {
              cache.set(key, previousValue);
              trackHydrationMutation(key, previousValue);
            } else {
              cache.delete(key);
              trackHydrationMutation(key, null);
            }
          }
        }
        if (pendingWriteGenerations.get(key) === generation) {
          pendingWriteGenerations.delete(key);
        }
      });
      return true;
    } catch (error) {
      console.warn(`Failed to persist ${key} to chrome.storage:`, error);
      reportStorageWriteError(key, error, { generation, value });
      if (pendingWriteGenerations.get(key) === generation) {
        pendingWriteGenerations.delete(key);
      }
      return false;
    }
  }


  function persistAsyncOperation(key, startOperation, onFailure) {
    const generation = ++writeSequence;
    pendingWriteGenerations.set(key, generation);

    let resolveOperation;
    let rejectOperation;
    const operationPromise = new Promise((resolve, reject) => {
      resolveOperation = resolve;
      rejectOperation = reject;
    });

    try {
      startOperation(() => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          rejectOperation(lastError);
          return;
        }

        resolveOperation(true);
      });
    } catch (error) {
      // chrome.storage threw synchronously: roll back the optimistic cache
      // update synchronously so fire-and-forget callers never observe the
      // failed value before the rejection microtask runs.
      let failureError = null;
      try {
        onFailure(error, generation);
      } catch (handlerError) {
        failureError = handlerError;
      } finally {
        if (pendingWriteGenerations.get(key) === generation) {
          pendingWriteGenerations.delete(key);
        }
      }
      return failureError ? Promise.reject(failureError) : Promise.resolve(false);
    }

    return operationPromise.catch(error => {
      onFailure(error, generation);
      return false;
    }).finally(() => {
      if (pendingWriteGenerations.get(key) === generation) {
        pendingWriteGenerations.delete(key);
      }
    });
  }

  function persistSetAsync(key, value, hadPreviousValue, previousValue) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      if (cache.get(key) === value) {
        if (hadPreviousValue) {
          cache.set(key, previousValue);
          trackHydrationMutation(key, previousValue);
        } else {
          cache.delete(key);
          trackHydrationMutation(key, null);
        }
      }
      return Promise.resolve(false);
    }

    return persistAsyncOperation(
      key,
      done => storageArea.set({ [key]: value }, done),
      (error, generation) => {
        const message = error?.message ? error.message : String(error);
        console.warn(`Failed to persist ${key} to chrome.storage:`, message);
        reportStorageWriteError(key, error, { generation, value });

        if (pendingWriteGenerations.get(key) !== generation ||
            cache.get(key) !== value) {
          return;
        }

        if (hadPreviousValue) {
          cache.set(key, previousValue);
          trackHydrationMutation(key, previousValue);
        } else {
          cache.delete(key);
          trackHydrationMutation(key, null);
        }
      }
    );
  }

  function persistRemoveAsync(key, hadPreviousValue, previousValue) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      if (!hadPreviousValue || !cache.has(key)) {
        return Promise.resolve(false);
      }

      cache.set(key, previousValue);
      trackHydrationMutation(key, previousValue);
      return Promise.resolve(false);
    }

    return persistAsyncOperation(
      key,
      done => storageArea.remove(key, done),
      (error, generation) => {
        const message = error?.message ? error.message : String(error);
        console.warn(`Failed to remove ${key} from chrome.storage:`, message);
        reportStorageWriteError(key, error, {
          operation: 'remove',
          generation
        });

        if (pendingWriteGenerations.get(key) !== generation || cache.has(key)) {
          return;
        }

        if (hadPreviousValue) {
          cache.set(key, previousValue);
          trackHydrationMutation(key, previousValue);
        }
      }
    );
  }

  function getRemoveRollbackSnapshot(key, hadPreviousValue, previousValue) {
    const existingSnapshot = pendingRemoveRollbackSnapshots.get(key);
    if (existingSnapshot) {
      return existingSnapshot;
    }

    const snapshot = {
      hadPreviousValue,
      previousValue,
      invalidated: false,
      pendingGenerations: new Set()
    };
    pendingRemoveRollbackSnapshots.set(key, snapshot);
    return snapshot;
  }

  function persistRemove(key, hadPreviousValue, previousValue) {
    const storageArea = getStorageArea();
    if (!storageArea) {
      return false;
    }

    const rollbackSnapshot = getRemoveRollbackSnapshot(key, hadPreviousValue, previousValue);
    const generation = ++writeSequence;
    pendingWriteGenerations.set(key, generation);
    rollbackSnapshot.pendingGenerations.add(generation);

    const finishRemove = (error) => {
      const isActiveSnapshot = pendingRemoveRollbackSnapshots.get(key) === rollbackSnapshot;

      if (isActiveSnapshot) {
        if (error) {
          const message = error?.message ? error.message : String(error);
          console.warn('Failed to remove ' + key + ' from chrome.storage:', message);
          reportStorageWriteError(key, error, {
            operation: 'remove',
            generation
          });

          if (!rollbackSnapshot.invalidated &&
              pendingWriteGenerations.get(key) === generation &&
              !cache.has(key) &&
              rollbackSnapshot.hadPreviousValue) {
            cache.set(key, rollbackSnapshot.previousValue);
            trackHydrationMutation(key, rollbackSnapshot.previousValue);
          }
        } else {
          rollbackSnapshot.invalidated = true;

          if (rollbackSnapshot.hadPreviousValue &&
              cache.get(key) === rollbackSnapshot.previousValue) {
            cache.delete(key);
            trackHydrationMutation(key, null);
          }
        }

        rollbackSnapshot.pendingGenerations.delete(generation);
        if (rollbackSnapshot.pendingGenerations.size === 0) {
          pendingRemoveRollbackSnapshots.delete(key);
        }
      }

      if (pendingWriteGenerations.get(key) === generation) {
        pendingWriteGenerations.delete(key);
      }
    };

    try {
      storageArea.remove(key, () => {
        finishRemove(chrome.runtime?.lastError || null);
      });
      return true;
    } catch (error) {
      finishRemove(error);
      return false;
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
      const hadPreviousValue = cache.has(key);
      const previousValue = cache.get(key);
      cache.set(key, stringValue);
      trackHydrationMutation(key, stringValue);

      if (!getStorageArea()) {
        const persisted = writeNativeSnapshot(snapshotToObject(), key);
        if (!persisted) {
          if (hadPreviousValue) {
            cache.set(key, previousValue);
            trackHydrationMutation(key, previousValue);
          } else {
            cache.delete(key);
            trackHydrationMutation(key, null);
          }
        }
        return persisted;
      }

      const accepted = persistSet(key, stringValue, hadPreviousValue, previousValue);
      if (!accepted) {
        if (hadPreviousValue) {
          cache.set(key, previousValue);
          trackHydrationMutation(key, previousValue);
        } else {
          cache.delete(key);
          trackHydrationMutation(key, null);
        }
      }
      return accepted;
    },

    setItemAsync(key, value) {
      const stringValue = String(value);
      const hadPreviousValue = cache.has(key);
      const previousValue = cache.get(key);
      cache.set(key, stringValue);
      trackHydrationMutation(key, stringValue);

      if (!getStorageArea()) {
        const persisted = writeNativeSnapshot(snapshotToObject(), key);
        if (!persisted) {
          if (hadPreviousValue) {
            cache.set(key, previousValue);
            trackHydrationMutation(key, previousValue);
          } else {
            cache.delete(key);
            trackHydrationMutation(key, null);
          }
        }
        return Promise.resolve(persisted);
      }

      return persistSetAsync(key, stringValue, hadPreviousValue, previousValue);
    },

    removeItemAsync(key) {
      const hadPreviousValue = cache.has(key);
      const previousValue = cache.get(key);
      cache.delete(key);
      trackHydrationMutation(key, null);

      if (!getStorageArea()) {
        const persisted = writeNativeSnapshot(snapshotToObject(), key);
        if (!persisted && hadPreviousValue) {
          cache.set(key, previousValue);
          trackHydrationMutation(key, previousValue);
        }
        return Promise.resolve(persisted);
      }

      return persistRemoveAsync(key, hadPreviousValue, previousValue);
    },

    removeItem(key) {
      const hadPreviousValue = cache.has(key);
      const previousValue = cache.get(key);
      cache.delete(key);
      trackHydrationMutation(key, null);

      if (!getStorageArea()) {
        writeNativeSnapshot(snapshotToObject());
        return;
      }

      persistRemove(key, hadPreviousValue, previousValue);
    },

    clear() {
      pendingWriteGenerations.clear();
      pendingRemoveRollbackSnapshots.clear();
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
