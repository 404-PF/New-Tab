import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { injectScript } from './helpers/inject-script.js';

const BOOTSTRAP_JS_PATH = resolve(process.cwd(), 'src/core/bootstrap.js');
const BOOTSTRAP_CODE = readFileSync(BOOTSTRAP_JS_PATH, 'utf-8');

describe('bootstrap error overlay', () => {
  function createDomWithScriptOverrides(scriptOverrides, includeI18n = false) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.com',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });

    dom.window.__storageBridgeReady = Promise.resolve();

    // Set up i18n mock if requested
    if (includeI18n) {
      dom.window.i18n = {
        t(key) {
          // Simulate i18n with translations for the bootstrap error keys
          const translations = {
            bootstrapErrorTitle: 'Extension failed to load',
            bootstrapErrorDesc: 'The following module(s) could not be loaded:',
            bootstrapErrorHint: 'If the problem persists, reinstall the extension.',
            bootstrapErrorReload: 'Reload'
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

  it('shows overlay listing failed scripts when a script fails to load', async () => {
    const dom = createDomWithScriptOverrides({
      'src/core/utils.js': 'error',
    });

    try {
      injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).not.toBeNull();

      const items = overlay.querySelectorAll('li');
      const failedNames = Array.from(items).map(li => li.textContent);
      expect(failedNames).toContain('src/core/utils.js');

      const reloadBtn = overlay.querySelector('button');
      expect(reloadBtn).not.toBeNull();
      expect(reloadBtn.textContent).toBe('Reload');
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
      injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());

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
      injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('uses English fallback strings when window.i18n is not available', async () => {
    const dom = createDomWithScriptOverrides({
      'src/core/utils.js': 'error',
    }, false); // explicitly no i18n

    try {
      injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).not.toBeNull();

      // Verify English fallback text is used
      const heading = overlay.querySelector('h2');
      expect(heading?.textContent).toBe('Extension failed to load');

      const description = overlay.querySelector('p');
      expect(description?.textContent).toBe('The following module(s) could not be loaded:');

      const paragraphs = overlay.querySelectorAll('p');
      const hint = paragraphs[paragraphs.length - 1];
      expect(hint?.textContent).toBe('If the problem persists, reinstall the extension.');

      const reloadBtn = overlay.querySelector('button');
      expect(reloadBtn?.textContent).toBe('Reload');
    } finally {
      dom.window.close();
    }
  });

  it('uses window.i18n translations when available', async () => {
    const dom = createDomWithScriptOverrides({
      'src/core/utils.js': 'error',
    }, true); // include i18n mock

    try {
      injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).not.toBeNull();

      // Verify i18n-backed text is used (same as English in this mock)
      const heading = overlay.querySelector('h2');
      expect(heading?.textContent).toBe('Extension failed to load');

      const description = overlay.querySelector('p');
      expect(description?.textContent).toBe('The following module(s) could not be loaded:');

      const paragraphs = overlay.querySelectorAll('p');
      const hint = paragraphs[paragraphs.length - 1];
      expect(hint?.textContent).toBe('If the problem persists, reinstall the extension.');

      const reloadBtn = overlay.querySelector('button');
      expect(reloadBtn?.textContent).toBe('Reload');
    } finally {
      dom.window.close();
    }
  });

  it('falls back to English when i18n returns the key itself (missing translation)', async () => {
    const dom = createDomWithScriptOverrides({
      'src/core/utils.js': 'error',
    });

    try {
      // Set up i18n that returns the key itself (simulating missing translation)
      dom.window.i18n = {
        t(key) {
          // Return the key itself to simulate missing translation
          return key;
        }
      };

      injectScript(BOOTSTRAP_CODE, dom.getInternalVMContext());

      await new Promise(resolve => setTimeout(resolve, 200));
      await dom.window.__storageBridgeReady;

      await new Promise(resolve => setTimeout(resolve, 200));

      const overlay = dom.window.document.getElementById('bootstrap-error-overlay');
      expect(overlay).not.toBeNull();

      // Verify English fallback is used when i18n returns the key
      const heading = overlay.querySelector('h2');
      expect(heading?.textContent).toBe('Extension failed to load');

      const description = overlay.querySelector('p');
      expect(description?.textContent).toBe('The following module(s) could not be loaded:');

      const paragraphs = overlay.querySelectorAll('p');
      const hint = paragraphs[paragraphs.length - 1];
      expect(hint?.textContent).toBe('If the problem persists, reinstall the extension.');

      const reloadBtn = overlay.querySelector('button');
      expect(reloadBtn?.textContent).toBe('Reload');
    } finally {
      dom.window.close();
    }
  });
});
