import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// PR #1187 human-review follow-ups: MODEL_ORIGINS coverage, page-load double
// resume guard, and shared embedding loader delegation.

function installMockService() {
  window.EmbeddingService = {
    _state: { status: 'idle', progress: 0, error: '', modelId: 'test-model' },
    ensureModelCalls: 0,
    getStatus: function () { return { ...this._state }; },
    isReady: function () { return this._state.status === 'ready'; },
    ensureModel: function () {
      this.ensureModelCalls += 1;
      this._state = { status: 'ready', progress: 1, error: '', modelId: 'test-model' };
      document.dispatchEvent(new CustomEvent('embedding-status'));
      return Promise.resolve({ id: 'harrier-int8' });
    },
    cancelLoad: function () {
      this._state = { status: 'idle', progress: 0, error: '', modelId: 'test-model' };
      document.dispatchEvent(new CustomEvent('embedding-status'));
    }
  };
}

function patternCovers(pattern, host) {
  // Minimal chrome match-pattern check for the https://host/* and
  // https://*.host/* forms used by MODEL_ORIGINS.
  if (typeof pattern !== 'string' || !pattern.startsWith('https://') || !pattern.endsWith('/*')) {
    return false;
  }
  const hostPart = pattern.slice('https://'.length, -'/*'.length);
  if (hostPart.startsWith('*.')) {
    const suffix = hostPart.slice(1);
    return host === hostPart.slice(2) || host.endsWith(suffix);
  }
  return host === hostPart;
}

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ai/embeddings/embedding-scripts.js');
  injectScript('src/ai/embeddings/embedding-registry.js');
  injectScript('src/ai/embeddings/harrier-provider.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/embedding-service.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
});

beforeEach(() => {
  localStorage.clear();
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  window.initNotesSemanticSetting();
});

describe('PR #1187 review follow-ups', () => {
  it('exposes a shared embedding loader both callers can delegate to', () => {
    expect(window.EmbeddingScripts).toBeTruthy();
    expect(typeof window.EmbeddingScripts.ensureScripts).toBe('function');
    expect(window.EmbeddingScripts.SOURCES).toEqual([
      'src/ai/embeddings/embedding-registry.js',
      'src/ai/embeddings/harrier-provider.js',
      'src/ai/embeddings/notes-vector-cache.js',
      'src/ai/embeddings/embedding-service.js',
      'src/ai/embeddings/notes-semantic-search.js'
    ]);
  });

  it('MODEL_ORIGINS covers the Hub API and its weight CDN hosts', () => {
    const origins = window.MODEL_ORIGINS;
    expect(Array.isArray(origins)).toBe(true);
    const hosts = [
      'huggingface.co',
      'hf.co',
      // LFS weight shards.
      'cdn-lfs.huggingface.co',
      'cdn-lfs.hf.co',
      // Xet CAS bridge + static mirrors (multi-level subdomains).
      'cas-bridge.xethub.huggingface.co',
      'cdn.static.huggingface.co'
    ];
    hosts.forEach(function (host) {
      expect(
        origins.some(function (pattern) { return patternCovers(pattern, host); }),
        'expected MODEL_ORIGINS to cover ' + host
      ).toBe(true);
    });
  });

  it('page-load double init triggers only one passive resume', async () => {
    installMockService();
    // Passive resumes only proceed when the host permission is already
    // granted (no gesture to request with): pre-grant the mocked origins.
    try {
      (window.MODEL_ORIGINS || []).forEach(function (origin) {
        chrome.permissions._granted[origin] = true;
      });
    } catch { /* ignore */ }
    localStorage.setItem('notesSemanticEnabled', 'true');
    // Prime the transient marker as a fresh profile would after import.
    localStorage.setItem('notesSemanticDownload', 'loading');
    // Two back-to-back inits (script evaluation + initSettings) must not
    // start two downloads: the second resume returns via the in-flight flag
    // instead of bumping the generation and orphaning the first chain.
    window.initNotesSemanticSetting();
    window.initNotesSemanticSetting();
    await Promise.resolve();
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    expect(window.EmbeddingService.ensureModelCalls).toBe(1);
  });

  it('delegates settings opt-in and notes load to the shared loader', async () => {
    // Both callers must use window.EmbeddingScripts when present instead of
    // their fallback twins. Simulate absent modules, stub the shared loader,
    // then exercise one settings resume and one notes rerank.
    // Flush any in-flight resume from the previous test (its async clear may
    // still be pending when this test starts).
    await Promise.resolve();
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    if (typeof window.setNotesSearchQuery !== 'function') {
      injectScript('src/features/notes.js');
    }
    const shared = window.EmbeddingScripts;
    expect(shared).toBeTruthy();
    const origEnsure = shared.ensureScripts;
    const origLoaded = shared.scriptsLoaded;
    const saved = {
      registry: window.EmbeddingRegistry,
      harrier: window.HarrierProvider,
      cache: window.NotesVectorCache,
      search: window.NotesSemanticSearch
    };
    let loaded = false;
    let calls = 0;
    shared.scriptsLoaded = function () { return loaded; };
    shared.ensureScripts = function () {
      calls += 1;
      loaded = true;
      return Promise.resolve();
    };
    try {
      try { delete window.EmbeddingRegistry; } catch { /* ignore */ }
      try { delete window.HarrierProvider; } catch { /* ignore */ }
      try { delete window.NotesVectorCache; } catch { /* ignore */ }
      try { delete window.NotesSemanticSearch; } catch { /* ignore */ }
      installMockService();
      try {
        (window.MODEL_ORIGINS || []).forEach(function (origin) {
          chrome.permissions._granted[origin] = true;
        });
      } catch { /* ignore */ }
      localStorage.setItem('notesSemanticEnabled', 'true');
      localStorage.setItem('notesSemanticDownload', 'loading');
      window.initNotesSemanticSetting();
      await Promise.resolve();
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      expect(calls).toBeGreaterThan(0);
      // Notes half: a query with the service not ready still triggers the
      // shared loader via scheduleSemanticRerank (renderNotes path).
      calls = 0;
      loaded = false;
      try { delete window.EmbeddingRegistry; } catch { /* ignore */ }
      try { delete window.HarrierProvider; } catch { /* ignore */ }
      try { delete window.NotesVectorCache; } catch { /* ignore */ }
      try { delete window.NotesSemanticSearch; } catch { /* ignore */ }
      window.setNotesSearchQuery('milk');
      window.renderNotes();
      await Promise.resolve();
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      expect(calls).toBeGreaterThan(0);
    } finally {
      shared.ensureScripts = origEnsure;
      shared.scriptsLoaded = origLoaded;
      if (saved.registry) window.EmbeddingRegistry = saved.registry;
      if (saved.harrier) window.HarrierProvider = saved.harrier;
      if (saved.cache) window.NotesVectorCache = saved.cache;
      if (saved.search) window.NotesSemanticSearch = saved.search;
      window.setNotesSearchQuery('');
    }
  });
});
