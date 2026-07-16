import { injectScript } from './helpers/inject-script.js';

describe('ReleaseNotes', () => {
  beforeAll(() => {
    injectScript('src/features/release-notes.js');
  });

  beforeEach(() => {
    document.querySelectorAll('.release-notes-modal').forEach((el) => el.remove());
    localStorage.removeItem(window.releaseNotes.LAST_SEEN_VERSION_KEY);
    window.CURRENT_VERSION = '0.4.7';
  });

  it('does not show notes on fresh install (no stored version)', () => {
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('fresh-install');
    expect(document.querySelector('.release-notes-modal')).toBeNull();
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

  it('renders bundled notes for the upgraded version', () => {
    localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.4.6');
    window.releaseNotes.detectAndShow();
    const modal = document.querySelector('.release-notes-modal');
    expect(modal.querySelector('.release-notes-list li').textContent).toContain('Redesigned the Background tab');
  });

  it('handles versions without bundled notes without throwing', () => {
    window.CURRENT_VERSION = '9.9.9';
    localStorage.setItem(window.releaseNotes.LAST_SEEN_VERSION_KEY, '0.4.7');
    const result = window.releaseNotes.detectAndShow();
    expect(result).toBe('shown');
    expect(document.querySelector('.release-notes-modal')).not.toBeNull();
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
});
