import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function setNotes(data) {
  localStorage.setItem('notes', JSON.stringify(data));
}

const SEED = [
  { id: '1', text: 'My cat Whiskers needs vet food', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: '2', text: 'Deploy the staging server Friday', tag: 'work', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: '3', text: 'Best dog parks nearby', tag: '', order: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

// Deterministic mock service: cat-like texts embed as [1,0], dog-like as
// [0,1]; the query 'feline' embeds cat-like so semantic recall finds note 1
// even though it shares no keywords with the query.
function installMockService() {
  window.EmbeddingService = {
    isReady: function () { return true; },
    getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 'test-model' }; },
    embedQuery: function (text) {
      void text;
      return Promise.resolve([1, 0]);
    },
    embedTexts: function (texts) {
      const list = Array.isArray(texts) ? texts : [texts];
      return Promise.resolve(list.map(function (t) {
        const lower = String(t).toLowerCase();
        if (lower.includes('cat') || lower.includes('whiskers')) return [1, 0];
        if (lower.includes('dog')) return [0, 1];
        return [0.2, 0.2];
      }));
    }
  };
}

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/ai/embeddings/embedding-registry.js');
  injectScript('src/ai/embeddings/harrier-provider.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/features/notes.js');
});

beforeEach(() => {
  localStorage.clear();
  try { delete globalThis.indexedDB; } catch { /* ignore */ }
  window.NotesVectorCache._resetForTests();
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  localStorage.setItem('notesSemanticEnabled', 'false');
  window.setNotesSearchQuery('');
  const searchInput = document.getElementById('notes-search');
  if (searchInput) searchInput.value = '';
  document.querySelector('.notes-list').innerHTML = '';
  const filterBar = document.getElementById('notes-tag-filter');
  if (filterBar) filterBar.innerHTML = '';
  setNotes(SEED);
  initNotes();
  // Reset any tag filter left over from a previous test.
  const allBtn = document.querySelector('.note-tag-filter-btn[data-tag=""]');
  if (allBtn) allBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

afterEach(() => {
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  try { delete globalThis.indexedDB; } catch { /* ignore */ }
});

describe('Notes semantic integration', () => {
  it('falls back to keyword results when disabled', async () => {
    window.setNotesSearchQuery('cat');
    expect(window.getFilteredNotes().map((n) => n.id)).toEqual(['1']);
    expect(await window.getFilteredNotesRanked()).toEqual(window.getFilteredNotes());
    expect(window.isNotesSemanticEnabled()).toBe(false);
    expect(window.isNotesSemanticReady()).toBe(false);
  });

  it('falls back to keyword results when enabled but the model is not ready', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.setNotesSearchQuery('cat');
    expect(window.isNotesSemanticEnabled()).toBe(true);
    expect(window.isNotesSemanticReady()).toBe(false);
    expect((await window.getFilteredNotesRanked()).map((n) => n.id)).toEqual(['1']);
  });

  it('recalls semantically related notes with different wording', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    installMockService();
    expect(window.isNotesSemanticReady()).toBe(true);
    window.setNotesSearchQuery('feline nutrition advice');
    // Keyword-only path finds nothing: no shared substring.
    expect(window.getFilteredNotes()).toEqual([]);
    const ranked = await window.getFilteredNotesRanked();
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].id).toBe('1');
  });

  it('applies the tag filter before semantic ranking', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    installMockService();
    // Activate the 'work' tag filter via its button, then search.
    const workBtn = [...document.querySelectorAll('.note-tag-filter-btn')].find((b) => b.dataset.tag === 'work');
    expect(workBtn).toBeTruthy();
    workBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.setNotesSearchQuery('feline');
    const ranked = await window.getFilteredNotesRanked();
    // Only the work-tagged note survives, even though note 1 is the
    // semantically closer match.
    expect(ranked.map((n) => n.id)).toEqual(['2']);
  });

  it('does not render ghosts from a rerank overtaken by delete', async () => {
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
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'feline';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    // Let the 200ms debounce fire so inference is in flight.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeof resolveEmbed).toBe('function');
    window.deleteNote('1');
    resolveEmbed([[1, 0], [0.2, 0.2], [0, 1]]);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The stale chain resolves after the delete: generation mismatch drops
    // it instead of re-inserting note 1.
    expect(document.querySelector('.note-item[data-id="1"]')).toBeNull();
  });

  it('reorders against the displayed semantic order, not the keyword order', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    installMockService();
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'feline';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    // Wait out the 200ms rerank debounce plus async ranking.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const shown = [...document.querySelectorAll('.note-item')].map((el) => el.dataset.id);
    expect(shown).toEqual(['1', '2']);
    // Move the first *visible* card to the end: keyword order is empty, so
    // the old code would no-op while the fixed code reorders [1,2] -> [2,1].
    window.reorderNotes(0, 2);
    const stored = JSON.parse(localStorage.getItem('notes')).map((n) => n.id);
    expect(stored).toEqual(['2', '1', '3']);
  });

  it('returns tag-filtered notes for empty queries when ready', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    installMockService();
    window.setNotesSearchQuery('');
    expect((await window.getFilteredNotesRanked()).map((n) => n.id)).toEqual(['1', '2', '3']);
  });
});
