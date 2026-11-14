import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Minimal in-memory IndexedDB mock shaped like the real API surface used by
// notes-vector-cache.js (open/upgrade/transaction/objectStore/index/get/put/
// delete/getAll/clear with onsuccess + tx.oncomplete).
function makeMockIndexedDB() {
  const stores = new Map();

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
            .filter((r) => (name === 'byModel' ? r.modelId : r.noteId) === key)
            .map((r) => r.key))
        };
      }
    };
  }

  const db = {
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

  return {
    open() {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
      setTimeout(() => {
        if (!stores.has('noteVectors')) {
          const upgradeTx = { objectStore: (name) => makeStoreFacade(stores.get(name), {}) };
          stores.set('noteVectors', new Map());
          if (typeof request.onupgradeneeded === 'function') {
            request.result = db;
            request.onupgradeneeded({ target: { result: db, transaction: upgradeTx } });
          }
        }
        request.result = db;
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
});

afterAll(() => {
  // Do not leak the mock into other test files (jsdom has no indexedDB).
  try { delete globalThis.indexedDB; } catch { /* ignore */ }
  window.NotesVectorCache._resetForTests();
});

describe('NotesVectorCache pure helpers', () => {
  it('hashes text deterministically', () => {
    expect(window.NotesVectorCache.hashNoteText('hello')).toBe(window.NotesVectorCache.hashNoteText('hello'));
    expect(window.NotesVectorCache.hashNoteText('hello')).not.toBe(window.NotesVectorCache.hashNoteText('world'));
    expect(typeof window.NotesVectorCache.hashNoteText('')).toBe('string');
  });

  it('builds keys from model + note + hash', () => {
    const key = window.NotesVectorCache.makeVectorKey('n1', 'abc', 'model-x');
    expect(key).toBe('model-x::n1::abc');
  });
});

describe('NotesVectorCache IndexedDB roundtrip', () => {
  it('stores and retrieves a vector', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    window.NotesVectorCache._resetForTests();
    expect(await window.NotesVectorCache.putCachedVector('n1', 'hello world', 'm1', [0.5, 0.5])).toBe(true);
    const record = await window.NotesVectorCache.getCachedVector('n1', 'hello world', 'm1');
    expect(record).not.toBeNull();
    expect(record.vector).toEqual([0.5, 0.5]);
    expect(record.noteId).toBe('n1');
  });

  it('misses when the text changed (hash mismatch)', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    window.NotesVectorCache._resetForTests();
    await window.NotesVectorCache.putCachedVector('n1', 'v1', 'm1', [1, 0]);
    expect(await window.NotesVectorCache.getCachedVector('n1', 'v2', 'm1')).toBeNull();
  });

  it('deletes all vectors for a note', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    window.NotesVectorCache._resetForTests();
    await window.NotesVectorCache.putCachedVector('gone', 'a', 'm1', [1, 0]);
    await window.NotesVectorCache.putCachedVector('kept', 'b', 'm1', [0, 1]);
    expect(await window.NotesVectorCache.deleteCachedVectorsForNote('gone')).toBe(true);
    expect(await window.NotesVectorCache.getCachedVector('gone', 'a', 'm1')).toBeNull();
    expect(await window.NotesVectorCache.getCachedVector('kept', 'b', 'm1')).not.toBeNull();
  });

  it('clears vectors per model', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    window.NotesVectorCache._resetForTests();
    await window.NotesVectorCache.putCachedVector('n1', 'a', 'm1', [1, 0]);
    await window.NotesVectorCache.putCachedVector('n2', 'b', 'm2', [0, 1]);
    expect(await window.NotesVectorCache.clearCachedVectors('m1')).toBe(true);
    expect(await window.NotesVectorCache.getAllCachedVectors('m1')).toEqual([]);
    expect((await window.NotesVectorCache.getAllCachedVectors('m2'))).toHaveLength(1);
  });
});

describe('NotesVectorCache without IndexedDB', () => {
  it('degrades gracefully', async () => {
    const previous = globalThis.indexedDB;
    globalThis.indexedDB = undefined;
    window.NotesVectorCache._resetForTests();
    try {
      expect(await window.NotesVectorCache.getCachedVector('n', 't', 'm')).toBeNull();
      expect(await window.NotesVectorCache.putCachedVector('n', 't', 'm', [1])).toBe(false);
      expect(await window.NotesVectorCache.getAllCachedVectors('m')).toEqual([]);
    } finally {
      globalThis.indexedDB = previous;
      window.NotesVectorCache._resetForTests();
    }
  });
});
