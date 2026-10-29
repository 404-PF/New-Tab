import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

function expectTranslationKeys(keys, options) {
  const differFromEnglish = Boolean(options && options.differFromEnglish);
  const languages = window.i18n.getSupportedLanguages();
  const english = differFromEnglish ? window.i18n.getTranslations('en') : null;

  languages.forEach(({ code }) => {
    const localeTranslations = window.i18n.getTranslations(code);

    keys.forEach((key) => {
      expect(localeTranslations, `${code}:${key}`).toHaveProperty(key);
      expect(localeTranslations[key], `${code}:${key}`).toBeTypeOf('string');
      expect(localeTranslations[key].trim(), `${code}:${key}`).not.toBe('');
      // A locale that echoes the key name has no real translation.
      expect(localeTranslations[key], `${code}:${key}`).not.toBe(key);
      if (differFromEnglish && code !== 'en') {
        expect(localeTranslations[key], `${code}:${key}`).not.toBe(english[key]);
      }
    });
  });
}

// Asserts a feedback key ships in every _locales/<locale>/messages.json with
// its own non-empty message and description. Shared by the save-error keys
// that must exist both as runtime translations and as chrome.i18n messages.
function expectMessagesJsonKey(key) {
  const localesDir = resolve(process.cwd(), '_locales');
  const locales = readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  expect(locales.length).toBeGreaterThan(0);

  const english = JSON.parse(
    readFileSync(resolve(localesDir, 'en', 'messages.json'), 'utf8')
  )[key].message;

  locales.forEach((locale) => {
    const file = resolve(localesDir, locale, 'messages.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed, `${locale}:${key}`).toHaveProperty(key);
    const entry = parsed[key];
    expect(entry.message, `${locale}`).toBeTypeOf('string');
    expect(entry.message.trim(), `${locale}`).not.toBe('');
    expect(entry.description, `${locale}`).toBeTypeOf('string');
    // en and en_US are the English source strings, so every other locale
    // must ship its own copy rather than a copy of the English text.
    if (locale !== 'en' && locale !== 'en_US') {
      expect(entry.message, `${locale}:${key}`).not.toBe(english);
    }
  });
}

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
  'customBackgroundDeleteError',
  'customBackgroundDialogError',
  'customBgSelectVideo',
  'customBgSelectImage',
  'customBgProcessError'
];

const CUSTOM_BACKGROUND_DIALOG_TRANSLATION_KEYS = [
  'customBackgroundDeleteConfirmTitle',
  'customBackgroundDeleteConfirmMessage'
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

const AI_TRANSLATION_KEYS = [
  'aiExportConversation',
  'aiExportAll',
  'aiExportSuccess',
  'aiExportAllSuccess',
  'aiExportError',
  'aiSaveError',
  'aiStorageFullError',
  'aiConversationLoadError',
  'aiRegenerate',
  'aiRenameConversation'
];

// Derived from the source's window.i18n.gamesTranslationKeys in beforeAll so
// this list can never drift from the keys languages.js actually defines.
let GAMES_TRANSLATION_KEYS = [];

// Derived from the exported release-notes data in beforeAll so this list can
// never drift from src/features/release-notes.js — a newly added raw English
// bullet (or a key omitted from the locales) fails the check below.
let RELEASE_NOTES_TRANSLATION_KEYS = [];

let originalLanguage;

beforeAll(() => {
  injectScript('src/core/languages.js');
  // Non-en tables are lazy-loaded now (issue #927); inject them so the
  // completeness checks below see every supported locale.
  ['zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru'].forEach((code) => {
    injectScript('src/core/locales/' + code + '.js');
  });
  injectScript('src/features/release-notes.js');
  originalLanguage = window.i18n.currentLanguage();
  GAMES_TRANSLATION_KEYS = window.i18n.gamesTranslationKeys;
  RELEASE_NOTES_TRANSLATION_KEYS = Array.from(
    new Set(Object.values(window.releaseNotes.RELEASE_NOTES).flat())
  ).concat('releaseNotesFallback');
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


describe('Search provider save error translation', () => {
  it('defines a localized searchProviderSaveError for every supported language', () => {
    expectTranslationKeys(['searchProviderSaveError', 'dataImportLateWriteFailure'], { differFromEnglish: true });
  });
});

describe('Storage/copy failure translations', () => {
  it('defines localized notesSaveError, todoSaveError and copyFailed for every supported language', () => {
    expectTranslationKeys(['notesSaveError', 'todoSaveError', 'copyFailed'], { differFromEnglish: true });
  });
});

const AI_COPY_LABEL_TRANSLATION_KEYS = [
  'copySuccess',
  'copyFailedShort'
];

describe('AI copy button label translations (issue #970)', () => {
  it('defines localized copySuccess and copyFailedShort for every supported language', () => {
    expectTranslationKeys(AI_COPY_LABEL_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

describe('Search unavailable fallback translations (#973)', () => {
  it('defines a localized validationSearchUnavailable for every supported language', () => {
    expectTranslationKeys(['validationSearchUnavailable'], { differFromEnglish: true });
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
  // Inspect getTranslations() directly rather than t(): t() silently falls
  // back to the English string when a locale omits the key, so a missing
  // customBackgroundDialogError entry would still pass a t()-based check.
  it('defines every error message for all supported languages', () => {
    expectTranslationKeys(CUSTOM_BACKGROUND_ERROR_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

const DATA_MEDIA_BACKUP_TRANSLATION_KEYS = [
  'dataExportMediaSkipped',
  'dataImportInvalidCustomBackgrounds',
  'dataImportInvalidMedia',
  'dataImportMediaTooLarge',
  'dataLimitationsDesc'
];

describe('Custom background media backup translations (issue #996)', () => {
  it('defines every media backup message for all supported languages', () => {
    // differFromEnglish: the size-limit warning and the import validation
    // errors must be localized in every locale, not just the English fallback.
    expectTranslationKeys(DATA_MEDIA_BACKUP_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

describe('Custom background confirm dialog translations (issue #968)', () => {
  it('defines the delete confirmation title and message for all supported languages', () => {
    // differFromEnglish: every non-English locale must ship its own copy, not
    // the English fallback behind a passing presence check.
    expectTranslationKeys(CUSTOM_BACKGROUND_DIALOG_TRANSLATION_KEYS, { differFromEnglish: true });
  });

  it('renders the confirmation strings through t() at runtime', async () => {
    const languages = window.i18n.getSupportedLanguages();

    for (const { code } of languages) {
      await window.i18n.applyLanguage(code);

      CUSTOM_BACKGROUND_DIALOG_TRANSLATION_KEYS.forEach((key) => {
        expect(window.i18n.t(key), `${code}:${key}`).toBe(
          window.i18n.getTranslations(code)[key]
        );
      });
    }
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

describe('AI translations', () => {
  // Inspect getTranslations() directly rather than t(): t() silently falls
  // back to English when a locale lacks the key, which would hide a stale
  // non-English entry behind a passing assertion.
  it('defines every AI string in each supported language', () => {
    expectTranslationKeys(AI_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

const TODO_BULK_TRANSLATION_KEYS = [
  'bulkActionsLabel',
  'bulkComplete',
  'bulkDelete',
  'selectedCount',
  'todoSelectAria'
];

describe('Todo bulk selection translations (issue #942)', () => {
  it('defines every bulk-toolbar string in each supported language', () => {
    expectTranslationKeys(TODO_BULK_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

const TODO_SUBTASK_ARIA_TRANSLATION_KEYS = [
  'todoSubtaskToggleAria',
  'todoSubtaskAria',
  'todoSubtaskUntitled'
];

describe('Todo subtask aria-label translations (issue #1059)', () => {
  it('defines every subtask screen-reader string in each supported language', () => {
    expectTranslationKeys(TODO_SUBTASK_ARIA_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

describe('t() placeholder replacement safety (issue #1059)', () => {
  it('keeps $&, $` and $\' in user text literal instead of expanding them', () => {
    const template = window.i18n.t('todoSubtaskToggleAria');
    const text = 'Costs $& or $\' or $` now';
    expect(window.i18n.t('todoSubtaskToggleAria', { text }))
      .toBe(template.split('{text}').join(text));
  });
});

const TODO_SORT_TRANSLATION_KEYS = [
  'todoSortLabel',
  'todoSortManual',
  'todoSortDue',
  'todoSortPriority',
  'todoSortCreated',
  'todoSortAz'
];

describe('Todo sort selector translations (issue #1013)', () => {
  it('defines every todo sort string in each supported language', () => {
    // Presence-only: 'Manual' (es/pt) and 'A-Z' (every locale) legitimately
    // match the English source, so differFromEnglish would be wrong here.
    expectTranslationKeys(TODO_SORT_TRANSLATION_KEYS);
  });
});

const TODO_SEARCH_TRANSLATION_KEYS = [
  'todoSearchPlaceholder',
  'todoNoResults'
];

describe('Todo search translations (issue #1060)', () => {
  it('defines every todo search string in each supported language', () => {
    expectTranslationKeys(TODO_SEARCH_TRANSLATION_KEYS);
  });

  it('includes the todo search strings in every _locales messages.json', () => {
    expectMessagesJsonKey('todoSearchPlaceholder');
    expectMessagesJsonKey('todoNoResults');
  });
});

describe('Todo no-results empty state sweep (issue #1060)', () => {
  it('keeps the no-results variant translated when the language changes', async () => {
    const container = document.createElement('div');
    container.className = 'empty-state';
    container.innerHTML = `
      <p data-i18n="todoNoResults">No matching todos.</p>
      <small data-i18n="emptyStateDesc">Try adding due dates for better organization.</small>
    `;
    // Insert before the setup's live .empty-state so the empty-state
    // updater (document.querySelector('.empty-state p')) selects this
    // fixture and the test covers the production no-results path.
    document.body.insertBefore(container, document.querySelector('.empty-state'));
    try {
      await window.i18n.applyLanguage('de');
      const paragraph = container.querySelector('p');
      expect(paragraph.textContent).toBe(window.i18n.getTranslations('de').todoNoResults);
      await window.i18n.applyLanguage('ja');
      expect(paragraph.textContent).toBe(window.i18n.getTranslations('ja').todoNoResults);
    } finally {
      container.remove();
    }
  });
});

const MISSING_UI_KEY_TRANSLATIONS = [
  'notesEditTooltip',
  'notesPreviewTooltip',
  'todoSubtaskDelete',
  'aiNoSearchResults'
];

describe('Notes/todo tooltip and AI search empty state translations', () => {
  it('defines every raw-key bug key in each supported language', () => {
    expectTranslationKeys(MISSING_UI_KEY_TRANSLATIONS, { differFromEnglish: true });
  });
});

describe('Games translations', () => {
  it('defines every games string in each supported language', () => {
    expectTranslationKeys(GAMES_TRANSLATION_KEYS);
  });
});

const BG_OVERLAY_TRANSLATION_KEYS = [
  'bgOverlay',
  'bgOverlayDesc',
  'bgOverlayDim',
  'bgOverlayBlur',
  'bgOverlayTint',
  'bgOverlayTintStrength',
  'bgOverlayReset'
];

const BG_OVERLAY_EXPECTED = {
  en: {
    bgOverlay: 'Readability',
    bgOverlayDesc: 'Dim, blur, or tint the background so text stays readable',
    bgOverlayDim: 'Dim',
    bgOverlayBlur: 'Blur',
    bgOverlayTint: 'Tint',
    bgOverlayTintStrength: 'Tint strength',
    bgOverlayReset: 'Reset overlay'
  },
  zh: {
    bgOverlay: '可读性',
    bgOverlayDesc: '调暗、模糊或着色背景，让文字更清晰',
    bgOverlayDim: '调暗',
    bgOverlayBlur: '模糊',
    bgOverlayTint: '着色',
    bgOverlayTintStrength: '着色强度',
    bgOverlayReset: '重置叠加层'
  },
  ja: {
    bgOverlay: '読みやすさ',
    bgOverlayDesc: '背景を暗く、ぼかし、または色付けして文字を読みやすくします',
    bgOverlayDim: '暗さ',
    bgOverlayBlur: 'ぼかし',
    bgOverlayTint: '色付け',
    bgOverlayTintStrength: '色の強さ',
    bgOverlayReset: 'オーバーレイをリセット'
  },
  ko: {
    bgOverlay: '가독성',
    bgOverlayDesc: '배경을 어둡게 하거나 흐리게 하거나 색을 더해 글자를 읽기 쉽게 합니다',
    bgOverlayDim: '어둡기',
    bgOverlayBlur: '흐림',
    bgOverlayTint: '색조',
    bgOverlayTintStrength: '색조 강도',
    bgOverlayReset: '오버레이 초기화'
  },
  es: {
    bgOverlay: 'Legibilidad',
    bgOverlayDesc: 'Oscurece, desenfoca o tiñe el fondo para que el texto se lea mejor',
    bgOverlayDim: 'Oscurecer',
    bgOverlayBlur: 'Desenfoque',
    bgOverlayTint: 'Tinte',
    bgOverlayTintStrength: 'Intensidad del tinte',
    bgOverlayReset: 'Restablecer superposición'
  },
  fr: {
    bgOverlay: 'Lisibilité',
    bgOverlayDesc: 'Assombrissez, floutez ou teintez l\'arrière-plan pour garder le texte lisible',
    bgOverlayDim: 'Assombrir',
    bgOverlayBlur: 'Flou',
    bgOverlayTint: 'Teinte',
    bgOverlayTintStrength: 'Intensité de la teinte',
    bgOverlayReset: 'Réinitialiser le calque'
  },
  de: {
    bgOverlay: 'Lesbarkeit',
    bgOverlayDesc: 'Hintergrund abdunkeln, weichzeichnen oder einfärben, damit Text lesbar bleibt',
    bgOverlayDim: 'Abdunkeln',
    bgOverlayBlur: 'Weichzeichnen',
    bgOverlayTint: 'Farbton',
    bgOverlayTintStrength: 'Farbstärke',
    bgOverlayReset: 'Overlay zurücksetzen'
  },
  pt: {
    bgOverlay: 'Legibilidade',
    bgOverlayDesc: 'Escureça, desfoque ou tinja o fundo para o texto continuar legível',
    bgOverlayDim: 'Escurecer',
    bgOverlayBlur: 'Desfoque',
    bgOverlayTint: 'Tonalidade',
    bgOverlayTintStrength: 'Intensidade da tonalidade',
    bgOverlayReset: 'Redefinir sobreposição'
  },
  ru: {
    bgOverlay: 'Читаемость',
    bgOverlayDesc: 'Затемните, размойте или подкрасьте фон, чтобы текст оставался читаемым',
    bgOverlayDim: 'Затемнение',
    bgOverlayBlur: 'Размытие',
    bgOverlayTint: 'Оттенок',
    bgOverlayTintStrength: 'Сила оттенка',
    bgOverlayReset: 'Сбросить наложение'
  }
};

describe('Background overlay translations', () => {
  it('defines every overlay string in each supported language', () => {
    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      const localeTranslations = window.i18n.getTranslations(code);
      const expected = BG_OVERLAY_EXPECTED[code];
      expect(expected, code).toBeTypeOf('object');

      BG_OVERLAY_TRANSLATION_KEYS.forEach((key) => {
        expect(localeTranslations[key], `${code}:${key}`).toBe(expected[key]);
        expect(expected[key].trim(), `${code}:${key}`).not.toBe('');
      });
    });
  });
});

describe('App grid context menu translations', () => {
  it('defines the sort action label for all supported languages', () => {
    // getTranslation silently falls back to the English string when a locale
    // omits the key, so each non-English locale must also differ from the
    // English value — not merely return something other than the key name.
    const englishLabel = window.i18n.getTranslations('en').sortAlphabetically;
    expect(englishLabel).toBeTypeOf('string');
    expect(englishLabel).not.toBe('');

    const languages = window.i18n.getSupportedLanguages();

    languages.forEach(({ code }) => {
      window.i18n.applyLanguage(code);

      const label = window.i18n.t('sortAlphabetically');
      expect(label, `${code}:sortAlphabetically`).not.toBe('sortAlphabetically');
      if (code !== 'en') {
        expect(label, `${code}:sortAlphabetically`).not.toBe(englishLabel);
      }
    });
  });
});

const DEFAULT_APP_VISIBILITY_TRANSLATION_KEYS = [
  'hideDefaultApp',
  'visibleApps',
  'visibleAppsDesc'
];

describe('Default app visibility translations', () => {
  it('defines every built-in app visibility string in each supported language', () => {
    expectTranslationKeys(DEFAULT_APP_VISIBILITY_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

// Keys backing the AI conversation-delete confirmation dialog and the
// Rename App / Change Thumbnail / Delete App / Edit Todo modals (issue #845).
const APP_MODAL_TRANSLATION_KEYS = [
  'aiDeleteConfirmTitle',
  'aiDeleteConfirmMessage',
  'aiCancel',
  'aiDelete',
  'cancel',
  'deleteApp',
  'changeThumbnail',
  'changeThumbnailTitle',
  'renameAppTitle',
  'renameAppDescription',
  'enterAppName',
  'changeThumbnailDescription',
  'enterIconUrl',
  'deleteAppTitle',
  'deleteAppMessage',
  'delete',
  'todoEditTitle',
  'todoEditText',
  'todoEditPriority',
  'todoSubtasks',
  'todoAddSubtask',
  'save',
  'playbackControls'
];

describe('App and todo modal translations', () => {
  it('defines every dialog string in each supported language', () => {
    // Assert getTranslations() directly: t() falls back to English (or echoes
    // the key), which would hide a missing entry behind a passing assertion.
    expectTranslationKeys(APP_MODAL_TRANSLATION_KEYS);
  });
});

describe('Release notes translations', () => {
  it('defines every bundled release-note bullet in each supported language', () => {
    expectTranslationKeys(RELEASE_NOTES_TRANSLATION_KEYS, { differFromEnglish: true });
  });
});

// Shared feedback string for feature toggles whose storage write the bridge
// rejected (issue #969).
describe('Feature toggle save error translation (issue #969)', () => {
  it('defines a localized featureToggleSaveError for every supported language', () => {
    expectTranslationKeys(['featureToggleSaveError'], { differFromEnglish: true });
  });

  it('includes featureToggleSaveError in every _locales messages.json', () => {
    expectMessagesJsonKey('featureToggleSaveError');
  });
});

// Shared feedback string for game saves whose storage write the bridge
// rejected (issue #1039).
describe('Game saves save error translation (issue #1039)', () => {
  it('defines a localized gameSavesSaveError for every supported language', () => {
    expectTranslationKeys(['gameSavesSaveError'], { differFromEnglish: true });
  });

  it('includes gameSavesSaveError in every _locales messages.json', () => {
    expectMessagesJsonKey('gameSavesSaveError');
  });
});

describe('New-Tab.html i18n key completeness', () => {
  it('resolves every data-i18n key used in New-Tab.html in the en dictionary', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)]
      .map((match) => match[1]);

    expect(keys.length).toBeGreaterThan(0);

    const english = window.i18n.getTranslations('en');
    [...new Set(keys)].sort().forEach((key) => {
      expect(english, `en:${key}`).toHaveProperty(key);
      expect(english[key], `en:${key}`).toBeTypeOf('string');
      expect(english[key].trim(), `en:${key}`).not.toBe('');
      // A dictionary entry equal to the key name is a missing translation.
      expect(english[key], `en:${key}`).not.toBe(key);
    });
  });

  it('wires the todo priority selector buttons to localized titles and aria-labels', () => {
    // #999: the priority dot buttons must not carry hardcoded English tooltips.
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
    const buttons = [...html.matchAll(/<button[^>]*class="priority-selector-btn[^"]*"[^>]*>/g)]
      .map((match) => match[0]);

    expectTranslationKeys(['priorityLowTitle', 'priorityMediumTitle', 'priorityHighTitle']);
    expect(buttons).toHaveLength(3);
    const expected = ['priorityLowTitle', 'priorityMediumTitle', 'priorityHighTitle'];
    buttons.forEach((button, index) => {
      expect(button, button).toContain(`data-i18n-title="${expected[index]}"`);
      expect(button, button).toContain(`data-i18n-aria-label="${expected[index]}"`);
      expect(button, button).not.toMatch(/title="(Low|Medium|High) Priority"/);
    });
  });

  it('defines the todo priority labels in every supported language', () => {
    expectTranslationKeys(['priorityLow', 'priorityMedium', 'priorityHigh']);
  });
});

// Motto pill action buttons (issue #975): New-Tab.html wires the buttons'
// aria-labels to the pre-existing refreshMotto/copyMotto keys.
describe('Motto button aria-label translations', () => {
  it('defines every motto button label in each supported language', () => {
    expectTranslationKeys(['refreshMotto', 'copyMotto'], { differFromEnglish: true });
  });
});

// App grid type-to-filter (issue #1065): the New-Tab.html input above the
// grid carries a localized placeholder and aria-label.
describe('App grid filter translations (issue #1065)', () => {
  it('defines the filter placeholder and aria-label in each supported language', () => {
    expectTranslationKeys(['appGridFilterPlaceholder', 'appGridFilterAriaLabel'], { differFromEnglish: true });
  });

  it('includes the filter strings in every _locales messages.json', () => {
    expectMessagesJsonKey('appGridFilterPlaceholder');
    expectMessagesJsonKey('appGridFilterAriaLabel');
  });
});
