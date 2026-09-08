import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function setNotes(data) {
  localStorage.setItem('notes', JSON.stringify(data));
}

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/features/notes.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelector('.notes-list').innerHTML = '';
  const emptyEl = document.querySelector('.notes-empty');
  if (emptyEl) {
    emptyEl.style.display = 'block';
    const p = emptyEl.querySelector('p');
    if (p) {
      p.textContent = window.i18n ? window.i18n.t('notesEmpty') : 'No notes yet. Click + to add one!';
      p.setAttribute('data-i18n', 'notesEmpty');
    }
  }
  const filterBar = document.getElementById('notes-tag-filter');
  if (filterBar) filterBar.innerHTML = '';
  const searchInput = document.getElementById('notes-search');
  if (searchInput) searchInput.value = '';
  if (typeof window.setNotesSearchQuery === 'function') window.setNotesSearchQuery('');
  initNotes();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Notes scroll stability (#688)', () => {
  it('keeps window.scrollY stable while typing in a note below the fold', async () => {
    vi.useFakeTimers();
    setNotes([
      { id: 'a', text: 'Top note', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'b', text: 'Middle note', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'c', text: 'Lower note to edit', tag: '', order: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();

    // Simulate page is scrolled down: note 'c' is below the fold.
    Object.defineProperty(window, 'scrollY', { value: 400, writable: true, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true, configurable: true });
    const scrollToSpy = vi.fn((x, y) => {
      window.scrollX = x;
      window.scrollY = y;
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollToSpy);

    // Mock requestAnimationFrame to run immediately for resize batch.
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb();
      return 1;
    });

    const lowerTextarea = document.querySelector('.note-textarea[data-id="c"]');
    expect(lowerTextarea).toBeTruthy();
    lowerTextarea.focus();
    lowerTextarea.selectionStart = 5;
    lowerTextarea.selectionEnd = 5;

    // In jsdom, reading scrollHeight never changes window.scrollY, so the
    // flushResizeBatch restore branch would never be taken. Mock the getter
    // to simulate the browser resetting scroll to top during a reflow.
    vi.spyOn(lowerTextarea, 'scrollHeight', 'get').mockImplementation(() => {
      window.scrollY = 0;
      return 80;
    });

    // Simulate continuous typing: several input events.
    lowerTextarea.value = 'Lower note to edit!';
    lowerTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    lowerTextarea.value = 'Lower note to edit!!';
    lowerTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    // Place caret where user would be after typing.
    lowerTextarea.selectionStart = lowerTextarea.value.length;
    lowerTextarea.selectionEnd = lowerTextarea.value.length;

    // Flush the resize rAF batch (mocked to run immediately above).
    // Also advance debounce timers to trigger saves (500ms).
    vi.advanceTimersByTime(500);

    // Scroll must remain stable — not reset to top.
    expect(window.scrollY).toBe(400);
    // The mock caused a scroll jump to 0 during the batch; the fix must
    // have restored via scrollTo. Without restoration the test would fail.
    expect(scrollToSpy).toHaveBeenCalled();
    for (const [, y] of scrollToSpy.mock.calls) {
      expect(y).not.toBe(0);
    }
    // Focus remains on the edited note.
    expect(document.activeElement).toBe(document.querySelector('.note-textarea[data-id="c"]'));

    rafSpy.mockRestore();
  });

  it('preserves focus, selection and scroll when renderNotes rebuilds while editing', () => {
    setNotes([
      { id: 'x', text: 'First', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'y', text: 'Second lower note', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();

    Object.defineProperty(window, 'scrollY', { value: 350, writable: true, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true, configurable: true });
    const scrollToSpy = vi.fn((x, y) => {
      window.scrollX = x;
      window.scrollY = y;
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollToSpy);

    const ta = document.querySelector('.note-textarea[data-id="y"]');
    ta.focus();
    ta.selectionStart = 2;
    ta.selectionEnd = 6;

    // In jsdom, clearing innerHTML and focusing never change window.scrollY,
    // so renderNotes' restore branches would never be exercised. Mock both
    // operations to simulate the browser jumping to top.
    const notesListEl = document.getElementById('notes-list');
    const origInnerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(notesListEl, 'innerHTML', {
      configurable: true,
      get() { return origInnerHTMLDesc.get.call(this); },
      set(val) {
        window.scrollY = 0;
        origInnerHTMLDesc.set.call(this, val);
      }
    });
    const originalFocus = HTMLElement.prototype.focus;
    const focusInterceptor = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (...args) {
      // renderNotes will call focus on the rebuilt textarea; simulate that
      // this focus resets scroll before the post-focus restore check.
      if (this.classList && this.classList.contains('note-textarea') && this.dataset.id === 'y') {
        // Let the original focus run first so activeElement updates, then jump.
        const result = originalFocus.apply(this, args);
        window.scrollY = 0;
        return result;
      }
      return originalFocus.apply(this, args);
    });

    try {
      // Force a re-render while editing (e.g., due to an external tag update /
      // language change that would previously destroy the focused textarea).
      // Directly invoke renderNotes via an API that triggers it: updateNoteTag on
      // the *other* note, which calls renderNotes. The focused note's DOM is rebuilt.
      updateNoteTag('x', 'work');

      expect(window.scrollY).toBe(350);
      const restored = document.querySelector('.note-textarea[data-id="y"]');
      expect(document.activeElement).toBe(restored);
      expect(restored.selectionStart).toBe(2);
      expect(restored.selectionEnd).toBe(6);
      // The mocks caused scroll jumps to 0; ensure the fix restored via scrollTo
      // and never left the viewport at top.
      expect(scrollToSpy).toHaveBeenCalled();
      for (const [, y] of scrollToSpy.mock.calls) {
        expect(y).not.toBe(0);
      }
    } finally {
      // Cleanup the innerHTML interceptor (vi.restoreAllMocks does not remove
      // defineProperty on the instance) even if an assertion fails.
      delete notesListEl.innerHTML;
      focusInterceptor.mockRestore();
    }
  });
});
