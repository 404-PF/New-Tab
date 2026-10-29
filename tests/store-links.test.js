import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const CANONICAL_URL = 'https://chromewebstore.google.com/detail/new-tab/maifjidpfffffeapgephnpdhomkocncd';
const OLD_ID = 'bgjillpeijfmdopfbmoinfogfhaadina';
const EDGE_URL = 'https://microsoftedge.microsoft.com/addons/detail/new-tab/mcbemnamenhelofgaclcanfcdjnjnhmi';
const STORE_LINK_FILES = [
  'README.md',
  'docs/README.en-US.md',
  'docs/README.zh-CN.md'
];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.tmp', 'coverage']);
const SKIP_EXTS = new Set(['mp4', 'webm', 'mov', 'jpeg', 'jpg', 'png', 'gif', 'webp', 'ico']);
// This file itself names the old ID as a constant; skip it in the repo-wide scan.
const SELF = resolve(process.cwd(), 'tests/store-links.test.js');

function walk(dir, out = []) {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(join(dir, entry.name), out);
      }
      return;
    }
    out.push(join(dir, entry.name));
  });
  return out;
}

describe('Chrome Web Store links (#1040)', () => {
  it('point the store READMEs at the canonical listing URL', () => {
    STORE_LINK_FILES.forEach((rel) => {
      const content = readFileSync(resolve(process.cwd(), rel), 'utf-8');
      expect(content).toContain(CANONICAL_URL);
    });
  });

  it('no longer reference the old extension ID anywhere in the repo', () => {
    const offenders = walk(process.cwd()).filter((file) => {
      if (resolve(file) === SELF) {
        return false;
      }
      const dot = file.lastIndexOf('.');
      const ext = dot === -1 ? '' : file.slice(dot + 1).toLowerCase();
      if (SKIP_EXTS.has(ext)) {
        return false;
      }
      let content;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        return false;
      }
      return content.includes(OLD_ID);
    });
    expect(offenders).toEqual([]);
  });

  it('leave the Microsoft Edge Add-ons links unchanged', () => {
    STORE_LINK_FILES.forEach((rel) => {
      const content = readFileSync(resolve(process.cwd(), rel), 'utf-8');
      expect(content).toContain(EDGE_URL);
    });
  });
});
