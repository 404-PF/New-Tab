// vendor/embedding-loader.mjs - ESM bridge for on-device embeddings (issue #1186)
//
// Transformers.js is ESM-only, so the classic-script bootstrap cannot load it
// directly. EmbeddingService injects this file as <script type="module"> on
// demand (lazy opt-in only, never in bootstrap scriptSources).
//
// Populate vendor/ with:
//   npm ci --ignore-scripts (pinned devDependencies)
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
// Transformers.js imports 'onnxruntime-web/webgpu', which vendor-embeddings.js
// rewrites to ort.webgpu.min.mjs: the pipeline runs on that ORT instance,
// not on ort.web.mjs above. Both modules must stay single-threaded (MV3 has
// no cross-origin isolation), otherwise the guard below never reaches the
// runtime that runs inference (PR #1187 review). Importing the webgpu build
// here shares the same module instance Transformers uses, so setting its
// env affects the pipeline. Without cross-origin isolation ORT falls back to
// one thread anyway; the explicit setting documents the intent.
import * as OrtWebGpu from './onnxruntime-web/ort.webgpu.min.mjs';

const { pipeline, env } = Transformers;

function applySingleThread(ortModule) {
  try {
    if (ortModule && ortModule.env && ortModule.env.wasm) {
      ortModule.env.wasm.numThreads = 1;
    }
  } catch {
    // Non-fatal: service re-applies numThreads defensively.
  }
}

applySingleThread(OrtWeb);
applySingleThread(OrtWebGpu);

try {
  if (env) {
    env.allowLocalModels = false;
    const wasm = env.backends && env.backends.onnx && env.backends.onnx.wasm;
    if (wasm) {
      wasm.wasmPaths = new URL('./onnxruntime-web/', import.meta.url).href;
    }
  }
} catch {
  // ignore
}

window.__embeddingVendor = {
  pipeline,
  env,
  ort: OrtWeb,
  ortWebGpu: OrtWebGpu
};

try {
  document.dispatchEvent(new CustomEvent('embedding-vendor-loaded'));
} catch {
  // ignore
}
