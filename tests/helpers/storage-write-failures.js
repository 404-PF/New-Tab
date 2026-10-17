// Fail chrome.storage.local writes for one key through the real storage
// bridge. 'sync' makes chrome.storage.local.set throw, so the bridge both
// dispatches storageBridgeWriteError and returns false from setItem. 'async'
// reports runtime.lastError from the set callback, after which the bridge
// rolls its cache back and dispatches the event. Returns a restore function.
export function failStorageWritesFor(key, mode = 'sync') {
  const area = chrome.storage.local;
  const originalSet = area.set;
  area.set = function (items, callback) {
    if (!Object.prototype.hasOwnProperty.call(items, key)) {
      return originalSet.call(area, items, callback);
    }
    if (mode === 'sync') {
      throw new Error('QUOTA_BYTES quota exceeded');
    }
    setTimeout(() => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      try {
        if (typeof callback === 'function') callback();
      } finally {
        chrome.runtime.lastError = null;
      }
    }, 0);
    return undefined;
  };
  return () => { area.set = originalSet; };
}

export const flushDeferredFailureSync = () => new Promise((resolve) => setTimeout(resolve, 0));
