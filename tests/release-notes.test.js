import { injectScript } from './helpers/inject-script.js';

describe('ReleaseNotes', () => {
  beforeAll(() => {
    injectScript('src/features/release-notes.js');
  });

  beforeEach(() => {
    document.querySelectorAll('.release-notes-modal').forEach((el) => el.remove());
    localStorage.removeItem(window.releaseNotes.LAST_SEEN_VERSION_KEY);
    localStorage.removeItem(window.releaseNotes.INSTALL_REASON_KEY);
    window.CURRENT_VERSION = '0.4.7';
  });

  it('shows notes when upgrading from a pre-feature install (no stored version, update reason)', () => {
    localStorage.setItem(window.releaseNotes.INSTALL_REASON_KEY, 'update');
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('shown');
    const modal = document.querySelector('.release-notes-modal');
    expect(modal).not.toBeNull();
    expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBe('0.4.7');
    // Subsequent runs with the version now stored are a no-op.
    expect(window.releaseNotes.detectAndShow()).toBe('up-to-date');
    expect(document.querySelectorAll('.release-notes-modal').length).toBe(1);
  });

  it('does not show notes on a fresh install (no stored version, install reason)', () => {
    localStorage.setItem(window.releaseNotes.INSTALL_REASON_KEY, 'install');
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('fresh-install');
    expect(document.querySelector('.release-notes-modal')).toBeNull();
    expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBe('0.4.7');
    // Subsequent runs with the version now stored are a no-op.
    expect(window.releaseNotes.detectAndShow()).toBe('up-to-date');
  });

  it('waits without recording the version when the install reason has not arrived', () => {
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('pending');
    expect(document.querySelector('.release-notes-modal')).toBeNull();
    expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBeNull();
  });

  it('retries detection when a delayed update reason arrives', async () => {
    expect(window.releaseNotes.detectAndShow()).toBe('pending');

    await chrome.storage.local.set({
      [window.releaseNotes.INSTALL_REASON_KEY]: 'update'
    });

    expect(document.querySelector('.release-notes-modal')).not.toBeNull();
    expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBe('0.4.7');
  });

  it('shows notes after an upgrade and records the new version', () => {
    localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.4.6');
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('shown');
    const modal = document.querySelector('.release-notes-modal');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('v0.4.7');
    expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBe('0.4.7');
  });

  it('does not re-show notes for the same already-seen version', () => {
    localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.4.7');
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('up-to-date');
    expect(document.querySelector('.release-notes-modal')).toBeNull();
  });

  it('skips detection when CURRENT_VERSION is unavailable', () => {
    window.CURRENT_VERSION = null;
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('skipped');
    expect(document.querySelector('.release-notes-modal')).toBeNull();
  });

  [
    ['0.4.7', '0.4.6', 'Redesigned the Background tab'],
    ['0.4.8', '0.4.7', 'focus-mode layout'],
    ['0.5.0', '0.4.9', 'Flappy Bird'],
    ['0.5.4', '0.5.3', 'Added multi-select to the Todo list with bulk complete and delete']
  ].forEach(([version, previousVersion, expectedNote]) => {
    it(`renders bundled notes for the ${version} release`, () => {
      window.CURRENT_VERSION = version;
      localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, previousVersion);
      const result = window.releaseNotes.detectAndShow();
      const modal = document.querySelector('.release-notes-modal');

      expect(result).toBe('shown');
      expect(modal).not.toBeNull();
      expect(modal.querySelector('.release-notes-list li').textContent).toContain(expectedNote);
      expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBe(version);
    });
  });

  it('handles versions without bundled notes without throwing', () => {
    window.CURRENT_VERSION = '9.9.9';
    localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.4.7');
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('shown');
    const modal = document.querySelector('.release-notes-modal');
    expect(modal).not.toBeNull();
    expect(modal.querySelector('.release-notes-list li').textContent).toBe(
      'Check the full changelog for everything included in this update.'
    );
    expect(localStorage.getItem(window.releaseNotes.LAST_SEEN_VERSION_KEY)).toBe('9.9.9');
  });

  it('closes the modal when the dismiss button is clicked', () => {
    localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.4.6');
    window.releaseNotes.detectAndShow();
    const dismiss = document.querySelector('#release-notes-dismiss');
    expect(dismiss).not.toBeNull();
    dismiss.click();
    expect(document.querySelector('.release-notes-modal')).toBeNull();
  });

  // Every bullet is an i18n key (issue #972), so these run against the real
  // languages.js/locale tables instead of the mock window.i18n from setup.js.
  describe('localized bullets', () => {
    let mockI18n;

    // showReleaseNotesModal() waits on i18n.ensureLocale() before rendering
    // when the real i18n is installed, so the modal lands one tick later.
    const flushModalRender = () => new Promise((resolve) => setTimeout(resolve, 0));

    const readBullets = () =>
      Array.from(document.querySelectorAll('.release-notes-list li'), (li) => li.textContent);

    beforeAll(() => {
      mockI18n = window.i18n;
      injectScript('src/core/languages.js');
    });

    afterAll(() => {
      window.i18n = mockI18n;
    });

    it('renders the active language for every bullet of the current release', async () => {
      injectScript('src/core/locales/de.js');
      await window.i18n.applyLanguage('de');

      window.CURRENT_VERSION = '0.5.4';
      localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.5.3');
      expect(window.releaseNotes.detectAndShow()).toBe('shown');
      await flushModalRender();

      const keys = window.releaseNotes.RELEASE_NOTES['0.5.4'];
      const german = window.i18n.getTranslations('de');
      const english = window.i18n.getTranslations('en');
      const bullets = readBullets();

      expect(bullets.length).toBe(keys.length);
      expect(bullets).toEqual(keys.map((key) => german[key]));
      keys.forEach((key) => {
        expect(german[key], key).not.toBe(english[key]);
        expect(bullets.join('\n'), key).not.toContain(english[key]);
      });
    });

    it('falls back to English instead of the raw key for an untranslated locale', async () => {
      // A registered table without release-note entries — the state of a
      // locale that shipped before a key existed — must resolve through
      // getTranslation()'s en fallback rather than print the key name. A code
      // outside SUPPORTED_LANGUAGES keeps the merge passes from filling the
      // table in again, which is exactly the "key not translated yet" case.
      // Use a real bundled release so actual bullet keys are rendered, not
      // just the fallback-only array.
      window.i18n.__registerLocale('xx', {});
      await window.i18n.applyLanguage('xx');

      window.CURRENT_VERSION = '0.5.4';
      localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.5.3');
      expect(window.releaseNotes.detectAndShow()).toBe('shown');
      await flushModalRender();

      const english = window.i18n.getTranslations('en');
      expect(readBullets()).toEqual(
        window.releaseNotes.RELEASE_NOTES['0.5.4'].map((key) => english[key])
      );
    });

    it('resolves every bundled bullet to a real English sentence', () => {
      const english = window.i18n.getTranslations('en');

      Object.values(window.releaseNotes.RELEASE_NOTES).forEach((keys) => {
        expect(keys.length).toBeGreaterThan(0);
        keys.forEach((key) => {
          expect(english, `en:${key}`).toHaveProperty(key);
          expect(english[key], `en:${key}`).toBeTypeOf('string');
          expect(english[key], `en:${key}`).not.toBe(key);
        });
      });
      expect(english.releaseNotesFallback).toBeTypeOf('string');
      expect(english.releaseNotesFallback).not.toBe('releaseNotesFallback');
    });
  });
});
