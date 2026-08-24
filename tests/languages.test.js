import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const SEARCH_TRANSLATION_KEYS = [
  'searchWith',
  'searchProviderGoogle',
  'searchProviderBing',
  'searchProviderDuckDuckGo',
  'searchProviderWikipedia',
  'searchProviderYouTube'
];

const POMODORO_TRANSLATION_KEYS = [
  'enablePomodoro',
  'pomodoroDurations',
  'pomodoroDurationsDesc',
  'pomodoroWork',
  'pomodoroShortBreak',
  'pomodoroLongBreak',
  'pomodoroSessionsBeforeLong'
];

const CUSTOM_BACKGROUND_ERROR_TRANSLATION_KEYS = [
  'customBackgroundsLoadError',
  'customBackgroundLoadError',
  'customBackgroundDeleteError'
];

const ROTATION_UPLOADS_TRANSLATION_KEYS = [
  'bgRotationUploads'
];

// Expected value per locale for keys asserted below. English fallback would
// mask a missing non-English entry in a `.not.toBe(key)` check, so these
// assert the locale's own translation object directly.
const ROTATION_UPLOADS_EXPECTED = {
  en: 'Your uploads',
  zh: '上传的背景',
  ja: 'アップロードした背景',
  ko: '업로드한 배경',
  es: 'Tus subidas',
  fr: 'Vos importations',
  de: 'Deine Uploads',
  pt: 'Seus envios',
  ru: 'Ваши загрузки'
};

// Derived from the source's window.i18n.gamesTranslationKeys in beforeAll so
// this list can never drift from the keys languages.js actually defines.
let GAMES_TRANSLATION_KEYS = [];

let originalLanguage;

beforeAll(() => {
  injectScript('src/core/languages.js');
  originalLanguage = window.i18n.currentLanguage();
  GAMES_TRANSLATION_KEYS = window.i18n.gamesTranslationKeys;
});

afterEach(() => {
  if (originalLanguage && window.i18n) {
    window.i18n.applyLanguage(originalLanguage);
  }
});

describe('Search provider translations', () => {
  it('defines every provider label for all supported languages', () => {
    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      window.i18n.applyLanguage(code);

      SEARCH_TRANSLATION_KEYS.forEach((key) => {
        expect(window.i18n.t(key), `${code}:${key}`).not.toBe(key);
      });
    });
  });
});


describe('Pomodoro translations', () => {
  it('falls back to English for every supported language', () => {
    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      window.i18n.applyLanguage(code);

      POMODORO_TRANSLATION_KEYS.forEach((key) => {
        expect(window.i18n.t(key), code + ':' + key).not.toBe(key);
      });
    });
  });
});

describe('Custom background error translations', () => {
  it('defines every error message for all supported languages', () => {
    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      window.i18n.applyLanguage(code);

      CUSTOM_BACKGROUND_ERROR_TRANSLATION_KEYS.forEach((key) => {
        expect(window.i18n.t(key), `${code}:${key}`).not.toBe(key);
      });
    });
  });
});

describe('Rotation uploads translations', () => {
  it('defines every rotation uploads string in each supported language', () => {
    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      const localeTranslations = window.i18n.getTranslations(code);

      ROTATION_UPLOADS_TRANSLATION_KEYS.forEach((key) => {
        expect(localeTranslations, `${code}:${key}`).toHaveProperty(key);
        expect(localeTranslations[key], `${code}:${key}`).toBe(ROTATION_UPLOADS_EXPECTED[code]);
        expect(localeTranslations[key], `${code}:${key}`).not.toBe('');
      });
    });
  });

  it('resolves the active-language value at runtime', () => {
    window.i18n.applyLanguage('de');
    expect(window.i18n.t('bgRotationUploads')).toBe(ROTATION_UPLOADS_EXPECTED.de);
  });
});

describe('Games translations', () => {
  it('defines every games string in each supported language', () => {
    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      const localeTranslations = window.i18n.getTranslations(code);

      GAMES_TRANSLATION_KEYS.forEach((key) => {
        expect(localeTranslations, `${code}:${key}`).toHaveProperty(key);
        expect(localeTranslations[key], `${code}:${key}`).toBeTypeOf('string');
        expect(localeTranslations[key], `${code}:${key}`).not.toBe('');
      });
    });
  });
});
