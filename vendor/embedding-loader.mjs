// vendor/embedding-loader.mjs - ESM bridge for on-device embeddings (issue #1186)
//
// Transformers.js is ESM-only, so the classic-script bootstrap cannot load it
// directly. EmbeddingService injects this file as <script type="module"> on
// demand (lazy opt-in only, never in bootstrap scriptSources).
//
// Populate vendor/ with:
//   npm install --no-save @huggingface/transformers onnxruntime-web
//   node backgrounds/tools/vendor-embeddings.js  (see vendor/README.md)
//
// Expected layout after population:
//   vendor/transformers/transformers.js (ESM build)
//   vendor/onnxruntime-web/ort.web.mjs (+ *.wasm)
//
// This checked-in loader stays tiny and CSP-safe (script-src 'self', no
// inline code, no CDN).

import * as Transformers from './transformers/transformers.js';
import * as OrtWeb from './onnxruntime-web/ort.web.mjs';

const { pipeline, env } = Transformers;

try {
  if (OrtWeb && OrtWeb.env && OrtWeb.env.wasm) {
    // MV3 pages have no cross-origin isolation: keep ORT single-threaded.
    OrtWeb.env.wasm.numThreads = 1;
  }
} catch {
  // Non-fatal: service re-applies numThreads defensively.
}

try {
  if (env) {
    env.allowLocalModels = false;
  }
} catch {
  // ignore
}

window.__embeddingVendor = {
  pipeline,
  env,
  ort: OrtWeb
};

try {
  document.dispatchEvent(new CustomEvent('embedding-vendor-loaded'));
} catch {
  // ignore
}
