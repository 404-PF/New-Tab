// src/ai/embeddings/app-semantic-search.js - Semantic app-launcher ranking
// Issue #1329: reuses the Harrier model and the shared hybrid ranker
// (hybrid-ranker.js via the notes-semantic-search.js backward-compatible
// re-export). Vectors are cached by embedding text, so a change to an app's
// name, URL host, or folder re-embeds that app, and removed apps are pruned
// on the next ranking pass. No separate invalidation hooks needed.
// Issue #1332: prefers window.HybridRanker, falls back to
// window.NotesSemanticSearch; both rankNotesForQuery/getNoteVector names keep
// working through the ranker alias.

(function () {
  'use strict';

  let cacheModelId = null;
  const vectorCache = new Map();

  function getHost(url) {
    try {
      return new URL(String(url)).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function trimmed(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  // Built-in apps store nameKey instead of name, so resolve the displayed name
  // the same way the grid does.
  function displayNameOf(app) {
    const grid = window.AppGridState;
    if (grid && typeof grid.getAppDisplayName === 'function') {
      return trimmed(grid.getAppDisplayName(app));
    }
    return trimmed(app.name) || trimmed(app.nameKey);
  }

  // Each app becomes a note-shaped doc so the shared ranker can score it:
  // text (name + host) drives the keyword score, tag (folder) is a weaker
  // keyword signal, and embedText is what the model embeds.
  function buildDocuments(apps, folders) {
    const folderByAppId = new Map();
    (Array.isArray(folders) ? folders : []).forEach(function (folder) {
      const name = trimmed(folder && folder.name);
      (Array.isArray(folder && folder.apps) ? folder.apps : []).forEach(function (id) {
        if (!folderByAppId.has(id)) folderByAppId.set(id, name);
      });
    });
    return (Array.isArray(apps) ? apps : [])
      .filter(function (app) { return app && app.id; })
      .map(function (app, order) {
        const name = displayNameOf(app);
        const host = getHost(app.url);
        const folder = folderByAppId.get(app.id) || '';
        return {
          id: app.id,
          order,
          text: [name, host].filter(Boolean).join(' '),
          tag: folder,
          embedText: [name, host, folder].filter(Boolean).join(' ')
        };
      });
  }

  function isSemanticEnabled() {
    try {
      if (typeof window.loadSemanticEnabled === 'function') {
        return !!window.loadSemanticEnabled();
      }
      if (typeof window.loadNotesSemanticEnabled === 'function') {
        return !!window.loadNotesSemanticEnabled();
      }
      try {
        const next = localStorage.getItem('semanticEnabled');
        if (next === 'true') return true;
        if (next === 'false') return false;
      } catch { /* ignore */ }
      return localStorage.getItem('notesSemanticEnabled') === 'true';
    } catch {
      return false;
    }
  }

  function getLiveService() {
    const service = window.EmbeddingService;
    if (!service || typeof service.isReady !== 'function' || !service.isReady()) return null;
    if (typeof service.embedTexts !== 'function' || typeof service.embedQuery !== 'function') return null;
    return service;
  }

  function getModelId(service) {
    try {
      const status = service.getStatus();
      return (status && status.modelId) || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  function getAppCache() {
    try {
      return window.AppVectorCache || null;
    } catch {
      return null;
    }
  }

  // Embeds only texts missing from the cache, in one batch, and prunes
  // entries whose text no longer matches any current app. The in-memory Map
  // stays the hot path; window.AppVectorCache (issue #1332) persists vectors
  // across reloads when the embedding modules are loaded.
  function ensureVectors(docs, service) {
    const modelId = getModelId(service);
    if (cacheModelId !== modelId) {
      vectorCache.clear();
      cacheModelId = modelId;
    }
    const wanted = new Set(docs.map(function (d) { return d.embedText; }));
    Array.from(vectorCache.keys()).forEach(function (key) {
      if (!wanted.has(key)) vectorCache.delete(key);
    });
    const appCache = getAppCache();
    const docByText = new Map();
    docs.forEach(function (d) {
      if (!docByText.has(d.embedText)) docByText.set(d.embedText, d);
    });
    const misses = Array.from(wanted).filter(function (text) { return !vectorCache.has(text); });
    if (misses.length === 0) {
      maybePruneRemovedAppVectors(docs, modelId, appCache);
      return Promise.resolve();
    }
    if (!appCache) {
      return service.embedTexts(misses).then(function (vectors) {
        misses.forEach(function (text, i) {
          const vec = Array.isArray(vectors) ? vectors[i] : null;
          if (Array.isArray(vec) && vec.length > 0) vectorCache.set(text, vec);
        });
      });
    }
    // Persistent path: reuse IndexedDB rows before embedding, then write
    // new vectors to both the memory map and AppVectorCache.
    const reads = misses.map(function (text) {
      const doc = docByText.get(text);
      try {
        return appCache.getCachedVector(doc.id, text, modelId).catch(function () { return null; });
      } catch {
        return Promise.resolve(null);
      }
    });
    return Promise.all(reads).then(function (cached) {
      const stillMissing = [];
      cached.forEach(function (record, i) {
        if (record && Array.isArray(record.vector) && record.vector.length > 0) {
          vectorCache.set(misses[i], record.vector);
        } else {
          stillMissing.push(misses[i]);
        }
      });
      if (stillMissing.length === 0) {
        maybePruneRemovedAppVectors(docs, modelId, appCache);
        return null;
      }
      return service.embedTexts(stillMissing).then(function (vectors) {
        stillMissing.forEach(function (text, i) {
          const vec = Array.isArray(vectors) ? vectors[i] : null;
          if (!Array.isArray(vec) || vec.length === 0) return;
          vectorCache.set(text, vec);
          const doc = docByText.get(text);
          if (!doc) return;
          try {
            const put = appCache.putCachedVector(doc.id, text, modelId, vec);
            if (put && typeof put.catch === 'function') put.catch(function () { /* ignore */ });
          } catch { /* ignore */ }
        });
        maybePruneRemovedAppVectors(docs, modelId, appCache);
        return null;
      });
    });
  }

  function pruneRemovedAppVectors(docs, modelId, appCache) {
    try {
      const liveTextById = new Map();
      (Array.isArray(docs) ? docs : []).forEach(function (d) {
        if (d && d.id !== undefined) liveTextById.set(String(d.id), d.embedText);
      });
      const all = appCache.getAllCachedVectors(modelId);
      if (!all || typeof all.then !== 'function') return;
      all.then(function (records) {
        (Array.isArray(records) ? records : []).forEach(function (r) {
          const id = r && (r.appId !== undefined ? r.appId : r.id);
          if (id === undefined) return;
          const sid = String(id);
          if (!liveTextById.has(sid)) {
            try {
              const deleted = appCache.deleteCachedVectorsForItem(id);
              if (deleted && typeof deleted.catch === 'function') deleted.catch(function () { /* ignore */ });
            } catch { /* ignore */ }
            return;
          }
          // Live app whose embedding text changed (rename, URL or folder
          // move): the row's text hash no longer matches, but an id-scoped
          // delete would also drop the fresh row just written for the same
          // id, so only the stale key is removed.
          try {
            if (typeof appCache.hashNoteText !== 'function'
              || typeof appCache.deleteCachedVectorByKey !== 'function') return;
            const liveHash = appCache.hashNoteText(liveTextById.get(sid));
            if (r.textHash !== liveHash && r.key !== undefined && r.key !== null) {
              const removed = appCache.deleteCachedVectorByKey(r.key);
              if (removed && typeof removed.catch === 'function') removed.catch(function () { /* ignore */ });
            }
          } catch { /* ignore */ }
        });
      }).catch(function () { /* best-effort */ });
    } catch { /* best-effort */ }
  }

  // Prune runs inside every ranking pass, including cache-hit passes (one
  // keystroke = one pass). The persistent read pulls the whole apps store
  // with all vector arrays, so skip it while the app list is unchanged and
  // only run after adds/removes/renames (the fingerprint binds ids to their
  // current embedding text, so folder moves count as changes too).
  let _lastPruneFingerprint = null;

  function pruneFingerprint(docs, modelId) {
    try {
      const parts = (Array.isArray(docs) ? docs : []).map(function (d) {
        return String(d && d.id) + '=' + String(d && d.embedText);
      });
      parts.sort();
      return String(modelId) + '|' + parts.length + '|' + parts.join('|');
    } catch {
      return null;
    }
  }

  function maybePruneRemovedAppVectors(docs, modelId, appCache) {
    if (!appCache) return;
    const fingerprint = pruneFingerprint(docs, modelId);
    if (fingerprint !== null && fingerprint === _lastPruneFingerprint) return;
    _lastPruneFingerprint = fingerprint;
    pruneRemovedAppVectors(docs, modelId, appCache);
  }

  function toAppResults(ranked, appsById) {
    return ranked.map(function (doc) {
      return { ...appsById.get(doc.id), _semanticScore: doc._semanticScore };
    });
  }

  // Exact-name and name-prefix matches lead regardless of cosine; the
  // semantic order is kept within each group (stable partition).
  function prioritizeNameMatches(ranked, query, nameById) {
    const q = query.toLowerCase();
    const isNameMatch = function (doc) {
      const name = (nameById.get(doc.id) || '').toLowerCase();
      return name === q || name.startsWith(q);
    };
    return ranked.filter(isNameMatch).concat(ranked.filter(function (doc) { return !isNameMatch(doc); }));
  }

  // Resolves to copies of the matching apps, best first. Each copy carries
  // _semanticScore (number, or null for keyword-only results). When semantic
  // ranking is off or the model is not ready, returns keyword matches in the
  // original order, matching the non-semantic path.
  function rankApps(query, apps, folders) {
    const ranker = window.HybridRanker || window.NotesSemanticSearch;
    const q = trimmed(query);
    const docs = buildDocuments(apps, folders);
    const appsById = new Map((Array.isArray(apps) ? apps : [])
      .filter(function (a) { return a && a.id; })
      .map(function (a) { return [a.id, a]; }));
    const nameById = new Map(docs.map(function (d) { return [d.id, displayNameOf(appsById.get(d.id))]; }));
    const rankFn = ranker && (ranker.rankItemsForQuery || ranker.rankNotesForQuery);
    if (!ranker || typeof rankFn !== 'function') {
      return Promise.resolve([]);
    }
    const keywordOnly = function () {
      return rankFn.call(ranker, docs, q, null).then(function (ranked) {
        return toAppResults(ranked, appsById);
      });
    };
    const service = isSemanticEnabled() ? getLiveService() : null;
    if (!q || !service) return keywordOnly();

    return ensureVectors(docs, service).then(function () {
      const deps = {
        embedQuery: function (text) { return service.embedQuery(text); },
        getItemVector: function (doc) { return Promise.resolve(vectorCache.get(doc.embedText) || null); },
        getNoteVector: function (doc) { return Promise.resolve(vectorCache.get(doc.embedText) || null); }
      };
      return rankFn.call(ranker, docs, q, deps).then(function (ranked) {
        return toAppResults(prioritizeNameMatches(ranked, q, nameById), appsById);
      });
    }).catch(keywordOnly);
  }

  function clearCache() {
    vectorCache.clear();
    cacheModelId = null;
    // A cleared store must be pruned again on the next pass even for an
    // unchanged app list; also resets test state between ranking passes.
    _lastPruneFingerprint = null;
    try {
      const appCache = getAppCache();
      if (appCache && typeof appCache.clearCachedVectors === 'function') {
        const cleared = appCache.clearCachedVectors();
        if (cleared && typeof cleared.catch === 'function') cleared.catch(function () { /* ignore */ });
      }
    } catch { /* ignore */ }
  }

  const api = {
    buildDocuments,
    rankApps,
    clearCache
  };

  try {
    window.AppSemanticSearch = api;
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
