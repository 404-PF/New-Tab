import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function mockFactoryFor(vectorsByText) {
  return function (docs, opts) {
    void opts;
    const list = Array.isArray(docs) ? docs : [docs];
    return Promise.resolve(list.map(function (text) {
      const hit = Object.keys(vectorsByText).find(function (k) { return text.includes(k); });
      return (hit ? vectorsByText[hit] : [0, 0]).slice();
    }));
  };
}

beforeAll(() => {
  injectScript('src/ai/embeddings/embedding-registry.js');
  injectScript('src/ai/embeddings/harrier-provider.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/embedding-service.js');
});

beforeEach(() => {
  localStorage.clear();
  window.EmbeddingRegistry._resetForTests();
  window.EmbeddingService._resetForTests();
  try { delete window.__embeddingTestHooks; } catch { /* ignore */ }
  try { delete window.__embeddingVendor; } catch { /* ignore */ }
});

afterEach(() => {
  window.EmbeddingService._resetForTests();
  try { delete window.__embeddingTestHooks; } catch { /* ignore */ }
  try { delete window.__embeddingVendor; } catch { /* ignore */ }
});

describe('EmbeddingService state machine', () => {
  it('starts idle and not ready', () => {
    expect(window.EmbeddingService.getStatus().status).toBe('idle');
    expect(window.EmbeddingService.isReady()).toBe(false);
  });

  it('loads via injected test factory without downloading', async () => {
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({ hello: [1, 0] }) };
    const provider = await window.EmbeddingService.ensureModel();
    expect(provider).not.toBeNull();
    expect(window.EmbeddingService.isReady()).toBe(true);
    expect(window.EmbeddingService.getStatus().status).toBe('ready');
  });

  it('embeds texts and queries through the live provider', async () => {
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({ cat: [1, 0], dog: [0, 1] }) };
    await window.EmbeddingService.ensureModel();
    const vectors = await window.EmbeddingService.embedTexts(['I love my cat', 'such dog']);
    expect(vectors[0]).toEqual([1, 0]);
    expect(vectors[1]).toEqual([0, 1]);
    // embedQuery prefixes the text (Harrier instruction) but still matches.
    expect(await window.EmbeddingService.embedQuery('cat')).toEqual([1, 0]);
  });

  it('rejects embed calls before ready', async () => {
    await expect(window.EmbeddingService.embedTexts(['x'])).rejects.toThrow('not ready');
    await expect(window.EmbeddingService.embedQuery('x')).rejects.toThrow('not ready');
  });

  it('reports an error when the vendor loader fails', async () => {
    window.__embeddingTestHooks = {
      vendorLoader: function () { return Promise.reject(new Error('no vendor')); }
    };
    await expect(window.EmbeddingService.ensureModel()).rejects.toThrow('no vendor');
    expect(window.EmbeddingService.getStatus().status).toBe('error');
    expect(window.EmbeddingService.isReady()).toBe(false);
  });

  it('publishes a working provider to the registry', async () => {
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({ hi: [1, 0] }) };
    await window.EmbeddingService.ensureModel();
    const active = window.EmbeddingRegistry.getActiveEmbeddingProvider();
    expect(active).not.toBeNull();
    expect(active.id).toBe('harrier-int8');
    await expect(active.embed(['hi there'])).resolves.toEqual([[1, 0]]);
  });

  it('replaces a stale registry stub on load', async () => {
    window.EmbeddingRegistry.registerEmbeddingProvider({
      id: 'harrier-int8',
      label: 'stub',
      dims: 640,
      maxTokens: 512,
      embed: function () { return Promise.reject(new Error('stub')); }
    });
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({}) };
    await window.EmbeddingService.ensureModel();
    expect(window.EmbeddingRegistry.listEmbeddingProviders()).toHaveLength(1);
    const active = window.EmbeddingRegistry.getActiveEmbeddingProvider();
    await expect(active.embed(['x'])).resolves.toBeDefined();
  });

  it('fails fast when the vendor runtime is missing', async () => {
    const fetchMock = vi.fn(async function () { return { ok: false, status: 404 }; });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(window.EmbeddingService.ensureModel()).rejects.toThrow('vendor');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(window.EmbeddingService.getStatus().status).toBe('error');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the new promise when cancel is followed by re-enable', async () => {
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({}) };
    const first = window.EmbeddingService.ensureModel();
    window.EmbeddingService.cancelLoad();
    const second = window.EmbeddingService.ensureModel();
    expect(second).not.toBe(first);
    // The stale chain settles as AbortError but must not clear `second`.
    await expect(first).rejects.toThrow('cancelled');
    await second;
    expect(window.EmbeddingService.isReady()).toBe(true);
    expect(window.EmbeddingService.getStatus().status).toBe('ready');
  });

  it('truncates long inputs to the token budget before inference', async () => {
    const seen = [];
    const fakeExtractor = function (text) {
      seen.push(text);
      return Promise.resolve({ data: [0.5, 0.5] });
    };
    fakeExtractor.tokenizer = {
      encode: function (text) { return Array.from(text).map(function (_, i) { return i + 1; }); },
      decode: function (ids) { return 'x'.repeat(ids.length); }
    };
    window.__embeddingTestHooks = {
      vendorLoader: function () {
        return Promise.resolve({
          pipeline: async function () { return fakeExtractor; },
          env: {},
          ort: { env: { wasm: {} } }
        });
      }
    };
    await window.EmbeddingService.ensureModel();
    // 5000 chars -> 5000 ids -> exact 512-token truncate -> decode.
    expect(await window.EmbeddingService.embedTexts(['y'.repeat(5000)])).toEqual([[0.5, 0.5]]);
    expect(seen[0]).toBe('x'.repeat(512));
  });

  it('falls back to a char cap when the pipeline tokenizer lacks decode', async () => {
    const seen = [];
    const encodeOnlyExtractor = function (text) {
      seen.push(text);
      return Promise.resolve({ data: [0.5, 0.5] });
    };
    encodeOnlyExtractor.tokenizer = {
      encode: function (text) { return Array.from(text).map(function (_, i) { return i + 1; }); }
    };
    window.__embeddingTestHooks = {
      vendorLoader: function () {
        return Promise.resolve({
          pipeline: async function () { return encodeOnlyExtractor; },
          env: {},
          ort: { env: { wasm: {} } }
        });
      }
    };
    await window.EmbeddingService.ensureModel();
    await window.EmbeddingService.embedTexts(['y'.repeat(5000)]);
    expect(seen[0].length).toBe(512 * 4);
  });

  it('falls back to a char cap when the pipeline has no tokenizer', async () => {
    const seen = [];
    const bareExtractor = function (text) {
      seen.push(text);
      return Promise.resolve({ data: [0.5, 0.5] });
    };
    window.__embeddingTestHooks = {
      vendorLoader: function () {
        return Promise.resolve({
          pipeline: async function () { return bareExtractor; },
          env: {},
          ort: { env: { wasm: {} } }
        });
      }
    };
    await window.EmbeddingService.ensureModel();
    await window.EmbeddingService.embedTexts(['y'.repeat(5000)]);
    expect(seen[0].length).toBe(512 * 4);
  });

  it('aborts when the signal is already aborted', async () => {    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({}) };
    const controller = new AbortController();
    controller.abort();
    await expect(
      window.EmbeddingService.ensureModel({ signal: controller.signal })
    ).rejects.toThrow('cancelled');
    expect(window.EmbeddingService.getStatus().status).toBe('idle');
  });

  it('notifies status listeners', async () => {
    const seen = [];
    const off = window.EmbeddingService.onStatusChange(function (s) { seen.push(s.status); });
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({}) };
    await window.EmbeddingService.ensureModel();
    off();
    expect(seen).toContain('loading');
    expect(seen).toContain('ready');
  });

  it('cancelLoad resets a loading state', () => {
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({}) };
    const pending = window.EmbeddingService.ensureModel();
    window.EmbeddingService.cancelLoad();
    expect(window.EmbeddingService.getStatus().status).toBe('idle');
    return pending.catch(function () {}).then(function () {
      expect(window.EmbeddingService.getStatus().status).toBe('idle');
    });
  });

  it('deleteModel clears state', async () => {
    window.__embeddingTestHooks = { pipelineFactory: mockFactoryFor({}) };
    await window.EmbeddingService.ensureModel();
    expect(await window.EmbeddingService.deleteModel()).toBe(true);
    expect(window.EmbeddingService.isReady()).toBe(false);
    expect(window.EmbeddingService.getStatus().status).toBe('idle');
  });

  it('reads the semantic opt-in flag', () => {
    expect(window.EmbeddingService.isSemanticEnabled()).toBe(false);
    localStorage.setItem('notesSemanticEnabled', 'true');
    expect(window.EmbeddingService.isSemanticEnabled()).toBe(true);
  });
});
