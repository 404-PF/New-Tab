import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function validDef(id) {
  return {
    id,
    label: 'Test ' + id,
    dims: 4,
    maxTokens: 16,
    embed: function (texts) { return Promise.resolve((Array.isArray(texts) ? texts : [texts]).map(function () { return [0, 0, 0, 1]; })); }
  };
}

beforeAll(() => {
  injectScript('src/ai/embeddings/embedding-registry.js');
});

beforeEach(() => {
  localStorage.clear();
  window.EmbeddingRegistry._resetForTests();
});

describe('EmbeddingRegistry', () => {
  it('registers a valid provider and lists it', () => {
    expect(window.EmbeddingRegistry.registerEmbeddingProvider(validDef('a'))).toBe(true);
    const list = window.EmbeddingRegistry.listEmbeddingProviders();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', dims: 4, maxTokens: 16 });
  });

  it('rejects invalid definitions', () => {
    expect(window.EmbeddingRegistry.registerEmbeddingProvider(null)).toBe(false);
    expect(window.EmbeddingRegistry.registerEmbeddingProvider({})).toBe(false);
    expect(window.EmbeddingRegistry.registerEmbeddingProvider({
      id: 'x', label: 'X', dims: 0, maxTokens: 8, embed: function () {}
    })).toBe(false);
    expect(window.EmbeddingRegistry.registerEmbeddingProvider({
      id: 'x', label: 'X', dims: 8, maxTokens: 8
    })).toBe(false);
    expect(window.EmbeddingRegistry.listEmbeddingProviders()).toHaveLength(0);
  });

  it('rejects duplicate ids', () => {
    expect(window.EmbeddingRegistry.registerEmbeddingProvider(validDef('dup'))).toBe(true);
    expect(window.EmbeddingRegistry.registerEmbeddingProvider(validDef('dup'))).toBe(false);
    expect(window.EmbeddingRegistry.listEmbeddingProviders()).toHaveLength(1);
  });

  it('first registration becomes active and persists the choice', () => {
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('first'));
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('first');
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('second'));
    expect(window.EmbeddingRegistry.setActiveEmbeddingProvider('second')).toBe(true);
    expect(window.EmbeddingRegistry.getActiveEmbeddingProvider().id).toBe('second');
    expect(localStorage.getItem('embeddingProviderId')).toBe('second');
  });

  it('rejects activating an unknown provider', () => {
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('only'));
    expect(window.EmbeddingRegistry.setActiveEmbeddingProvider('nope')).toBe(false);
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('only');
  });

  it('returns null when empty', () => {
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBeNull();
    expect(window.EmbeddingRegistry.getActiveEmbeddingProvider()).toBeNull();
    expect(window.EmbeddingRegistry.getEmbeddingProvider('missing')).toBeNull();
  });

  it('restores the persisted provider on next registration', () => {
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('one'));
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('zero'));
    window.EmbeddingRegistry.setActiveEmbeddingProvider('zero');
    window.EmbeddingRegistry._resetForTests();
    // Persisted id ('zero') survives the reset via localStorage.
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('zero'));
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('zero');
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('one'));
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('zero');
  });

  it('activates the persisted provider even when registered second', () => {
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('one'));
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('two'));
    window.EmbeddingRegistry.setActiveEmbeddingProvider('two');
    window.EmbeddingRegistry._resetForTests();
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('one'));
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('one');
    window.EmbeddingRegistry.registerEmbeddingProvider(validDef('two'));
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('two');
  });

  it('replaces an existing provider without duplicating', () => {
    expect(window.EmbeddingRegistry.registerEmbeddingProvider(validDef('a'))).toBe(true);
    const live = validDef('a');
    live.label = 'Live A';
    expect(window.EmbeddingRegistry.replaceEmbeddingProvider(live)).toBe(true);
    expect(window.EmbeddingRegistry.listEmbeddingProviders()).toHaveLength(1);
    expect(window.EmbeddingRegistry.getEmbeddingProvider('a').label).toBe('Live A');
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('a');
  });

  it('replace registers when absent and rejects invalid defs', () => {
    expect(window.EmbeddingRegistry.replaceEmbeddingProvider(validDef('new'))).toBe(true);
    expect(window.EmbeddingRegistry.getActiveEmbeddingProviderId()).toBe('new');
    expect(window.EmbeddingRegistry.replaceEmbeddingProvider(null)).toBe(false);
    expect(window.EmbeddingRegistry.replaceEmbeddingProvider({ id: 'bad' })).toBe(false);
  });
});
