// src/features/notes.js - Quick Notes Scratchpad

(function () {
  'use strict';

  let notes = [];

  const elements = {};

  const debounceTimers = {};

  const notePreviewModes = {};

  const SVG_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const SVG_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';

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
    } else {
      console.warn('showToast unavailable: Failed to save note. Your changes were not saved.');
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

      const isPreview = notePreviewModes[note.id] === true;

      const textarea = document.createElement('textarea');
      textarea.className = 'note-textarea';
      textarea.placeholder = window.i18n ? window.i18n.t('notesPlaceholder') : 'Type your note here...';
      textarea.value = note.text || '';
      textarea.dataset.id = note.id;
      textarea.rows = 2;
      if (isPreview) {
        textarea.style.display = 'none';
      }

      const previewDiv = document.createElement('div');
      previewDiv.className = 'note-preview markdown-body';
      previewDiv.dataset.id = note.id;
      if (isPreview) {
        previewDiv.innerHTML = renderNotePreview(note.text || '');
      } else {
        previewDiv.style.display = 'none';
      }

      const previewBtn = document.createElement('button');
      previewBtn.className = 'note-preview-btn';
      previewBtn.dataset.id = note.id;
      previewBtn.title = isPreview ? (window.i18n ? window.i18n.t('notesEditTooltip') : 'Edit') : (window.i18n ? window.i18n.t('notesPreviewTooltip') : 'Preview');
      previewBtn.innerHTML = isPreview ? SVG_PENCIL : SVG_EYE;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'note-delete-btn';
      deleteBtn.dataset.id = note.id;
      deleteBtn.title = window.i18n ? window.i18n.t('notesDeleteTooltip') : 'Delete Note';
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path></svg>';

      card.appendChild(textarea);
      card.appendChild(previewDiv);
      card.appendChild(previewBtn);
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
        const text = ta.value || '';
        if (text) {
          updateNoteText(id, text);
        } else {
          deleteNote(id);
        }
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
      renderNotes();
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
    delete notePreviewModes[id];
    const previousNotes = notes.map(n => ({ ...n }));
    notes = notes.filter(n => n.id !== id);
    if (!saveNotes(notes)) {
      notes = previousNotes;
      renderNotes();
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

  function renderNotePreview(text) {
    if (!text) return '';
    if (window.MarkdownParser && typeof window.MarkdownParser.parse === 'function') {
      return window.MarkdownParser.parse(text);
    }
    return '<p class="md-paragraph">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />') + '</p>';
  }

  function handleNotePreviewToggle(id) {
    const isCurrentlyPreview = notePreviewModes[id] === true;
    notePreviewModes[id] = !isCurrentlyPreview;
    const isPreview = notePreviewModes[id];

    const card = document.querySelector(`.note-item[data-id="${id}"]`);
    if (!card) return;

    const textarea = card.querySelector('.note-textarea');
    const previewDiv = card.querySelector('.note-preview');
    const previewBtn = card.querySelector('.note-preview-btn');

    if (isPreview) {
      const text = textarea ? textarea.value || '' : '';
      if (previewDiv) {
        previewDiv.innerHTML = renderNotePreview(text);
        previewDiv.style.display = '';
      }
      if (textarea) {
        textarea.style.display = 'none';
      }
      if (previewBtn) {
        previewBtn.title = window.i18n ? window.i18n.t('notesEditTooltip') : 'Edit';
        previewBtn.innerHTML = SVG_PENCIL;
      }
    } else {
      if (previewDiv) {
        previewDiv.style.display = 'none';
      }
      if (textarea) {
        textarea.style.display = '';
        textarea.focus();
        autoResizeTextareas();
      }
      if (previewBtn) {
        previewBtn.title = window.i18n ? window.i18n.t('notesPreviewTooltip') : 'Preview';
        previewBtn.innerHTML = SVG_EYE;
      }
    }
  }

  function handleNotesClick(e) {
    const previewBtn = e.target.closest('.note-preview-btn');
    if (previewBtn) {
      handleNotePreviewToggle(previewBtn.dataset.id);
      return;
    }

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
      const raw = text || '';
      if (!raw) return;
      updateNoteText(id, raw);
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
    const text = ta.value || '';
    if (!text && notePreviewModes[ta.dataset.id] !== true) {
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
      elements.addNoteBtn.title = window.i18n ? window.i18n.t('addNoteTooltip') : 'Add note';
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
    if (elements.addNoteBtn) {
      elements.addNoteBtn.title = window.i18n ? window.i18n.t('addNoteTooltip') : 'Add note';
    }
    renderNotes();
  });

  const runNotesOnDomReady = window.onDomReady;
  runNotesOnDomReady(initNotes);

// Export public API for tests
try {
  window.initNotes = initNotes;
  window.loadNotes = loadNotes;
  window.saveNotes = saveNotes;
  window.addNote = addNote;
  window.deleteNote = deleteNote;
  window.updateNoteText = updateNoteText;
  window.flushPendingSaves = flushPendingSaves;
  window.debouncedSave = debouncedSave;
  window.handleNotesInput = handleNotesInput;
  window.handleNotesBlur = handleNotesBlur;
  window.handleNotesClick = handleNotesClick;
  window.handleNotesKeydown = handleNotesKeydown;
  window.autoResizeTextareas = autoResizeTextareas;
  window.focusNewNote = focusNewNote;
  window.renderNotePreview = renderNotePreview;
  window.handleNotePreviewToggle = handleNotePreviewToggle;
} catch {
  // ignore
}

})();
