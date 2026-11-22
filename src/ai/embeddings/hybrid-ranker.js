// src/ai/embeddings/hybrid-ranker.js - Collection-agnostic hybrid keyword + semantic ranker
// Issue #1332: generalizes the Notes-specific helpers from
// notes-semantic-search.js so Todo search, AI history search, RAG,
// related-items and the app launcher share one implementation.
//
// Shared embedding-text conventions (all collections):
// - Callers build the text to embed, then pre-cap to EMBEDDING_TEXT_PRE_CAP
//   (4000 chars). The cap only bounds hashing/transport; the exact 512-token
//   truncate stays in embedding-service.js via the real tokenizer.
// - Tag/label inclusion is per-collection but follows the same rule:
//   notes: `tag + ' ' + text`; todos: `text + subtasks + details` (label stays
//   keyword-only); apps: `name + host + folder`. Documents surfaced to the
//   ranker are always `{ id, text, tag, order }` shaped; `embedText` (when it
//   differs from `text`) is a cache concern, never a ranker concern.
// - Vector cache keys are `collection + id + textHash + modelId`
//   (see notes-vector-cache.js); legacy `modelId::id::textHash` note/todo rows
//   are read as a fallback so upgrades never wipe the cache.
// - Single opt-in story (decision for #1332): one global `semanticEnabled`
//   master flag (alias `notesSemanticEnabled` for upgrades) gates the shared
//   Harrier model download; per-feature sub-toggles default ON once the master
//   is on. All collections reuse the same model, so nothing new is downloaded.

(function () {
  'use strict';

  const DEFAULT_ALPHA = 0.35;
  // Scores map cosine [-1,1] to [0,1] before blending, so an item with zero
  // signal (keyword 0, cosine 0) still scores 0.325. Instruction-tuned
  // embedding models give unrelated pairs a clearly positive cosine
  // (~0.3-0.4), so the floor must sit above the 0.455 hybrid that a
  // cosine-0.4 unrelated item reaches: 0.65 * 0.7 = 0.455. A 0.5 floor
  // blocks that weak-but-positive case while keeping weak-but-real matches
  // (cosine 0.5 -> 0.4875 is still out; cosine 0.6 -> 0.52 stays; any keyword
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

  // Shared pre-cap (bounds hashing/transport only). The exact 512-token
  // truncate lives in embedding-service.js.
  const EMBEDDING_TEXT_PRE_CAP = 4000;
  // Same chunk/debounce discipline as Notes: the pipeline runs on the UI
  // thread (numThreads:1, no worker), so idle backfills yield between chunks.
  const BACKFILL_CHUNK_SIZE = 8;
  const BACKFILL_IDLE_DELAY_MS = 1500;

  function capEmbeddingText(text) {
    return String(text || '').slice(0, EMBEDDING_TEXT_PRE_CAP);
  }

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

  function keywordScore(item, query) {
    if (!query) return 0;
    const q = String(query).toLowerCase();
    if (!q) return 0;
    const text = typeof item.text === 'string' ? item.text.toLowerCase() : '';
    const tag = typeof item.tag === 'string' ? item.tag.toLowerCase() : '';
    if (text.includes(q)) return 1;
    if (tag && tag.includes(q)) return 0.6;
    return 0;
  }

  function hybridScore(keyword, cosine, alpha) {
    const weight = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : DEFAULT_ALPHA;
    const k = Number.isFinite(keyword) ? keyword : 0;
    const c = Number.isFinite(cosine) ? Math.min(1, Math.max(-1, cosine)) : 0;
    // Cosine maps [-1,1] -> [0,1] so unrelated items score ~0.5, not 0.
    const normalizedCosine = (c + 1) / 2;
    return (weight * k) + ((1 - weight) * normalizedCosine);
  }

  function filterByTag(items, tagFilter) {
    if (tagFilter === null || tagFilter === undefined) return Array.isArray(items) ? items.slice() : [];
    return (Array.isArray(items) ? items : []).filter(function (n) { return n && n.tag === tagFilter; });
  }

  function keywordFilter(items, query) {
    const list = Array.isArray(items) ? items : [];
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
    const candidates = [entry && entry.item, entry && entry.note];
    for (let i = 0; i < candidates.length; i += 1) {
      const target = candidates[i];
      if (target && Number.isFinite(target.order)) return target.order;
    }
    return 0;
  }

  function targetOf(entry) {
    if (entry && entry.item) return entry.item;
    if (entry && entry.note) return entry.note;
    return null;
  }

  function rankByScores(itemsWithScores) {
    return itemsWithScores.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return orderOf(a) - orderOf(b);
    });
  }

  // One result shape for every path (PR #1187 review): semantic hits are
  // copies carrying a numeric _semanticScore; keyword fallbacks are copies
  // carrying _semanticScore: null so callers never receive stored-item
  // references they could mutate and never branch on a missing field.
  // Keyword fallbacks are never capped: the keyword-only path shows every
  // match, so truncating fallbacks to 50 would drop matches the user sees
  // when the model is not ready (PR #1187 human review). Only an explicit
  // maxResults option truncates, and then only the semantic ranked list.
  function copyWithScore(item, score) {
    const copy = { ...(item || {}) };
    copy._semanticScore = (typeof score === 'number' && Number.isFinite(score)) ? score : null;
    return copy;
  }

  function resolveVectorGetter(deps) {
    if (!deps || typeof deps !== 'object') return null;
    if (typeof deps.getItemVector === 'function') return deps.getItemVector;
    // Backward-compatible alias: the Notes-era name.
    if (typeof deps.getNoteVector === 'function') return deps.getNoteVector;
    return null;
  }

  // deps: { embedQuery(query)->Promise<vector>, getItemVector(item)->Promise<vector|null> }
  // (getNoteVector accepted as an alias). Returns ranked item array (new array
  // of copies; stored items never mutated). Keyword fallbacks return every
  // match (no cap) to match the keyword-only path. The semantic ranked list is
  // capped only when the caller passes an explicit maxResults; the score floor
  // applies only to items with no keyword match so enabling the model never
  // drops keyword matches the user otherwise sees (PR #1187 human review).
  // DEFAULT_MAX_RESULTS stays exported for callers that want opt-in truncation.
  // options.keywordScore / options.keywordFilter let other item types (todos,
  // issue #1330) reuse the ranker with their own keyword rules; they default
  // to the generic text/tag rules.
  function rankItemsForQuery(tagFilteredItems, query, deps, options) {
    const opts = options || {};
    const alpha = opts.alpha !== undefined ? opts.alpha : DEFAULT_ALPHA;
    const minScore = opts.minScore !== undefined ? opts.minScore : DEFAULT_MIN_SCORE;
    const maxResults = opts.maxResults;
    const scoreKeyword = typeof opts.keywordScore === 'function' ? opts.keywordScore : keywordScore;
    const filterKeyword = typeof opts.keywordFilter === 'function' ? opts.keywordFilter : keywordFilter;
    const items = Array.isArray(tagFilteredItems) ? tagFilteredItems : [];
    const q = (query || '').trim();

    function keywordOnly() {
      return filterKeyword(items, q).map(function (n) { return copyWithScore(n, null); });
    }

    if (!q) {
      return Promise.resolve(items.map(function (n) { return copyWithScore(n, null); }));
    }
    if (items.length === 0) {
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
      const jobs = items.map(function (item) {
        return getVector.call(deps, item).then(function (vec) {
          const cosine = Array.isArray(vec) && vec.length === queryVector.length
            ? cosineSimilarity(queryVector, vec)
            : 0;
          const keyword = scoreKeyword(item, q);
          const score = hybridScore(keyword, cosine, alpha);
          return { item, note: item, score, cosine, keyword };
        }).catch(function () {
          const keyword = scoreKeyword(item, q);
          return { item, note: item, score: hybridScore(keyword, 0, alpha), cosine: 0, keyword };
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
          const copy = { ...targetOf(s) };
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

  // Picks the items to inject into an AI prompt (issue #1333). scored is
  // [{ item|note, cosine }]. Keeps the best cosines at or above minCosine,
  // at most maxItems, and stops once the summed text reaches maxChars (the
  // last item is cut to fit). Returns copies shaped { id, title, text }.
  function selectContextNotes(scored, options) {
    const opts = options || {};
    const minCosine = Number.isFinite(opts.minCosine) ? opts.minCosine : DEFAULT_CONTEXT_MIN_COSINE;
    const maxItems = Number.isFinite(opts.maxItems) ? opts.maxItems : DEFAULT_CONTEXT_MAX_ITEMS;
    const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : DEFAULT_CONTEXT_MAX_CHARS;
    const candidates = (Array.isArray(scored) ? scored : [])
      .filter(function (s) {
        const src = s && (s.note || s.item);
        return src && Number.isFinite(s.cosine) && s.cosine >= minCosine;
      })
      .sort(function (a, b) { return b.cosine - a.cosine; });
    const picked = [];
    let used = 0;
    for (let i = 0; i < candidates.length && picked.length < maxItems && used < maxChars; i += 1) {
      const src = candidates[i].note || candidates[i].item;
      const text = typeof src.text === 'string' ? src.text.trim() : '';
      if (!text) continue;
      const room = maxChars - used;
      const clipped = text.slice(0, room);
      used += clipped.length;
      const title = clipped.split('\n')[0].slice(0, CONTEXT_TITLE_MAX_CHARS).trim();
      picked.push({ id: src.id, title: title || clipped.slice(0, CONTEXT_TITLE_MAX_CHARS), text: clipped });
    }
    return picked;
  }

  function yieldToUI() {
    return new Promise(function (resolve) {
      try {
        if (typeof setTimeout === 'function') {
          setTimeout(resolve, 0);
          return;
        }
      } catch { /* fall through */ }
      resolve();
    });
  }

  // Chunked backfill for uncached collections (issue #1332): one cache pass,
  // then embedTexts in BACKFILL_CHUNK_SIZE batches with a yield between
  // chunks (same discipline as the Notes search path and the
  // embedding-service EMBED_CHUNK_SIZE). Skips blank texts and keeps cached
  // vectors on partial failure. options.isLive(item, text) guards the
  // write-back the same way the Notes/Todo search paths do (skip when the
  // item was edited/deleted or the model was disabled mid-flight).
  // Returns { embedded, skipped, total }.
  function backfillMissingVectors(args) {
    const opts = args || {};
    const items = Array.isArray(opts.items) ? opts.items : [];
    const toText = typeof opts.toText === 'function' ? opts.toText : function () { return ''; };
    const getId = typeof opts.getId === 'function' ? opts.getId : function (item, i) { return (item && item.id !== undefined) ? item.id : i; };
    const cache = opts.cache || null;
    const service = opts.service || null;
    const modelId = opts.modelId;
    const chunkSize = Number.isFinite(opts.chunkSize) && opts.chunkSize > 0 ? Math.max(1, Math.floor(opts.chunkSize)) : BACKFILL_CHUNK_SIZE;
    const isLive = typeof opts.isLive === 'function' ? opts.isLive : null;
    const isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : null;
    if (items.length === 0 || !cache || !service || !modelId) {
      return Promise.resolve({ embedded: 0, skipped: 0, total: items.length });
    }
    const inputs = items.map(function (item) {
      try { return String(toText(item) || ''); } catch { return ''; }
    });
    return Promise.all(items.map(function (item, i) {
      try {
        return cache.getCachedVector(getId(item, i), inputs[i], modelId).catch(function () { return null; });
      } catch {
        return Promise.resolve(null);
      }
    })).then(function (cached) {
      const missIndexes = [];
      cached.forEach(function (record, i) {
        if (record && Array.isArray(record.vector) && record.vector.length > 0) return;
        if (!inputs[i].trim()) return;
        missIndexes.push(i);
      });
      if (missIndexes.length === 0) {
        return { embedded: 0, skipped: 0, total: items.length };
      }
      let embedded = 0;
      let chain = Promise.resolve();
      for (let start = 0; start < missIndexes.length; start += chunkSize) {
        const chunk = missIndexes.slice(start, start + chunkSize);
        chain = chain.then(function () {
          try {
            if (isCancelled && isCancelled()) return null;
          } catch { /* ignore cancellation check errors */ }
          let texts;
          try {
            texts = chunk.map(function (i) { return inputs[i]; });
          } catch { texts = []; }
          if (texts.length === 0) return null;
          return service.embedTexts(texts).then(function (vectors) {
            chunk.forEach(function (itemIndex, j) {
              const vec = Array.isArray(vectors) ? vectors[j] : null;
              if (!Array.isArray(vec) || vec.length === 0) return;
              if (isLive) {
                let keep;
                try { keep = isLive(items[itemIndex], inputs[itemIndex]) !== false; } catch { keep = true; }
                if (!keep) return;
              }
              embedded += 1;
              try {
                const put = cache.putCachedVector(getId(items[itemIndex], itemIndex), inputs[itemIndex], modelId, vec);
                if (put && typeof put.catch === 'function') put.catch(function () { /* ignore */ });
              } catch { /* ignore */ }
            });
            return yieldToUI();
          }).catch(function () { return null; });
        });
      }
      return chain.then(function () {
        return { embedded, skipped: missIndexes.length - embedded, total: items.length };
      });
    }).catch(function () {
      return { embedded: 0, skipped: 0, total: items.length };
    });
  }

  // requestIdleCallback-style scheduling for backfills: runs after the model
  // is ready without blocking first paint or search. Uses requestIdleCallback
  // when available, otherwise a short delayed task. Returns a cancel function.
  function scheduleIdleBackfill(args, scheduleOptions) {
    let cancelled = false;
    const task = function () {
      try {
        if (cancelled) return;
      } catch { /* ignore */ }
      const merged = Object.assign({}, args || {}, {
        isCancelled: function () {
          if (cancelled) return true;
          try {
            const inner = args && typeof args.isCancelled === 'function' ? args.isCancelled() : false;
            return !!inner;
          } catch { return false; }
        }
      });
      backfillMissingVectors(merged).catch(function () { /* best-effort */ });
    };
    const opts = scheduleOptions || {};
    const delay = Number.isFinite(opts.delayMs) ? opts.delayMs : BACKFILL_IDLE_DELAY_MS;
    const timeout = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 2000;
    try {
      if (typeof requestIdleCallback === 'function') {
        const handle = requestIdleCallback(task, { timeout });
        return function () {
          cancelled = true;
          try {
            if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
          } catch { /* ignore */ }
        };
      }
    } catch { /* fall through to setTimeout */ }
    let timer = null;
    try {
      timer = setTimeout(task, delay);
    } catch { /* ignore */ }
    return function () {
      cancelled = true;
      try {
        if (timer) clearTimeout(timer);
      } catch { /* ignore */ }
      timer = null;
    };
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
    EMBEDDING_TEXT_PRE_CAP,
    BACKFILL_CHUNK_SIZE,
    BACKFILL_IDLE_DELAY_MS,
    capEmbeddingText,
    cosineSimilarity,
    keywordScore,
    hybridScore,
    filterByTag,
    keywordFilter,
    rankByScores,
    rankItemsForQuery,
    rankSimilarItems,
    selectContextNotes,
    backfillMissingVectors,
    scheduleIdleBackfill
  };

  // Backward-compatible Notes-era aliases: rankNotesForQuery(item, ...) and the
  // getNoteVector dep name keep working for existing callers/tests.
  // selectContextItems is the collection-agnostic alias of selectContextNotes.
  api.rankNotesForQuery = rankItemsForQuery;
  api.selectContextItems = selectContextNotes;

  try {
    window.HybridRanker = api;
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
