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
});
