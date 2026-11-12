import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// PR #1187 human-review follow-ups (5 unresolved threads from 404-Page-Found):
// 1. in-flight rerank invalidated on disable/delete
// 2. vector write-back gated on model live
// 3. tag-filter/import bump generation via renderNotes
// 4. passive resume defers ~300MB load to first query
// 5. import does not start a silent download

const SEED = [
  { id: '1', text: 'My cat Whiskers needs vet food', tag: 'pets', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: '2', text: 'Deploy the staging server Friday', tag: 'work', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: '3', text: 'Best dog parks nearby', tag: 'pets', order: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

function setNotes(data) {
  localStorage.setItem('notes', JSON.stringify(data));
}

function grantModelHosts() {
  try {
    (window.MODEL_ORIGINS || []).forEach(function (origin) {
      chrome.permissions._granted[origin] = true;
    });
  } catch { /* ignore */ }
}

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
  injectScript('src/ai/embeddings/embedding-scripts.js');
  injectScript('src/ai/embeddings/embedding-registry.js');
  injectScript('src/ai/embeddings/harrier-provider.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/embedding-service.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
  injectScript('src/features/notes.js');
});

beforeEach(() => {
  localStorage.clear();
  try { delete window.EmbeddingService._testState; } catch { /* ignore */ }
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  setNotes(SEED);
  localStorage.setItem('notesSemanticEnabled', 'false');
  localStorage.removeItem('notesSemanticDownload');
  window.setNotesSearchQuery('');
  const searchInput = document.getElementById('notes-search');
  if (searchInput) searchInput.value = '';
  window.initNotes();
  window.initNotesSemanticSetting();
  const allBtn = document.querySelector('.note-tag-filter-btn[data-tag=\"\"]');
  if (allBtn) allBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  window.setNotesSearchQuery('');
});

afterEach(() => {
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  try { delete globalThis.indexedDB; } catch { /* ignore */ }
});

describe('PR #1187 human-review resolutions', () => {
  it('drops an in-flight rerank when semantic search is turned off', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    let resolveEmbed = null;
    window.EmbeddingService = {
      isReady: function () { return localStorage.getItem('notesSemanticEnabled') === 'true'; },
      getStatus: function () {
        return localStorage.getItem('notesSemanticEnabled') === 'true'
          ? { status: 'ready', progress: 1, error: '', modelId: 'test-model' }
          : { status: 'idle', progress: 0, error: '', modelId: 'test-model' };
      },
      embedQuery: function () { return Promise.resolve([1, 0]); },
      embedTexts: function () {
        return new Promise(function (resolve) { resolveEmbed = resolve; });
      },
      cancelLoad: function () {},
      deleteModel: function () { return Promise.resolve(true); }
    };
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'feline';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeof resolveEmbed).toBe('function');
    // Disable mid-flight: sync pass shows keyword order (empty for feline).
    localStorage.setItem('notesSemanticEnabled', 'false');
    window.applyNotesSemanticEnabled();
    resolveEmbed([[1, 0], [0.2, 0.2], [0, 1]]);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Stale semantic order must not repaint with the feature off.
    expect(window.isNotesSemanticEnabled()).toBe(false);
    expect(document.querySelector('.notes-semantic-status')?.hidden ?? true).toBe(true);
  });

  it('does not write back vectors when the model is no longer ready', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    const putCalls = [];
    const originalPut = window.NotesVectorCache.putCachedVector;
    window.NotesVectorCache.putCachedVector = function (noteId) {
      putCalls.push(String(noteId));
      return originalPut.apply(this, arguments);
    };
    let ready = true;
    window.EmbeddingService = {
      isReady: function () { return ready; },
      getStatus: function () {
        return ready
          ? { status: 'ready', progress: 1, error: '', modelId: 'test-model' }
          : { status: 'idle', progress: 0, error: '', modelId: 'test-model' };
      },
      embedQuery: function () { return Promise.resolve([1, 0]); },
      embedTexts: function (texts) {
        // Simulate Delete racing inference: service goes idle before
        // the write-back guard runs.
        ready = false;
        localStorage.setItem('notesSemanticEnabled', 'false');
        const list = Array.isArray(texts) ? texts : [texts];
        return Promise.resolve(list.map(function () { return [0.5, 0.5]; }));
      }
    };
    try {
      window.setNotesSearchQuery('feline');
      await window.getFilteredNotesRanked();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(putCalls).toEqual([]);
    } finally {
      window.NotesVectorCache.putCachedVector = originalPut;
    }
  });

  it('invalidates a tag-A rerank when the tag filter changes to B', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    let resolveEmbed = null;
    window.EmbeddingService = {
      isReady: function () { return true; },
      getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 'test-model' }; },
      embedQuery: function () { return Promise.resolve([1, 0]); },
      embedTexts: function () {
        return new Promise(function (resolve) { resolveEmbed = resolve; });
      }
    };
    // Filter to pets, start a query, then switch to work mid-flight.
    const petsBtn = [...document.querySelectorAll('.note-tag-filter-btn')].find((b) => b.dataset.tag === 'pets');
    expect(petsBtn).toBeTruthy();
    petsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'e';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeof resolveEmbed).toBe('function');
    const workBtn = [...document.querySelectorAll('.note-tag-filter-btn')].find((b) => b.dataset.tag === 'work');
    workBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    resolveEmbed([[1, 0], [0, 1]]);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // renderNotes bumped the generation, so the stale pets-base rerank
    // must not paint pets notes under the work filter.
    const shown = [...document.querySelectorAll('.note-item')].map((el) => el.dataset.id);
    expect(shown).toEqual(['2']);
  });

  it('defers the model load until the first query (no eager resume)', async () => {
    let calls = 0;
    window.EmbeddingService = {
      getStatus: function () { return { status: 'idle', progress: 0, error: '', modelId: 'test-model' }; },
      isReady: function () { return false; },
      ensureModel: function () {
        calls += 1;
        return Promise.resolve({ id: 'harrier-int8' });
      },
      cancelLoad: function () {}
    };
    grantModelHosts();
    localStorage.setItem('notesSemanticEnabled', 'true');
    // Previously finished model: page load must NOT warm it.
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.initNotesSemanticSetting();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
    // Legacy flag without a marker also defers.
    localStorage.removeItem('notesSemanticDownload');
    window.initNotesSemanticSetting();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
    // An interrupted download still resumes eagerly.
    localStorage.setItem('notesSemanticDownload', 'loading');
    window.initNotesSemanticSetting();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBeGreaterThan(0);
  });

  it('import primes nothing so no silent download starts', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.removeItem('notesSemanticDownload');
    window.primeNotesSemanticImport();
    expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
    let calls = 0;
    window.EmbeddingService = {
      getStatus: function () { return { status: 'idle', progress: 0, error: '', modelId: 'test-model' }; },
      isReady: function () { return false; },
      ensureModel: function () {
        calls += 1;
        return Promise.resolve({ id: 'harrier-int8' });
      },
      cancelLoad: function () {}
    };
    grantModelHosts();
    window.initNotesSemanticSetting();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
  });
});
