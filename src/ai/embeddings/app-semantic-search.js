// src/ai/embeddings/app-semantic-search.js - Semantic app-launcher ranking
// Issue #1329: reuses the Harrier model and the hybrid ranker from
// notes-semantic-search.js. Vectors are cached by embedding text, so a change
// to an app's name, URL host, or folder re-embeds that app, and removed apps
// are pruned on the next ranking pass. No separate invalidation hooks needed.

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
      if (typeof window.loadNotesSemanticEnabled === 'function') {
        return !!window.loadNotesSemanticEnabled();
      }
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

  // Embeds only texts missing from the cache, in one batch, and prunes
  // entries whose text no longer matches any current app.
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
    const misses = Array.from(wanted).filter(function (text) { return !vectorCache.has(text); });
    if (misses.length === 0) return Promise.resolve();
    return service.embedTexts(misses).then(function (vectors) {
      misses.forEach(function (text, i) {
        const vec = Array.isArray(vectors) ? vectors[i] : null;
        if (Array.isArray(vec) && vec.length > 0) vectorCache.set(text, vec);
      });
    });
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
    const ranker = window.NotesSemanticSearch;
    const q = trimmed(query);
    const docs = buildDocuments(apps, folders);
    const appsById = new Map((Array.isArray(apps) ? apps : [])
      .filter(function (a) { return a && a.id; })
      .map(function (a) { return [a.id, a]; }));
    const nameById = new Map(docs.map(function (d) { return [d.id, displayNameOf(appsById.get(d.id))]; }));
    if (!ranker || typeof ranker.rankNotesForQuery !== 'function') {
      return Promise.resolve([]);
    }
    const keywordOnly = function () {
      return ranker.rankNotesForQuery(docs, q, null).then(function (ranked) {
        return toAppResults(ranked, appsById);
      });
    };
    const service = isSemanticEnabled() ? getLiveService() : null;
    if (!q || !service) return keywordOnly();

    return ensureVectors(docs, service).then(function () {
      const deps = {
        embedQuery: function (text) { return service.embedQuery(text); },
        getNoteVector: function (doc) { return Promise.resolve(vectorCache.get(doc.embedText) || null); }
      };
      return ranker.rankNotesForQuery(docs, q, deps).then(function (ranked) {
        return toAppResults(prioritizeNameMatches(ranked, q, nameById), appsById);
      });
    }).catch(keywordOnly);
  }

  function clearCache() {
    vectorCache.clear();
    cacheModelId = null;
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
