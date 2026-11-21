// tests/helpers/mock-indexeddb.js - Shared in-memory IndexedDB mock for vector-cache tests.
// Mirrors the real API surface used by notes-vector-cache.js (open/upgrade/
// transaction/objectStore/index/get/put/delete/getAll/clear with onsuccess +
// tx.oncomplete). One canonical implementation so the notes and collections
// harnesses cannot drift apart (PR #1386 review).
// Failure semantics mirror real IndexedDB: a failing request fires
// request.onerror (not just tx.onerror) and aborts the transaction, so
// tx.oncomplete is skipped and the failure guards in notes-vector-cache.js
// (e.g. keySource.onerror -> done(false)) can be exercised.

export function makeMockIndexedDB() {
  // Each database name starts empty so onupgradeneeded creates its stores.
  // indexes records createIndex(indexName -> field) per store so custom index
  // names (e.g. a shared-store 'byItem') resolve like the real API instead
  // of falling back to a hardcoded field.
  const databases = new Map();

  // Index name -> record field. Covers every vector-cache store plus the
  // legacy noteId fallback for unknown indexes.
  const INDEX_FIELD = {
    byModel: 'modelId',
    byNote: 'noteId',
    byTodo: 'todoId',
    byApp: 'appId'
  };

  function fieldFor(db, storeName, indexName) {
    try {
      const perStore = db.indexes.get(storeName);
      if (perStore && perStore.has(indexName)) return perStore.get(indexName);
    } catch { /* fall through to the static map */ }
    return INDEX_FIELD[indexName] || 'noteId';
  }

  function makeStoreFacade(db, storeName, records, tx) {
    // Like real IndexedDB, tx.oncomplete fires only after every request in
    // the transaction settles; requests queued from inside an onsuccess
    // handler (e.g. deletes after a key lookup) extend the transaction.
    // A request failure fires request.onerror and aborts the transaction
    // (tx.onabort/tx.onerror), so tx.oncomplete is skipped.
    const req = (getResult) => {
      tx._pending += 1;
      const request = { transaction: tx, onsuccess: null, onerror: null, result: undefined, error: null };
      setTimeout(() => {
        try {
          request.result = getResult();
          if (typeof request.onsuccess === 'function') request.onsuccess();
        } catch (e) {
          request.error = e;
          tx._aborted = true;
          try { if (typeof request.onerror === 'function') request.onerror(); } catch { /* ignore */ }
          try { if (typeof tx.onabort === 'function') tx.onabort(); } catch { /* ignore */ }
          try { if (typeof tx.onerror === 'function') tx.onerror(); } catch { /* ignore */ }
        } finally {
          tx._pending -= 1;
          if (tx._pending === 0 && !tx._aborted && typeof tx.oncomplete === 'function') tx.oncomplete();
        }
      }, 0);
      return request;
    };
    return {
      put(record) {
        return req(() => { records.set(record.key, { ...record }); return record.key; });
      },
      get(key) {
        return req(() => records.get(key));
      },
      delete(key) {
        return req(() => { records.delete(key); return undefined; });
      },
      getAll() {
        return req(() => Array.from(records.values()));
      },
      clear() {
        return req(() => { records.clear(); return undefined; });
      },
      index(name) {
        const field = fieldFor(db, storeName, name);
        const match = (key) => (r) => key === undefined || r[field] === key;
        return {
          getAllKeys: (key) => req(() => Array.from(records.values())
            .filter(match(key))
            .map((r) => r.key)),
          getAll: (key) => req(() => Array.from(records.values()).filter(match(key)))
        };
      }
    };
  }

  function makeDatabase(db) {
    return {
      _stores: db.stores,
      objectStoreNames: { contains: (name) => db.stores.has(name) },
      createObjectStore(name, options) {
        void options;
        if (!db.stores.has(name)) db.stores.set(name, new Map());
        if (!db.indexes.has(name)) db.indexes.set(name, new Map());
        const perStore = db.indexes.get(name);
        return {
          createIndex: function (indexName, keyPath) {
            try { perStore.set(indexName, typeof keyPath === 'string' ? keyPath : String(keyPath)); } catch { /* ignore */ }
          }
        };
      },
      transaction(names, mode) {
        void mode;
        const tx = { oncomplete: null, onabort: null, onerror: null, _pending: 0, _aborted: false };
        tx.objectStore = (name) => makeStoreFacade(db, name, db.stores.get(name), tx);
        void names;
        return tx;
      },
      close() {}
    };
  }

  return {
    open(name) {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
      setTimeout(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, { stores: new Map(), indexes: new Map() });
        const db = makeDatabase(databases.get(name));
        request.result = db;
        if (isNew && typeof request.onupgradeneeded === 'function') {
          const upgradeTx = { objectStore: (storeName) => makeStoreFacade(databases.get(name), storeName, databases.get(name).stores.get(storeName), {}) };
          request.onupgradeneeded({ target: { result: db, transaction: upgradeTx } });
        }
        if (typeof request.onsuccess === 'function') request.onsuccess({ target: { result: db } });
      }, 0);
      return request;
    }
  };
}
