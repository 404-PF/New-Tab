// src/ai/embeddings/notes-semantic-search.js - Hybrid keyword + semantic ranker
// Issue #1186: single-box #notes-search keeps the keyword fast-path and
// cosine re-ranks once the model is ready. Tag filter always applies first.

(function () {
  'use strict';

  const DEFAULT_ALPHA = 0.35;
  // Scores map cosine [-1,1] to [0,1] before blending, so a note with zero
  // signal (keyword 0, cosine 0) still scores 0.325. The floor must sit above
  // that: unrelated notes (~0.33) are filtered while weak-but-real matches
  // (cosine 0.3 → 0.42 is still out; cosine 0.5 → 0.49 stays) survive.
  const DEFAULT_MIN_SCORE = 0.45;
  const DEFAULT_MAX_RESULTS = 50;

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
    // Cosine maps [-1,1] -> [0,1] so unrelated notes score ~0.5, not 0.
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

  function rankByScores(notesWithScores) {
    return notesWithScores.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      const orderA = Number.isFinite(a.note.order) ? a.note.order : 0;
      const orderB = Number.isFinite(b.note.order) ? b.note.order : 0;
      return orderA - orderB;
    });
  }

  // deps: { embedQuery(query)->Promise<vector>, getNoteVector(note)->Promise<vector|null> }
  // Returns ranked note array (new array, originals not mutated except for an
  // optional non-enumerable score? we attach _semanticScore as own prop copy).
  function rankNotesForQuery(tagFilteredNotes, query, deps, options) {
    const opts = options || {};
    const alpha = opts.alpha !== undefined ? opts.alpha : DEFAULT_ALPHA;
    const minScore = opts.minScore !== undefined ? opts.minScore : DEFAULT_MIN_SCORE;
    const maxResults = opts.maxResults !== undefined ? opts.maxResults : DEFAULT_MAX_RESULTS;
    const notes = Array.isArray(tagFilteredNotes) ? tagFilteredNotes : [];
    const q = (query || '').trim();

    if (!q) {
      return Promise.resolve(notes.slice());
    }
    if (notes.length === 0) {
      return Promise.resolve([]);
    }
    if (!deps || typeof deps.embedQuery !== 'function' || typeof deps.getNoteVector !== 'function') {
      return Promise.resolve(keywordFilter(notes, q));
    }

    return deps.embedQuery(q).then(function (queryVector) {
      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        return keywordFilter(notes, q);
      }
      const jobs = notes.map(function (note) {
        return deps.getNoteVector(note).then(function (vec) {
          const cosine = Array.isArray(vec) && vec.length === queryVector.length
            ? cosineSimilarity(queryVector, vec)
            : 0;
          const keyword = keywordScore(note, q);
          const score = hybridScore(keyword, cosine, alpha);
          return { note, score, cosine, keyword };
        }).catch(function () {
          return { note, score: keywordScore(note, q), cosine: 0, keyword: keywordScore(note, q) };
        });
      });
      return Promise.all(jobs).then(function (scored) {
        const hasSignal = scored.some(function (s) { return s.cosine !== 0 || s.keyword !== 0; });
        if (!hasSignal) {
          return keywordFilter(notes, q);
        }
        const ranked = rankByScores(scored).filter(function (s) { return s.score >= minScore; });
        const limited = ranked.slice(0, maxResults).map(function (s) {
          const copy = { ...s.note };
          copy._semanticScore = s.score;
          return copy;
        });
        // If semantic filtering is too aggressive (empty), fall back to
        // keyword matches rather than a surprising empty list.
        if (limited.length === 0) {
          return keywordFilter(notes, q);
        }
        return limited;
      });
    }).catch(function () {
      return keywordFilter(notes, q);
    });
  }

  const api = {
    DEFAULT_ALPHA,
    DEFAULT_MIN_SCORE,
    DEFAULT_MAX_RESULTS,
    cosineSimilarity,
    keywordScore,
    hybridScore,
    filterByTag,
    keywordFilter,
    rankByScores,
    rankNotesForQuery
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
