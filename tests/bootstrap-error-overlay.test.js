import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';

const BOOTSTRAP_JS_PATH = resolve(process.cwd(), 'src/core/bootstrap.js');
const BOOTSTRAP_CODE = readFileSync(BOOTSTRAP_JS_PATH, 'utf-8');

describe('bootstrap error overlay', () => {
  function createDomWithScriptOverrides(scriptOverrides) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });

    dom.window.__storageBridgeReady = Promise.resolve();

    const originalCreateElement = dom.window.document.createElement.bind(dom.window.document);
    dom.window.document.createElement = function (tag) {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        let srcValue = '';
        Object.defineProperty(el, 'src', {
          get() { return srcValue; },
          set(value) {
            srcValue = value;
            if (scriptOverrides[value]) {
              setTimeout(() => {
                if (scriptOverrides[value] === 'error') {
                  el.onerror?.(new Event('error'));
                } else {
                  el.onload?.(new Event('load'));
                }
              }, 0);
            } else {
              setTimeout(() => el.onload?.(new Event('load')), 0);
            }
          },
          configurable: true,
        });
      }
      return el;
    };

    return dom;
  }

  it('shows overlay listing failed scripts when a script fails to load', async () => {
    const dom = createDomWithScriptOverrides({
      'src/core/utils.js': 'error',
    });

    try {
      dom.window.eval(BOOTSTRAP_CODE);

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).not.toBeNull();

      const items = overlay.querySelectorAll('li');
      const failedNames = Array.from(items).map(li => li.textContent);
      expect(failedNames).toContain('src/core/utils.js');
    } finally {
      dom.window.close();
    }
  });

  it('lists multiple failed scripts in the overlay', async () => {
    const dom = createDomWithScriptOverrides({
      'src/core/utils.js': 'error',
      'src/core/main.js': 'error',
    });

    try {
      dom.window.eval(BOOTSTRAP_CODE);

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).not.toBeNull();

      const items = overlay.querySelectorAll('li');
      const failedNames = Array.from(items).map(li => li.textContent);
      expect(failedNames).toContain('src/core/utils.js');
      expect(failedNames).toContain('src/core/main.js');
    } finally {
      dom.window.close();
    }
  });

  it('does not show overlay when all scripts load successfully', async () => {
    const dom = createDomWithScriptOverrides({});

    try {
      dom.window.eval(BOOTSTRAP_CODE);

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).toBeNull();
    } finally {
      dom.window.close();
    }
  });
});
