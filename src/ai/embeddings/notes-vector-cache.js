// src/ai/embeddings/notes-vector-cache.js - IndexedDB caches for embeddings
// Issue #1186: vectors live in IndexedDB (not the localStorage bridge, which
// caps at ~5-10MB). Keyed by item id + text hash + model id so edits
// invalidate and model swaps never collide. Issue #1330 reuses the same
// factory for todos, each cache in its own database.
// Issue #1332: keys are generalized to `collection + id + textHash + modelId`
// (`collection::modelId::id::textHash`). Existing `noteVectors`/`todoVectors`
// rows written as legacy `modelId::id::textHash` stay readable via a fallback
// lookup so upgrades never wipe the cache; new writes use the collection key
// and carry a `collection` field. DB_VERSION stays 1 and no new index is
// required (deletes filter by the existing id/model indexes with a full-scan
// fallback), so existing databases open unchanged.

(function () {
  'use strict';

  const DB_VERSION = 1;

  // djb2 hex hash: sync, dependency-free, stable across sessions. A hash
  // mismatch after an edit simply misses the cache and re-embeds. A true
  // 32-bit collision would reuse a stale vector for different text, but at
  // notes scale the probability is negligible (and the key also binds the
  // item id + model id, so a collision can only confuse two texts of one
  // item under one model, never across items).
  function hashNoteText(text) {
    const input = typeof text === 'string' ? text : String(text || '');
    let hash = 5381;
    // Int32Array enforces the 32-bit wrap that `| 0` would do (Sonar prefers
    // Math.trunc over `| 0`, but truncation alone would not wrap).
    const buf = new Int32Array(1);
    for (let i = 0; i < input.length; i += 1) {
      buf[0] = ((hash << 5) + hash + input.charCodeAt(i));
      hash = buf[0];
    }
    return (hash >>> 0).toString(16);
  }

  // Shared alias (issue #1332): the hash is collection-agnostic; the Notes
  // name stays for backward compatibility.
  const hashEmbeddingText = hashNoteText;

  function hasIndexedDB() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.open === 'function';
    } catch {
      return false;
    }
  }

  function isStaleConnectionError(e) {
    try {
      return !!e && (e.name === 'InvalidStateError' || e.name === 'VersionError');
    } catch { return false; }
  }

  // config: { dbName, storeName, idField, idIndex, label, collection }.
  // idField is the record property holding the item id; idIndex is the index
  // over it. The notes config keeps the original noteId/byNote schema so
  // existing databases open unchanged. `collection` namespaces keys for
  // shared/reused caches (issue #1332: notes, todos, apps, future AI-history
  // and RAG collections).
  function createVectorCache(config) {
    const cfg = config || {};
    const DB_NAME = cfg.dbName;
    const STORE_NAME = cfg.storeName;
    const ID_FIELD = cfg.idField;
    const ID_INDEX = cfg.idIndex;
    const LABEL = cfg.label;
    const COLLECTION = typeof cfg.collection === 'string' && cfg.collection
      ? cfg.collection
      : String(cfg.label || 'items');

    let dbPromise = null;

    function makeLegacyVectorKey(itemId, textHash, modelId) {
      return String(modelId) + '::' + String(itemId) + '::' + String(textHash);
    }

    function makeCollectionVectorKey(collection, itemId, textHash, modelId) {
      return String(collection) + '::' + String(modelId) + '::' + String(itemId) + '::' + String(textHash);
    }

    // New signature: makeVectorKey(collection, itemId, textHash, modelId).
    // Legacy 3-arg form makeVectorKey(itemId, textHash, modelId) is kept so
    // existing callers/tests keep working; it returns the pre-#1332 key.
    function makeVectorKey(collectionOrItemId, itemIdOrHash, textHashOrModelId, modelId) {
      if (modelId !== undefined) {
        return makeCollectionVectorKey(collectionOrItemId, itemIdOrHash, textHashOrModelId, modelId);
      }
      return makeLegacyVectorKey(collectionOrItemId, itemIdOrHash, textHashOrModelId);
    }

    function openVectorsDB() {
      if (dbPromise) return dbPromise;
      if (!hasIndexedDB()) {
        return Promise.reject(new Error('IndexedDB unavailable'));
      }
      const pending = new Promise(function (resolve, reject) {
        let request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) {
          reject(e);
          return;
        }
        request.onupgradeneeded = function (e) {
          const database = e.target.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex(ID_INDEX, ID_FIELD, { unique: false });
            store.createIndex('byModel', 'modelId', { unique: false });
          }
        };
        request.onsuccess = function (e) {
          const database = e.target.result;
          // If the browser closes the connection (e.g. site data cleared
          // while the tab is open), every later transaction throws
          // InvalidStateError and runStore would silently stop caching until
          // reload. Drop the cached promise so the next call reopens
          // (PR #1187 review).
          try {
            database.onclose = function () {
              if (dbPromise === pending) dbPromise = null;
            };
            database.onversionchange = function () {
              try { database.close(); } catch { /* ignore */ }
              if (dbPromise === pending) dbPromise = null;
            };
          } catch { /* ignore */ }
          resolve(database);
        };
        request.onerror = function (e) {
          reject(e.target.error || new Error('Failed to open ' + LABEL + ' vector cache'));
        };
      });
      dbPromise = pending;
      pending.catch(function () {
        if (dbPromise === pending) dbPromise = null;
      });
      return pending;
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
            // Stale connection (see onclose above): drop the cached promise
            // so the next call reopens instead of failing until reload.
            if (isStaleConnectionError(e)) dbPromise = null;
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

    function getCachedVector(itemId, text, modelId) {
      const textHash = hashNoteText(text);
      const key = makeCollectionVectorKey(COLLECTION, itemId, textHash, modelId);
      const legacyKey = makeLegacyVectorKey(itemId, textHash, modelId);
      // Apps never had legacy rows: skip the second IndexedDB round-trip.
      const hasLegacyRows = COLLECTION === 'notes' || COLLECTION === 'todos';
      return runStore('readonly', function (store) {
        return store.get(key);
      }, 'Failed to read ' + LABEL + ' vector from IndexedDB:').then(function (record) {
        if (record && Array.isArray(record.vector)) return record;
        // Upgrade path (issue #1332): rows written before the collection key
        // existed stay readable and are not rewritten or removed; the next
        // put writes the new collection key alongside the legacy row.
        if (!hasLegacyRows || legacyKey === key) return null;
        return runStore('readonly', function (store) {
          return store.get(legacyKey);
        }, 'Failed to read ' + LABEL + ' vector from IndexedDB:').then(function (legacyRecord) {
          if (!legacyRecord || !Array.isArray(legacyRecord.vector)) return null;
          return legacyRecord;
        }).catch(function () { return null; });
      }).catch(function () { return null; });
    }

    function putCachedVector(itemId, text, modelId, vector) {
      if (!Array.isArray(vector) || vector.length === 0) {
        return Promise.resolve(false);
      }
      const textHash = hashNoteText(text);
      const record = {
        key: makeCollectionVectorKey(COLLECTION, itemId, textHash, modelId),
        collection: COLLECTION,
        textHash,
        modelId: String(modelId),
        vector: Array.from(vector),
        updatedAt: new Date().toISOString()
      };
      record[ID_FIELD] = String(itemId);
      return runStore('readwrite', function (store) {
        return store.put(record);
      }, 'Failed to save ' + LABEL + ' vector to IndexedDB:').then(function () { return true; })
        .catch(function () { return false; });
    }

    // Deletes run in a single readwrite transaction: keys are resolved and
    // removed atomically, so an edit racing the delete cannot leave a stale
    // vector behind that a later hash check would silently resurrect.
    function openWriteStore(database, errorMessage) {
      let tx;
      try {
        tx = database.transaction([STORE_NAME], 'readwrite');
      } catch (e) {
        // Stale connection (see openVectorsDB): drop the cached promise so
        // the next delete reopens instead of reusing the dead connection
        // until onclose fires (PR #1187 review).
        if (isStaleConnectionError(e)) dbPromise = null;
        console.warn(errorMessage, e);
        return null;
      }
      let store;
      try {
        store = tx.objectStore(STORE_NAME);
      } catch (e) {
        console.warn(errorMessage, e);
        return null;
      }
      return { tx, store };
    }

    function removeKeysFromStore(store, keys, errorMessage) {
      const list = Array.isArray(keys) ? keys : [];
      for (let i = 0; i < list.length; i += 1) {
        try {
          store.delete(list[i]);
        } catch (e) {
          console.warn(errorMessage, e);
        }
      }
    }

    function deleteByIndex(store, match, done, errorMessage) {
      let keySource = null;
      try {
        keySource = match.index ? store.index(match.index).getAllKeys(match.value) : null;
      } catch {
        keySource = null;
      }
      if (!keySource) return false;
      keySource.onsuccess = function () {
        removeKeysFromStore(store, keySource.result, errorMessage);
      };
      // A failed lookup must not report purged: tx.oncomplete would otherwise
      // resolve true with nothing deleted.
      keySource.onerror = function () { done(false); };
      return true;
    }

    function deleteByFullScan(store, match, done, errorMessage) {
      let allReq = null;
      try {
        allReq = store.getAll();
      } catch (e) {
        console.warn(errorMessage, e);
        done(false);
        return;
      }
      allReq.onsuccess = function () {
        const rows = Array.isArray(allReq.result) ? allReq.result : [];
        const keys = [];
        for (let i = 0; i < rows.length; i += 1) {
          if (rows[i] && match.test(rows[i])) keys.push(rows[i].key);
        }
        removeKeysFromStore(store, keys, errorMessage);
      };
      allReq.onerror = function () { done(false); };
    }

    function deleteInSingleTransaction(match, errorMessage) {
      // No IndexedDB (jsdom tests, private mode): nothing is stored, so a
      // delete is vacuously successful instead of a failure.
      if (!hasIndexedDB()) return Promise.resolve(true);
      return openVectorsDB().then(function (database) {
        return new Promise(function (resolve) {
          let settled = false;
          const done = function (ok) {
            if (settled) return;
            settled = true;
            resolve(ok);
          };
          const opened = openWriteStore(database, errorMessage);
          if (!opened) {
            done(false);
            return;
          }
          opened.tx.oncomplete = function () { done(true); };
          opened.tx.onabort = function () { done(false); };
          opened.tx.onerror = function () { done(false); };
          if (deleteByIndex(opened.store, match, done, errorMessage)) return;
          deleteByFullScan(opened.store, match, done, errorMessage);
        });
      }).catch(function (error) {
        console.warn(errorMessage, error);
        return false;
      });
    }

    // Collection guard for shared stores (issue #1332): production uses one
    // IndexedDB per collection, but a reused cache must never touch another
    // collection's rows. Legacy rows carry no collection field and belong to
    // the notes/todos caches that wrote them before the collection key.
    function belongsToCollection(record) {
      if (!record) return false;
      if (record.collection === COLLECTION) return true;
      if (!record.collection && (COLLECTION === 'notes' || COLLECTION === 'todos')) return true;
      return false;
    }

    function deleteCachedVectorsForItem(itemId) {
      const id = String(itemId);
      // Full scan (not the id index): the index lookup alone cannot enforce
      // the collection guard for shared stores, so filter by id + collection.
      return deleteInSingleTransaction({
        index: null,
        value: id,
        test: function (r) { return r && r[ID_FIELD] === id && belongsToCollection(r); }
      }, 'Failed to delete ' + LABEL + ' vectors from IndexedDB:');
    }

    function clearCachedVectors(modelId) {
      if (typeof modelId === 'string' && modelId) {
        const expected = String(modelId);
        // Full scan for the same collection-guard reason as above.
        return deleteInSingleTransaction({
          index: null,
          value: expected,
          test: function (r) { return r && r.modelId === expected && belongsToCollection(r); }
        }, 'Failed to clear ' + LABEL + ' vectors from IndexedDB:');
      }
      return deleteInSingleTransaction({
        index: null,
        value: null,
        test: function (r) { return belongsToCollection(r); }
      }, 'Failed to clear ' + LABEL + ' vectors from IndexedDB:');
    }

    function getAllCachedVectors(modelId) {
      return runStore('readonly', function (store) {
        return store.getAll();
      }, 'Failed to read ' + LABEL + ' vectors from IndexedDB:').then(function (all) {
        const records = Array.isArray(all) ? all : [];
        if (typeof modelId === 'string' && modelId) {
          return records.filter(function (r) { return r && r.modelId === modelId && Array.isArray(r.vector) && belongsToCollection(r); });
        }
        return records.filter(function (r) { return r && Array.isArray(r.vector) && belongsToCollection(r); });
      }).catch(function () { return []; });
    }

    return {
      DB_NAME,
      STORE_NAME,
      COLLECTION,
      hashNoteText,
      hashEmbeddingText,
      makeVectorKey,
      makeLegacyVectorKey,
      makeCollectionVectorKey,
      openVectorsDB,
      getCachedVector,
      putCachedVector,
      deleteCachedVectorsForItem,
      clearCachedVectors,
      getAllCachedVectors,
      _resetForTests
    };
  }

  const noteCache = createVectorCache({
    dbName: 'NewTabNoteEmbeddings',
    storeName: 'noteVectors',
    idField: 'noteId',
    idIndex: 'byNote',
    label: 'note',
    collection: 'notes'
  });
  const NotesVectorCache = Object.assign({}, noteCache, {
    deleteCachedVectorsForNote: noteCache.deleteCachedVectorsForItem
  });

  const TodoVectorCache = createVectorCache({
    dbName: 'NewTabTodoEmbeddings',
    storeName: 'todoVectors',
    idField: 'todoId',
    idIndex: 'byTodo',
    label: 'todo',
    collection: 'todos'
  });

  const AppVectorCache = createVectorCache({
    dbName: 'NewTabAppEmbeddings',
    storeName: 'appVectors',
    idField: 'appId',
    idIndex: 'byApp',
    label: 'app',
    collection: 'apps'
  });

  try {
    window.NotesVectorCache = NotesVectorCache;
    window.TodoVectorCache = TodoVectorCache;
    window.AppVectorCache = AppVectorCache;
    window.createVectorCache = createVectorCache;
  } catch {
    // ignore
  }

  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = NotesVectorCache;
    }
  } catch {
    // ignore
  }
})();
