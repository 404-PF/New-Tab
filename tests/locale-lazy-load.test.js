// Lazy locale loading (issue #927): languages.js only builds the inline en
// table; every other locale lives in src/core/locales/<code>.js and is
// appended on demand. These tests cover the acceptance criteria that the
// default en profile makes zero extra requests and that a non-English
// language is applied correctly once its locale file loads asynchronously.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const LOCALE_SCRIPT_SELECTOR = 'script[src^="src/core/locales/"]';

function localeScripts() {
  return Array.from(document.querySelectorAll(LOCALE_SCRIPT_SELECTOR));
}

function mountTranslatable() {
  const element = document.createElement('span');
  element.setAttribute('data-i18n', 'searchWith');
  element.textContent = 'stale';
  document.body.appendChild(element);
  return element;
}

let originalI18n;

beforeAll(() => {
  originalI18n = window.i18n;
  injectScript('src/core/languages.js');
});

afterAll(() => {
  window.i18n = originalI18n;
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('lazy locale loading', () => {
  it('applies English synchronously without requesting any locale script', async () => {
    const element = mountTranslatable();

    await window.i18n.applyLanguage('en');

    expect(localeScripts()).toHaveLength(0);
    expect(element.textContent).toBe(window.i18n.getTranslations('en').searchWith);
    expect(document.documentElement.lang).toBe('en');
  });

  it('sweeps a non-English language only after its locale file registers', async () => {
    const element = mountTranslatable();
    const applied = [];
    const onLanguageChanged = (event) => applied.push(event.detail.language);
    window.addEventListener('languageChanged', onLanguageChanged);

    try {
      const pending = window.i18n.applyLanguage('de');
      // A second caller (Settings + onboarding both can trigger this) must
      // reuse the in-flight load instead of requesting the script again.
      const alsoPending = window.i18n.applyLanguage('de');
      expect(localeScripts()).toHaveLength(1);
      expect(localeScripts()[0].getAttribute('src')).toBe('src/core/locales/de.js');

      // The table is not built yet: getTranslations guards to an empty
      // object, the sweep has not run, and t() falls back to English.
      expect(window.i18n.getTranslations('de')).toEqual({});
      expect(element.textContent).toBe('stale');
      expect(window.i18n.t('searchWith')).toBe('Search with');
      expect(applied).toEqual([]);

      // Simulate the locale script finishing its load/registration.
      injectScript('src/core/locales/de.js');
      await Promise.all([pending, alsoPending]);

      const german = window.i18n.getTranslations('de').searchWith;
      expect(german).toBeTypeOf('string');
      expect(german).not.toBe('');
      expect(german).not.toBe('Search with');
      expect(element.textContent).toBe(german);
      expect(applied).toEqual(['de', 'de']);
      expect(localeScripts()).toHaveLength(1);
    } finally {
      window.removeEventListener('languageChanged', onLanguageChanged);
    }
  });

  it('caches the locale load so repeated ensureLocale calls make one request', async () => {
    const first = window.i18n.ensureLocale('fr');
    const second = window.i18n.ensureLocale('fr');
    expect(second).toBe(first);
    expect(localeScripts()).toHaveLength(1);

    injectScript('src/core/locales/fr.js');
    await first;

    await window.i18n.ensureLocale('fr');
    expect(localeScripts()).toHaveLength(1);
    expect(window.i18n.getTranslations('fr').searchWith).toBeTypeOf('string');
  });

  it('merges every feature-string pass into a lazily registered locale', () => {
    injectScript('src/core/locales/ja.js');
    const ja = window.i18n.getTranslations('ja');

    expect(ja.gamesLevel).toBe('レベル');
    expect(ja.gamesReady).toBeTypeOf('string');
    expect(ja.gamesStart).toBeTypeOf('string');
    expect(ja.gamesFlappyBird).toBe('Flappy Bird');
    expect(ja.gamesPacman).toBe('パックマン');
    expect(ja.enablePomodoro).toBeTypeOf('string');
    expect(ja.accessibilityCalendar).toBe('カレンダー');
    expect(ja.aiExportAll).toBeTypeOf('string');
    expect(ja.customBackgroundsLoadError).toBeTypeOf('string');
    expect(ja.searchWith).toBeTypeOf('string');
  });

  it('keeps the en table untouched and available without any locale file', () => {
    const en = window.i18n.getTranslations('en');
    expect(en.searchWith).toBe('Search with');
    expect(en.gamesLevel).toBe('Level');
    expect(en.enablePomodoro).toBeTypeOf('string');
    expect(window.i18n.getSupportedLanguages()).toHaveLength(9);
  });
});
