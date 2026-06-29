import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

// bootstrap.js is an IIFE that must run in an isolated JSDOM with controlled
// script loading. This is the same pattern used by bootstrap-timeout.test.js.
const BOOTSTRAP_CODE = readFileSync(
  resolve(process.cwd(), 'src/core/bootstrap.js'), 'utf-8'
);

async function waitFor(predicate, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = predicate();
    if (result) return result;
    await new Promise(r => setTimeout(r, 10));
  }
  return predicate();
}

describe('bootstrap error overlay', () => {
  function createTestDom(scriptOverrides, includeI18n = false) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });

    dom.window.__storageBridgeReady = Promise.resolve();

    if (includeI18n) {
      dom.window.i18n = {
        t(key) {
          const translations = {
            bootstrapErrorTitle: 'i18n_TITLE',
            bootstrapErrorDesc: 'i18n_DESC',
            bootstrapErrorHint: 'i18n_HINT',
            bootstrapErrorReload: 'i18n_RELOAD'
          };
          return translations[key] || key;
        }
      };
    }

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

  async function runBootstrap(dom) {
    injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());
    await dom.window.__storageBridgeReady;
  }

  it('shows overlay listing failed scripts when a script fails to load', async () => {
    const dom = createTestDom({ 'src/core/utils.js': 'error' });
    try {
      await runBootstrap(dom);
      const overlay = await waitFor(() =>
        dom.window.document.getElementById('bootstrap-error-overlay')
      );
      expect(overlay).not.toBeNull();

      const failedNames = Array.from(overlay.querySelectorAll('li')).map(li => li.textContent);
      expect(failedNames).toContain('src/core/utils.js');

      const reloadBtn = overlay.querySelector('button');
      expect(reloadBtn).not.toBeNull();
      expect(reloadBtn.textContent).toBe('Reload');
    } finally {
      dom.window.close();
    }
  });

  it('lists multiple failed scripts in the overlay', async () => {
    const dom = createTestDom({
      'src/core/utils.js': 'error',
      'src/core/main.js': 'error',
    });
    try {
      await runBootstrap(dom);
      const overlay = await waitFor(() =>
        dom.window.document.getElementById('bootstrap-error-overlay')
      );
      expect(overlay).not.toBeNull();

      const failedNames = Array.from(overlay.querySelectorAll('li')).map(li => li.textContent);
      expect(failedNames).toContain('src/core/utils.js');
      expect(failedNames).toContain('src/core/main.js');
    } finally {
      dom.window.close();
    }
  });

  it('does not show overlay when all scripts load successfully', async () => {
    const dom = createTestDom({});
    try {
      await runBootstrap(dom);
      await new Promise(r => setTimeout(r, 100));
      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('uses English fallback strings when window.i18n is not available', async () => {
    const dom = createTestDom({ 'src/core/utils.js': 'error' }, false);
    try {
      await runBootstrap(dom);
      const overlay = await waitFor(() =>
        dom.window.document.getElementById('bootstrap-error-overlay')
      );
      expect(overlay).not.toBeNull();

      expect(overlay.querySelector('h2')?.textContent).toBe('Extension failed to load');
      expect(overlay.querySelector('p')?.textContent).toBe(
        'The following module(s) could not be loaded:'
      );
      const paragraphs = overlay.querySelectorAll('p');
      expect(paragraphs[paragraphs.length - 1]?.textContent).toBe(
        'If the problem persists, reinstall the extension.'
      );
      expect(overlay.querySelector('button')?.textContent).toBe('Reload');
    } finally {
      dom.window.close();
    }
  });

  it('uses window.i18n translations when available', async () => {
    const dom = createTestDom({ 'src/core/utils.js': 'error' }, true);
    try {
      await runBootstrap(dom);
      const overlay = await waitFor(() =>
        dom.window.document.getElementById('bootstrap-error-overlay')
      );
      expect(overlay).not.toBeNull();

      expect(overlay.querySelector('h2')?.textContent).toBe('i18n_TITLE');
      expect(overlay.querySelector('p')?.textContent).toBe('i18n_DESC');
      const paragraphs = overlay.querySelectorAll('p');
      expect(paragraphs[paragraphs.length - 1]?.textContent).toBe('i18n_HINT');
      expect(overlay.querySelector('button')?.textContent).toBe('i18n_RELOAD');
    } finally {
      dom.window.close();
    }
  });

  it('falls back to English when i18n returns the key itself (missing translation)', async () => {
    const dom = createTestDom({ 'src/core/utils.js': 'error' });
    try {
      dom.window.i18n = { t(key) { return key; } };
      await runBootstrap(dom);
      const overlay = await waitFor(() =>
        dom.window.document.getElementById('bootstrap-error-overlay')
      );
      expect(overlay).not.toBeNull();

      expect(overlay.querySelector('h2')?.textContent).toBe('Extension failed to load');
      expect(overlay.querySelector('p')?.textContent).toBe(
        'The following module(s) could not be loaded:'
      );
      const paragraphs = overlay.querySelectorAll('p');
      expect(paragraphs[paragraphs.length - 1]?.textContent).toBe(
        'If the problem persists, reinstall the extension.'
      );
      expect(overlay.querySelector('button')?.textContent).toBe('Reload');
    } finally {
      dom.window.close();
    }
  });
});
