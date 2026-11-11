// src/ai/embeddings/embedding-service.js - Lazy on-device embedding loader
// Issue #1186: model (~270-300MB INT8) downloads only after the user enables
// semantic search. Never in the scriptSources bootstrap path; loaded here on
// demand via a type="module" vendor loader (Transformers.js is ESM-only).
// ORT runs with numThreads:1 (no cross-origin isolation in MV3).

(function () {
  'use strict';

  const SEMANTIC_ENABLED_KEY = 'notesSemanticEnabled';
  const VENDOR_LOADER_SRC = 'vendor/embedding-loader.mjs';
  // Local files load in ms; the model download (minutes) reports through
  // progress_callback instead, so this only guards a broken vendor/ setup.
  const VENDOR_LOAD_TIMEOUT_MS = 20000;
  const TRANSFORMERS_CACHE_NAME = 'transformers-cache';

  let status = 'idle';
  let progress = 0;
  let errorMessage = '';
  let loadPromise = null;
  // Generation token: cancelLoad() invalidates the in-flight chain so its
  // late settlement cannot clear a newer loadPromise (cancel → re-enable).
  let loadGeneration = 0;
  let abortController = null;
  let loaderScript = null;
  let liveProvider = null;
  let progressListeners = [];

  function getHarrierConsts() {
    try {
      if (window.HarrierProvider) {
        return {
          modelId: window.HarrierProvider.HARRIER_MODEL_ID,
          providerId: window.HarrierProvider.HARRIER_PROVIDER_ID,
          dims: window.HarrierProvider.HARRIER_DIMS,
          maxTokens: window.HarrierProvider.HARRIER_MAX_TOKENS
        };
      }
    } catch { /* ignore */ }
    return {
      modelId: 'onnx-community/harrier-oss-v1-270m-ONNX',
      providerId: 'harrier-int8',
      dims: 640,
      maxTokens: 512
    };
  }

  function isSemanticEnabled() {
    try {
      return localStorage.getItem(SEMANTIC_ENABLED_KEY) === 'true';
    } catch (e) {
      console.warn('Failed to read semantic search flag:', e);
      return false;
    }
  }

  function getStatus() {
    return { status, progress, error: errorMessage, modelId: getHarrierConsts().modelId };
  }

  function isReady() {
    return status === 'ready' && !!liveProvider;
  }

  function dispatchStatus() {
    const snapshot = getStatus();
    progressListeners.forEach(function (fn) {
      try { fn(snapshot); } catch { /* ignore listener errors */ }
    });
    try {
      if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
        document.dispatchEvent(new CustomEvent('embedding-status', { detail: snapshot }));
      }
    } catch { /* ignore */ }
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('embedding-status', { detail: snapshot }));
      }
    } catch { /* ignore */ }
  }

  function onStatusChange(fn) {
    if (typeof fn !== 'function') return function () {};
    progressListeners.push(fn);
    return function () {
      progressListeners = progressListeners.filter(function (f) { return f !== fn; });
    };
  }

  function setState(next, nextProgress, nextError) {
    status = next;
    if (typeof nextProgress === 'number') {
      progress = Math.min(1, Math.max(0, nextProgress));
    }
    errorMessage = typeof nextError === 'string' ? nextError : '';
    dispatchStatus();
  }

  function getTestHooks() {
    try {
      return window.__embeddingTestHooks || null;
    } catch {
      return null;
    }
  }

  function removeLoaderScript() {
    if (loaderScript && loaderScript.parentNode) {
      try { loaderScript.parentNode.removeChild(loaderScript); } catch { /* ignore */ }
    }
    loaderScript = null;
  }

  // Classic scripts cannot use static import (ESM-only vendor). The vendored
  // loader is a real .mjs file (CSP-safe: script-src 'self', no inline code)
  // that sets window.__embeddingVendor = { pipeline, env, ort }.
  function vendorFileURL(path) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(path);
      }
    } catch { /* fall through to relative path */ }
    return path;
  }

  // Fail fast when the vendor runtime was never populated (e.g. a release
  // packaged without running backgrounds/tools/vendor-embeddings.js) instead
  // of hanging until the load timeout. Skipped when test hooks take over.
  // A thrown fetch error is environmental (not a 404), so loading proceeds
  // and the script onerror/timeout paths still report.
  function checkVendorPresent() {
    if (getTestHooks()) return Promise.resolve(true);
    let doFetch = null;
    try {
      doFetch = typeof fetch === 'function' ? fetch : null;
    } catch { doFetch = null; }
    if (!doFetch) return Promise.resolve(true);
    const urls = [
      vendorFileURL('vendor/transformers/transformers.js'),
      vendorFileURL('vendor/onnxruntime-web/ort.web.mjs')
    ];
    return Promise.all(urls.map(function (url) {
      // Tri-state: ok → present; 404 → missing; anything else (405 for HEAD,
      // 5xx, or a thrown fetch error) → unknown, let the script-tag load
      // attempt decide via its own onerror/timeout paths.
      return doFetch(url, { method: 'HEAD' }).then(function (res) {
        if (res && res.ok) return true;
        if (res && res.status === 404) return false;
        return null;
      }, function () { return null; });
    })).then(function (results) {
      if (results.indexOf(false) !== -1) {
        throw new Error(
          'Embedding runtime missing under vendor/ (run: node backgrounds/tools/vendor-embeddings.js)'
        );
      }
      return true;
    });
  }

  function getCachedVendor() {
    try {
      if (window.__embeddingVendor && window.__embeddingVendor.pipeline) {
        return window.__embeddingVendor;
      }
    } catch { /* ignore */ }
    return null;
  }

  function loadVendorModule(signal) {
    const hooks = getTestHooks();
    if (hooks && typeof hooks.vendorLoader === 'function') {
      return hooks.vendorLoader(signal);
    }
    const cached = getCachedVendor();
    if (cached) return Promise.resolve(cached);

    return checkVendorPresent().then(function () {
      return new Promise(function (resolve, reject) {
      let settled = false;
      let timeoutId = null;
      let pollId = null;

      function cleanup() {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (pollId) { clearInterval(pollId); pollId = null; }
        try {
          document.removeEventListener('embedding-vendor-loaded', onVendorLoaded);
        } catch { /* ignore */ }
        if (signal && typeof signal.removeEventListener === 'function') {
          try { signal.removeEventListener('abort', onAbort); } catch { /* ignore */ }
        }
      }

      function settleResolve(vendor) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(vendor);
      }

      function settleReject(err) {
        if (settled) return;
        settled = true;
        cleanup();
        removeLoaderScript();
        reject(err);
      }

      function onAbort() {
        const err = new Error('Embedding load cancelled');
        err.name = 'AbortError';
        settleReject(err);
      }

      function onVendorLoaded() {
        try {
          if (window.__embeddingVendor && window.__embeddingVendor.pipeline) {
            settleResolve(window.__embeddingVendor);
          }
        } catch { /* ignore */ }
      }

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        if (typeof signal.addEventListener === 'function') {
          try { signal.addEventListener('abort', onAbort); } catch { /* ignore */ }
        }
      }

      timeoutId = setTimeout(function () {
        settleReject(new Error('Timed out loading embedding runtime (vendor/)'));
      }, VENDOR_LOAD_TIMEOUT_MS);

      pollId = setInterval(function () {
        try {
          if (window.__embeddingVendor && window.__embeddingVendor.pipeline) {
            settleResolve(window.__embeddingVendor);
          }
        } catch { /* ignore */ }
      }, 100);

      try {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          settleReject(new Error('DOM unavailable for module load'));
          return;
        }
        // Fast path: the loader module announces itself when done; the
        // poll above is only a backup for stray event loss.
        try {
          document.addEventListener('embedding-vendor-loaded', onVendorLoaded);
        } catch { /* ignore */ }
        const script = document.createElement('script');
        script.type = 'module';
        script.src = VENDOR_LOADER_SRC;
        script.onload = function () {
          // onload can fire before the module finishes executing; the
          // event listener / poll resolves once globals land.
          onVendorLoaded();
        };
        script.onerror = function () {
          settleReject(new Error('Failed to load ' + VENDOR_LOADER_SRC + ' (run vendor population step)'));
        };
        loaderScript = script;
        document.body.appendChild(script);
      } catch (e) {
        settleReject(e);
      }
      });
    });
  }

  function makeProgressCallback(onProgress, generation) {
    const fileProgress = new Map();
    let aggregateProgress = null;
    return function (info) {
      // Stale chain (cancel → re-enable): abort the pipeline via the progress
      // hook so a cancelled download does not keep fetching in the
      // background. Transformers.js treats a throw in progress_callback as a
      // failure, which surfaces as AbortError and is ignored via generation.
      if (typeof generation === 'number' && loadGeneration !== generation) {
        const cancelErr = new Error('Embedding load cancelled');
        cancelErr.name = 'AbortError';
        throw cancelErr;
      }
      try {
        // Transformers.js reports progress as a 0-100 percentage. The
        // aggregate `progress_total` event already accounts for every file,
        // so prefer it outright and only average per-file progress while no
        // aggregate value has arrived yet.
        if (info && info.status === 'progress_total' && typeof info.progress === 'number') {
          aggregateProgress = Math.min(1, Math.max(0, info.progress / 100));
        } else if (info && typeof info.file === 'string' && typeof info.progress === 'number') {
          fileProgress.set(info.file, Math.min(1, Math.max(0, info.progress / 100)));
        } else if (info && typeof info.progress === 'number') {
          aggregateProgress = Math.min(1, Math.max(0, info.progress / 100));
        }
        let overall;
        if (aggregateProgress !== null) {
          overall = aggregateProgress;
        } else if (fileProgress.size > 0) {
          let sum = 0;
          fileProgress.forEach(function (v) { sum += v; });
          overall = sum / fileProgress.size;
        } else {
          overall = 0;
        }
        setState('loading', overall);
        if (typeof onProgress === 'function') {
          try { onProgress(overall, info); } catch { /* ignore */ }
        }
      } catch { /* ignore progress errors */ }
    };
  }

  function buildPipelineFactory(extractor) {
    const maxTokens = getHarrierConsts().maxTokens;

    // Exact pre-truncation to the model's token budget. The pipeline itself
    // truncates at model_max_length, but that can exceed our 512 budget and
    // wastes WASM compute on 1000-token notes. Each text goes through its
    // OWN extractor call (never one batched call): with padding enabled, a
    // batched call right-pads short sequences and last_token pooling would
    // read pad embeddings for every note but the longest.
    function truncateText(text) {
      const input = String(text || '');
      try {
        const tokenizer = extractor && extractor.tokenizer;
        if (tokenizer && typeof tokenizer.encode === 'function') {
          const rawIds = tokenizer.encode(input);
          const ids = Array.isArray(rawIds) ? rawIds : [];
          const truncated = window.HarrierProvider && typeof window.HarrierProvider.truncateTokenIds === 'function'
            ? window.HarrierProvider.truncateTokenIds(ids, maxTokens)
            : ids.slice(0, maxTokens);
          if (truncated.length >= ids.length) return input;
          if (typeof tokenizer.decode === 'function') {
            return tokenizer.decode(truncated, { skip_special_tokens: true });
          }
          // Tokenizer without decode: cap by characters instead of passing
          // the full text through (which would silently exceed the budget).
          return input.slice(0, maxTokens * 4);
        }
      } catch { /* fall through to the heuristic cap */ }
      // No tokenizer (should not happen with a real pipeline): ~4 chars per
      // token keeps even CJK-heavy text near the budget.
      return input.slice(0, maxTokens * 4);
    }

    return function (docs) {
      const list = Array.isArray(docs) ? docs : [docs];
      const jobs = list.map(function (text) {
        let result;
        try {
          result = extractor(truncateText(text), {
            pooling: 'last_token',
            normalize: true
          });
        } catch (e) {
          return Promise.reject(e);
        }
        return Promise.resolve(result).then(function (output) {
          if (output && Array.isArray(output.data)) return Array.from(output.data);
          if (output && output.data && typeof output.data.length === 'number') {
            return Array.from(output.data);
          }
          if (Array.isArray(output)) return output.slice();
          if (output && Array.isArray(output.tolist)) return output.tolist();
          return [];
        });
      });
      return Promise.all(jobs);
    };
  }

  // Publishes the live implementation to the generic registry, replacing
  // any metadata stub: registry consumers must get working embed/embedQuery,
  // not a forever-rejecting placeholder.
  function publishLiveProvider(provider) {
    try {
      const registry = window.EmbeddingRegistry;
      if (!registry) return;
      if (typeof registry.replaceEmbeddingProvider === 'function') {
        registry.replaceEmbeddingProvider(provider);
      } else if (typeof registry.registerEmbeddingProvider === 'function'
        && typeof registry.getEmbeddingProvider === 'function'
        && !registry.getEmbeddingProvider(provider.id)) {
        registry.registerEmbeddingProvider(provider);
      }
      if (typeof registry.setActiveEmbeddingProvider === 'function') {
        registry.setActiveEmbeddingProvider(provider.id);
      }
    } catch { /* ignore */ }
  }

  function ensureModel(options) {
    const opts = options || {};
    if (status === 'ready' && liveProvider) {
      return Promise.resolve(liveProvider);
    }
    if (loadPromise) return loadPromise;
    const generation = ++loadGeneration;

    const hooks = getTestHooks();
    abortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const signal = (opts.signal) || (abortController && abortController.signal) || null;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    setState('loading', 0);

    // Test path: injected factory, no vendor download, no DOM needed.
    if (hooks && typeof hooks.pipelineFactory === 'function') {
      loadPromise = Promise.resolve().then(function () {
        if (signal && signal.aborted) {
          const err = new Error('Embedding load cancelled');
          err.name = 'AbortError';
          throw err;
        }
        let provider;
        try {
          provider = window.HarrierProvider
            ? window.HarrierProvider.createHarrierProvider(hooks.pipelineFactory)
            : null;
        } catch {
          provider = null;
        }
        if (!provider && hooks.pipelineFactory) {
          provider = {
            id: getHarrierConsts().providerId,
            label: 'Harrier 270M INT8',
            modelId: getHarrierConsts().modelId,
            dims: getHarrierConsts().dims,
            maxTokens: getHarrierConsts().maxTokens,
            embed: hooks.pipelineFactory,
            embedQuery: function (text) {
              return hooks.pipelineFactory([text], { isQuery: true }).then(function (v) {
                return Array.isArray(v) ? v[0] || [] : [];
              });
            }
          };
        }
        liveProvider = provider;
        publishLiveProvider(provider);
        setState('ready', 1);
        return liveProvider;
      }).catch(function (err) {
        // Stale chain (cancel → re-enable): leave shared state alone.
        if (loadGeneration !== generation) throw err;
        loadPromise = null;
        if (err && err.name === 'AbortError') {
          setState('idle', 0);
        } else {
          setState('error', progress, (err && err.message) || String(err));
        }
        throw err;
      });
      return loadPromise;
    }

    loadPromise = loadVendorModule(signal).then(function (vendor) {
      if (signal && signal.aborted) {
        const err = new Error('Embedding load cancelled');
        err.name = 'AbortError';
        throw err;
      }
      // MV3 has no cross-origin isolation: ORT must stay single-threaded.
      try {
        if (vendor.ort && vendor.ort.env && vendor.ort.env.wasm) {
          vendor.ort.env.wasm.numThreads = 1;
        }
      } catch { /* ignore */ }
      try {
        if (vendor.env) {
          vendor.env.allowLocalModels = false;
        }
      } catch { /* ignore */ }

      const consts = getHarrierConsts();
      const progressCallback = makeProgressCallback(onProgress, generation);
      return vendor.pipeline('feature-extraction', consts.modelId, {
        dtype: 'int8',
        device: 'wasm',
        progress_callback: progressCallback
      }).then(function (extractor) {
        if (signal && signal.aborted) {
          const err = new Error('Embedding load cancelled');
          err.name = 'AbortError';
          throw err;
        }
        const factory = buildPipelineFactory(extractor);
        let provider;
        try {
          provider = window.HarrierProvider
            ? window.HarrierProvider.createHarrierProvider(factory)
            : null;
        } catch {
          provider = null;
        }
        if (!provider) {
          throw new Error('Harrier provider unavailable');
        }
        liveProvider = provider;
        publishLiveProvider(provider);
        setState('ready', 1);
        return liveProvider;
      });
    }).catch(function (err) {
      // Stale chain (cancel → re-enable): leave shared state alone.
      if (loadGeneration !== generation) throw err;
      loadPromise = null;
      if (err && err.name === 'AbortError') {
        setState('idle', 0);
      } else {
        console.warn('Failed to load embedding model:', err);
        setState('error', progress, (err && err.message) || String(err));
      }
      throw err;
    });

    return loadPromise;
  }

  function cancelLoad() {
    // Invalidate the in-flight chain first: its late rejection must not
    // clear a loadPromise created by an immediate re-enable (see ensureModel).
    loadGeneration += 1;
    try {
      if (abortController && typeof abortController.abort === 'function') {
        abortController.abort();
      }
    } catch { /* ignore */ }
    abortController = null;
    removeLoaderScript();
    if (status === 'loading') {
      loadPromise = null;
      setState('idle', 0);
    }
  }

  function deleteModel() {
    cancelLoad();
    liveProvider = null;
    loadPromise = null;
    const consts = getHarrierConsts();
    let vectorClearFn = null;
    try {
      if (window.NotesVectorCache && typeof window.NotesVectorCache.clearCachedVectors === 'function') {
        vectorClearFn = window.NotesVectorCache.clearCachedVectors;
      }
    } catch { vectorClearFn = null; }
    // Wrap the call so a synchronous throw becomes a rejection instead of
    // escaping deleteModel synchronously (no try/catch return, per S4822).
    const clearVectors = vectorClearFn
      ? new Promise(function (resolve) { resolve(vectorClearFn.call(window.NotesVectorCache, consts.modelId)); })
      : Promise.resolve(true);
    let cacheDeleteFn = null;
    try {
      if (typeof caches !== 'undefined' && caches && typeof caches.delete === 'function') {
        cacheDeleteFn = caches.delete.bind(caches, TRANSFORMERS_CACHE_NAME);
      }
    } catch { cacheDeleteFn = null; }
    // caches.delete resolves false when absent (success) and only rejects
    // on failure; normalize absent to true so a missing cache does not
    // report a failed delete. Same sync-throw guard as above.
    const clearCache = cacheDeleteFn
      ? new Promise(function (resolve) { resolve(cacheDeleteFn()); }).then(function () { return true; }).catch(function () { return false; })
      : Promise.resolve(true);
    return Promise.all([clearVectors, clearCache]).then(function (results) {
      // Preserve window.__embeddingVendor: the browser module map caches
      // vendor/embedding-loader.mjs, so a re-injected script with the same
      // URL never re-runs and the next enable would wait for the load
      // timeout. The bridge is stateless, so keeping it is safe.
      const ok = results[0] !== false && results[1] !== false;
      setState('idle', 0);
      return ok;
    });
  }

  function embedTexts(texts) {
    if (!isReady() || !liveProvider) {
      return Promise.reject(new Error('Embedding model not ready'));
    }
    try {
      return liveProvider.embed(texts);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function embedQuery(text) {
    if (!isReady() || !liveProvider) {
      return Promise.reject(new Error('Embedding model not ready'));
    }
    try {
      if (typeof liveProvider.embedQuery === 'function') {
        return liveProvider.embedQuery(text);
      }
      return liveProvider.embed([text]).then(function (vectors) {
        return Array.isArray(vectors) ? vectors[0] || [] : [];
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function _resetForTests() {
    cancelLoad();
    loadGeneration += 1;
    liveProvider = null;
    progressListeners = [];
    loadPromise = null;
    abortController = null;
    status = 'idle';
    progress = 0;
    errorMessage = '';
    try {
      if (window.__embeddingVendor) {
        window.__embeddingVendor = undefined;
      }
    } catch { /* ignore */ }
  }

  const api = {
    SEMANTIC_ENABLED_KEY,
    VENDOR_LOADER_SRC,
    isSemanticEnabled,
    getStatus,
    isReady,
    onStatusChange,
    ensureModel,
    cancelLoad,
    deleteModel,
    embedTexts,
    embedQuery,
    _resetForTests
  };

  try {
    window.EmbeddingService = api;
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
