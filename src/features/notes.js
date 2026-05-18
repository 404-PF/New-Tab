// src/features/notes.js - Quick Notes Scratchpad

let notes = [];

const elements = {};

const debounceTimers = {};

function loadNotes() {
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

function showNotesSaveError() {
  if (typeof showToast === 'function') {
    showToast('Failed to save note. Your changes were not saved.', 'error');
  }
}

function saveNotes(data) {
  try {
    localStorage.setItem('notes', JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn('Failed to save notes to localStorage:', error);
    showNotesSaveError();
    return false;
  }
}

function generateNoteId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function renderNotes() {
  const { notesList, notesEmpty } = elements;
  if (!notesList || !notesEmpty) return;

  notesList.innerHTML = '';

  if (notes.length === 0) {
    notesEmpty.style.display = 'block';
    return;
  }

  notesEmpty.style.display = 'none';

  notes.forEach((note, index) => {
    const card = document.createElement('div');
    card.className = 'note-item';
    card.dataset.id = note.id;
    card.style.animationDelay = (index * 0.05) + 's';

    const textarea = document.createElement('textarea');
    textarea.className = 'note-textarea';
    textarea.placeholder = window.i18n ? window.i18n.t('notesPlaceholder') : 'Type your note here...';
    textarea.value = note.text || '';
    textarea.dataset.id = note.id;
    textarea.rows = 2;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'note-delete-btn';
    deleteBtn.dataset.id = note.id;
    deleteBtn.title = window.i18n ? window.i18n.t('notesDeleteTooltip') : 'Delete Note';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path></svg>';

    card.appendChild(textarea);
    card.appendChild(deleteBtn);
    notesList.appendChild(card);
  });

  autoResizeTextareas();
}

function autoResizeTextareas() {
  document.querySelectorAll('.note-textarea').forEach(ta => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  });
}

function flushPendingSaves() {
  Object.keys(debounceTimers).forEach(id => {
    clearTimeout(debounceTimers[id]);
    delete debounceTimers[id];
    const ta = document.querySelector(`.note-textarea[data-id="${id}"]`);
    if (ta) {
      const text = (ta.value || '').trim();
      if (text) updateNoteText(id, text);
    }
  });
}

function addNote() {
  const note = {
    id: generateNoteId(),
    text: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  flushPendingSaves();
  const previousNotes = notes.map(n => ({ ...n }));
  notes.unshift(note);
  if (!saveNotes(notes)) {
    notes = previousNotes;
    return;
  }
  renderNotes();
  focusNewNote(note.id);
}

function focusNewNote(id) {
  const ta = document.querySelector(`.note-textarea[data-id="${id}"]`);
  if (ta) {
    ta.focus();
  }
}

function deleteNote(id) {
  if (debounceTimers[id]) {
    clearTimeout(debounceTimers[id]);
    delete debounceTimers[id];
  }
  const previousNotes = notes.map(n => ({ ...n }));
  notes = notes.filter(n => n.id !== id);
  if (!saveNotes(notes)) {
    notes = previousNotes;
    return;
  }
  renderNotes();
}

function updateNoteText(id, text) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  const previousNotes = notes.map(n => ({ ...n }));
  note.text = text;
  note.updatedAt = new Date().toISOString();
  if (!saveNotes(notes)) {
    notes = previousNotes;
    renderNotes();
  }
}

function handleNotesClick(e) {
  const deleteBtn = e.target.closest('.note-delete-btn');
  if (deleteBtn) {
    deleteNote(deleteBtn.dataset.id);
    return;
  }
}

function debouncedSave(id, text) {
  if (debounceTimers[id]) clearTimeout(debounceTimers[id]);
  debounceTimers[id] = setTimeout(() => {
    delete debounceTimers[id];
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    updateNoteText(id, trimmed);
  }, 500);
}

function handleNotesInput(e) {
  const ta = e.target.closest('.note-textarea');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
  debouncedSave(ta.dataset.id, ta.value);
}

function handleNotesBlur(e) {
  const ta = e.target.closest('.note-textarea');
  if (!ta) return;
  if (debounceTimers[ta.dataset.id]) {
    clearTimeout(debounceTimers[ta.dataset.id]);
    delete debounceTimers[ta.dataset.id];
  }
  const text = (ta.value || '').trim();
  if (!text) {
    deleteNote(ta.dataset.id);
    return;
  }
  updateNoteText(ta.dataset.id, text);
}

function handleNotesKeydown(e) {
  const ta = e.target.closest('.note-textarea');
  if (!ta) return;
  if (e.key === 'Escape') {
    ta.blur();
  }
}

function initNotes() {
  const notesSection = document.querySelector('.notes-section');
  if (!notesSection) {
    return;
  }

  elements.notesSection = notesSection;
  elements.notesList = document.getElementById('notes-list');
  elements.notesEmpty = document.getElementById('notes-empty');
  elements.addNoteBtn = document.getElementById('add-note-btn');

  if (!elements.notesList || !elements.notesEmpty) {
    return;
  }

  notes = loadNotes();

  renderNotes();

  if (elements.addNoteBtn) {
    elements.addNoteBtn.removeEventListener('click', addNote);
    elements.addNoteBtn.addEventListener('click', addNote);
  }

  document.removeEventListener('click', handleNotesClick);
  document.removeEventListener('input', handleNotesInput);
  document.removeEventListener('blur', handleNotesBlur, true);
  document.removeEventListener('keydown', handleNotesKeydown);
  document.addEventListener('click', handleNotesClick);
  document.addEventListener('input', handleNotesInput);
  document.addEventListener('blur', handleNotesBlur, true);
  document.addEventListener('keydown', handleNotesKeydown);
}

window.addEventListener('beforeunload', () => {
  flushPendingSaves();
});

window.addEventListener('languageChanged', () => {
  flushPendingSaves();
  renderNotes();
});

const runNotesOnDomReady = window.onDomReady;
runNotesOnDomReady(initNotes);
