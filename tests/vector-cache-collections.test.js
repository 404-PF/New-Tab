import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { makeMockIndexedDB } from './helpers/mock-indexeddb.js';

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

  it('scopes deletes, clears and enumeration to its own collection', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    const makeCache = window.createVectorCache;
    const cacheA = makeCache({
      dbName: 'SharedCollectionDb',
      storeName: 'vectors',
      idField: 'itemId',
      idIndex: 'byItem',
      label: 'a',
      collection: 'aaa'
    });
    const cacheB = makeCache({
      dbName: 'SharedCollectionDb',
      storeName: 'vectors',
      idField: 'itemId',
      idIndex: 'byItem',
      label: 'b',
      collection: 'bbb'
    });
    await cacheA.putCachedVector('shared', 'hello', 'm1', [1, 0]);
    await cacheB.putCachedVector('shared', 'hello', 'm1', [0, 1]);
    const allA = await cacheA.getAllCachedVectors('m1');
    expect(allA).toHaveLength(1);
    expect(allA[0].collection).toBe('aaa');
    // Deleting from A must not touch B.
    expect(await cacheA.deleteCachedVectorsForItem('shared')).toBe(true);
    expect(await cacheB.getCachedVector('shared', 'hello', 'm1')).not.toBeNull();
    expect(await cacheA.getCachedVector('shared', 'hello', 'm1')).toBeNull();
    // Re-populate A, then a model-scoped clear must preserve B.
    await cacheA.putCachedVector('shared', 'hello', 'm1', [1, 0]);
    expect(await cacheA.clearCachedVectors('m1')).toBe(true);
    expect(await cacheB.getCachedVector('shared', 'hello', 'm1')).not.toBeNull();
    expect(await cacheA.getAllCachedVectors('m1')).toEqual([]);
    // No-model clear is collection-scoped too.
    await cacheA.putCachedVector('shared', 'hello', 'm1', [1, 0]);
    expect(await cacheA.clearCachedVectors()).toBe(true);
    expect(await cacheB.getCachedVector('shared', 'hello', 'm1')).not.toBeNull();
  });

  it('deletes a single stale key without touching the fresh row for the same id', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    window.NotesVectorCache._resetForTests();
    const cache = window.NotesVectorCache;
    await cache.putCachedVector('n1', 'old text', 'm1', [1, 0]);
    await cache.putCachedVector('n1', 'new text', 'm1', [0, 1]);
    const staleKey = cache.makeCollectionVectorKey(
      'notes', 'n1', cache.hashNoteText('old text'), 'm1');
    expect(await cache.deleteCachedVectorByKey(staleKey)).toBe(true);
    expect(await cache.getCachedVector('n1', 'old text', 'm1')).toBeNull();
    const fresh = await cache.getCachedVector('n1', 'new text', 'm1');
    expect(fresh).not.toBeNull();
    expect(fresh.vector).toEqual([0, 1]);
  });

  it('aborts the transaction on a request failure instead of completing', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    const db = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open('AbortDb');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // 'missing' was never created: the facade throws on access, exercising
    // the request.onerror path that guards like keySource.onerror rely on.
    const tx = db.transaction(['missing'], 'readwrite');
    let completed = false;
    let requestErrored = false;
    tx.oncomplete = () => { completed = true; };
    const store = tx.objectStore('missing');
    await new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve();
      request.onerror = () => { requestErrored = true; resolve(); };
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requestErrored).toBe(true);
    expect(completed).toBe(false);
  });

  it('rejects a cross-collection single-key delete', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    const makeCache = window.createVectorCache;
    const cacheA = makeCache({
      dbName: 'SharedDeleteByKeyDb',
      storeName: 'vectors',
      idField: 'itemId',
      idIndex: 'byItem',
      label: 'a',
      collection: 'aaa'
    });
    const cacheB = makeCache({
      dbName: 'SharedDeleteByKeyDb',
      storeName: 'vectors',
      idField: 'itemId',
      idIndex: 'byItem',
      label: 'b',
      collection: 'bbb'
    });
    await cacheA.putCachedVector('shared', 'hello', 'm1', [1, 0]);
    await cacheB.putCachedVector('shared', 'hello', 'm1', [0, 1]);
    const otherKey = cacheB.makeCollectionVectorKey('bbb', 'shared', cacheB.hashNoteText('hello'), 'm1');
    expect(await cacheA.deleteCachedVectorByKey(otherKey)).toBe(false);
    expect(await cacheB.getCachedVector('shared', 'hello', 'm1')).not.toBeNull();
    expect(await cacheA.getCachedVector('shared', 'hello', 'm1')).not.toBeNull();
  });

  it('does not fire request.onerror when an onsuccess handler throws', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    // Ensure the store exists through the vector cache path instead of raw DDL.
    const cache = window.createVectorCache({
      dbName: 'HandlerThrowDb2',
      storeName: 'vectors',
      idField: 'itemId',
      idIndex: 'byItem',
      label: 'h',
      collection: 'hhh'
    });
    await cache.putCachedVector('x', 'hello', 'm1', [1, 0]);
    const db2 = await new Promise((resolve, reject) => {
      const openReq = globalThis.indexedDB.open('HandlerThrowDb2');
      openReq.onsuccess = () => resolve(openReq.result);
      openReq.onerror = () => reject(openReq.error);
    });
    const checkTx = db2.transaction(['vectors'], 'readonly');
    let errored = false;
    let completed = false;
    let reported = null;
    const originalReportError = globalThis.reportError;
    globalThis.reportError = (e) => { reported = e; };
    try {
      checkTx.oncomplete = () => { completed = true; };
      const store = checkTx.objectStore('vectors');
      const req = store.getAll();
      req.onerror = () => { errored = true; };
      const boom = new Error('handler boom');
      req.onsuccess = () => { throw boom; };
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(errored).toBe(false);
      expect(completed).toBe(true);
      expect(req.result.length).toBe(1);
      expect(reported).toBe(boom);
    } finally {
      if (originalReportError === undefined) delete globalThis.reportError;
      else globalThis.reportError = originalReportError;
    }
  });
});
