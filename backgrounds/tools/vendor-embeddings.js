// backgrounds/tools/vendor-embeddings.js - Populate vendor/ ESM runtime (issue #1186)
// Usage: npm ci --ignore-scripts (installs pinned devDependencies)
//        node backgrounds/tools/vendor-embeddings.js
// Copies the ESM builds + ORT WASM into vendor/ so the extension stays
// self-hosted (MV3 script-src 'self' bans CDN). Model weights are never
// checked in; they download at runtime after opt-in.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const VENDOR = path.join(ROOT, 'vendor');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('copied ' + path.relative(ROOT, src) + ' -> ' + path.relative(ROOT, dest));
}

function findFirst(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function countOccurrences(text, pattern) {
  const matches = text.match(new RegExp(pattern, 'g'));
  return matches ? matches.length : 0;
}

function rewriteBareSpecifiers(transformersPath) {
  // Same pattern family as the release import-graph verifier
  // (from\s*["']); the verifier additionally accepts extensionless and
  // dynamic forms, which the rewrite does not need to produce.
  const rewrites = [
    ['from\\s*([\'"])onnxruntime-common\\1', 'from$1../onnxruntime-common/index.js$1'],
    ['from\\s*([\'"])onnxruntime-web\\/webgpu\\1', 'from$1../onnxruntime-web/ort.webgpu.min.mjs$1']
  ];
  let text = fs.readFileSync(transformersPath, 'utf8');
  rewrites.forEach(function ([pattern, replacement]) {
    const count = countOccurrences(text, pattern);
    if (count !== 1) {
      console.error(
        'Expected exactly 1 occurrence of /' + pattern + '/ in ' +
        path.relative(ROOT, transformersPath) + ', found ' + count +
        '. Refusing to patch: inspect the bundle layout first.'
      );
      process.exit(1);
    }
    text = text.replace(new RegExp(pattern, 'g'), replacement);
  });
  fs.writeFileSync(transformersPath, text);
  console.log('rewrote 2 bare specifiers in ' + path.relative(ROOT, transformersPath));
}

function main() {
  const transformersBase = path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'dist');
  // Transformers 4.3.2 resolves its own nested ORT build
  // (onnxruntime-web 1.31.0-dev.20260914 + onnxruntime-common 1.31.0-dev.20260911)
  // which differs from the top-level pinned ORT. Copying from the top-level
  // tree would combine a mismatched transformers + ORT pair, so prefer the
  // nested tree transformers actually resolves and fall back to top-level
  // only when npm hoists/dedupes the nested copy away. Both ORT packages
  // must come from the same tree so the loaded runtime is a single
  // consistent version set.
  const nestedOrtBase = path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web', 'dist');
  const topOrtBase = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
  const ortBase = fs.existsSync(nestedOrtBase) ? nestedOrtBase : topOrtBase;
  const nestedCommonEsmBase = path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-common', 'dist', 'esm');
  const topCommonEsmBase = path.join(ROOT, 'node_modules', 'onnxruntime-common', 'dist', 'esm');

  if (!fs.existsSync(transformersBase)) {
    console.error('Missing node_modules/@huggingface/transformers. Run npm install first.');
    process.exit(1);
  }
  if (!fs.existsSync(ortBase)) {
    console.error('Missing node_modules/onnxruntime-web. Run npm install first.');
    process.exit(1);
  }

  // Filenames move between major versions (Transformers 3.x shipped
  // transformers.js; 4.x prefers transformers.web[.min].js. ORT 1.31 ships
  // ort.min.mjs / ort.wasm.min.mjs instead of ort.web.mjs). Files are copied
  // to the canonical names vendor/embedding-loader.mjs imports so the loader
  // never changes across vendor upgrades; the log below records the source.
  const transformersEntry = findFirst([
    path.join(transformersBase, 'transformers.web.min.js'),
    path.join(transformersBase, 'transformers.web.js'),
    path.join(transformersBase, 'transformers.min.js'),
    path.join(transformersBase, 'transformers.js'),
    path.join(transformersBase, 'index.js')
  ]);
  if (!transformersEntry) {
    console.error('Could not locate transformers ESM build under ' + transformersBase);
    process.exit(1);
  }
  copyFile(transformersEntry, path.join(VENDOR, 'transformers', 'transformers.js'));

  // The stock web bundle imports two bare specifiers ('onnxruntime-common'
  // and 'onnxruntime-web/webgpu') that never resolve in an MV3 page (no
  // bundler, and inline import maps are off the table under script-src
  // 'self'). Rewrite them to vendored relative paths. transformers.js is a
  // generated artifact, so patching the copy (never node_modules) is safe;
  // the exact-count assertion inside rewriteBareSpecifiers fails the script
  // if a vendor upgrade moves or adds specifiers.
  rewriteBareSpecifiers(path.join(VENDOR, 'transformers', 'transformers.js'));

  // onnxruntime-common ships real ESM under dist/esm (its package.json has
  // no "module" field, so resolve the tree explicitly).
  const commonEsmBase = fs.existsSync(path.join(nestedCommonEsmBase, 'index.js'))
    ? nestedCommonEsmBase
    : topCommonEsmBase;
  console.log('using ORT runtime from ' + path.relative(ROOT, ortBase));
  console.log('using ORT common from ' + path.relative(ROOT, commonEsmBase));
  if (!fs.existsSync(path.join(commonEsmBase, 'index.js'))) {
    console.error('Missing onnxruntime-common/dist/esm/index.js in both nested and top-level trees. Run npm install first.');
    process.exit(1);
  }
  fs.readdirSync(commonEsmBase).filter(function (f) { return f.endsWith('.js'); }).forEach(function (f) {
    copyFile(path.join(commonEsmBase, f), path.join(VENDOR, 'onnxruntime-common', f));
  });

  const ortEntry = findFirst([
    path.join(ortBase, 'ort.wasm.min.mjs'),
    path.join(ortBase, 'ort.min.mjs'),
    path.join(ortBase, 'ort.web.min.mjs'),
    path.join(ortBase, 'ort.web.mjs'),
    path.join(ortBase, 'ort.wasm.mjs'),
    path.join(ortBase, 'ort.mjs')
  ]);
  if (!ortEntry) {
    console.error('Could not locate onnxruntime-web ESM build under ' + ortBase);
    process.exit(1);
  }
  copyFile(ortEntry, path.join(VENDOR, 'onnxruntime-web', 'ort.web.mjs'));

  // Imported (statically, but backend-registered lazily) by the rewritten
  // 'onnxruntime-web/webgpu' specifier above; never executed on the wasm path.
  const webgpuEntry = path.join(ortBase, 'ort.webgpu.min.mjs');
  if (!fs.existsSync(webgpuEntry)) {
    console.error('Missing onnxruntime-web webgpu ESM build under ' + ortBase);
    process.exit(1);
  }
  copyFile(webgpuEntry, path.join(VENDOR, 'onnxruntime-web', 'ort.webgpu.min.mjs'));

  const wasmFiles = fs.readdirSync(ortBase).filter(function (f) { return f.endsWith('.wasm'); });
  if (wasmFiles.length === 0) {
    console.error('No .wasm files found under ' + ortBase);
    process.exit(1);
  }
  wasmFiles.forEach(function (f) {
    copyFile(path.join(ortBase, f), path.join(VENDOR, 'onnxruntime-web', f));
  });
  // ORT's ESM entry dynamically imports its ort-wasm-*.mjs glue modules:
  // copying only .wasm leaves the packaged runtime unable to start.
  fs.readdirSync(ortBase).filter(function (f) {
    return f.startsWith('ort-wasm-') && f.endsWith('.mjs');
  }).forEach(function (f) {
    copyFile(path.join(ortBase, f), path.join(VENDOR, 'onnxruntime-web', f));
  });
  console.log('NOTE: copied all .wasm files; trim to the binary your testing');
  console.log('confirms (single-threaded ORT needs no threaded variants) before');
  console.log('committing, then update this script\'s copy step if filenames change.');

  const loader = path.join(VENDOR, 'embedding-loader.mjs');
  if (!fs.existsSync(loader)) {
    console.error('Missing vendor/embedding-loader.mjs');
    process.exit(1);
  }

  console.log('vendor/ populated. Model weights still download at runtime after opt-in.');
}

if (require.main === module) {
  main();
}

module.exports = { main };
