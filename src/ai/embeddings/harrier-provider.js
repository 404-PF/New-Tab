// src/ai/embeddings/harrier-provider.js - Harrier 270M INT8 provider adapter
// Issue #1186: 640-dim, last-token pooling + L2 normalize, instruction prefix
// on queries only, 512-token truncate. Pure helpers are unit-testable without
// downloading the ~300MB model.

(function () {
  'use strict';

  const HARRIER_MODEL_ID = 'onnx-community/harrier-oss-v1-270m-ONNX';
  const HARRIER_PROVIDER_ID = 'harrier-int8';
  const HARRIER_DIMS = 640;
  const HARRIER_MAX_TOKENS = 512;
  // Instruction prefix applied to search queries only, never to stored notes.
  const HARRIER_QUERY_INSTRUCTION = 'Instruct: retrieve relevant notes\nQuery: ';

  function formatHarrierQuery(text) {
    return HARRIER_QUERY_INSTRUCTION + (text || '');
  }

  function formatHarrierDocument(text) {
    return text || '';
  }

  function truncateTokenIds(tokenIds, maxTokens) {
    if (!Array.isArray(tokenIds)) return [];
    const max = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : HARRIER_MAX_TOKENS;
    if (tokenIds.length <= max) return tokenIds.slice();
    return tokenIds.slice(0, max);
  }

  // hiddenStates: [seqLen][dims] array of numbers. Pools the last valid token
  // (last row, or attention-mask-aware index) then L2-normalizes.
  function lastTokenPool(hiddenStates, attentionMask) {
    if (!Array.isArray(hiddenStates) || hiddenStates.length === 0) return [];
    let index = hiddenStates.length - 1;
    if (Array.isArray(attentionMask) && attentionMask.length === hiddenStates.length) {
      for (let i = hiddenStates.length - 1; i >= 0; i -= 1) {
        if (attentionMask[i]) {
          index = i;
          break;
        }
      }
    }
    const row = hiddenStates[index];
    if (!Array.isArray(row)) return [];
    return row.slice();
  }

  function l2Normalize(vector) {
    if (!Array.isArray(vector) || vector.length === 0) return [];
    let sum = 0;
    for (let i = 0; i < vector.length; i += 1) {
      const v = Number(vector[i]) || 0;
      sum += v * v;
    }
    const norm = Math.sqrt(sum);
    if (!Number.isFinite(norm) || norm === 0) {
      return vector.map(function () { return 0; });
    }
    return vector.map(function (v) { return (Number(v) || 0) / norm; });
  }

  function poolAndNormalize(hiddenStates, attentionMask) {
    return l2Normalize(lastTokenPool(hiddenStates, attentionMask));
  }

  function isValidEmbedding(vector, dims) {
    const expected = Number.isFinite(dims) && dims > 0 ? dims : HARRIER_DIMS;
    if (!Array.isArray(vector) || vector.length !== expected) return false;
    for (let i = 0; i < vector.length; i += 1) {
      if (!Number.isFinite(Number(vector[i]))) return false;
    }
    return true;
  }

  // pipelineFactory: async (docs, opts) => Promise<number[][]>, one vector
  // per input, for injection in tests. Production wiring is done by
  // embedding-service.js once the Transformers pipeline is loaded.
  function createHarrierProvider(pipelineFactory) {
    const runPipeline = typeof pipelineFactory === 'function' ? pipelineFactory : null;

    function embed(texts) {
      if (!runPipeline) {
        return Promise.reject(new Error('Harrier pipeline not loaded'));
      }
      const list = Array.isArray(texts) ? texts : [texts];
      const docs = list.map(function (t) { return formatHarrierDocument(t); });
      return runPipeline(docs, { isQuery: false });
    }

    function embedQuery(text) {
      if (!runPipeline) {
        return Promise.reject(new Error('Harrier pipeline not loaded'));
      }
      return runPipeline([formatHarrierQuery(text)], { isQuery: true }).then(function (vectors) {
        return Array.isArray(vectors) ? vectors[0] || [] : [];
      });
    }

    return {
      id: HARRIER_PROVIDER_ID,
      label: 'Harrier 270M INT8',
      modelId: HARRIER_MODEL_ID,
      dims: HARRIER_DIMS,
      maxTokens: HARRIER_MAX_TOKENS,
      embed,
      embedQuery
    };
  }

  function registerHarrierProvider(pipelineFactory) {
    try {
      const registry = window.EmbeddingRegistry;
      if (!registry || typeof registry.registerEmbeddingProvider !== 'function') return false;
      const existing = typeof registry.getEmbeddingProvider === 'function'
        ? registry.getEmbeddingProvider(HARRIER_PROVIDER_ID)
        : null;
      if (existing) {
        if (typeof pipelineFactory !== 'function') return true;
        if (typeof registry.replaceEmbeddingProvider === 'function') {
          return registry.replaceEmbeddingProvider(createHarrierProvider(pipelineFactory));
        }
        return true;
      }
      if (typeof pipelineFactory !== 'function') return false;
      return registry.registerEmbeddingProvider(createHarrierProvider(pipelineFactory));
    } catch (e) {
      console.warn('Failed to register Harrier provider:', e);
      return false;
    }
  }

  // NOTE: no file-scope self-registration. An eager stub would shadow the
  // live implementation later (registry rejects duplicates), leaving
  // getActiveEmbeddingProvider().embed* rejecting forever. Registration
  // happens explicitly via registerHarrierProvider() or, in production, via
  // the embedding service once the real pipeline finishes loading.

  const api = {
    HARRIER_MODEL_ID,
    HARRIER_PROVIDER_ID,
    HARRIER_DIMS,
    HARRIER_MAX_TOKENS,
    HARRIER_QUERY_INSTRUCTION,
    formatHarrierQuery,
    formatHarrierDocument,
    truncateTokenIds,
    lastTokenPool,
    l2Normalize,
    poolAndNormalize,
    isValidEmbedding,
    createHarrierProvider,
    registerHarrierProvider
  };

  try {
    window.HarrierProvider = api;
  } catch {
    // ignore
  }

  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api;
    }
  } catch {
    // ignore
  }
})();
