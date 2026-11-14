import { describe, it, expect, beforeAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/embeddings/notes-semantic-search.js');
});

const notes = [
  { id: '1', text: 'Buy milk and eggs', tag: 'shopping', order: 0 },
  { id: '2', text: 'Read the new novel', tag: 'leisure', order: 1 },
  { id: '3', text: 'Milkshake recipe with bananas', tag: '', order: 2 }
];

describe('NotesSemanticSearch math', () => {
  it('computes cosine similarity', () => {
    expect(window.NotesSemanticSearch.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(window.NotesSemanticSearch.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(window.NotesSemanticSearch.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(window.NotesSemanticSearch.cosineSimilarity([], [])).toBe(0);
    expect(window.NotesSemanticSearch.cosineSimilarity([1], [1, 0])).toBe(0);
  });

  it('scores keyword matches like the notes filter', () => {
    expect(window.NotesSemanticSearch.keywordScore(notes[0], 'milk')).toBe(1);
    expect(window.NotesSemanticSearch.keywordScore(notes[0], 'MILK')).toBe(1);
    expect(window.NotesSemanticSearch.keywordScore(notes[0], 'shopping')).toBe(0.6);
    expect(window.NotesSemanticSearch.keywordScore(notes[0], 'zzz')).toBe(0);
    expect(window.NotesSemanticSearch.keywordScore(notes[0], '')).toBe(0);
  });

  it('blends keyword and cosine with alpha', () => {
    const S = window.NotesSemanticSearch;
    expect(S.hybridScore(1, 1, 0.35)).toBeCloseTo(1);
    expect(S.hybridScore(0, -1, 0.35)).toBeCloseTo(0);
    // alpha=1 ignores cosine entirely.
    expect(S.hybridScore(1, -1, 1)).toBeCloseTo(1);
    expect(S.hybridScore(0, 1, 1)).toBeCloseTo(0);
  });

  it('filters by tag first', () => {
    expect(window.NotesSemanticSearch.filterByTag(notes, null)).toHaveLength(3);
    expect(window.NotesSemanticSearch.filterByTag(notes, 'shopping').map((n) => n.id)).toEqual(['1']);
  });

  it('ranks higher scores first with stable order fallback', () => {
    const ranked = window.NotesSemanticSearch.rankByScores([
      { note: notes[2], score: 0.2 },
      { note: notes[1], score: 0.2 },
      { note: notes[0], score: 0.9 }
    ]);
    expect(ranked.map((s) => s.note.id)).toEqual(['1', '2', '3']);
  });
});

describe('NotesSemanticSearch.rankNotesForQuery', () => {
  // cat-note [1,0], dog-note [0,1]; query 'feline' embeds as [1,0].
  const deps = {
    embedQuery: function () { return Promise.resolve([1, 0]); },
    getNoteVector: function (note) {
      if (note.id === '1') return Promise.resolve([1, 0]);
      if (note.id === '2') return Promise.resolve([0, 1]);
      return Promise.resolve(null);
    }
  };

  it('returns copies with null scores for empty queries', async () => {
    // One shape for every path (PR #1187 review): empty-query results are
    // copies with _semanticScore: null, never stored-note references.
    for (const q of ['', '   ']) {
      const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, q, deps);
      expect(ranked.map((n) => n.id)).toEqual(notes.map((n) => n.id));
      ranked.forEach((n) => expect(n._semanticScore).toBeNull());
      // Every result must be isolated, not just the first.
      ranked.forEach((n) => {
        const src = notes.find((s) => s.id === n.id);
        expect(n).not.toBe(src);
      });
    }
  });

  it('returns copies with null scores for keyword fallbacks', async () => {
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'milk', null);
    expect(ranked.map((n) => n.id).sort()).toEqual(['1', '3']);
    ranked.forEach((n) => expect(n._semanticScore).toBeNull());
    // Every fallback result must be isolated: mutating any copy must not
    // mutate the stored note with the same id.
    ranked.forEach((n) => {
      const src = notes.find((s) => s.id === n.id);
      expect(n).not.toBe(src);
    });
    ranked.forEach((n, i) => {
      const marker = 'mutated-' + i;
      n.text = marker;
      expect(notes.find((s) => s.id === n.id).text).not.toBe(marker);
    });
  });

  it('finds semantically related notes with different wording', async () => {
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'feline nutrition', deps);
    // Note 1 (cat-like vector) outranks the rest despite zero keyword overlap.
    expect(ranked[0].id).toBe('1');
    expect(ranked[0]._semanticScore).toBeGreaterThan(0);
    // Note 3 has no signal at all (score 0.325 < floor) and is filtered;
    // note 2 (orthogonal vector, no keywords) scores 0.325 too.
    expect(ranked.map((n) => n.id)).toEqual(['1']);
  });

  it('filters weak positive-cosine unrelated notes above the old floor (PR #1187)', async () => {
    // Instruction-tuned models give unrelated pairs ~0.4 cosine: hybrid
    // 0.65 * 0.7 = 0.455 clears the old 0.45 floor, returning almost every
    // note ordered by a weak signal. The 0.5 floor blocks it, falling back
    // to keyword matches (none here) instead of a full weak list.
    const weakDeps = {
      embedQuery: function () { return Promise.resolve([1, 0]); },
      getNoteVector: function () {
        // cosine 0.4 vector: [1, 0] vs normalized [0.4, sqrt(1-0.16)].
        return Promise.resolve([0.4, Math.sqrt(1 - 0.16)]);
      }
    };
    const many = [
      { id: 'a', text: 'alpha note', tag: '', order: 0 },
      { id: 'b', text: 'beta note', tag: '', order: 1 }
    ];
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(many, 'zzz-no-keyword', weakDeps);
    expect(ranked).toEqual([]);
  });

  it('returns every keyword match without a cap (PR #1187)', async () => {
    // The keyword-only path shows all matches; the semantic path must not
    // drop matches beyond 50 once the model is ready.
    const big = Array.from({ length: 60 }, (_, i) => ({
      id: 'n' + i,
      text: 'milk note ' + i,
      tag: '',
      order: i
    }));
    const fallback = await window.NotesSemanticSearch.rankNotesForQuery(big, 'milk', null);
    expect(fallback).toHaveLength(60);
    const readyDeps = {
      embedQuery: function () { return Promise.resolve([1, 0]); },
      getNoteVector: function () { return Promise.resolve([0, 1]); }
    };
    // Orthogonal vectors score 0.325 < floor, so the ranker falls back to
    // keyword matches: all 60 must survive, not the first 50.
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(big, 'milk', readyDeps);
    expect(ranked).toHaveLength(60);
    // An explicit maxResults still truncates the semantic list for callers
    // that want it.
    const two = [
      { id: 'x1', text: 'x', tag: '', order: 0 },
      { id: 'x2', text: 'x', tag: '', order: 1 }
    ];
    const capped = await window.NotesSemanticSearch.rankNotesForQuery(
      two,
      'x',
      {
        embedQuery: function () { return Promise.resolve([1, 0]); },
        getNoteVector: function () { return Promise.resolve([1, 0]); }
      },
      { maxResults: 1 }
    );
    expect(capped).toHaveLength(1);
  });

  it('keeps tag-filtered inputs ranked', async () => {
    const tagged = window.NotesSemanticSearch.filterByTag(notes, 'leisure');
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(tagged, 'novel', deps);
    expect(ranked.map((n) => n.id)).toEqual(['2']);
  });

  it('falls back to keyword matches when semantic scores all miss the floor', async () => {
    // Every note embeds opposite the query (cosine -1): keyword hits score
    // 0.35 and pure misses 0, both below the 0.5 floor, so the ranker yields
    // to the keyword fast-path instead of a surprising empty list.
    const oppositeDeps = {
      embedQuery: function () { return Promise.resolve([1, 0]); },
      getNoteVector: function () { return Promise.resolve([-1, 0]); }
    };
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'milk', oppositeDeps);
    expect(ranked.map((n) => n.id).sort()).toEqual(['1', '3']);
  });

  it('falls back to keyword matches without model deps', async () => {
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'milk', null);
    expect(ranked.map((n) => n.id).sort()).toEqual(['1', '3']);
  });

  it('falls back to keyword matches when embedding rejects', async () => {
    const badDeps = {
      embedQuery: function () { return Promise.reject(new Error('offline')); },
      getNoteVector: function () { return Promise.resolve([1, 0]); }
    };
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'milk', badDeps);
    expect(ranked.map((n) => n.id).sort()).toEqual(['1', '3']);
  });

  it('falls back to keyword matches when the query vector is empty', async () => {
    const emptyDeps = {
      embedQuery: function () { return Promise.resolve([]); },
      getNoteVector: function () { return Promise.resolve([1, 0]); }
    };
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'milk', emptyDeps);
    expect(ranked.map((n) => n.id).sort()).toEqual(['1', '3']);
  });

  it('keeps keyword matches despite a very low cosine (PR #1187)', async () => {
    // The floor applies only to notes with no keyword match: a keyword hit
    // with cosine -1 (hybrid 0.35 < 0.5 floor) must survive instead of
    // being dropped from the semantic list.
    const oppositeDeps = {
      embedQuery: function () { return Promise.resolve([1, 0]); },
      getNoteVector: function () { return Promise.resolve([-1, 0]); }
    };
    const ranked = await window.NotesSemanticSearch.rankNotesForQuery(notes, 'milk', oppositeDeps);
    expect(ranked.map((n) => n.id).sort()).toEqual(['1', '3']);
    ranked.forEach((n) => {
      expect(typeof n._semanticScore).toBe('number');
    });
  });
});
