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

function installPendingRerankMock(isReadyImpl) {
  const holder = { resolveEmbed: null };
  window.EmbeddingService = {
    isReady: isReadyImpl || function () { return true; },
    getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 'test-model' }; },
    embedQuery: function () { return Promise.resolve([1, 0]); },
    embedTexts: function () {
      return new Promise(function (resolve) { holder.resolveEmbed = resolve; });
    },
    cancelLoad: function () {},
    deleteModel: function () { return Promise.resolve(true); }
  };
  return holder;
}

function installCountingEnsureMock() {
  const state = { calls: 0 };
  window.EmbeddingService = {
    getStatus: function () { return { status: 'idle', progress: 0, error: '', modelId: 'test-model' }; },
    isReady: function () { return false; },
    ensureModel: function () {
      state.calls += 1;
      return Promise.resolve({ id: 'harrier-int8' });
    },
    cancelLoad: function () {}
  };
  return state;
}

async function flushSettings(rounds) {
  await Promise.resolve();
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function startNotesQuery(value) {
  const searchInput = document.getElementById('notes-search');
  searchInput.value = value;
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  return searchInput;
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
  const allBtn = document.querySelector('.note-tag-filter-btn[data-tag=""]');
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
    const pending = installPendingRerankMock(function () {
      return localStorage.getItem('notesSemanticEnabled') === 'true';
    });
    // Keep the status shape of the original test: idle once disabled.
    window.EmbeddingService.getStatus = function () {
      return localStorage.getItem('notesSemanticEnabled') === 'true'
        ? { status: 'ready', progress: 1, error: '', modelId: 'test-model' }
        : { status: 'idle', progress: 0, error: '', modelId: 'test-model' };
    };
    startNotesQuery('feline');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeof pending.resolveEmbed).toBe('function');
    // Disable mid-flight: sync pass shows keyword order (empty for feline).
    localStorage.setItem('notesSemanticEnabled', 'false');
    window.applyNotesSemanticEnabled();
    pending.resolveEmbed([[1, 0], [0.2, 0.2], [0, 1]]);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Stale semantic order must not repaint with the feature off.
    expect(window.isNotesSemanticEnabled()).toBe(false);
    expect(document.querySelector('.notes-semantic-status')?.hidden ?? true).toBe(true);
    // The stale rerank resolves after disable: it must not repaint note
    // cards. The sync keyword pass for 'feline' is empty, so the list stays
    // empty and the empty state is restored (not a blank list, not stale
    // semantic order).
    const shownAfterDisable = [...document.querySelectorAll('.note-item')].map((el) => el.dataset.id);
    expect(shownAfterDisable).toEqual([]);
    expect(document.getElementById('notes-empty').style.display).toBe('block');
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
    const pending = installPendingRerankMock();
    // Filter to pets, start a query, then switch to work mid-flight.
    const petsBtn = [...document.querySelectorAll('.note-tag-filter-btn')].find((b) => b.dataset.tag === 'pets');
    expect(petsBtn).toBeTruthy();
    petsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    startNotesQuery('e');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeof pending.resolveEmbed).toBe('function');
    const workBtn = [...document.querySelectorAll('.note-tag-filter-btn')].find((b) => b.dataset.tag === 'work');
    workBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    pending.resolveEmbed([[1, 0], [0, 1]]);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // renderNotes bumped the generation, so the stale pets-base rerank
    // must not paint pets notes under the work filter.
    const shown = [...document.querySelectorAll('.note-item')].map((el) => el.dataset.id);
    expect(shown).toEqual(['2']);
  });

  it('defers the model load until the first query (no eager resume)', async () => {
    const tracker = installCountingEnsureMock();
    grantModelHosts();
    localStorage.setItem('notesSemanticEnabled', 'true');
    // Previously finished model: page load must NOT warm it.
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.initNotesSemanticSetting();
    await flushSettings(2);
    expect(tracker.calls).toBe(0);
    // Legacy flag without a marker also defers.
    localStorage.removeItem('notesSemanticDownload');
    window.initNotesSemanticSetting();
    await flushSettings(1);
    expect(tracker.calls).toBe(0);
    // An interrupted download still resumes eagerly.
    localStorage.setItem('notesSemanticDownload', 'loading');
    window.initNotesSemanticSetting();
    await flushSettings(3);
    expect(tracker.calls).toBeGreaterThan(0);
  });

  it('starts the deferred model on the first query after page load', async () => {
    const tracker = installCountingEnsureMock();
    grantModelHosts();
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.initNotesSemanticSetting();
    await flushSettings(2);
    expect(tracker.calls).toBe(0);
    // First semantic query warms the deferred model exactly once.
    startNotesQuery('feline');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(tracker.calls).toBe(1);
  });

  it('import primes nothing so no silent download starts', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.removeItem('notesSemanticDownload');
    window.primeNotesSemanticImport();
    expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
    const tracker = installCountingEnsureMock();
    grantModelHosts();
    window.initNotesSemanticSetting();
    await flushSettings(2);
    expect(tracker.calls).toBe(0);
  });
});
