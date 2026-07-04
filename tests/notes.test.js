import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function getNotes() {
  try {
    const raw = localStorage.getItem('notes');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid notes data in localStorage: expected array, resetting to empty list');
      return [];
    }
    return parsed;
  } catch (e) {
    console.warn('Failed to parse notes from localStorage, resetting to empty list:', e);
    return [];
  }
}

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
  document.querySelector('.notes-empty').style.display = 'block';
  initNotes();
});

describe('Notes persistence', () => {
  it('returns empty array when localStorage is empty', () => {
    expect(getNotes()).toEqual([]);
  });

  it('persists data to localStorage', () => {
    const data = [{ id: '1', text: 'Hello', createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
    setNotes(data);
    expect(getNotes()).toEqual(data);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('notes', 'not-json');
    initNotes();
    expect(getNotes()).toEqual([]);
    expect(document.getElementById('notes-empty').style.display).toBe('block');
  });

  it('resets non-array data on init', () => {
    localStorage.setItem('notes', '{"foo":"bar"}');
    initNotes();
    expect(document.getElementById('notes-empty').style.display).toBe('block');
    expect(document.querySelectorAll('.note-item')).toHaveLength(0);
  });

  it('rolls back note mutations on save failure', () => {
    const note = { id: '1', text: 'Keep me', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    setNotes([note]);
    initNotes();

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      addNote();
      expect(getNotes()).toHaveLength(1);
      expect(getNotes()[0].text).toBe('Keep me');

      deleteNote('1');
      expect(getNotes()).toHaveLength(1);

      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe('Notes CRUD', () => {
  it('addNote creates a new note at the top', () => {
    addNote();
    const list = getNotes();
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('');
    expect(list[0].id).toBeDefined();
  });

  it('addNote renders the note in the DOM', () => {
    addNote();
    const items = document.querySelectorAll('.note-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.note-textarea')).toBeTruthy();
  });

  it('deleteNote removes a note by id', () => {
    addNote();
    expect(getNotes()).toHaveLength(1);
    const id = getNotes()[0].id;

    deleteNote(id);
    expect(getNotes()).toHaveLength(0);
  });

  it('deleteNote removes the DOM element', () => {
    addNote();
    expect(document.querySelectorAll('.note-item')).toHaveLength(1);
    const id = getNotes()[0].id;

    deleteNote(id);
    expect(document.querySelectorAll('.note-item')).toHaveLength(0);
  });

  it('updateNoteText updates text and updatedAt', () => {
    addNote();
    const id = getNotes()[0].id;
    const originalUpdatedAt = getNotes()[0].updatedAt;

    updateNoteText(id, 'Updated text');
    expect(getNotes()[0].text).toBe('Updated text');
    expect(getNotes()[0].updatedAt).not.toBe(originalUpdatedAt);
  });

  it('updateNoteText does nothing for unknown id', () => {
    addNote();
    const original = getNotes();

    updateNoteText('nonexistent', 'text');
    expect(getNotes()).toEqual(original);
  });
});

describe('Notes empty state', () => {
  it('shows empty state when no notes exist', () => {
    const empty = document.getElementById('notes-empty');
    expect(empty.style.display).toBe('block');
  });

  it('hides empty state when notes exist', () => {
    setNotes([{ id: '1', text: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]);
    initNotes();

    const empty = document.getElementById('notes-empty');
    expect(empty.style.display).toBe('none');
    expect(document.querySelectorAll('.note-item')).toHaveLength(1);
  });
});

describe('Notes blur cleanup', () => {
  it('deletes empty notes on blur', () => {
    addNote();
    expect(getNotes()).toHaveLength(1);

    const ta = document.querySelector('.note-textarea');
    ta.value = '';
    ta.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(getNotes()).toHaveLength(0);
  });

  it('saves non-empty notes on blur', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');

    ta.value = 'Hello';
    ta.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(getNotes()).toHaveLength(1);
    expect(getNotes()[0].text).toBe('Hello');
  });
});

describe('Notes flushPendingSaves', () => {
  it('deletes an empty note on flush', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = '';

    ta.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('beforeunload'));

    expect(getNotes()).toHaveLength(0);
  });

  it('saves a non-empty note on flush', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = 'Hello world';

    ta.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('beforeunload'));

    expect(getNotes()).toHaveLength(1);
    expect(getNotes()[0].text).toBe('Hello world');
  });
});

describe('Notes rollback on save failure', () => {
  it('updateNoteText rolls back and re-renders on save failure', () => {
    addNote();
    const id = getNotes()[0].id;
    const originalText = getNotes()[0].text;

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      updateNoteText(id, 'New text that should not persist');

      expect(getNotes()).toHaveLength(1);
      expect(getNotes()[0].text).toBe(originalText);

      const textarea = document.querySelector('.note-textarea');
      expect(textarea.value).toBe(originalText);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('handleNotesBlur with empty note rolls back deleteNote on save failure and keeps DOM in sync', () => {
    addNote();
    expect(getNotes()).toHaveLength(1);

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const ta = document.querySelector('.note-textarea');
      ta.value = '';
      ta.dispatchEvent(new Event('blur', { bubbles: true }));

      expect(getNotes()).toHaveLength(1);
      expect(document.querySelectorAll('.note-item')).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('handleNotesBlur with non-empty note rolls back updateNoteText on save failure and re-renders original text', () => {
    addNote();

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Typed on blur';
      ta.dispatchEvent(new Event('blur', { bubbles: true }));

      expect(getNotes()).toHaveLength(1);
      expect(getNotes()[0].text).toBe('');
      const textarea = document.querySelector('.note-textarea');
      expect(textarea.value).toBe('');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('addNote rolls back and re-renders correctly when save fails after flushPendingSaves', () => {
    setNotes([{ id: 'existing-1', text: 'Existing note', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]);
    initNotes();
    expect(getNotes()).toHaveLength(1);

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      addNote();
      expect(getNotes()).toHaveLength(1);
      expect(getNotes()[0].text).toBe('Existing note');
      expect(document.querySelectorAll('.note-item')).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe('Notes event handlers', () => {
  it('handleNotesInput triggers debouncedSave and updates text after debounce delay', () => {
    vi.useFakeTimers();
    addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = 'Typed text';

    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getNotes()[0].text).toBe('');

    vi.advanceTimersByTime(500);
    expect(getNotes()[0].text).toBe('Typed text');
    vi.useRealTimers();
  });

  it('debouncedSave with empty text does not update note', () => {
    vi.useFakeTimers();
    addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = '';

    ta.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(getNotes()[0].text).toBe('');
    vi.useRealTimers();
  });

  it('handleNotesClick deletes a note via delete button click', () => {
    addNote();
    expect(getNotes()).toHaveLength(1);

    const deleteBtn = document.querySelector('.note-delete-btn');
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(getNotes()).toHaveLength(0);
    expect(document.querySelectorAll('.note-item')).toHaveLength(0);
  });

  it('handleNotesKeydown blurs textarea on Escape', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    const blurSpy = vi.spyOn(ta, 'blur');

    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });

  it('handleNotesKeydown does nothing for other keys', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    const blurSpy = vi.spyOn(ta, 'blur').mockImplementation(() => {});

    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(blurSpy).not.toHaveBeenCalled();
    blurSpy.mockRestore();
  });
});

describe('Notes multiple operations', () => {
  it('adds multiple notes and preserves order', () => {
    addNote();
    addNote();
    addNote();

    expect(getNotes()).toHaveLength(3);
    const items = document.querySelectorAll('.note-item');
    expect(items).toHaveLength(3);
  });

  it('deletes the correct note when multiple exist', () => {
    addNote();
    addNote();
    addNote();
    const notes = getNotes();
    const middleId = notes[1].id;

    deleteNote(middleId);
    expect(getNotes()).toHaveLength(2);
    expect(getNotes().find(n => n.id === middleId)).toBeUndefined();
  });

  it('flushPendingSaves processes all pending timers before addNote', () => {
    addNote();
    const firstId = getNotes()[0].id;
    const ta = document.querySelector('.note-textarea');
    ta.value = 'Updated before add';

    ta.dispatchEvent(new Event('input', { bubbles: true }));

    addNote();
    expect(getNotes()).toHaveLength(2);
    expect(getNotes().find(n => n.id === firstId).text).toBe('Updated before add');
  });
});

describe('Notes markdown preview', () => {
  describe('renderNotePreview via preview toggle', () => {
    it('shows empty preview for empty text', () => {
      addNote();
      const id = getNotes()[0].id;

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-preview').innerHTML).toBe('');
    });

    it('uses fallback HTML escaping when MarkdownParser is unavailable', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = undefined;
        addNote();
        const id = getNotes()[0].id;
        const ta = document.querySelector('.note-textarea');
        ta.value = 'Hello **world**';

        const previewBtn = document.querySelector('.note-preview-btn');
        previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const card = document.querySelector(`.note-item[data-id="${id}"]`);
        const preview = card.querySelector('.note-preview');
        expect(preview.innerHTML).toContain('Hello **world**');
        expect(preview.innerHTML).toContain('md-paragraph');
        expect(preview.innerHTML).not.toContain('<strong>');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('escapes HTML in fallback mode', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = undefined;
        addNote();
        const id = getNotes()[0].id;
        const ta = document.querySelector('.note-textarea');
        ta.value = '<script>alert(1)</script>';

        const previewBtn = document.querySelector('.note-preview-btn');
        previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const card = document.querySelector(`.note-item[data-id="${id}"]`);
        const preview = card.querySelector('.note-preview');
        expect(preview.innerHTML).not.toContain('<script>');
        expect(preview.innerHTML).toContain('&lt;script&gt;');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('converts newlines to <br /> in fallback mode', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = undefined;
        addNote();
        const id = getNotes()[0].id;
        const ta = document.querySelector('.note-textarea');
        ta.value = 'line1\nline2';

        const previewBtn = document.querySelector('.note-preview-btn');
        previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const card = document.querySelector(`.note-item[data-id="${id}"]`);
        const preview = card.querySelector('.note-preview');
        expect(preview.innerHTML).toContain('line1<br>line2');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('delegates to MarkdownParser.parse when available', () => {
      const mockParse = vi.fn().mockReturnValue('<p>parsed</p>');
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = { parse: mockParse };
        addNote();
        const ta = document.querySelector('.note-textarea');
        ta.value = 'Hello';

        const previewBtn = document.querySelector('.note-preview-btn');
        previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(mockParse).toHaveBeenCalledWith('Hello');
        const preview = document.querySelector('.note-preview');
        expect(preview.innerHTML).toBe('<p>parsed</p>');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('uses fallback when MarkdownParser.parse is not a function', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = { parse: 'not a function' };
        addNote();
        const ta = document.querySelector('.note-textarea');
        ta.value = 'test';

        const previewBtn = document.querySelector('.note-preview-btn');
        previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const preview = document.querySelector('.note-preview');
        expect(preview.innerHTML).toContain('md-paragraph');
      } finally {
        window.MarkdownParser = original;
      }
    });
  });

  describe('handleNotePreviewToggle via click', () => {
    it('toggles a note from edit mode to preview mode', () => {
      addNote();
      const id = getNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Test content';

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').style.display).not.toBe('none');
      expect(card.querySelector('.note-preview').innerHTML).toContain('Test content');
      expect(card.querySelector('.note-preview-btn').title).toBe('Edit');
    });

    it('toggles from preview mode back to edit mode', () => {
      addNote();
      const id = getNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Test content';

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).not.toBe('none');
      expect(card.querySelector('.note-preview').style.display).toBe('none');
      expect(card.querySelector('.note-preview-btn').title).toBe('Preview');
    });

    it('persists preview state across re-renders', () => {
      addNote();
      const id = getNotes()[0].id;
      updateNoteText(id, 'Persistent content');

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      initNotes();

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').innerHTML).toContain('Persistent content');
    });

    it('shows empty preview div for empty text', () => {
      addNote();
      const id = getNotes()[0].id;

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-preview').innerHTML).toBe('');
    });

    it('saves pending debounced content before entering preview mode', () => {
      vi.useFakeTimers();
      addNote();
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Unsaved typed text';

      ta.dispatchEvent(new Event('input', { bubbles: true }));

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(getNotes()[0].text).toBe('Unsaved typed text');
      vi.useRealTimers();
    });
  });

  describe('Notes preview click delegation', () => {
    it('handleNotesClick triggers preview toggle for preview button', () => {
      addNote();
      const id = getNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Click test';

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').style.display).not.toBe('none');
    });
  });

  describe('Notes blur in preview mode', () => {
    it('does not delete empty note on blur when in preview mode', () => {
      addNote();
      expect(getNotes()).toHaveLength(1);

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const ta = document.querySelector('.note-textarea');
      ta.value = '';
      ta.dispatchEvent(new Event('blur', { bubbles: true }));

      expect(getNotes()).toHaveLength(1);
    });

    it('skips save on blur when in preview mode (textarea is hidden and stale)', () => {
      addNote();

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const ta = document.querySelector('.note-textarea');
      ta.value = 'Should not save';
      ta.dispatchEvent(new Event('blur', { bubbles: true }));

      expect(getNotes()).toHaveLength(1);
      expect(getNotes()[0].text).toBe('');
    });
  });

  describe('Notes preview DOM structure', () => {
    it('note card includes preview div, preview button, and delete button', () => {
      addNote();
      const card = document.querySelector('.note-item');
      expect(card.querySelector('.note-preview')).toBeTruthy();
      expect(card.querySelector('.note-preview-btn')).toBeTruthy();
      expect(card.querySelector('.note-delete-btn')).toBeTruthy();
    });

    it('preview div is hidden by default in edit mode', () => {
      addNote();
      const card = document.querySelector('.note-item');
      expect(card.querySelector('.note-preview').style.display).toBe('none');
    });

    it('preview button SVG has eye icon by default', () => {
      addNote();
      const btn = document.querySelector('.note-preview-btn');
      expect(btn.innerHTML).toContain('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
    });

    it('preview button shows pencil icon when in preview mode', () => {
      addNote();
      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const btn = document.querySelector('.note-preview-btn');
      expect(btn.innerHTML).toContain('M11 4H4a2 2 0 0 0-2 2v14');
    });
  });

  describe('Notes delete in preview mode', () => {
    it('deleteNote cleans up preview state', () => {
      addNote();
      const id = getNotes()[0].id;

      const previewBtn = document.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      deleteNote(id);
      expect(getNotes()).toHaveLength(0);
    });
  });

  describe('Notes blur before preview click race condition', () => {
    it('does not delete empty note when preview button mousedown precedes blur', () => {
      addNote();
      const id = getNotes()[0].id;
      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      const ta = card.querySelector('.note-textarea');

      const previewBtn = card.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      ta.dispatchEvent(new Event('blur', { bubbles: true }));

      expect(getNotes()).toHaveLength(1);

      previewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').style.display).not.toBe('none');
    });

    it('still deletes empty note on normal blur (no preview mousedown)', () => {
      addNote();
      expect(getNotes()).toHaveLength(1);
      const card = document.querySelector('.note-item');
      const ta = card.querySelector('.note-textarea');

      ta.dispatchEvent(new Event('blur', { bubbles: true }));

      expect(getNotes()).toHaveLength(0);
    });
  });
});
