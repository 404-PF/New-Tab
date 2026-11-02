import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

// Regression coverage for the dead-code cleanup batch in issue #1093.
// Each removed symbol must stay gone, and the live twins the cleanup kept
// (pill-driven todo status filters, utils.js URL helpers, blob URL
// revocation, base-code flappy/pacman merges) must keep working.
//
// NOTE: describe blocks run in declaration order and share one jsdom
// global, so the app-grid-storage block must run before utils.js is
// injected to exercise its isolated-injection fallback.

describe('dead code cleanup (#1093)', () => {
  it('New-Tab.html has no #filter-status element; status filtering ships as pills', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
    expect(html).not.toMatch(/id="filter-status"/);
    expect(html).toMatch(/data-filter="pending"/);
  });

  it('test setup no longer stubs #filter-status', () => {
    expect(document.getElementById('filter-status')).toBeNull();
  });

  describe('app-grid-storage.js (injected without utils.js)', () => {
    beforeAll(() => {
      injectScript('src/core/app-grid-storage.js');
    });

    it('no longer exports window.__fallbackIsCustomScheme', () => {
      expect(window.__fallbackIsCustomScheme).toBeUndefined();
    });

    it('still normalizes app URLs via the documented test-injection fallback', () => {
      expect(window.normalizeCustomAppUrl).toBeUndefined();
      expect(AppGridStorage.saveCustomApps([{ id: 'a', url: 'https://example.com' }])).toBe(true);
      expect(AppGridStorage.loadCustomApps()[0].url).toBe('https://example.com');
    });
  });

  describe('utils.js', () => {
    beforeAll(() => {
      injectScript('src/core/utils.js');
    });

    it('keeps hasHttpScheme but no longer exports hasHttpSchemeSafe', () => {
      expect(typeof window.hasHttpScheme).toBe('function');
      expect(window.hasHttpSchemeSafe).toBeUndefined();
    });

    it('still exposes the live URL helpers', () => {
      expect(typeof window.isCustomScheme).toBe('function');
      expect(typeof window.normalizeCustomAppUrl).toBe('function');
    });
  });

  describe('custom-backgrounds.js', () => {
    beforeAll(() => {
      injectScript('src/data/custom-backgrounds.js');
    });

    it('no longer exports getBlobUrl but keeps blob URL revocation', () => {
      expect(window._customBackgrounds.getBlobUrl).toBeUndefined();
      expect(typeof window._customBackgrounds.revokeAll).toBe('function');
    });
  });

  describe('languages.js', () => {
    beforeAll(() => {
      injectScript('src/core/languages.js');
    });

    it('still merges flappy/pacman strings for the registered base code', () => {
      const en = window.i18n.getTranslations('en');
      expect(en.gamesFlappyBird).toBeTypeOf('string');
      expect(en.gamesFlappyBird.trim()).not.toBe('');
      expect(en.gamesPacman).toBeTypeOf('string');
      expect(en.gamesPacman.trim()).not.toBe('');
    });

    it('keeps the live pomodoro underscore rows', () => {
      const en = window.i18n.getTranslations('en');
      expect(en.enablePomodoro).toBeTypeOf('string');
      expect(en.enablePomodoro.trim()).not.toBe('');
    });
  });
});
