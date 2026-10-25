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

const UTF8_ENCODER = new TextEncoder();
const utf8Length = (text) => UTF8_ENCODER.encode(text).length;

// Model a persistent storage quota: every write for `key` whose serialized
// value exceeds `limitBytes` in UTF-8 bytes is rejected, while smaller writes
// still land. Unlike failStorageWritesFor this never recovers on its own, so a
// save path can only succeed by shrinking the payload first (#947). Returns a
// restore function.
export function failStorageWritesOver(limitBytes, key, mode = 'async') {
  const area = chrome.storage.local;
  const originalSet = area.set;
  area.set = function (items, callback) {
    const oversized = Object.prototype.hasOwnProperty.call(items, key) &&
      typeof items[key] === 'string' &&
      utf8Length(items[key]) > limitBytes;
    if (!oversized) {
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
