// src/ai/embeddings/notes-semantic-search.js - Hybrid keyword + semantic ranker
// Issue #1186: single-box #notes-search keeps the keyword fast-path and
// cosine re-ranks once the model is ready. Tag filter always applies first.
// Issue #1332: the collection-agnostic implementation lives in
// hybrid-ranker.js; this module is a backward-compatible re-export so existing
// imports (`window.NotesSemanticSearch`, `rankNotesForQuery`, `getNoteVector`)
// and tests keep working. New code should use `window.HybridRanker` directly.

(function () {
  'use strict';

  function getBase() {
    try {
      return window.HybridRanker || null;
    } catch {
      return null;
    }
  }

  const base = getBase();
  if (base) {
    const api = {
      DEFAULT_ALPHA: base.DEFAULT_ALPHA,
      DEFAULT_MIN_SCORE: base.DEFAULT_MIN_SCORE,
      DEFAULT_MAX_RESULTS: base.DEFAULT_MAX_RESULTS,
      DEFAULT_RELATED_MIN_SCORE: base.DEFAULT_RELATED_MIN_SCORE,
      DEFAULT_RELATED_MAX_RESULTS: base.DEFAULT_RELATED_MAX_RESULTS,
      DEFAULT_DUPLICATE_MIN_SCORE: base.DEFAULT_DUPLICATE_MIN_SCORE,
      cosineSimilarity: base.cosineSimilarity,
      keywordScore: base.keywordScore,
      hybridScore: base.hybridScore,
      filterByTag: base.filterByTag,
      keywordFilter: base.keywordFilter,
      rankByScores: base.rankByScores,
      rankNotesForQuery: base.rankItemsForQuery,
      rankItemsForQuery: base.rankItemsForQuery,
      rankSimilarItems: base.rankSimilarItems
    };

    try {
      window.NotesSemanticSearch = api;
    } catch {
      // ignore
    }

    try {
      if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
      }
    } catch {
      // ignore
    }
    return;
  }

  // Fallback for isolated unit tests that inject only this file without
  // hybrid-ranker.js: full local implementation (mirrors hybrid-ranker.js).
  const DEFAULT_ALPHA = 0.35;
  const DEFAULT_MIN_SCORE = 0.5;
  const DEFAULT_MAX_RESULTS = 50;
  const DEFAULT_RELATED_MIN_SCORE = 0.75;
  const DEFAULT_RELATED_MAX_RESULTS = 5;
  const DEFAULT_DUPLICATE_MIN_SCORE = 0.9;

  function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
      const x = Number(a[i]) || 0;
      const y = Number(b[i]) || 0;
      dot += x * y;
      normA += x * x;
      normB += y * y;
    }
    if (normA === 0 || normB === 0) return 0;
    const result = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return Number.isFinite(result) ? result : 0;
  }

  function keywordScore(note, query) {
    if (!query) return 0;
    const q = String(query).toLowerCase();
    if (!q) return 0;
    const text = typeof note.text === 'string' ? note.text.toLowerCase() : '';
    const tag = typeof note.tag === 'string' ? note.tag.toLowerCase() : '';
    if (text.includes(q)) return 1;
    if (tag && tag.includes(q)) return 0.6;
    return 0;
  }

  function hybridScore(keyword, cosine, alpha) {
    const weight = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : DEFAULT_ALPHA;
    const k = Number.isFinite(keyword) ? keyword : 0;
    const c = Number.isFinite(cosine) ? Math.min(1, Math.max(-1, cosine)) : 0;
    const normalizedCosine = (c + 1) / 2;
    return (weight * k) + ((1 - weight) * normalizedCosine);
  }

  function filterByTag(notes, tagFilter) {
    if (tagFilter === null || tagFilter === undefined) return Array.isArray(notes) ? notes.slice() : [];
    return (Array.isArray(notes) ? notes : []).filter(function (n) { return n && n.tag === tagFilter; });
  }

  function keywordFilter(notes, query) {
    const list = Array.isArray(notes) ? notes : [];
    if (!query) return list.slice();
    const q = String(query).toLowerCase();
    return list.filter(function (n) {
      if (!n) return false;
      const textMatch = typeof n.text === 'string' && n.text.toLowerCase().includes(q);
      const tagMatch = typeof n.tag === 'string' && n.tag.toLowerCase().includes(q);
      return textMatch || tagMatch;
    });
  }

  function orderOf(entry) {
    if (entry && entry.note && Number.isFinite(entry.note.order)) return entry.note.order;
    if (entry && entry.item && Number.isFinite(entry.item.order)) return entry.item.order;
    return 0;
  }

  function rankByScores(notesWithScores) {
    return notesWithScores.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return orderOf(a) - orderOf(b);
    });
  }

  function copyWithScore(note, score) {
    const copy = { ...(note || {}) };
    copy._semanticScore = (typeof score === 'number' && Number.isFinite(score)) ? score : null;
    return copy;
  }

  function resolveVectorGetter(deps) {
    if (!deps || typeof deps !== 'object') return null;
    if (typeof deps.getNoteVector === 'function') return deps.getNoteVector;
    if (typeof deps.getItemVector === 'function') return deps.getItemVector;
    return null;
  }

  function rankNotesForQuery(tagFilteredNotes, query, deps, options) {
    const opts = options || {};
    const alpha = opts.alpha !== undefined ? opts.alpha : DEFAULT_ALPHA;
    const minScore = opts.minScore !== undefined ? opts.minScore : DEFAULT_MIN_SCORE;
    const maxResults = opts.maxResults;
    const scoreKeyword = typeof opts.keywordScore === 'function' ? opts.keywordScore : keywordScore;
    const filterKeyword = typeof opts.keywordFilter === 'function' ? opts.keywordFilter : keywordFilter;
    const notes = Array.isArray(tagFilteredNotes) ? tagFilteredNotes : [];
    const q = (query || '').trim();

    function keywordOnly() {
      return filterKeyword(notes, q).map(function (n) { return copyWithScore(n, null); });
    }

    if (!q) {
      return Promise.resolve(notes.map(function (n) { return copyWithScore(n, null); }));
    }
    if (notes.length === 0) {
      return Promise.resolve([]);
    }
    const getVector = resolveVectorGetter(deps);
    if (!deps || typeof deps.embedQuery !== 'function' || typeof getVector !== 'function') {
      return Promise.resolve(keywordOnly());
    }

    return deps.embedQuery(q).then(function (queryVector) {
      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        return keywordOnly();
      }
      const jobs = notes.map(function (note) {
        return getVector(note).then(function (vec) {
          const cosine = Array.isArray(vec) && vec.length === queryVector.length
            ? cosineSimilarity(queryVector, vec)
            : 0;
          const keyword = scoreKeyword(note, q);
          const score = hybridScore(keyword, cosine, alpha);
          return { note, item: note, score, cosine, keyword };
        }).catch(function () {
          const keyword = scoreKeyword(note, q);
          return { note, item: note, score: hybridScore(keyword, 0, alpha), cosine: 0, keyword };
        });
      });
      return Promise.all(jobs).then(function (scored) {
        const hasSignal = scored.some(function (s) { return s.cosine !== 0; });
        if (!hasSignal) {
          return keywordOnly();
        }
        const ranked = rankByScores(scored).filter(function (s) { return s.score >= minScore || s.keyword > 0; });
        const capped = Number.isFinite(maxResults) ? ranked.slice(0, maxResults) : ranked;
        const limited = capped.map(function (s) {
          const copy = { ...s.note };
          copy._semanticScore = s.score;
          return copy;
        });
        if (limited.length === 0) {
          return keywordOnly();
        }
        return limited;
      });
    }).catch(function () {
      return keywordOnly();
    });
  }

  function rankSimilarItems(targetVector, candidates, options) {
    const opts = options || {};
    const minScore = Number.isFinite(opts.minScore) ? opts.minScore : DEFAULT_RELATED_MIN_SCORE;
    const maxResults = Number.isFinite(opts.maxResults) ? Math.max(0, Math.floor(opts.maxResults)) : DEFAULT_RELATED_MAX_RESULTS;
    if (!Array.isArray(targetVector) || targetVector.length === 0) return [];
    const list = Array.isArray(candidates) ? candidates : [];
    const scored = [];
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      if (!c || c.id === opts.excludeId || !Array.isArray(c.vector) || c.vector.length !== targetVector.length) continue;
      const score = cosineSimilarity(targetVector, c.vector);
      if (score >= minScore) scored.push({ id: c.id, score });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, maxResults);
  }

  const api = {
    DEFAULT_ALPHA,
    DEFAULT_MIN_SCORE,
    DEFAULT_MAX_RESULTS,
    DEFAULT_RELATED_MIN_SCORE,
    DEFAULT_RELATED_MAX_RESULTS,
    DEFAULT_DUPLICATE_MIN_SCORE,
    cosineSimilarity,
    keywordScore,
    hybridScore,
    filterByTag,
    keywordFilter,
    rankByScores,
    rankNotesForQuery,
    rankItemsForQuery: rankNotesForQuery,
    rankSimilarItems
  };

  try {
    window.NotesSemanticSearch = api;
  } catch {
    // ignore
  }

  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api;
    }
  } catch {
    // ignore
  }
})();
