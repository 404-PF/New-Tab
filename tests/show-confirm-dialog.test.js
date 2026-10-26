import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/data/custom-backgrounds.js');
  // Loaded so the Escape regression tests exercise the real MODAL_SELECTORS
  // path in shortcuts.js (issue #968).
  injectScript('src/features/shortcuts.js');
});

afterEach(() => {
  document.querySelectorAll('.bg-confirm-dialog').forEach(el => el.remove());
});

describe('showConfirmDialog', () => {
  it('appends a dialog to the DOM with correct structure', () => {
    window._customBackgrounds.showConfirmDialog('Title', 'Message');

    const dialog = document.querySelector('.bg-confirm-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-overlay')).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-content')).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-icon svg')).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-title')).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-message')).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-cancel')).not.toBeNull();
    expect(dialog.querySelector('.bg-confirm-delete')).not.toBeNull();
  });

  it('sets title and message via textContent (no innerHTML for user text)', () => {
    window._customBackgrounds.showConfirmDialog('My Title', 'My Message');

    const titleEl = document.querySelector('.bg-confirm-title');
    const messageEl = document.querySelector('.bg-confirm-message');
    expect(titleEl.textContent).toBe('My Title');
    expect(messageEl.textContent).toBe('My Message');
  });

  it('escapes HTML in title and message', () => {
    window._customBackgrounds.showConfirmDialog('<script>alert(1)</script>', '<img src=x onerror=alert(1)>');

    const titleEl = document.querySelector('.bg-confirm-title');
    const messageEl = document.querySelector('.bg-confirm-message');
    expect(titleEl.textContent).toBe('<script>alert(1)</script>');
    expect(messageEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(titleEl.querySelector('script')).toBeNull();
    expect(messageEl.querySelector('img')).toBeNull();
  });

  it('resolves true when delete button is clicked', async () => {
    const promise = window._customBackgrounds.showConfirmDialog('T', 'M');

    document.querySelector('.bg-confirm-delete').click();

    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolves false when cancel button is clicked', async () => {
    const promise = window._customBackgrounds.showConfirmDialog('T', 'M');

    document.querySelector('.bg-confirm-cancel').click();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('resolves false when overlay is clicked', async () => {
    const promise = window._customBackgrounds.showConfirmDialog('T', 'M');

    document.querySelector('.bg-confirm-overlay').click();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('removes the dialog from DOM after clicking delete', async () => {
    const promise = window._customBackgrounds.showConfirmDialog('T', 'M');

    document.querySelector('.bg-confirm-delete').click();
    await promise;

    // close() uses a 200ms timeout to remove the element
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(document.querySelector('.bg-confirm-dialog')).toBeNull();
  });

  it('adds bg-confirm-open class after append', async () => {
    window._customBackgrounds.showConfirmDialog('T', 'M');

    const dialog = document.querySelector('.bg-confirm-dialog');
    await vi.waitFor(() => {
      expect(dialog.classList.contains('bg-confirm-open')).toBe(true);
    });
  });

  it('gives the dialog the id looked up by the modal registries (#968)', () => {
    window._customBackgrounds.showConfirmDialog('T', 'M');

    const dialog = document.getElementById('bg-confirm-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog).toBe(document.querySelector('.bg-confirm-dialog'));
  });

  it('resolves false and removes the dialog on Escape (#968)', async () => {
    const promise = window._customBackgrounds.showConfirmDialog('T', 'M');
    const dialog = document.getElementById('bg-confirm-dialog');
    await vi.waitFor(() => expect(dialog.classList.contains('bg-confirm-open')).toBe(true));

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(await promise).toBe(false);

    // close() uses a 200ms timeout to remove the element
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(document.getElementById('bg-confirm-dialog')).toBeNull();
  });

  it('stays closed when Escape is pressed again (#968)', async () => {
    const promise = window._customBackgrounds.showConfirmDialog('T', 'M');
    const dialog = document.getElementById('bg-confirm-dialog');
    await vi.waitFor(() => expect(dialog.classList.contains('bg-confirm-open')).toBe(true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(second);

    // The second press must not re-close anything or swallow the event.
    expect(second.defaultPrevented).toBe(false);
    expect(await promise).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 250));
    expect(document.getElementById('bg-confirm-dialog')).toBeNull();
  });

  it('exposes closeConfirmDialog as a no-op when nothing is open (#968)', () => {
    expect(() => window._customBackgrounds.closeConfirmDialog()).not.toThrow();
  });

  it('translates the title, message, and buttons through i18n (#968)', async () => {
    const originalT = window.i18n.t;
    const strings = {
      customBackgroundDeleteConfirmTitle: 'Hintergrund löschen',
      customBackgroundDeleteConfirmMessage: 'Dieser benutzerdefinierte Hintergrund wird dauerhaft entfernt.',
      cancel: 'Abbrechen',
      delete: 'Löschen'
    };
    window.i18n.t = (key) => strings[key] || originalT(key);

    const delBtn = document.createElement('button');
    delBtn.className = 'custom-bg-delete-btn';
    delBtn.setAttribute('data-bg-id', 'custom_image_translate');
    document.body.appendChild(delBtn);

    try {
      delBtn.click();

      const dialog = document.getElementById('bg-confirm-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('.bg-confirm-title').textContent).toBe('Hintergrund löschen');
      expect(dialog.querySelector('.bg-confirm-message').textContent)
        .toBe('Dieser benutzerdefinierte Hintergrund wird dauerhaft entfernt.');
      expect(dialog.querySelector('.bg-confirm-cancel').textContent).toBe('Abbrechen');
      expect(dialog.querySelector('.bg-confirm-delete').textContent).toBe('Löschen');

      dialog.querySelector('.bg-confirm-cancel').click();
      await new Promise(resolve => setTimeout(resolve, 250));
      expect(document.getElementById('bg-confirm-dialog')).toBeNull();
    } finally {
      window.i18n.t = originalT;
      delBtn.remove();
    }
  });
});
