import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Issue #1329: semantic app-launcher ranking. Embeddings are mocked with
// concept vectors: mail-like text -> axis 0, photo-like text -> axis 1.

const APPS = [
  { id: 'gmail', name: 'Gmail', url: 'https://www.mail.google.com/' },
  { id: 'photos', name: 'Photos', url: 'https://photos.example.com' },
  { id: 'notes', name: 'Notepad', url: 'https://notes.example.com' }
];

function conceptVector(text) {
  const t = String(text).toLowerCase();
  if (/mail|outlook|inbox|email/.test(t)) return [1, 0, 0];
  if (/photo|pic|picture|image/.test(t)) return [0, 1, 0];
  return [0, 0, 1];
}

function makeService({ ready = true } = {}) {
  const service = {
    embedTextsCalls: [],
    embedQueryCalls: 0,
    ready,
    isReady: () => service.ready,
    getStatus: () => ({ modelId: 'harrier-test' }),
    embedTexts: (texts) => {
      service.embedTextsCalls.push(...texts);
      return Promise.resolve(texts.map(conceptVector));
    },
    embedQuery: (text) => {
      service.embedQueryCalls += 1;
      return Promise.resolve(conceptVector(text));
    }
  };
  return service;
}

beforeAll(() => {
  injectScript('src/ai/embeddings/hybrid-ranker.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/ai/embeddings/app-semantic-search.js');
});

beforeEach(() => {
  localStorage.clear();
  localStorage.removeItem('notesSemanticEnabled');
  window.AppSemanticSearch.clearCache();
  delete window.EmbeddingService;
});

describe('semantic app ranking', () => {
  it('resolves a synonym query to the right app when the model is ready', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.EmbeddingService = makeService();
    const results = await window.AppSemanticSearch.rankApps('email', APPS, []);
    expect(results[0].id).toBe('gmail');
    expect(results.map((r) => r.id)).not.toContain('photos');
    expect(typeof results[0]._semanticScore).toBe('number');
  });

  it('resolves an abbreviation query to the photo app', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.EmbeddingService = makeService();
    const results = await window.AppSemanticSearch.rankApps('pics', APPS, []);
    expect(results[0].id).toBe('photos');
  });

  it('keeps keyword matches ahead of semantic-only matches', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.EmbeddingService = makeService();
    const results = await window.AppSemanticSearch.rankApps('note', APPS, []);
    expect(results[0].id).toBe('notes');
  });

  it('falls back to keyword matches in original order when the opt-in is off', async () => {
    window.EmbeddingService = makeService();
    const service = window.EmbeddingService;
    const results = await window.AppSemanticSearch.rankApps('mail', APPS, []);
    expect(results.map((r) => r.id)).toEqual(['gmail']);
    expect(results[0]._semanticScore).toBeNull();
    expect(service.embedTextsCalls).toHaveLength(0);
  });

  it('falls back to keyword matching when the model is not ready', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.EmbeddingService = makeService({ ready: false });
    const results = await window.AppSemanticSearch.rankApps('photos', APPS, []);
    expect(results.map((r) => r.id)).toEqual(['photos']);
    expect(results[0]._semanticScore).toBeNull();
  });

  it('falls back to keyword matching when embedding throws', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    const service = makeService();
    service.embedTexts = () => Promise.reject(new Error('boom'));
    window.EmbeddingService = service;
    const results = await window.AppSemanticSearch.rankApps('gmail', APPS, []);
    expect(results.map((r) => r.id)).toEqual(['gmail']);
  });

  it('returns every app in order for an empty query', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.EmbeddingService = makeService();
    const results = await window.AppSemanticSearch.rankApps('  ', APPS, []);
    expect(results.map((r) => r.id)).toEqual(['gmail', 'photos', 'notes']);
  });

  it('keeps an exact-name match ahead of a semantic-only match with higher cosine', async () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.EmbeddingService = {
      isReady: () => true,
      getStatus: () => ({ modelId: 'harrier-test' }),
      embedTexts: (texts) => Promise.resolve(texts.map((t) => (t.startsWith('Notes') ? [-1, 0, 0] : [1, 0, 0]))),
      embedQuery: () => Promise.resolve([1, 0, 0])
    };
    const apps = [
      { id: 'outlook', name: 'Outlook', url: 'https://outlook.example.com' },
      { id: 'notes', name: 'Notes', url: 'https://notes.example.com' }
    ];
    const results = await window.AppSemanticSearch.rankApps('notes', apps, []);
    expect(results.map((r) => r.id)).toEqual(['notes', 'outlook']);
  });
});

describe('app vector cache invalidation', () => {
  async function run(query, apps, folders) {
    return window.AppSemanticSearch.rankApps(query, apps, folders);
  }

  beforeEach(() => {
    localStorage.setItem('notesSemanticEnabled', 'true');
  });

  it('embeds app documents once and reuses cached vectors', async () => {
    const service = makeService();
    window.EmbeddingService = service;
    await run('email', APPS, []);
    const firstCount = service.embedTextsCalls.length;
    await run('mail', APPS, []);
    expect(service.embedTextsCalls.length).toBe(firstCount);
    expect(service.embedQueryCalls).toBe(2);
  });

  it('re-embeds an app when it is renamed', async () => {
    const service = makeService();
    window.EmbeddingService = service;
    await run('email', APPS, []);
    service.embedTextsCalls = [];
    const renamed = APPS.map((a) => (a.id === 'notes' ? { ...a, name: 'Photo Journal' } : a));
    await run('email', renamed, []);
    expect(service.embedTextsCalls).toEqual(['Photo Journal notes.example.com']);
  });

  it('re-embeds apps whose folder changes', async () => {
    const service = makeService();
    window.EmbeddingService = service;
    await run('email', APPS, []);
    service.embedTextsCalls = [];
    const folders = [{ id: 'f1', name: 'Pictures', apps: ['photos'] }];
    await run('email', APPS, folders);
    expect(service.embedTextsCalls).toEqual(['Photos photos.example.com Pictures']);
  });

  it('drops removed apps and re-embeds them when re-added', async () => {
    const service = makeService();
    window.EmbeddingService = service;
    await run('email', APPS, []);
    await run('email', APPS.filter((a) => a.id !== 'photos'), []);
    service.embedTextsCalls = [];
    await run('email', APPS, []);
    expect(service.embedTextsCalls).toEqual(['Photos photos.example.com']);
  });

  it('re-embeds everything when the model changes', async () => {
    const service = makeService();
    window.EmbeddingService = service;
    await run('email', APPS, []);
    service.embedTextsCalls = [];
    service.getStatus = () => ({ modelId: 'other-model' });
    await run('email', APPS, []);
    expect(service.embedTextsCalls).toHaveLength(APPS.length);
  });
});
