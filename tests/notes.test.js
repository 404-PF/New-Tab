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
