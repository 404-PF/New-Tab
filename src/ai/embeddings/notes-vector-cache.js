// src/ai/embeddings/notes-vector-cache.js - IndexedDB cache for note embeddings
// Issue #1186: vectors live in IndexedDB (not the localStorage bridge, which
// caps at ~5-10MB). Keyed by note-id + text hash + model id so edits
// invalidate and model swaps never collide.

(function () {
  'use strict';

  const DB_NAME = 'NewTabNoteEmbeddings';
  const DB_VERSION = 1;
  const STORE_NAME = 'noteVectors';

  let dbPromise = null;

  // djb2 hex hash: sync, dependency-free, stable across sessions. A hash
  // mismatch after an edit simply misses the cache and re-embeds. A true
  // 32-bit collision would reuse a stale vector for different text, but at
  // notes scale the probability is negligible (and the key also binds the
  // note id + model id, so a collision can only confuse two texts of one
  // note under one model, never across notes).
  function hashNoteText(text) {
    const input = typeof text === 'string' ? text : String(text || '');
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
      hash = (((hash << 5) + hash) + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }

  function makeVectorKey(noteId, textHash, modelId) {
    return String(modelId) + '::' + String(noteId) + '::' + String(textHash);
  }

  function hasIndexedDB() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.open === 'function';
    } catch {
      return false;
    }
  }

  function openVectorsDB() {
    if (dbPromise) return dbPromise;
    if (!hasIndexedDB()) {
      return Promise.reject(new Error('IndexedDB unavailable'));
    }
    dbPromise = new Promise(function (resolve, reject) {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        dbPromise = null;
        reject(e);
        return;
      }
      request.onupgradeneeded = function (e) {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('byNote', 'noteId', { unique: false });
          store.createIndex('byModel', 'modelId', { unique: false });
        }
      };
      request.onsuccess = function (e) {
        resolve(e.target.result);
      };
      request.onerror = function (e) {
        dbPromise = null;
        reject(e.target.error || new Error('Failed to open vector cache'));
      };
    });
    return dbPromise;
  }

  function _resetForTests() {
    if (dbPromise) {
      dbPromise.then(function (database) {
        try { database.close(); } catch { /* ignore */ }
      }).catch(function () { /* ignore */ });
    }
    dbPromise = null;
  }

  function runStore(mode, operation, errorMessage) {
    return openVectorsDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        let request;
        try {
          const tx = database.transaction([STORE_NAME], mode);
          const store = tx.objectStore(STORE_NAME);
          request = operation(store);
        } catch (e) {
          reject(e);
          return;
        }
        let result;
        if (request) {
          request.onsuccess = function () { result = request.result; };
          request.onerror = function () { /* tx handlers reject */ };
          const tx = request.transaction;
          if (tx) {
            tx.oncomplete = function () { resolve(result); };
            tx.onabort = function () { reject(request.error || tx.error || new Error('Transaction aborted')); };
            tx.onerror = function () { reject(request.error || tx.error || new Error('Transaction error')); };
            return;
          }
        }
        // Fallback for mocks without a transaction object.
        resolve(result);
      });
    }).catch(function (error) {
      console.warn(errorMessage, error);
      throw error;
    });
  }

  function getCachedVector(noteId, text, modelId) {
    const key = makeVectorKey(noteId, hashNoteText(text), modelId);
    return runStore('readonly', function (store) {
      return store.get(key);
    }, 'Failed to read note vector from IndexedDB:').then(function (record) {
      if (!record || !Array.isArray(record.vector)) return null;
      return record;
    }).catch(function () { return null; });
  }

  function putCachedVector(noteId, text, modelId, vector) {
    if (!Array.isArray(vector) || vector.length === 0) {
      return Promise.resolve(false);
    }
    const textHash = hashNoteText(text);
    const record = {
      key: makeVectorKey(noteId, textHash, modelId),
      noteId: String(noteId),
      textHash,
      modelId: String(modelId),
      vector: Array.from(vector),
      updatedAt: new Date().toISOString()
    };
    return runStore('readwrite', function (store) {
      return store.put(record);
    }, 'Failed to save note vector to IndexedDB:').then(function () { return true; })
      .catch(function () { return false; });
  }

  // Deletes run in a single readwrite transaction: keys are resolved and
  // removed atomically, so an edit racing the delete cannot leave a stale
  // vector behind that a later hash check would silently resurrect.
  function deleteInSingleTransaction(match, errorMessage) {
    return openVectorsDB().then(function (database) {
      return new Promise(function (resolve) {
        let settled = false;
        const done = function (ok) {
          if (!settled) {
            settled = true;
            resolve(ok);
          }
        };
        let tx;
        try {
          tx = database.transaction([STORE_NAME], 'readwrite');
        } catch (e) {
          console.warn(errorMessage, e);
          done(false);
          return;
        }
        tx.oncomplete = function () { done(true); };
        tx.onabort = function () { done(false); };
        tx.onerror = function () { done(false); };
        let store = null;
        try {
          store = tx.objectStore(STORE_NAME);
        } catch (e) {
          console.warn(errorMessage, e);
          done(false);
          return;
        }
        const removeKeys = function (keys) {
          (Array.isArray(keys) ? keys : []).forEach(function (k) {
            try {
              store.delete(k);
            } catch (e) {
              console.warn(errorMessage, e);
            }
          });
        };
        let keySource = null;
        try {
          keySource = match.index
            ? store.index(match.index).getAllKeys(match.value)
            : null;
        } catch {
          keySource = null;
        }
        if (keySource) {
          keySource.onsuccess = function () { removeKeys(keySource.result); };
          // A failed lookup must not report purged: the finally below would
          // otherwise resolve true via tx.oncomplete with nothing deleted.
          keySource.onerror = function () { done(false); };
          return;
        }
        let allReq = null;
        try {
          allReq = store.getAll();
        } catch (e) {
          console.warn(errorMessage, e);
          done(false);
          return;
        }
        allReq.onsuccess = function () {
          removeKeys((Array.isArray(allReq.result) ? allReq.result : [])
            .filter(function (r) { return r && match.test(r); })
            .map(function (r) { return r.key; }));
        };
        allReq.onerror = function () { done(false); };
      });
    }).catch(function (error) {
      console.warn(errorMessage, error);
      return false;
    });
  }

  function deleteCachedVectorsForNote(noteId) {
    const id = String(noteId);
    return deleteInSingleTransaction({
      index: 'byNote',
      value: id,
      test: function (r) { return r.noteId === id; }
    }, 'Failed to delete note vectors from IndexedDB:');
  }

  function clearCachedVectors(modelId) {
    if (typeof modelId === 'string' && modelId) {
      const expected = String(modelId);
      return deleteInSingleTransaction({
        index: 'byModel',
        value: expected,
        test: function (r) { return r && r.modelId === expected; }
      }, 'Failed to clear note vectors from IndexedDB:');
    }
    return runStore('readwrite', function (store) {
      return store.clear();
    }, 'Failed to clear note vectors from IndexedDB:').then(function () { return true; })
      .catch(function () { return false; });
  }

  function getAllCachedVectors(modelId) {
    return runStore('readonly', function (store) {
      return store.getAll();
    }, 'Failed to read note vectors from IndexedDB:').then(function (all) {
      const records = Array.isArray(all) ? all : [];
      if (typeof modelId === 'string' && modelId) {
        return records.filter(function (r) { return r && r.modelId === modelId && Array.isArray(r.vector); });
      }
      return records.filter(function (r) { return r && Array.isArray(r.vector); });
    }).catch(function () { return []; });
  }

  const api = {
    DB_NAME,
    STORE_NAME,
    hashNoteText,
    makeVectorKey,
    openVectorsDB,
    getCachedVector,
    putCachedVector,
    deleteCachedVectorsForNote,
    clearCachedVectors,
    getAllCachedVectors,
    _resetForTests
  };

  try {
    window.NotesVectorCache = api;
  } catch {
    // ignore
  }

  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api;
    }
  } catch {
    // ignore
  }
})();
