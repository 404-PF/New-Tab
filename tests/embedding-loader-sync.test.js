import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// The on-demand embedding loader is intentionally duplicated in settings.js
// and notes.js (a shared module would itself need loading before either can
// call it; same precedent as loadScript in bootstrap.js/games-app.js). This
// pins the two copies to the same module list and order.
function extractSources(text) {
  const match = text.match(/const EMBEDDING_SCRIPT_SOURCES = \[([\s\S]*?)\];/);
  if (!match) return null;
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe('embedding loader parity', () => {
  it('notes.js and settings.js load the same embedding modules in order', () => {
    const notes = readFileSync(resolve(process.cwd(), 'src/features/notes.js'), 'utf8');
    const settings = readFileSync(resolve(process.cwd(), 'src/ui/settings.js'), 'utf8');
    const fromNotes = extractSources(notes);
    const fromSettings = extractSources(settings);
    expect(fromNotes).not.toBeNull();
    expect(fromSettings).not.toBeNull();
    expect(fromNotes).toEqual(fromSettings);
    expect(fromNotes.length).toBeGreaterThan(0);
  });

  it('every listed module exists on disk', () => {
    const settings = readFileSync(resolve(process.cwd(), 'src/ui/settings.js'), 'utf8');
    extractSources(settings).forEach((src) => {
      expect(existsSync(resolve(process.cwd(), src)), src).toBe(true);
    });
  });
});
