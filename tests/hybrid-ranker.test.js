import { describe, it, expect, beforeAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/embeddings/hybrid-ranker.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
});

const items = [
  { id: '1', text: 'Buy milk and eggs', tag: 'shopping', order: 0 },
  { id: '2', text: 'Read the new novel', tag: 'leisure', order: 1 },
  { id: '3', text: 'Milkshake recipe with bananas', tag: '', order: 2 }
];

describe('HybridRanker (issue #1332)', () => {
  it('exposes collection-agnostic math helpers', () => {
    expect(window.HybridRanker.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(window.HybridRanker.hybridScore(1, 1, 0.35)).toBeCloseTo(1);
    expect(window.HybridRanker.keywordScore(items[0], 'milk')).toBe(1);
    expect(window.HybridRanker.keywordFilter(items, 'milk').map((n) => n.id).sort()).toEqual(['1', '3']);
  });

  it('caps embedding text to the shared pre-cap', () => {
    expect(window.HybridRanker.EMBEDDING_TEXT_PRE_CAP).toBe(4000);
    expect(window.HybridRanker.capEmbeddingText('a'.repeat(5000))).toHaveLength(4000);
  });

  it('ranks items with either vector dep name', async () => {
    const depsNote = {
      embedQuery: function () { return Promise.resolve([1, 0]); },
      getNoteVector: function (item) {
        if (item.id === '1') return Promise.resolve([1, 0]);
        if (item.id === '2') return Promise.resolve([0, 1]);
        return Promise.resolve(null);
      }
    };
    const depsItem = {
      embedQuery: depsNote.embedQuery,
      getItemVector: depsNote.getNoteVector
    };
    const byNote = await window.HybridRanker.rankItemsForQuery(items, 'feline nutrition', depsNote);
    const byItem = await window.HybridRanker.rankItemsForQuery(items, 'feline nutrition', depsItem);
    expect(byNote[0].id).toBe('1');
    expect(byItem.map((n) => n.id)).toEqual(byNote.map((n) => n.id));
  });

  it('keeps the Notes re-export backward compatible', async () => {
    expect(window.NotesSemanticSearch.rankItemsForQuery).toBe(window.HybridRanker.rankItemsForQuery);
    const deps = {
      embedQuery: function () { return Promise.resolve([1, 0]); },
      getNoteVector: function () { return Promise.resolve([1, 0]); }
    };
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(items.slice(0, 1), 'milk', deps);
    expect(ranked[0].id).toBe('1');
    expect(typeof ranked[0]._semanticScore).toBe('number');
  });

  it('backfills missing vectors in chunks without touching cached items', async () => {
    const stored = new Map([['1', [1, 0]]]);
    const cache = {
      getCachedVector: (id) => Promise.resolve(stored.has(id) ? { vector: stored.get(id) } : null),
      putCachedVector: (id, text, modelId, vec) => {
        stored.set(id, vec);
        return Promise.resolve(true);
      }
    };
    const calls = [];
    const service = {
      embedTexts: (texts) => {
        calls.push(texts.slice());
        return Promise.resolve(texts.map(() => [0, 1]));
      }
    };
    const list = [
      { id: '1', text: 'cached' },
      { id: '2', text: 'miss one' },
      { id: '3', text: '  ' },
      { id: '4', text: 'miss two' }
    ];
    const result = await window.HybridRanker.backfillMissingVectors({
      items: list,
      toText: (item) => item.text,
      getId: (item) => item.id,
      cache,
      service,
      modelId: 'm1',
      chunkSize: 1
    });
    expect(result.total).toBe(4);
    expect(result.embedded).toBe(2);
    expect(stored.has('2')).toBe(true);
    expect(stored.has('4')).toBe(true);
    // Chunked: two single-item batches.
    expect(calls).toEqual([['miss one'], ['miss two']]);
  });

  it('scheduleIdleBackfill returns a cancel function', async () => {
    const cancel = window.HybridRanker.scheduleIdleBackfill({
      items: [],
      toText: () => '',
      cache: null,
      service: null
    });
    expect(typeof cancel).toBe('function');
    cancel();
  });
});
