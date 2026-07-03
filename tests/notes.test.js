import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

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
  it('loadNotes returns empty array when localStorage is empty', () => {
    expect(loadNotes()).toEqual([]);
  });

  it('saveNotes persists to localStorage', () => {
    const data = [{ id: '1', text: 'Hello', createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
    saveNotes(data);
    expect(loadNotes()).toEqual(data);
  });

  it('loadNotes handles corrupted localStorage gracefully', () => {
    localStorage.setItem('notes', 'not-json');
    expect(loadNotes()).toEqual([]);
  });

  it('loadNotes resets non-array data', () => {
    localStorage.setItem('notes', '{"foo":"bar"}');
    expect(loadNotes()).toEqual([]);
  });

  it('saveNotes failures roll back note mutations', () => {
    const note = { id: '1', text: 'Keep me', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    saveNotes([note]);
    initNotes();

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      addNote();
      expect(loadNotes()).toHaveLength(1);
      expect(loadNotes()[0].text).toBe('Keep me');

      deleteNote('1');
      expect(loadNotes()).toHaveLength(1);

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
    const list = loadNotes();
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
    expect(loadNotes()).toHaveLength(1);
    const id = loadNotes()[0].id;

    deleteNote(id);
    expect(loadNotes()).toHaveLength(0);
  });

  it('deleteNote removes the DOM element', () => {
    addNote();
    expect(document.querySelectorAll('.note-item')).toHaveLength(1);
    const id = loadNotes()[0].id;

    deleteNote(id);
    expect(document.querySelectorAll('.note-item')).toHaveLength(0);
  });

  it('updateNoteText updates text and updatedAt', () => {
    addNote();
    const id = loadNotes()[0].id;
    const originalUpdatedAt = loadNotes()[0].updatedAt;

    updateNoteText(id, 'Updated text');
    expect(loadNotes()[0].text).toBe('Updated text');
    expect(loadNotes()[0].updatedAt).not.toBe(originalUpdatedAt);
  });

  it('updateNoteText does nothing for unknown id', () => {
    addNote();
    const original = loadNotes();

    updateNoteText('nonexistent', 'text');
    expect(loadNotes()).toEqual(original);
  });
});

describe('Notes empty state', () => {
  it('shows empty state when no notes exist', () => {
    const empty = document.getElementById('notes-empty');
    expect(empty.style.display).toBe('block');
  });

  it('hides empty state when notes exist', () => {
    saveNotes([{ id: '1', text: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]);
    initNotes();

    const empty = document.getElementById('notes-empty');
    expect(empty.style.display).toBe('none');
    expect(document.querySelectorAll('.note-item')).toHaveLength(1);
  });
});

describe('Notes blur cleanup', () => {
  it('deletes empty notes on blur', () => {
    addNote();
    expect(loadNotes()).toHaveLength(1);

    const id = loadNotes()[0].id;
    handleNotesBlur({ target: { closest: () => ({ dataset: { id }, value: '' }) } });
    expect(loadNotes()).toHaveLength(0);
  });

  it('saves non-empty notes on blur', () => {
    addNote();
    const id = loadNotes()[0].id;

    handleNotesBlur({ target: { closest: () => ({ dataset: { id }, value: 'Hello' }) } });
    expect(loadNotes()).toHaveLength(1);
    expect(loadNotes()[0].text).toBe('Hello');
  });
});

describe('Notes flushPendingSaves', () => {
  it('deletes an empty note on flush', () => {
    addNote();
    const id = loadNotes()[0].id;
    const ta = document.querySelector('.note-textarea');
    ta.value = '';

    debouncedSave(id, '');
    flushPendingSaves();

    expect(loadNotes()).toHaveLength(0);
  });

  it('saves a non-empty note on flush', () => {
    addNote();
    const id = loadNotes()[0].id;
    const ta = document.querySelector('.note-textarea');
    ta.value = 'Hello world';

    debouncedSave(id, 'Hello world');
    flushPendingSaves();

    expect(loadNotes()).toHaveLength(1);
    expect(loadNotes()[0].text).toBe('Hello world');
  });
});

describe('Notes rollback on save failure', () => {
  it('updateNoteText rolls back and re-renders on save failure', () => {
    addNote();
    const id = loadNotes()[0].id;
    const originalText = loadNotes()[0].text;

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      updateNoteText(id, 'New text that should not persist');

      expect(loadNotes()).toHaveLength(1);
      expect(loadNotes()[0].text).toBe(originalText);

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
    expect(loadNotes()).toHaveLength(1);
    const id = loadNotes()[0].id;

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      handleNotesBlur({ target: { closest: () => ({ dataset: { id }, value: '' }) } });

      expect(loadNotes()).toHaveLength(1);
      expect(document.querySelectorAll('.note-item')).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('handleNotesBlur with non-empty note rolls back updateNoteText on save failure and re-renders original text', () => {
    addNote();
    const id = loadNotes()[0].id;

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      handleNotesBlur({ target: { closest: () => ({ dataset: { id }, value: 'Typed on blur' }) } });

      expect(loadNotes()).toHaveLength(1);
      expect(loadNotes()[0].text).toBe('');
      const textarea = document.querySelector('.note-textarea');
      expect(textarea.value).toBe('');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('addNote rolls back and re-renders correctly when saveNotes fails after flushPendingSaves', () => {
    saveNotes([{ id: 'existing-1', text: 'Existing note', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]);
    initNotes();
    expect(loadNotes()).toHaveLength(1);

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      addNote();
      expect(loadNotes()).toHaveLength(1);
      expect(loadNotes()[0].text).toBe('Existing note');
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

    handleNotesInput({ target: ta });
    expect(loadNotes()[0].text).toBe('');

    vi.advanceTimersByTime(500);
    expect(loadNotes()[0].text).toBe('Typed text');
    vi.useRealTimers();
  });

  it('debouncedSave with empty text does not update note', () => {
    vi.useFakeTimers();
    addNote();
    const ta = document.querySelector('.note-textarea');
    ta.value = '';

    handleNotesInput({ target: ta });
    vi.advanceTimersByTime(500);
    expect(loadNotes()[0].text).toBe('');
    vi.useRealTimers();
  });

  it('handleNotesClick deletes a note via delete button click', () => {
    addNote();
    expect(loadNotes()).toHaveLength(1);
    const id = loadNotes()[0].id;

    handleNotesClick({ target: { closest: (sel) => sel === '.note-delete-btn' ? { dataset: { id } } : null } });
    expect(loadNotes()).toHaveLength(0);
    expect(document.querySelectorAll('.note-item')).toHaveLength(0);
  });

  it('handleNotesKeydown blurs textarea on Escape', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    const blurSpy = vi.spyOn(ta, 'blur');

    handleNotesKeydown({ target: { closest: () => ta }, key: 'Escape' });
    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });

  it('handleNotesKeydown does nothing for other keys', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    const blurSpy = vi.spyOn(ta, 'blur').mockImplementation(() => {});

    handleNotesKeydown({ target: { closest: () => ta }, key: 'Enter' });
    expect(blurSpy).not.toHaveBeenCalled();
    blurSpy.mockRestore();
  });
});

describe('Notes multiple operations', () => {
  it('adds multiple notes and preserves order', () => {
    addNote();
    addNote();
    addNote();

    expect(loadNotes()).toHaveLength(3);
    const items = document.querySelectorAll('.note-item');
    expect(items).toHaveLength(3);
  });

  it('deletes the correct note when multiple exist', () => {
    addNote();
    addNote();
    addNote();
    const notes = loadNotes();
    const middleId = notes[1].id;

    deleteNote(middleId);
    expect(loadNotes()).toHaveLength(2);
    expect(loadNotes().find(n => n.id === middleId)).toBeUndefined();
  });

  it('flushPendingSaves processes all pending timers before addNote', () => {
    addNote();
    const firstId = loadNotes()[0].id;
    const ta = document.querySelector('.note-textarea');
    ta.value = 'Updated before add';

    debouncedSave(firstId, 'Updated before add');

    addNote();
    expect(loadNotes()).toHaveLength(2);
    expect(loadNotes().find(n => n.id === firstId).text).toBe('Updated before add');
  });
});

describe('Notes markdown preview', () => {
  describe('renderNotePreview', () => {
    it('returns empty string for empty text', () => {
      expect(renderNotePreview('')).toBe('');
      expect(renderNotePreview(null)).toBe('');
      expect(renderNotePreview(undefined)).toBe('');
    });

    it('uses fallback HTML escaping when MarkdownParser is unavailable', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = undefined;
        const result = renderNotePreview('Hello **world**');
        expect(result).toContain('Hello **world**');
        expect(result).toContain('md-paragraph');
        expect(result).not.toContain('<strong>');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('escapes HTML in fallback mode', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = undefined;
        const result = renderNotePreview('<script>alert(1)</script>');
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('converts newlines to <br /> in fallback mode', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = undefined;
        const result = renderNotePreview('line1\nline2');
        expect(result).toContain('line1<br />line2');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('delegates to MarkdownParser.parse when available', () => {
      const mockParse = vi.fn().mockReturnValue('<p>parsed</p>');
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = { parse: mockParse };
        const result = renderNotePreview('Hello');
        expect(mockParse).toHaveBeenCalledWith('Hello');
        expect(result).toBe('<p>parsed</p>');
      } finally {
        window.MarkdownParser = original;
      }
    });

    it('uses fallback when MarkdownParser.parse is not a function', () => {
      const original = window.MarkdownParser;
      try {
        window.MarkdownParser = { parse: 'not a function' };
        const result = renderNotePreview('test');
        expect(result).toContain('md-paragraph');
      } finally {
        window.MarkdownParser = original;
      }
    });
  });

  describe('handleNotePreviewToggle', () => {
    it('toggles a note from edit mode to preview mode', () => {
      addNote();
      const id = loadNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Test content';

      handleNotePreviewToggle(id);

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').style.display).not.toBe('none');
      expect(card.querySelector('.note-preview').innerHTML).toContain('Test content');
      expect(card.querySelector('.note-preview-btn').title).toBe('Edit');
    });

    it('toggles from preview mode back to edit mode', () => {
      addNote();
      const id = loadNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Test content';

      handleNotePreviewToggle(id);
      handleNotePreviewToggle(id);

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).not.toBe('none');
      expect(card.querySelector('.note-preview').style.display).toBe('none');
      expect(card.querySelector('.note-preview-btn').title).toBe('Preview');
    });

    it('does nothing for a nonexistent note id', () => {
      addNote();
      const itemsBefore = document.querySelectorAll('.note-item');
      handleNotePreviewToggle('nonexistent');
      expect(document.querySelectorAll('.note-item')).toHaveLength(itemsBefore.length);
    });

    it('persists preview state across re-renders', () => {
      addNote();
      const id = loadNotes()[0].id;
      updateNoteText(id, 'Persistent content');

      handleNotePreviewToggle(id);
      initNotes();

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').innerHTML).toContain('Persistent content');
    });

    it('shows empty preview div for empty text', () => {
      addNote();
      const id = loadNotes()[0].id;

      handleNotePreviewToggle(id);

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-preview').innerHTML).toBe('');
    });

    it('saves pending debounced content before entering preview mode', () => {
      vi.useFakeTimers();
      addNote();
      const id = loadNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Unsaved typed text';

      debouncedSave(id, 'Unsaved typed text');
      handleNotePreviewToggle(id);

      expect(loadNotes()[0].text).toBe('Unsaved typed text');
      vi.useRealTimers();
    });
  });

  describe('Notes preview click delegation', () => {
    it('handleNotesClick triggers preview toggle for preview button', () => {
      addNote();
      const id = loadNotes()[0].id;
      const ta = document.querySelector('.note-textarea');
      ta.value = 'Click test';

      handleNotesClick({
        target: {
          closest: (sel) => sel === '.note-preview-btn' ? { dataset: { id } } : null
        }
      });

      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').style.display).not.toBe('none');
    });
  });

  describe('Notes blur in preview mode', () => {
    it('does not delete empty note on blur when in preview mode', () => {
      addNote();
      expect(loadNotes()).toHaveLength(1);
      const id = loadNotes()[0].id;

      handleNotePreviewToggle(id);
      handleNotesBlur({ target: { closest: () => ({ dataset: { id }, value: '' }) } });

      expect(loadNotes()).toHaveLength(1);
    });

    it('skips save on blur when in preview mode (textarea is hidden and stale)', () => {
      addNote();
      const id = loadNotes()[0].id;

      handleNotePreviewToggle(id);
      handleNotesBlur({ target: { closest: () => ({ dataset: { id }, value: 'Should not save' }) } });

      expect(loadNotes()).toHaveLength(1);
      expect(loadNotes()[0].text).toBe('');
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
      const id = loadNotes()[0].id;
      handleNotePreviewToggle(id);

      const btn = document.querySelector('.note-preview-btn');
      expect(btn.innerHTML).toContain('M11 4H4a2 2 0 0 0-2 2v14');
    });
  });

  describe('Notes delete in preview mode', () => {
    it('deleteNote cleans up preview state', () => {
      addNote();
      const id = loadNotes()[0].id;
      handleNotePreviewToggle(id);
      deleteNote(id);
      expect(loadNotes()).toHaveLength(0);
    });
  });

  describe('Notes blur before preview click race condition', () => {
    it('does not delete empty note when preview button mousedown precedes blur', () => {
      addNote();
      const id = loadNotes()[0].id;
      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      const ta = card.querySelector('.note-textarea');

      const previewBtn = card.querySelector('.note-preview-btn');
      previewBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      handleNotesBlur({ target: ta });

      expect(loadNotes()).toHaveLength(1);

      handleNotePreviewToggle(id);
      expect(card.querySelector('.note-textarea').style.display).toBe('none');
      expect(card.querySelector('.note-preview').style.display).not.toBe('none');
    });

    it('still deletes empty note on normal blur (no preview mousedown)', () => {
      addNote();
      expect(loadNotes()).toHaveLength(1);
      const id = loadNotes()[0].id;
      const card = document.querySelector(`.note-item[data-id="${id}"]`);
      const ta = card.querySelector('.note-textarea');

      handleNotesBlur({ target: ta });

      expect(loadNotes()).toHaveLength(0);
    });
  });
});

describe('Notes resize batching', () => {
  it('scheduleResize queues a textarea and flushResizeBatch sets its height', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');
    Object.defineProperty(ta, 'scrollHeight', { value: 42, configurable: true });

    scheduleResize(ta);
    flushResizeBatch();

    expect(ta.style.height).toBe('42px');
  });

  it('scheduleResize does not schedule a second rAF when one is pending', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    addNote();
    const ta = document.querySelector('.note-textarea');

    scheduleResize(ta);

    expect(rafSpy).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });

  it('scheduleResize schedules a new rAF after flush clears the pending one', () => {
    addNote();
    const ta = document.querySelector('.note-textarea');

    flushResizeBatch();

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    scheduleResize(ta);

    expect(rafSpy).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });

  it('flushResizeBatch resizes all queued textareas', () => {
    addNote();
    addNote();
    const items = document.querySelectorAll('.note-textarea');
    const ta1 = items[0];
    const ta2 = items[1];
    Object.defineProperty(ta1, 'scrollHeight', { value: 30, configurable: true });
    Object.defineProperty(ta2, 'scrollHeight', { value: 60, configurable: true });

    scheduleResize(ta1);
    scheduleResize(ta2);
    flushResizeBatch();

    expect(ta1.style.height).toBe('30px');
    expect(ta2.style.height).toBe('60px');
  });

  it('autoResizeTextareas with no args schedules all textareas', () => {
    addNote();
    addNote();
    const items = document.querySelectorAll('.note-textarea');
    Object.defineProperty(items[0], 'scrollHeight', { value: 10, configurable: true });
    Object.defineProperty(items[1], 'scrollHeight', { value: 20, configurable: true });

    autoResizeTextareas();
    flushResizeBatch();

    expect(items[0].style.height).toBe('10px');
    expect(items[1].style.height).toBe('20px');
  });

  it('flushResizeBatch skips textareas removed from the DOM', () => {
    addNote();
    addNote();
    const items = document.querySelectorAll('.note-textarea');
    const ta1 = items[0];
    const ta2 = items[1];
    Object.defineProperty(ta1, 'scrollHeight', { value: 30, configurable: true });
    Object.defineProperty(ta2, 'scrollHeight', { value: 60, configurable: true });

    scheduleResize(ta1);
    scheduleResize(ta2);

    ta1.remove();

    flushResizeBatch();

    expect(ta2.style.height).toBe('60px');
  });

  it('autoResizeTextareas with array schedules only those textareas', () => {
    addNote();
    addNote();
    const items = document.querySelectorAll('.note-textarea');
    const ta = items[0];
    Object.defineProperty(ta, 'scrollHeight', { value: 50, configurable: true });

    flushResizeBatch();

    ta.style.height = '';
    items[1].style.height = '';

    autoResizeTextareas([ta]);
    flushResizeBatch();

    expect(ta.style.height).toBe('50px');
    expect(items[1].style.height).toBe('');
  });
});
