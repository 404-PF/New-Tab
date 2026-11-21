import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function makeMockIndexedDB() {
  const databases = new Map();
  function makeStoreFacade(records, tx) {
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
      put: (record) => req(() => { records.set(record.key, { ...record }); return record.key; }),
      get: (key) => req(() => records.get(key)),
      delete: (key) => req(() => { records.delete(key); return undefined; }),
      getAll: () => req(() => Array.from(records.values())),
      clear: () => req(() => { records.clear(); return undefined; }),
      index: (name) => ({
        getAllKeys: (key) => req(() => Array.from(records.values())
          .filter((r) => r[({ byModel: 'modelId', byTodo: 'todoId', byApp: 'appId' })[name] || 'noteId'] === key)
          .map((r) => r.key))
      })
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
        const db = makeDatabase(databases.get(name));
        request.result = db;
        if (isNew && typeof request.onupgradeneeded === 'function') {
          const upgradeTx = { objectStore: (storeName) => makeStoreFacade(databases.get(name).get(storeName), {}) };
          request.onupgradeneeded({ target: { result: db, transaction: upgradeTx } });
        }
        if (typeof request.onsuccess === 'function') request.onsuccess({ target: { result: db } });
      }, 0);
      return request;
    }
  };
}

beforeAll(() => {
  injectScript('src/ai/embeddings/notes-vector-cache.js');
});

beforeEach(() => {
  localStorage.clear();
  window.NotesVectorCache._resetForTests();
  window.TodoVectorCache._resetForTests();
});

afterAll(() => {
  try { delete globalThis.indexedDB; } catch { /* ignore */ }
  window.NotesVectorCache._resetForTests();
  window.TodoVectorCache._resetForTests();
});

describe('Vector cache collections (issue #1332)', () => {
  it('keeps the legacy 3-arg key shape', () => {
    expect(window.NotesVectorCache.makeVectorKey('n1', 'abc', 'model-x')).toBe('model-x::n1::abc');
  });

  it('builds collection keys with the 4-arg form', () => {
    expect(window.NotesVectorCache.makeVectorKey('notes', 'n1', 'abc', 'model-x')).toBe('notes::model-x::n1::abc');
    expect(window.TodoVectorCache.COLLECTION).toBe('todos');
    expect(window.AppVectorCache.COLLECTION).toBe('apps');
  });

  it('reads legacy rows written before the collection key', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    window.NotesVectorCache._resetForTests();
    // Simulate a pre-#1332 row: legacy key, no collection field.
    const hash = window.NotesVectorCache.hashEmbeddingText('hello');
    const legacyKey = window.NotesVectorCache.makeLegacyVectorKey('n1', hash, 'm1');
    await new Promise((resolve, reject) => {
      window.NotesVectorCache.openVectorsDB().then((db) => {
        const tx = db.transaction(['noteVectors'], 'readwrite');
        const store = tx.objectStore('noteVectors');
        const putReq = store.put({ key: legacyKey, noteId: 'n1', textHash: hash, modelId: 'm1', vector: [1, 0] });
        putReq.transaction.oncomplete = () => resolve();
        putReq.transaction.onerror = () => reject(putReq.error || new Error('put failed'));
      }).catch(reject);
    });
    const record = await window.NotesVectorCache.getCachedVector('n1', 'hello', 'm1');
    expect(record).not.toBeNull();
    expect(record.vector).toEqual([1, 0]);
    // New writes use the collection key.
    expect(await window.NotesVectorCache.putCachedVector('n1', 'hello', 'm1', [0.5, 0.5])).toBe(true);
    const fresh = await window.NotesVectorCache.getCachedVector('n1', 'hello', 'm1');
    expect(fresh.key).toBe('notes::m1::n1::' + hash);
  });

  it('isolates collections by namespace', () => {
    const noteKey = window.NotesVectorCache.makeVectorKey('notes', 'x', 'h', 'm');
    const todoKey = window.TodoVectorCache.makeVectorKey('todos', 'x', 'h', 'm');
    expect(noteKey).not.toBe(todoKey);
  });
});
