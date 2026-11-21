// tests/helpers/mock-indexeddb.js - Shared in-memory IndexedDB mock for vector-cache tests.
// Mirrors the real API surface used by notes-vector-cache.js (open/upgrade/
// transaction/objectStore/index/get/put/delete/getAll/clear with onsuccess +
// tx.oncomplete). One canonical implementation so the notes and collections
// harnesses cannot drift apart (PR #1386 review).

export function makeMockIndexedDB() {
  // Each database name starts empty so onupgradeneeded creates its stores.
  const databases = new Map();

  // Index name -> record field. Covers every vector-cache store plus the
  // legacy noteId fallback for unknown indexes.
  const INDEX_FIELD = {
    byModel: 'modelId',
    byNote: 'noteId',
    byTodo: 'todoId',
    byApp: 'appId'
  };

  function makeStoreFacade(records, tx) {
    // Like real IndexedDB, tx.oncomplete fires only after every request in
    // the transaction settles; requests queued from inside an onsuccess
    // handler (e.g. deletes after a key lookup) extend the transaction.
    const req = (getResult) => {
      tx._pending += 1;
      const request = { transaction: tx, onsuccess: null, onerror: null, result: undefined, error: null };
      setTimeout(() => {
        try {
          request.result = getResult();
          if (typeof request.onsuccess === 'function') request.onsuccess();
        } catch (e) {
          request.error = e;
          if (typeof tx.onerror === 'function') tx.onerror();
        } finally {
          tx._pending -= 1;
          if (tx._pending === 0 && typeof tx.oncomplete === 'function') tx.oncomplete();
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
        return {
          getAllKeys: (key) => req(() => Array.from(records.values())
            .filter((r) => r[(INDEX_FIELD[name] || 'noteId')] === key)
            .map((r) => r.key))
        };
      }
    };
  }

  function makeDatabase(stores) {
    return {
      _stores: stores,
      objectStoreNames: { contains: (name) => stores.has(name) },
      createObjectStore(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        return { createIndex: function () {} };
      },
      transaction(names, mode) {
        void mode;
        const tx = { oncomplete: null, onabort: null, onerror: null, _pending: 0 };
        tx.objectStore = (name) => makeStoreFacade(stores.get(name), tx);
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
        if (isNew) databases.set(name, new Map());
        const stores = databases.get(name);
        const db = makeDatabase(stores);
        request.result = db;
        if (isNew && typeof request.onupgradeneeded === 'function') {
          const upgradeTx = { objectStore: (storeName) => makeStoreFacade(stores.get(storeName), {}) };
          request.onupgradeneeded({ target: { result: db, transaction: upgradeTx } });
        }
        if (typeof request.onsuccess === 'function') request.onsuccess({ target: { result: db } });
      }, 0);
      return request;
    }
  };
}
