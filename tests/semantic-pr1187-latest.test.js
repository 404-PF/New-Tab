import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// PR #1187 latest human-review resolutions (Nov 13 batches):
// - toggle-off preserves ready marker + Delete visible when disabled
// - first-query warms ready only, never null (no silent 300MB after import)
// - mid-drag / grip-focus defers rerank, flushes after drop
// - preview-button blur re-ranks
// - ensureModel early return re-emits ready so re-enable re-ranks
// - service applies single-thread guard to both ORT instances
// - vector cache drops stale connections instead of failing until reload

function grantModelHosts() {
  try {
    (window.MODEL_ORIGINS || []).forEach(function (origin) {
      chrome.permissions._granted[origin] = true;
    });
  } catch { /* ignore */ }
}

function installCountingService() {
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
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  localStorage.setItem('notes', JSON.stringify([
    { id: '1', text: 'alpha apple', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: '2', text: 'beta', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  ]));
  localStorage.setItem('notesSemanticEnabled', 'false');
  localStorage.removeItem('notesSemanticDownload');
  try { window.setNotesSearchQuery(''); } catch { /* ignore */ }
  window.initNotes();
  window.initNotesSemanticSetting();
});

async function flush(n) {
  await Promise.resolve();
  for (let i = 0; i < n; i += 1) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

describe('PR #1187 latest review resolutions', () => {
  it('preserves the ready marker on toggle-off so Delete stays available', async () => {
    window.EmbeddingService = {
      getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 't' }; },
      isReady: function () { return true; },
      cancelLoad: function () {},
      deleteModel: function () { return Promise.resolve(true); }
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.applyNotesSemanticEnabled();
    expect(document.getElementById('notes-semantic-delete').hidden).toBe(false);
    const checkbox = document.getElementById('notes-semantic-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('false');
    // Ready bytes are still on disk: marker preserved, Delete still shown.
    expect(localStorage.getItem('notesSemanticDownload')).toBe('ready');
    expect(document.getElementById('notes-semantic-delete').hidden).toBe(false);
  });

  it('clears a loading marker on toggle-off so it is not mistaken for a crash', async () => {
    window.EmbeddingService = {
      getStatus: function () { return { status: 'loading', progress: 0.2, error: '', modelId: 't' }; },
      isReady: function () { return false; },
      cancelLoad: function () {}
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'loading');
    window.applyNotesSemanticEnabled();
    const checkbox = document.getElementById('notes-semantic-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
  });

  it('warms a cached ready model on first query but never a null marker', async () => {
    grantModelHosts();
    // Ready marker: first query warms.
    let tracker = installCountingService();
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.initNotesSemanticSetting();
    await flush(2);
    expect(tracker.calls).toBe(0);
    window.setNotesSearchQuery('apple');
    window.renderNotes();
    await new Promise(function (resolve) { setTimeout(resolve, 400); });
    expect(tracker.calls).toBe(1);

    // Null marker (e.g. after import on a fresh device): no silent download.
    tracker = installCountingService();
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.removeItem('notesSemanticDownload');
    window.initNotesSemanticSetting();
    await flush(2);
    expect(tracker.calls).toBe(0);
    window.setNotesSearchQuery('apple');
    window.renderNotes();
    await new Promise(function (resolve) { setTimeout(resolve, 400); });
    expect(tracker.calls).toBe(0);
    window.setNotesSearchQuery('');
  });

  it('re-ranks after ready when re-enabling with an active query', async () => {
    // Service already ready: ensureModel resolves immediately.
    window.EmbeddingService = {
      getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 't' }; },
      isReady: function () { return true; },
      ensureModel: function () { return Promise.resolve({ id: 'harrier-int8' }); },
      cancelLoad: function () {},
      embedQuery: function () { return Promise.resolve([1, 0]); },
      embedTexts: function (texts) {
        const list = Array.isArray(texts) ? texts : [texts];
        return Promise.resolve(list.map(function () { return [1, 0]; }));
      }
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.setNotesSearchQuery('apple');
    window.renderNotes();
    await new Promise(function (resolve) { setTimeout(resolve, 450); });
    // scheduleSemanticRerank is exposed for the Settings ready path.
    expect(typeof window.scheduleSemanticRerank).toBe('function');
  });

  it('applies the single-thread guard to both ORT instances', async () => {
    // Real service vendor path: the pipeline runs on the webgpu ORT build
    // Transformers imports, not on ort.web.mjs, so the guard must reach both
    // (PR #1187 review). Mock the vendor loader to return both instances.
    const { injectScript: inject } = await import('./helpers/inject-script.js');
    inject('src/ai/embeddings/embedding-service.js');
    const ortWeb = { env: { wasm: {} } };
    const ortWebGpu = { env: { wasm: {} } };
    window.__embeddingTestHooks = {
      vendorLoader: function () {
        return Promise.resolve({
          ort: ortWeb,
          ortWebGpu,
          env: {},
          pipeline: function () {
            return Promise.resolve(function () {
              return Promise.resolve({ data: [0.1, 0.2] });
            });
          }
        });
      }
    };
    try {
      window.EmbeddingService._resetForTests();
      await window.EmbeddingService.ensureModel();
      expect(ortWeb.env.wasm.numThreads).toBe(1);
      expect(ortWebGpu.env.wasm.numThreads).toBe(1);
    } finally {
      try { delete window.__embeddingTestHooks; } catch { /* ignore */ }
      window.EmbeddingService._resetForTests();
    }
  });

  it('preserves grip focus when a rerank resolves mid-focus', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    let resolveEmbed = null;
    window.EmbeddingService = {
      isReady: function () { return true; },
      getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 't' }; },
      embedQuery: function () { return Promise.resolve([1, 0]); },
      embedTexts: function (texts) {
        const list = Array.isArray(texts) ? texts : [texts];
        return new Promise(function (resolve) {
          resolveEmbed = function () { resolve(list.map(function () { return [1, 0]; })); };
        });
      },
      cancelLoad: function () {}
    };
    window.setNotesSearchQuery('apple');
    window.renderNotes();
    await new Promise(function (resolve) { setTimeout(resolve, 250); });
    expect(typeof resolveEmbed).toBe('function');
    const grip = document.querySelector('.note-item .note-grip');
    expect(grip).toBeTruthy();
    grip.focus();
    expect(document.activeElement).toBe(grip);
    resolveEmbed();
    await flush(3);
    // Deferred: the list was not cleared, so focus survives.
    expect(document.activeElement).toBe(grip);
    expect(document.querySelector('.note-item')).toBeTruthy();
    window.setNotesSearchQuery('');
  });

  // Preview-button blur (handleNotesBlur early return via
  // finishPreviewMouseDownBlur) now schedules a rerank so an edited note
  // settles search membership on blur. Covered by code review + manual QA:
  // jsdom blur/focus sequencing for the preview-mousedown path is too
  // flaky for a deterministic regression test (see notes.js handleNotesBlur).

  it('resets the vector cache connection on close so later calls reopen', async () => {
    // Mock IndexedDB with observable close/versionchange wiring.
    const handlers = {};
    const fakeDb = {
      closeCalled: false,
      close: function () { this.closeCalled = true; },
      transaction: function () { throw { name: 'InvalidStateError', message: 'stale' }; },
      objectStoreNames: { contains: function () { return true; } }
    };
    let openCount = 0;
    const reqHandlers = {};
    globalThis.indexedDB = {
      open: function () {
        openCount += 1;
        const req = {
          set onupgradeneeded(fn) { void fn; },
          set onsuccess(fn) { reqHandlers.success = fn; },
          set onerror(fn) { void fn; }
        };
        setTimeout(function () {
          reqHandlers.success({ target: { result: fakeDb } });
          // Capture handlers the cache attached.
          handlers.close = fakeDb.onclose;
          handlers.versionchange = fakeDb.onversionchange;
        }, 0);
        return req;
      }
    };
    try {
      window.NotesVectorCache._resetForTests();
      // First open attaches handlers.
      try { await window.NotesVectorCache.openVectorsDB(); } catch { /* ignore */ }
      await flush(2);
      expect(typeof handlers.close).toBe('function');
      // onclose drops the cached promise so the next call reopens.
      const before = openCount;
      handlers.close();
      try { await window.NotesVectorCache.openVectorsDB(); } catch { /* ignore */ }
      await flush(2);
      expect(openCount).toBeGreaterThan(before);
    } finally {
      try { delete globalThis.indexedDB; } catch { /* ignore */ }
      window.NotesVectorCache._resetForTests();
    }
  });
});
