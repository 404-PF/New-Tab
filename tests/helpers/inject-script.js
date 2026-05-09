import { readFileSync } from 'fs';
import { resolve } from 'path';

export function injectScript(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const code = readFileSync(absolutePath, 'utf-8');
  globalThis.eval(code);
}
