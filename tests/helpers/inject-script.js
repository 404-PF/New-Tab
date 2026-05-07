import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Inject a vanilla JS source file into the jsdom window context.
 * Uses globalThis.eval so top-level function declarations become globals.
 */
export function injectScript(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const code = readFileSync(absolutePath, 'utf-8');
  globalThis.eval(code);
}

/**
 * Reset localStorage mock storage between tests.
 */
let storageMap = new Map();

export function resetLocalStorage() {
  storageMap = new Map();
}

export function getLocalStorageMap() {
  return storageMap;
}
