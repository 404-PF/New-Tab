import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// The on-demand embedding loader lives in exactly one place:
// src/ai/embeddings/embedding-scripts.js (loaded via bootstrap before
// settings.js/notes.js). Callers delegate with no local twin: twins drift
// and trip the Sonar duplication gate (PR #1187 review).
function extractSharedSources(text) {
  const match = text.match(/const SOURCES = \[([\s\S]*?)\];/);
  if (!match) return null;
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe('embedding loader parity', () => {
  it('settings.js and notes.js delegate without a local source twin', () => {
    const notes = readFileSync(resolve(process.cwd(), 'src/features/notes.js'), 'utf8');
    const settings = readFileSync(resolve(process.cwd(), 'src/ui/settings.js'), 'utf8');
    expect(notes).not.toMatch(/EMBEDDING_SCRIPT_SOURCES/);
    expect(settings).not.toMatch(/EMBEDDING_SCRIPT_SOURCES/);
    expect(notes).toMatch(/window\.EmbeddingScripts/);
    expect(settings).toMatch(/window\.EmbeddingScripts/);
    expect(notes).toMatch(/ensureScripts/);
    expect(settings).toMatch(/ensureScripts/);
  });

  it('every shared-loader module exists on disk', () => {
    const shared = readFileSync(resolve(process.cwd(), 'src/ai/embeddings/embedding-scripts.js'), 'utf8');
    const sources = extractSharedSources(shared);
    expect(sources).not.toBeNull();
    expect(sources.length).toBeGreaterThan(0);
    sources.forEach((src) => {
      expect(existsSync(resolve(process.cwd(), src)), src).toBe(true);
    });
  });
});

describe('embedding vendor self-hosting (PR #1187 CR7)', () => {
  it('loader resolves ORT from vendor/ with no CDN fallback', () => {
    const loader = readFileSync(resolve(process.cwd(), 'vendor/embedding-loader.mjs'), 'utf8');
    expect(loader).toContain('./onnxruntime-web/');
    expect(loader).toContain('wasmPaths');
    expect(loader).not.toMatch(/jsdelivr/i);
    expect(loader).not.toMatch(/unpkg/i);
    expect(loader).not.toMatch(/https:\/\//);
  });

  it('vendor tooling copies the ORT glue modules the ESM entry imports', () => {
    const tool = readFileSync(
      resolve(process.cwd(), 'backgrounds/tools/vendor-embeddings.js'),
      'utf8'
    );
    expect(tool).toContain('ort-wasm-');
    expect(tool).toContain('onnxruntime-common');
  });
});
