# vendor/ — self-hosted ESM runtime for on-device embeddings (issue #1186)

MV3 `script-src 'self'` bans CDN, so `@huggingface/transformers` +
`onnxruntime-web` are vendored here instead of `unpkg`/`jsdelivr`.

## Layout (after population)

```text
vendor/
  embedding-loader.mjs        # checked in: tiny ESM bridge (this repo)
  transformers/transformers.js # ESM web build from npm (rewritten: 2 bare
                              #   specifiers mapped to ../onnxruntime-*)
  onnxruntime-common/*.js     # ESM tree from npm (real ESM under dist/esm)
  onnxruntime-web/ort.web.mjs # ESM build from npm (canonical name; the copy
                              #   script maps the best dist file onto it)
  onnxruntime-web/ort.webgpu.min.mjs  # statically imported by transformers
                              #   (backend registered lazily; unused on wasm)
  onnxruntime-web/*.wasm      # ORT WASM artifacts (trim per note below)
```

`src/ai/embeddings/embedding-service.js` injects
`vendor/embedding-loader.mjs` as `<script type="module">` only after the
user enables semantic search. Nothing in `vendor/` is in the
`scriptSources` bootstrap path.

## Populate

```bash
npm install --no-save @huggingface/transformers onnxruntime-web
node backgrounds/tools/vendor-embeddings.js
```

The script copies the ESM builds + WASM into the layout above and verifies
`embedding-loader.mjs` resolves. Tested with `@huggingface/transformers`
4.3.2 + `onnxruntime-web` 1.31.1; if the copy script cannot locate the ESM
builds under `node_modules`, update the candidate filenames in
`backgrounds/tools/vendor-embeddings.js` to match the installed layout.

Model weights (~270–300MB Harrier INT8) are **never** checked in — they
download at runtime to Cache Storage after opt-in, with progress + cancel +
delete in Settings.

## Release requirement

`release.yml` packages `git archive HEAD`, so only **committed** files ship:
populate + commit `vendor/` before tagging, or the release workflow's
vendor-runtime check fails the run. The model weights stay out of git —
only the JS/WASM runtime ships.

Before committing, verify on a real browser (unpacked extension):
1. Enable semantic search in Settings → status reaches "ready"
   (proves the module graph resolves and WASM instantiates).
2. If WASM fails to instantiate (recent ORT builds are threaded and may
   need cross-origin isolation the extension page lacks), try the alternate
   `ort-*.wasm` binaries and `ort.*.mjs` builds, keep the working set, and
   update `backgrounds/tools/vendor-embeddings.js` candidate lists to match.
3. Trim `onnxruntime-web/*.wasm` to the confirmed binary before committing
   (the copy script stages all of them; ~87MB untrimmed).
4. With the network panel open, confirm the Harrier weight fetch completes:
   Hub downloads can redirect to LFS/Xet mirrors outside `MODEL_ORIGINS`
   (`src/ui/settings.js`); extend that list if shards fetch cross-host, or
   affected users stall in `error` with retry as their only recourse.

## CSP / permissions

- `manifest.json`: `extension_pages` needs
  `script-src 'self' 'wasm-unsafe-eval'` for ORT WASM.
- No required `host_permissions` for Hugging Face: the download uses the
  already-declared blanket `optional_host_permissions` (`https://*/*`),
  requested at opt-in time for the Hub API + weight CDNs
  (`huggingface.co`, `*.huggingface.co`, `hf.co`, `*.hf.co`). Installing the
  extension therefore never prompts for model-host access; denying the
  request unchecks the toggle with an error toast.
- ORT must run `numThreads: 1` (no cross-origin isolation in MV3).

## Tests

Unit tests mock the pipeline via `window.__embeddingTestHooks` — no real
300MB download in CI. `vendor/` is excluded from ESLint + coverage.
