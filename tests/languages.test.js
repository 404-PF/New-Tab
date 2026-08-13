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

const GAMES_TRANSLATION_KEYS = [
  'games',
  'enableGames',
  'gamesPlay',
  'gamesBack',
  'gamesScore',
  'gamesHighScore',
  'gamesBestMoves',
  'gamesMoves',
  'gamesTime',
  'gamesGameOver',
  'gamesYouWin',
  'gamesPaused',
  'gamesPressSpace',
  'gamesNoGames',
  'gamesDisabled',
  'gamesSnake',
  'gamesSnakeDesc',
  'gamesSnakeControls',
  'games2048',
  'games2048Desc',
  'games2048Controls',
  'gamesMemory',
  'gamesMemoryDesc',
  'gamesMemoryControls',
  'gamesLevel',
  'gamesReady',
  'gamesReadyStart',
  'gamesStart'
];

let originalLanguage;

beforeAll(() => {
  injectScript('src/core/languages.js');
  originalLanguage = window.i18n.currentLanguage();
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
