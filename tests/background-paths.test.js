import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', '.tmp', 'coverage']);
const SKIP_FILES = new Set(['background-paths.test.js']);
const BINARY_EXTENSIONS = new Set([
  '.jpeg', '.jpg', '.png', '.gif', '.webp', '.ico', '.mp4', '.webm', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf', '.zip',
]);
const STALE_BACKGROUND_PATH = /background\/|live_background(?!s)/;

function collectTextFiles(directory, files = []) {
  readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) return;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(entryPath, files);
      return;
    }
    if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return;
    files.push(entryPath);
  });
  return files;
}

describe('background folder paths', () => {
  it('registers a service worker that exists under backgrounds/', () => {
    const manifest = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'manifest.json'), 'utf8'));

    expect(manifest.background.service_worker).toBe('backgrounds/service-worker.js');
    expect(existsSync(path.join(PROJECT_ROOT, manifest.background.service_worker))).toBe(true);
  });

  it('leaves no stale background/ or live_background/ references in the repository', () => {
    const staleFiles = collectTextFiles(PROJECT_ROOT)
      .filter(file => STALE_BACKGROUND_PATH.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(PROJECT_ROOT, file));

    expect(staleFiles).toEqual([]);
  });
});
