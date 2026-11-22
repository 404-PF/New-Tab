import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { makeMockIndexedDB } from './helpers/mock-indexeddb.js';

// Issue #1386 review: app pruning must not run on every ranking pass, and
// renames/folder moves must not leave stale vectors behind.

const APPS = [
  { id: 'alpha', name: 'Alpha', url: 'https://alpha.example.com/' },
  { id: 'beta', name: 'Beta', url: 'https://beta.example.com/' }
];

function makeService() {
  const service = {
    isReady: () => true,
    getStatus: () => ({ modelId: 'prune-test-model' }),
    embedTexts: (texts) => Promise.resolve(texts.map(() => [1, 0])),
    embedQuery: () => Promise.resolve([1, 0])
  };
  return service;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

beforeAll(() => {
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/hybrid-ranker.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/ai/embeddings/app-semantic-search.js');
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('semanticEnabled', 'true');
  globalThis.indexedDB = makeMockIndexedDB();
  window.AppVectorCache._resetForTests();
  window.AppSemanticSearch.clearCache();
  window.EmbeddingService = makeService();
});

afterAll(() => {
  try { delete globalThis.indexedDB; } catch { /* ignore */ }
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  window.AppVectorCache._resetForTests();
});

describe('app vector pruning (issue #1386)', () => {
  it('skips the persistent prune while the app list is unchanged', async () => {
    let pruneReads = 0;
    const cache = window.AppVectorCache;
    const original = cache.getAllCachedVectors.bind(cache);
    cache.getAllCachedVectors = function (...args) {
      pruneReads += 1;
      return original(...args);
    };
    try {
      await window.AppSemanticSearch.rankApps('alpha', APPS, []);
      await flush();
      const afterFirst = pruneReads;
      expect(afterFirst).toBeGreaterThan(0);
      await window.AppSemanticSearch.rankApps('alpha', APPS, []);
      await flush();
      // Same apps, same embedding texts: no second store read.
      expect(pruneReads).toBe(afterFirst);
    } finally {
      cache.getAllCachedVectors = original;
    }
  });

  it('removes the stale row for a renamed app but keeps the fresh row', async () => {
    const cache = window.AppVectorCache;
    const modelId = 'prune-test-model';
    await window.AppSemanticSearch.rankApps('alpha', APPS, []);
    await flush();
    expect(await cache.getAllCachedVectors(modelId)).toHaveLength(2);

    const renamed = APPS.map((app) => (
      app.id === 'alpha' ? { ...app, name: 'Alpha Renamed' } : app
    ));
    await window.AppSemanticSearch.rankApps('alpha', renamed, []);
    await flush();

    const rows = await cache.getAllCachedVectors(modelId);
    expect(rows).toHaveLength(2);
    const liveHash = cache.hashNoteText('Alpha Renamed alpha.example.com');
    const hashes = rows.map((row) => row.textHash).sort();
    expect(hashes).toContain(liveHash);
    expect(hashes).not.toContain(cache.hashNoteText('Alpha alpha.example.com'));
  });

  it('drops every row when the app is removed', async () => {
    const cache = window.AppVectorCache;
    const modelId = 'prune-test-model';
    await window.AppSemanticSearch.rankApps('alpha', APPS, []);
    await flush();
    expect(await cache.getAllCachedVectors(modelId)).toHaveLength(2);

    await window.AppSemanticSearch.rankApps('alpha', APPS.filter((app) => app.id !== 'beta'), []);
    await flush();

    const rows = await cache.getAllCachedVectors(modelId);
    expect(rows.map((row) => String(row.appId)).sort()).toEqual(['alpha']);
  });

  it('skips a stale prune that resolves after a newer ranking pass', async () => {
    const cache = window.AppVectorCache;
    const modelId = 'prune-test-model';
    await window.AppSemanticSearch.rankApps('alpha', APPS, []);
    await flush();
    expect(await cache.getAllCachedVectors(modelId)).toHaveLength(2);

    // Hold the next prune's store read so the older generation resolves last.
    const originalGetAll = cache.getAllCachedVectors.bind(cache);
    let releaseStale;
    let staleStarted = false;
    const staleGate = new Promise((resolve) => { releaseStale = resolve; });
    cache.getAllCachedVectors = function (...args) {
      if (!staleStarted) {
        staleStarted = true;
        return originalGetAll(...args).then(async (rows) => {
          await staleGate;
          return rows;
        });
      }
      return originalGetAll(...args);
    };
    try {
      const renamed = APPS.map((app) => (
        app.id === 'alpha' ? { ...app, name: 'Alpha Renamed' } : app
      ));
      // Newer pass writes the fresh row while the stale read is held.
      const staleRank = window.AppSemanticSearch.rankApps('alpha', APPS, []);
      await flush();
      window.AppSemanticSearch.clearCache();
      await window.AppSemanticSearch.rankApps('alpha', renamed, []);
      await flush();
      releaseStale();
      await staleRank;
      await flush();

      const rows = await originalGetAll(modelId);
      const liveHash = cache.hashNoteText('Alpha Renamed alpha.example.com');
      const hashes = rows.map((row) => row.textHash);
      expect(hashes).toContain(liveHash);
    } finally {
      cache.getAllCachedVectors = originalGetAll;
    }
  });
});
