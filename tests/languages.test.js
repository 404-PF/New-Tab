import { describe, it, expect, beforeAll } from 'vitest';
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

beforeAll(() => {
  injectScript('src/core/languages.js');
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
