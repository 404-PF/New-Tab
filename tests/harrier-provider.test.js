import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/embeddings/embedding-registry.js');
  injectScript('src/ai/embeddings/harrier-provider.js');
});

beforeEach(() => {
  localStorage.clear();
  window.EmbeddingRegistry._resetForTests();
});

describe('HarrierProvider constants', () => {
  it('exposes the expected model shape', () => {
    expect(window.HarrierProvider.HARRIER_MODEL_ID).toBe('onnx-community/harrier-oss-v1-270m-ONNX');
    expect(window.HarrierProvider.HARRIER_DIMS).toBe(640);
    expect(window.HarrierProvider.HARRIER_MAX_TOKENS).toBe(512);
  });

  it('prefixes queries only, never documents', () => {
    const query = window.HarrierProvider.formatHarrierQuery('buy milk');
    expect(query).toContain('buy milk');
    expect(query.length).toBeGreaterThan('buy milk'.length);
    expect(window.HarrierProvider.formatHarrierDocument('buy milk')).toBe('buy milk');
    expect(window.HarrierProvider.formatHarrierDocument('')).toBe('');
  });
});

describe('HarrierProvider math helpers', () => {
  it('truncates token ids to the limit', () => {
    expect(window.HarrierProvider.truncateTokenIds([1, 2, 3], 2)).toEqual([1, 2]);
    expect(window.HarrierProvider.truncateTokenIds([1, 2], 512)).toEqual([1, 2]);
    expect(window.HarrierProvider.truncateTokenIds('nope', 8)).toEqual([]);
  });

  it('pools the last valid token', () => {
    const states = [[1, 0], [0, 2], [0, 0]];
    expect(window.HarrierProvider.lastTokenPool(states)).toEqual([0, 0]);
    expect(window.HarrierProvider.lastTokenPool(states, [1, 1, 0])).toEqual([0, 2]);
    expect(window.HarrierProvider.lastTokenPool([])).toEqual([]);
  });

  it('L2-normalizes vectors', () => {
    const out = window.HarrierProvider.l2Normalize([3, 4]);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.8);
    expect(window.HarrierProvider.l2Normalize([0, 0])).toEqual([0, 0]);
    expect(window.HarrierProvider.l2Normalize([])).toEqual([]);
  });

  it('poolAndNormalizes to unit length', () => {
    const out = window.HarrierProvider.poolAndNormalize([[3, 4]]);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.8);
  });

  it('validates embedding shapes', () => {
    expect(window.HarrierProvider.isValidEmbedding(new Array(640).fill(0.1))).toBe(true);
    expect(window.HarrierProvider.isValidEmbedding([0.1, 0.2])).toBe(false);
    expect(window.HarrierProvider.isValidEmbedding(new Array(640).fill(NaN))).toBe(false);
  });
});

describe('HarrierProvider registration', () => {
  it('creates a provider that prefixes query text', async () => {
    const seen = [];
    const factory = function (docs, opts) {
      seen.push({ docs: docs.slice(), opts });
      return Promise.resolve(docs.map(function () { return [1, 0]; }));
    };
    const provider = window.HarrierProvider.createHarrierProvider(factory);
    expect(provider.id).toBe('harrier-int8');
    expect(provider.dims).toBe(640);
    await provider.embed(['hello']);
    expect(seen[0].docs).toEqual(['hello']);
    const q = await provider.embedQuery('hello');
    expect(q).toEqual([1, 0]);
    expect(seen[1].docs[0]).toBe(window.HarrierProvider.formatHarrierQuery('hello'));
  });

  it('rejects without a loaded pipeline', async () => {
    const provider = window.HarrierProvider.createHarrierProvider(null);
    await expect(provider.embed(['x'])).rejects.toThrow('not loaded');
    await expect(provider.embedQuery('x')).rejects.toThrow('not loaded');
  });

  it('registers into the generic registry', () => {
    const factory = function (docs) {
      return Promise.resolve(docs.map(function () { return [1, 0]; }));
    };
    expect(window.HarrierProvider.registerHarrierProvider(factory)).toBe(true);
    expect(window.EmbeddingRegistry.getEmbeddingProvider('harrier-int8')).not.toBeNull();
    // Second call without a factory is idempotent.
    expect(window.HarrierProvider.registerHarrierProvider(null)).toBe(true);
    expect(window.EmbeddingRegistry.listEmbeddingProviders()).toHaveLength(1);
    // A real factory passed after a stub replaces it.
    const factory2 = function (docs) {
      return Promise.resolve(docs.map(function () { return [0, 1]; }));
    };
    expect(window.HarrierProvider.registerHarrierProvider(factory2)).toBe(true);
    expect(window.EmbeddingRegistry.listEmbeddingProviders()).toHaveLength(1);
  });

  it('does not register a stub without a factory', () => {
    expect(window.HarrierProvider.registerHarrierProvider(null)).toBe(false);
    expect(window.EmbeddingRegistry.getEmbeddingProvider('harrier-int8')).toBeNull();
  });
});
