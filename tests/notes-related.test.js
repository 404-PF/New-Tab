import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const MODEL_ID = 'test-model';

const SEED = [
  { id: 'a', text: 'cat food', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'b', text: 'whiskers cat toy', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'c', text: 'dog park', tag: '', order: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
];

function embedMock(text) {
  const lower = String(text).toLowerCase();
  if (lower.includes('cat')) return [1, 0];
  if (lower.includes('dog')) return [0, 1];
  return [0.2, 0.2];
}

function noteEmbedText(note) {
  return (note.tag ? note.tag + ' ' : '') + note.text;
}

// Real hash/key helpers, in-memory storage: IndexedDB is unavailable in jsdom.
function installMemoryCache() {
  const real = window.NotesVectorCache;
  const rows = new Map();
  window.NotesVectorCache = {
    hashNoteText: real.hashNoteText,
    getCachedVector: (noteId, text, modelId) => {
      const row = rows.get(`${modelId}::${noteId}`);
      return Promise.resolve(row && row.textHash === real.hashNoteText(text) ? row : null);
    },
    putCachedVector: (noteId, text, modelId, vector) => {
      rows.set(`${modelId}::${noteId}`, {
        noteId: String(noteId), modelId, textHash: real.hashNoteText(text), vector: Array.from(vector)
      });
      return Promise.resolve(true);
    },
    getAllCachedVectors: (modelId) => Promise.resolve(
      [...rows.values()].filter((r) => r.modelId === modelId || modelId === undefined)
    ),
    deleteCachedVectorsForNote: () => Promise.resolve(true)
  };
  return rows;
}

function installService() {
  window.EmbeddingService = {
    isReady: () => true,
    getStatus: () => ({ status: 'ready', progress: 1, error: '', modelId: MODEL_ID }),
    embedQuery: (text) => Promise.resolve(embedMock(text)),
    embedTexts: (texts) => Promise.resolve(texts.map(embedMock))
  };
}

function seedWarmCache(rows) {
  SEED.forEach((note) => {
    const vector = embedMock(noteEmbedText(note));
    rows.set(`${MODEL_ID}::${note.id}`, {
      noteId: note.id,
      modelId: MODEL_ID,
      textHash: window.NotesVectorCache.hashNoteText(noteEmbedText(note)),
      vector
    });
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/hybrid-ranker.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/features/notes.js');
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('notesSemanticEnabled', 'true');
  localStorage.setItem('notes', JSON.stringify(SEED));
  installService();
  window.initNotes();
});

function textareaFor(id) {
  return document.querySelector(`.note-textarea[data-id="${id}"]`);
}

describe('notes related panel (issue #1331)', () => {
  it('lists cosine-similar notes from the warm cache, not dissimilar ones', async () => {
    const rows = installMemoryCache();
    seedWarmCache(rows);
    window.initNotes();
    textareaFor('a').dispatchEvent(new Event('focusin', { bubbles: true }));
    textareaFor('a').focus();
    await flush();
    const panel = document.getElementById('notes-related');
    expect(panel.hidden).toBe(false);
    const linked = [...panel.querySelectorAll('.notes-related-item')].map((b) => b.dataset.id);
    expect(linked).toEqual(['b']);
  });

  it('stays hidden when semantic search is disabled', async () => {
    const rows = installMemoryCache();
    seedWarmCache(rows);
    localStorage.setItem('notesSemanticEnabled', 'false');
    window.initNotes();
    textareaFor('a').focus();
    await flush();
    expect(document.getElementById('notes-related').hidden).toBe(true);
  });

  it('does nothing when the cache is empty', async () => {
    installMemoryCache();
    window.initNotes();
    textareaFor('a').focus();
    await flush();
    const panel = document.getElementById('notes-related');
    expect(panel.hidden).toBe(true);
    expect(panel.querySelectorAll('.notes-related-item')).toHaveLength(0);
  });
});

describe('notes duplicate hint (issue #1331)', () => {
  it('suggests a near-identical existing note after a new note is first saved, and can be dismissed', async () => {
    const rows = installMemoryCache();
    seedWarmCache(rows);
    window.initNotes();
    window.addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = 'cat food tips';
    ta.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();

    const hint = document.getElementById('notes-duplicate-hint');
    expect(hint.hidden).toBe(false);
    expect(hint.querySelector('.notes-duplicate-link').dataset.id).toBe('a');
    const saved = JSON.parse(localStorage.getItem('notes')).find((n) => n.text === 'cat food tips');
    expect(saved).toBeDefined();

    hint.querySelector('.notes-duplicate-dismiss').click();
    expect(hint.hidden).toBe(true);
  });

  it('does not hint for dissimilar text', async () => {
    const rows = installMemoryCache();
    seedWarmCache(rows);
    window.initNotes();
    window.addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = 'bird watching';
    ta.dispatchEvent(new Event('blur', { bubbles: true }));
    await flush();
    expect(document.getElementById('notes-duplicate-hint').hidden).toBe(true);
  });
});
