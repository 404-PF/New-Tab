import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { makeMockIndexedDB } from './helpers/mock-indexeddb.js';

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

describe('TodoVectorCache IndexedDB roundtrip', () => {
  it('stores, misses on text change, and deletes by todo id', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    const cache = window.TodoVectorCache;
    cache._resetForTests();
    expect(cache.DB_NAME).toBe('NewTabTodoEmbeddings');
    await cache.putCachedVector('t1', 'buy milk', 'm1', [0.5, 0.5]);
    await cache.putCachedVector('t2', 'walk dog', 'm1', [1, 0]);
    expect((await cache.getCachedVector('t1', 'buy milk', 'm1')).todoId).toBe('t1');
    expect(await cache.getCachedVector('t1', 'buy oat milk', 'm1')).toBeNull();
    expect(await cache.deleteCachedVectorsForItem('t1')).toBe(true);
    expect(await cache.getCachedVector('t1', 'buy milk', 'm1')).toBeNull();
    expect(await cache.getCachedVector('t2', 'walk dog', 'm1')).not.toBeNull();
  });

  it('clears vectors per model', async () => {
    globalThis.indexedDB = makeMockIndexedDB();
    const cache = window.TodoVectorCache;
    cache._resetForTests();
    await cache.putCachedVector('t1', 'a', 'm1', [1, 0]);
    await cache.putCachedVector('t2', 'b', 'm2', [0, 1]);
    expect(await cache.clearCachedVectors('m1')).toBe(true);
    expect(await cache.getAllCachedVectors('m1')).toEqual([]);
    expect(await cache.getAllCachedVectors('m2')).toHaveLength(1);
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
