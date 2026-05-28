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
