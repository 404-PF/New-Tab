// src/ai/embeddings/notes-semantic-search.js - Hybrid keyword + semantic ranker
// Issue #1186: single-box #notes-search keeps the keyword fast-path and
// cosine re-ranks once the model is ready. Tag filter always applies first.

(function () {
  'use strict';

  const DEFAULT_ALPHA = 0.35;
  // Scores map cosine [-1,1] to [0,1] before blending, so a note with zero
  // signal (keyword 0, cosine 0) still scores 0.325. Instruction-tuned
  // embedding models give unrelated pairs a clearly positive cosine
  // (~0.3-0.4), so the floor must sit above the 0.455 hybrid that a
  // cosine-0.4 unrelated note reaches: 0.65 * 0.7 = 0.455. A 0.5 floor
  // blocks that weak-but-positive case while keeping weak-but-real matches
  // (cosine 0.5 → 0.4875 is still out; cosine 0.6 → 0.52 stays; any keyword
  // hit scores higher) and falls back to keyword matches when nothing
  // passes. Calibrated against Harrier cosine behavior (PR #1187 review);
  // re-check against real Harrier distributions if the model changes.
  const DEFAULT_MIN_SCORE = 0.5;
  const DEFAULT_MAX_RESULTS = 50;
  // Related-item and duplicate thresholds (issue #1331) are raw cosine
  // values, not hybrid scores. Tune against real Harrier distributions.
  const DEFAULT_RELATED_MIN_SCORE = 0.75;
  const DEFAULT_RELATED_MAX_RESULTS = 5;
  const DEFAULT_DUPLICATE_MIN_SCORE = 0.9;
  // AI context retrieval (issue #1333) has no keyword signal, so it uses the
  // hybrid floor directly: with alpha 0.35, a 0.5 hybrid needs cosine >= 0.54.
  const DEFAULT_CONTEXT_MIN_COSINE = 0.54;
  const DEFAULT_CONTEXT_MAX_ITEMS = 4;
  const DEFAULT_CONTEXT_MAX_CHARS = 1500;
  const CONTEXT_TITLE_MAX_CHARS = 60;

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

  // One result shape for every path (PR #1187 review): semantic hits are
  // copies carrying a numeric _semanticScore; keyword fallbacks are copies
  // carrying _semanticScore: null so callers never receive stored-note
  // references they could mutate and never branch on a missing field.
  // Keyword fallbacks are never capped: the keyword-only path
  // (getFilteredNotes) shows every match, so truncating fallbacks to 50
  // would drop matches the user sees when the model is not ready
  // (PR #1187 human review). Only an explicit maxResults option truncates,
  // and then only the semantic ranked list.
  function copyWithScore(note, score) {
    const copy = { ...(note || {}) };
    copy._semanticScore = (typeof score === 'number' && Number.isFinite(score)) ? score : null;
    return copy;
  }

  // deps: { embedQuery(query)->Promise<vector>, getNoteVector(note)->Promise<vector|null> }
  // Returns ranked note array (new array of copies; stored notes never mutated).
  // Keyword fallbacks return every match (no cap) to match the keyword-only
  // path. The semantic ranked list is capped only when the caller passes an
  // explicit maxResults; the score floor applies only to notes with no
  // keyword match so enabling the model never drops keyword matches the user
  // otherwise sees (PR #1187 human review). DEFAULT_MAX_RESULTS stays exported for
  // callers that want an opt-in truncation.
  // options.keywordScore / options.keywordFilter let other item types (todos,
  // issue #1330) reuse the ranker with their own keyword rules; they default
  // to the note rules.
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
    if (!deps || typeof deps.embedQuery !== 'function' || typeof deps.getNoteVector !== 'function') {
      return Promise.resolve(keywordOnly());
    }

    return deps.embedQuery(q).then(function (queryVector) {
      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        return keywordOnly();
      }
      const jobs = notes.map(function (note) {
        return deps.getNoteVector(note).then(function (vec) {
          const cosine = Array.isArray(vec) && vec.length === queryVector.length
            ? cosineSimilarity(queryVector, vec)
            : 0;
          const keyword = scoreKeyword(note, q);
          const score = hybridScore(keyword, cosine, alpha);
          return { note, score, cosine, keyword };
        }).catch(function () {
          const keyword = scoreKeyword(note, q);
          return { note, score: hybridScore(keyword, 0, alpha), cosine: 0, keyword };
        });
      });
      return Promise.all(jobs).then(function (scored) {
        // Cosine-only signal: keyword matches alone must not count, or a
        // vector-less search returns numeric _semanticScore values ordered
        // by keyword score instead of falling back to displayed order
        // (PR #1187 review).
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
        // If semantic filtering is too aggressive (empty), fall back to
        // keyword matches rather than a surprising empty list.
        if (limited.length === 0) {
          return keywordOnly();
        }
        return limited;
      });
    }).catch(function () {
      return keywordOnly();
    });
  }

  // candidates: [{ id, vector }]. Returns [{ id, score }] (raw cosine), best
  // first, keeping only items at or above minScore. Candidates without a
  // usable vector and the excluded id are skipped.
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

  // Picks the notes to inject into an AI prompt (issue #1333). scored is
  // [{ note, cosine }]. Keeps the best cosines at or above minCosine, at most
  // maxItems, and stops once the summed text reaches maxChars (the last item
  // is cut to fit). Returns copies shaped { id, title, text }.
  function selectContextNotes(scored, options) {
    const opts = options || {};
    const minCosine = Number.isFinite(opts.minCosine) ? opts.minCosine : DEFAULT_CONTEXT_MIN_COSINE;
    const maxItems = Number.isFinite(opts.maxItems) ? opts.maxItems : DEFAULT_CONTEXT_MAX_ITEMS;
    const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : DEFAULT_CONTEXT_MAX_CHARS;
    const candidates = (Array.isArray(scored) ? scored : [])
      .filter(function (s) { return s && s.note && Number.isFinite(s.cosine) && s.cosine >= minCosine; })
      .sort(function (a, b) { return b.cosine - a.cosine; });
    const picked = [];
    let used = 0;
    for (let i = 0; i < candidates.length && picked.length < maxItems && used < maxChars; i += 1) {
      const note = candidates[i].note;
      const text = typeof note.text === 'string' ? note.text.trim() : '';
      if (!text) continue;
      const room = maxChars - used;
      const clipped = text.slice(0, room);
      used += clipped.length;
      const title = clipped.split('\n')[0].slice(0, CONTEXT_TITLE_MAX_CHARS).trim();
      picked.push({ id: note.id, title: title || clipped.slice(0, CONTEXT_TITLE_MAX_CHARS), text: clipped });
    }
    return picked;
  }

  const api = {
    DEFAULT_ALPHA,
    DEFAULT_MIN_SCORE,
    DEFAULT_MAX_RESULTS,
    DEFAULT_RELATED_MIN_SCORE,
    DEFAULT_RELATED_MAX_RESULTS,
    DEFAULT_DUPLICATE_MIN_SCORE,
    DEFAULT_CONTEXT_MIN_COSINE,
    DEFAULT_CONTEXT_MAX_ITEMS,
    DEFAULT_CONTEXT_MAX_CHARS,
    cosineSimilarity,
    keywordScore,
    hybridScore,
    filterByTag,
    keywordFilter,
    rankByScores,
    rankNotesForQuery,
    rankSimilarItems,
    selectContextNotes
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
