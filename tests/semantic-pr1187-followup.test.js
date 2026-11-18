import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// PR #1187 follow-up (Nov 16 human review, 4 unresolved threads):
// - updateNoteText skips vector purge when text is unchanged (perf)
// - any focus inside #notes-list blocks semantic re-render (focus safety)
// - resumeSemanticIfNeeded does not relaunch while a load is live
// - vendor/README names the pinned nightly ORT (docs-only, no test)

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
  try { delete window.EmbeddingScripts; } catch { /* ignore */ }
  localStorage.setItem('notes', JSON.stringify([
    { id: '1', text: 'hello world', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: '2', text: 'second note', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  ]));
  localStorage.setItem('notesSemanticEnabled', 'false');
  localStorage.removeItem('notesSemanticDownload');
  try { window.setNotesSearchQuery(''); } catch { /* ignore */ }
  window.initNotes();
  window.initNotesSemanticSetting();
});

afterEach(() => {
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  try { delete window.EmbeddingScripts; } catch { /* ignore */ }
});

async function flush(n) {
  await Promise.resolve();
  for (let i = 0; i < n; i += 1) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

describe('PR #1187 Nov 16 follow-ups', () => {
  it('does not purge vectors when the text is unchanged', async () => {
    // Vectors only exist with a download marker; without it the purge is
    // already skipped. Use a ready marker so the guard under test is the
    // text-equality early return, not the marker check.
    localStorage.setItem('notesSemanticDownload', 'ready');
    let purgeCalls = 0;
    const original = window.NotesVectorCache.deleteCachedVectorsForNote;
    window.NotesVectorCache.deleteCachedVectorsForNote = function () {
      purgeCalls += 1;
      return Promise.resolve(true);
    };
    try {
      const before = localStorage.getItem('notes');
      window.updateNoteText('1', 'hello world');
      await flush(1);
      expect(purgeCalls).toBe(0);
      expect(localStorage.getItem('notes')).toBe(before);

      window.updateNoteText('1', 'hello world edited');
      await flush(1);
      expect(purgeCalls).toBe(1);
    } finally {
      window.NotesVectorCache.deleteCachedVectorsForNote = original;
    }
  });

  it('defers a rerank while a card button holds focus', async () => {
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
    window.setNotesSearchQuery('hello');
    window.renderNotes();
    await new Promise(function (resolve) { setTimeout(resolve, 250); });
    expect(typeof resolveEmbed).toBe('function');
    const previewBtn = document.querySelector('.note-item .note-preview-btn');
    expect(previewBtn).toBeTruthy();
    previewBtn.focus();
    expect(document.activeElement).toBe(previewBtn);
    resolveEmbed();
    await flush(3);
    // Deferred: the list was not cleared, so button focus survives.
    expect(document.activeElement).toBe(previewBtn);
    expect(document.querySelector('.note-item')).toBeTruthy();
    window.setNotesSearchQuery('');
  });

  it('does not relaunch a passive resume while a load is live', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'loading');
    window.EmbeddingService = {
      isReady: function () { return false; },
      getStatus: function () { return { status: 'loading', progress: 0.3, error: '', modelId: 't' }; },
      ensureModel: function () { return Promise.resolve({ id: 'harrier-int8' }); },
      cancelLoad: function () {}
    };
    // Ensure any stray passive from a previous test settled.
    for (let i = 0; i < 50 && window.__semanticResumeInFlight && window.__semanticResumeInFlight(); i += 1) {
      await new Promise(function (resolve) { setTimeout(resolve, 10); });
    }
    window.resumeSemanticIfNeeded();
    // No passive launch: the in-flight flag stays down synchronously.
    expect(window.__semanticResumeInFlight()).toBe(false);
  });
});
