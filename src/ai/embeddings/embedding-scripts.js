// src/ai/embeddings/embedding-scripts.js - shared lazy loader for embedding modules (issue #1186)
//
// src/ui/settings.js and src/features/notes.js both need the embedding
// modules on demand (lazy opt-in, never in the bootstrap bundle). This file
// is the single canonical implementation; both callers delegate to it when
// present and fall back to their local twin only when this file has not been
// loaded (e.g. unit tests that inject a single module in isolation).
//
// Loaded via bootstrap scriptSources before src/ui/settings.js so Settings
// and Notes share one in-flight promise instead of racing duplicate <script>
// tags for the same module.

(function () {
  'use strict';

  const SOURCES = [
    'src/ai/embeddings/embedding-registry.js',
    'src/ai/embeddings/harrier-provider.js',
    'src/ai/embeddings/notes-vector-cache.js',
    'src/ai/embeddings/embedding-service.js',
    'src/ai/embeddings/notes-semantic-search.js'
  ];

  let scriptsPromise = null;

  function scriptsLoaded() {
    try {
      return !!(
        window.EmbeddingRegistry
        && window.HarrierProvider
        && window.NotesVectorCache
        && window.EmbeddingService
        && window.NotesSemanticSearch
      );
    } catch {
      return false;
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      function fail(message) {
        reject(new Error(message || ('Failed to load ' + src)));
      }
      try {
        const existing = document.querySelector('script[data-embeddings-src="' + src + '"]');
        if (existing) {
          // Another caller is already loading this module: wait for ITS
          // load instead of resolving early. Resolving here would recurse
          // schedule->ensure in microtasks and starve the module-execution
          // task forever.
          if (existing.dataset.embeddingsLoaded === 'true') {
            resolve();
            return;
          }
          existing.addEventListener('load', function () { resolve(); });
          existing.addEventListener('error', function () { fail(); });
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.dataset.embeddingsSrc = src;
        script.addEventListener('load', function () {
          script.dataset.embeddingsLoaded = 'true';
          resolve();
        });
        script.addEventListener('error', function () {
          // Remove the dead tag so the next attempt recreates it instead of
          // attaching to a tag that will never fire again.
          if (script.parentNode) {
            try { script.parentNode.removeChild(script); } catch { /* ignore */ }
          }
          fail();
        });
        document.body.appendChild(script);
      } catch (e) {
        reject(e);
      }
    });
  }

  function ensureScripts() {
    if (scriptsLoaded()) return Promise.resolve();
    if (scriptsPromise) return scriptsPromise;
    let chain = Promise.resolve();
    SOURCES.forEach(function (src) {
      chain = chain.then(function () { return loadScript(src); });
    });
    // A classic script fires load even when it throws during evaluation,
    // so verify registration before caching success. A failed check clears
    // the cached promise so the next caller retries instead of reusing an
    // unusable loader.
    scriptsPromise = chain.then(function () {
      if (!scriptsLoaded()) {
        throw new Error('Embedding modules failed to register globals');
      }
    }).catch(function (err) {
      scriptsPromise = null;
      throw err;
    });
    return scriptsPromise;
  }

  const api = {
    SOURCES: SOURCES,
    scriptsLoaded: scriptsLoaded,
    loadScript: loadScript,
    ensureScripts: ensureScripts
  };

  try {
    window.EmbeddingScripts = api;
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
