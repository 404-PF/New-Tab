// src/ai/embeddings/embedding-registry.js - Generic embedding provider registry
// Issue #1186: provider layer must be generic so additional models can be
// registered later. Harrier INT8 ships as the default (and initially only)
// entry; future models register through the same interface.

(function () {
  'use strict';

  const ACTIVE_PROVIDER_KEY = 'embeddingProviderId';

  const providers = new Map();
  let activeProviderId = null;

  function isValidProviderDef(def) {
    if (!def || typeof def !== 'object') return false;
    if (typeof def.id !== 'string' || !def.id) return false;
    if (typeof def.label !== 'string' || !def.label) return false;
    if (!Number.isFinite(def.dims) || def.dims <= 0) return false;
    if (!Number.isFinite(def.maxTokens) || def.maxTokens <= 0) return false;
    if (typeof def.embed !== 'function') return false;
    if (def.embedQuery !== undefined && typeof def.embedQuery !== 'function') return false;
    if (def.modelId !== undefined && typeof def.modelId !== 'string') return false;
    return true;
  }

  function readPersistedActiveId() {
    try {
      const raw = localStorage.getItem(ACTIVE_PROVIDER_KEY);
      return typeof raw === 'string' && raw ? raw : null;
    } catch (e) {
      console.warn('Failed to read active embedding provider:', e);
      return null;
    }
  }

  function persistActiveId(id) {
    try {
      localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
      return true;
    } catch (e) {
      console.warn('Failed to persist active embedding provider:', e);
      return false;
    }
  }

  function registerEmbeddingProvider(def) {
    if (!isValidProviderDef(def)) {
      console.warn('Rejected invalid embedding provider definition:', def && def.id);
      return false;
    }
    if (providers.has(def.id)) {
      console.warn('Embedding provider already registered:', def.id);
      return false;
    }
    providers.set(def.id, Object.freeze({ ...def }));
    const persisted = readPersistedActiveId();
    if (persisted && persisted === def.id) {
      activeProviderId = persisted;
    } else if (activeProviderId === null) {
      if (persisted && providers.has(persisted)) {
        activeProviderId = persisted;
      } else {
        activeProviderId = def.id;
      }
    }
    return true;
  }

  function getEmbeddingProvider(id) {
    return providers.get(id) || null;
  }

  function listEmbeddingProviders() {
    return Array.from(providers.values()).map(function (def) {
      return { id: def.id, label: def.label, dims: def.dims, maxTokens: def.maxTokens, modelId: def.modelId || null };
    });
  }

  function setActiveEmbeddingProvider(id) {
    if (!providers.has(id)) return false;
    activeProviderId = id;
    persistActiveId(id);
    return true;
  }

  // Overwrites a metadata stub with a live implementation (or vice versa).
  // The service uses this when the real pipeline finishes loading: the
  // registry may already hold a Harrier stub registered before the ~300MB
  // download, and a duplicate registration would be rejected.
  function replaceEmbeddingProvider(def) {
    if (!isValidProviderDef(def)) {
      console.warn('Rejected invalid embedding provider definition:', def && def.id);
      return false;
    }
    const hadActive = activeProviderId === def.id;
    providers.set(def.id, Object.freeze({ ...def }));
    if (activeProviderId === null || hadActive) {
      activeProviderId = def.id;
      persistActiveId(def.id);
    }
    return true;
  }

  function getActiveEmbeddingProviderId() {
    if (activeProviderId && providers.has(activeProviderId)) return activeProviderId;
    const persisted = readPersistedActiveId();
    if (persisted && providers.has(persisted)) {
      activeProviderId = persisted;
      return activeProviderId;
    }
    const first = providers.keys().next();
    if (!first.done) {
      activeProviderId = first.value;
      return activeProviderId;
    }
    return null;
  }

  function getActiveEmbeddingProvider() {
    const id = getActiveEmbeddingProviderId();
    return id ? providers.get(id) : null;
  }

  function _resetForTests() {
    providers.clear();
    activeProviderId = null;
  }

  const api = {
    registerEmbeddingProvider,
    replaceEmbeddingProvider,
    getEmbeddingProvider,
    listEmbeddingProviders,
    setActiveEmbeddingProvider,
    getActiveEmbeddingProviderId,
    getActiveEmbeddingProvider,
    ACTIVE_PROVIDER_KEY,
    _resetForTests
  };

  try {
    window.EmbeddingRegistry = api;
  } catch {
    // ignore
  }

  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api;
    }
  } catch {
    // browser without module: ignore
  }
})();
