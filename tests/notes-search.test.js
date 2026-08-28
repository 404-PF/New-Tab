import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
  const searchInput = document.getElementById('notes-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof window.setNotesSearchQuery === 'function') {
    window.setNotesSearchQuery('');
  }
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
  initNotes();
});

describe('Notes search', () => {
  it('filters notes by text content case-insensitively', () => {
    setNotes([
      { id: '1', text: 'Buy milk', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '2', text: 'Read book', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '3', text: 'Milkshake recipe', tag: '', order: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'milk';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    const items = document.querySelectorAll('.note-item');
    expect(items).toHaveLength(2);
    const texts = [...items].map(el => el.querySelector('.note-textarea').value);
    expect(texts).toEqual(expect.arrayContaining(['Buy milk', 'Milkshake recipe']));
    expect(texts).not.toEqual(expect.arrayContaining(['Read book']));
  });

  it('matches tag when search query equals tag', () => {
    setNotes([
      { id: '1', text: 'Hello', tag: 'work', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '2', text: 'Hello', tag: 'personal', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'work';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    const items = document.querySelectorAll('.note-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.note-tag-label').textContent).toBe('work');
  });

  it('combines tag filter and search with AND semantics', () => {
    setNotes([
      { id: '1', text: 'Buy milk', tag: 'work', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '2', text: 'Buy milk', tag: 'personal', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '3', text: 'Read book', tag: 'work', order: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();
    const workBtn = [...document.querySelectorAll('.note-tag-filter-btn')].find(b => b.dataset.tag === 'work');
    workBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'milk';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    const items = document.querySelectorAll('.note-item');
    expect(items).toHaveLength(1);
    expect(items[0].dataset.id).toBe('1');
  });

  it('shows no-results message when filter yields no matches', () => {
    setNotes([
      { id: '1', text: 'Hello world', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();
    const searchInput = document.getElementById('notes-search');
    const emptyEl = document.getElementById('notes-empty');
    const emptyP = emptyEl.querySelector('p');
    searchInput.value = 'nonexistent';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(emptyEl.style.display).toBe('block');
    expect(emptyP.textContent).toBe('No matching notes.');
    expect(emptyP.getAttribute('data-i18n')).toBe('notesNoResults');
    expect(document.querySelectorAll('.note-item')).toHaveLength(0);
  });

  it('shows empty state when no notes exist', () => {
    setNotes([]);
    initNotes();
    const emptyEl = document.getElementById('notes-empty');
    const emptyP = emptyEl.querySelector('p');
    expect(emptyEl.style.display).toBe('block');
    expect(emptyP.getAttribute('data-i18n')).toBe('notesEmpty');
  });

  it('clears filter when search input is cleared', () => {
    setNotes([
      { id: '1', text: 'Hello', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '2', text: 'World', tag: '', order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();
    const searchInput = document.getElementById('notes-search');
    searchInput.value = 'Hello';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.note-item')).toHaveLength(1);
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.note-item')).toHaveLength(2);
  });

  it('trims search query', () => {
    setNotes([
      { id: '1', text: 'Hello world', tag: '', order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ]);
    initNotes();
    const searchInput = document.getElementById('notes-search');
    searchInput.value = '  hello  ';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.note-item')).toHaveLength(1);
  });

  it('search input has correct placeholder and i18n key', () => {
    initNotes();
    const searchInput = document.getElementById('notes-search');
    expect(searchInput).toBeTruthy();
    expect(searchInput.placeholder).toBe('Search notes...');
    expect(searchInput.getAttribute('data-i18n')).toBe('notesSearchPlaceholder');
  });
});
