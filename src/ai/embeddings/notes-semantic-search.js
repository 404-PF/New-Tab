// src/ai/embeddings/notes-semantic-search.js - Hybrid keyword + semantic ranker
// Issue #1186: single-box #notes-search keeps the keyword fast-path and
// cosine re-ranks once the model is ready. Tag filter always applies first.
// Issue #1332: the collection-agnostic implementation lives in
// hybrid-ranker.js; this module is a backward-compatible re-export so existing
// imports (`window.NotesSemanticSearch`, `rankNotesForQuery`, `getNoteVector`)
// and tests keep working. New code should use `window.HybridRanker` directly.
// Tests must inject `hybrid-ranker.js` before this file; there is no local
// fallback copy (it drifted and tripped the Sonar duplication gate).

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
  if (!base) return;

  const api = {
    DEFAULT_ALPHA: base.DEFAULT_ALPHA,
    DEFAULT_MIN_SCORE: base.DEFAULT_MIN_SCORE,
    DEFAULT_MAX_RESULTS: base.DEFAULT_MAX_RESULTS,
    DEFAULT_RELATED_MIN_SCORE: base.DEFAULT_RELATED_MIN_SCORE,
    DEFAULT_RELATED_MAX_RESULTS: base.DEFAULT_RELATED_MAX_RESULTS,
    DEFAULT_DUPLICATE_MIN_SCORE: base.DEFAULT_DUPLICATE_MIN_SCORE,
    DEFAULT_CONTEXT_MIN_COSINE: base.DEFAULT_CONTEXT_MIN_COSINE,
    DEFAULT_CONTEXT_MAX_ITEMS: base.DEFAULT_CONTEXT_MAX_ITEMS,
    DEFAULT_CONTEXT_MAX_CHARS: base.DEFAULT_CONTEXT_MAX_CHARS,
    cosineSimilarity: base.cosineSimilarity,
    keywordScore: base.keywordScore,
    hybridScore: base.hybridScore,
    filterByTag: base.filterByTag,
    keywordFilter: base.keywordFilter,
    rankByScores: base.rankByScores,
    rankNotesForQuery: base.rankItemsForQuery,
    rankItemsForQuery: base.rankItemsForQuery,
    rankSimilarItems: base.rankSimilarItems,
    selectContextNotes: base.selectContextNotes,
    selectContextItems: base.selectContextItems || base.selectContextNotes
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
