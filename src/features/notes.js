// src/features/notes.js - Quick Notes Scratchpad with tags and reordering

(function () {
  'use strict';

  let notes = [];

  const elements = {};

  const debounceTimers = {};

  const notePreviewModes = {};

  let _previewMouseDown = false;
  const _resizeSet = new Set();
  let _resizeRaf = null;

  // Drag state
  let _dragSourceId = null;
  let _dragSourceEl = null;
  let _dragPlaceholder = null;
  let _dragOverId = null;

  const SVG_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const SVG_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const SVG_GRIP = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="8" cy="5" r="1.5"/><circle cx="16" cy="5" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/></svg>';
  const SVG_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>';

  function loadNotes() {
    try {
      const raw = localStorage.getItem('notes');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn('Invalid notes data in localStorage: expected array, resetting to empty list');
        return [];
      }
      return migrateNotes(parsed);
    } catch (e) {
      console.warn('Failed to parse notes from localStorage, resetting to empty list:', e);
      return [];
    }
  }

  function migrateNotes(data) {
    let changed = false;
    const migrated = data.map((note, index) => {
      const n = { ...note };
      if (typeof n.order !== 'number') {
        n.order = index;
        changed = true;
      }
      if (n.tag !== undefined && typeof n.tag !== 'string') {
        n.tag = '';
        changed = true;
      }
      return n;
    });
    if (changed) {
      saveNotes(migrated);
    }
    return migrated;
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

  function getUniqueTags() {
    const tagSet = new Set();
    notes.forEach(n => {
      if (n.tag) tagSet.add(n.tag);
    });
    return [...tagSet].sort();
  }

  let _activeTagFilter = null;

  function renderTagFilter() {
    const filterBar = document.getElementById('notes-tag-filter');
    if (!filterBar) return;

    const tags = getUniqueTags();
    filterBar.innerHTML = '';

    if (tags.length === 0) {
      filterBar.style.display = 'none';
      return;
    }

    filterBar.style.display = 'flex';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'note-tag-filter-btn' + (_activeTagFilter === null ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.dataset.tag = '';
    filterBar.appendChild(allBtn);

    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-tag-filter-btn' + (_activeTagFilter === tag ? ' active' : '');
      btn.textContent = tag;
      btn.dataset.tag = tag;
      filterBar.appendChild(btn);
    });
  }

  function getFilteredNotes() {
    if (_activeTagFilter === null) return notes;
    return notes.filter(n => n.tag === _activeTagFilter);
  }

  function renderNotes() {
    const { notesList, notesEmpty } = elements;
    if (!notesList || !notesEmpty) return;

    notesList.innerHTML = '';

    const activeIds = new Set(notes.map(n => n.id));
    for (const key of Object.keys(notePreviewModes)) {
      if (!activeIds.has(key)) delete notePreviewModes[key];
    }

    renderTagFilter();

    const filtered = getFilteredNotes();

    if (filtered.length === 0) {
      notesEmpty.style.display = 'block';
      return;
    }

    notesEmpty.style.display = 'none';

    filtered.forEach((note, index) => {
      const card = createNoteCard(note, index);
      notesList.appendChild(card);
    });
  }

  function createNoteCard(note, index) {
    const card = document.createElement('div');
    card.className = 'note-item';
    card.dataset.id = note.id;
    card.style.animationDelay = (index * 0.05) + 's';

    const isPreview = notePreviewModes[note.id] === true;

    const grip = document.createElement('span');
    grip.className = 'note-grip';
    grip.innerHTML = SVG_GRIP;
    grip.title = 'Drag to reorder';

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
    previewDiv.className = 'note-preview';
    previewDiv.dataset.id = note.id;
    if (isPreview) {
      previewDiv.innerHTML = renderNotePreview(note.text || '');
    } else {
      previewDiv.style.display = 'none';
    }

    const tagBtn = document.createElement('button');
    tagBtn.className = 'note-tag-btn';
    tagBtn.dataset.id = note.id;
    tagBtn.title = note.tag || 'Add tag';
    tagBtn.innerHTML = SVG_TAG;
    if (note.tag) {
      const tagLabel = document.createElement('span');
      tagLabel.className = 'note-tag-label';
      tagLabel.textContent = note.tag;
      tagBtn.appendChild(tagLabel);
      tagBtn.classList.add('has-tag');
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

    card.appendChild(grip);
    card.appendChild(textarea);
    card.appendChild(previewDiv);
    card.appendChild(tagBtn);
    card.appendChild(previewBtn);
    card.appendChild(deleteBtn);
    scheduleResize(textarea);
    return card;
  }

  function flushResizeBatch() {
    _resizeRaf = null;
    const tas = [..._resizeSet].filter(t => t.isConnected);
    _resizeSet.clear();
    if (tas.length === 0) return;
    tas.forEach(t => { t.style.height = 'auto'; });
    const heights = tas.map(t => t.scrollHeight);
    tas.forEach((t, i) => { t.style.height = heights[i] + 'px'; });
  }

  function scheduleResize(ta) {
    _resizeSet.add(ta);
    if (!_resizeRaf) {
      _resizeRaf = requestAnimationFrame(flushResizeBatch);
    }
  }

  function flushPendingSaves() {
    Object.keys(debounceTimers).forEach(id => {
      clearTimeout(debounceTimers[id]);
      delete debounceTimers[id];
      if (notePreviewModes[id] === true) return;
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
    const maxOrder = notes.reduce((max, n) => Math.max(max, typeof n.order === 'number' ? n.order : 0), -1);
    const note = {
      id: generateNoteId(),
      text: '',
      tag: '',
      order: maxOrder + 1,
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

  function updateNoteTag(id, tag) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const previousNotes = notes.map(n => ({ ...n }));
    note.tag = tag;
    note.updatedAt = new Date().toISOString();
    if (!saveNotes(notes)) {
      notes = previousNotes;
      renderNotes();
      return;
    }
    renderNotes();
  }

  function reorderNotes(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const previousNotes = notes.map(n => ({ ...n }));

    const filtered = getFilteredNotes();
    const movedNote = filtered[fromIndex];
    if (!movedNote) return;

    const actualFromIndex = notes.findIndex(n => n.id === movedNote.id);
    let actualToIndex;
    if (toIndex >= filtered.length) {
      const lastFiltered = filtered[filtered.length - 1];
      actualToIndex = notes.findIndex(n => n.id === lastFiltered.id);
      if (actualToIndex !== -1) actualToIndex += 1;
    } else {
      const targetNote = filtered[toIndex];
      actualToIndex = notes.findIndex(n => n.id === targetNote.id);
    }

    if (actualFromIndex === -1 || actualToIndex === -1) return;

    const [removed] = notes.splice(actualFromIndex, 1);
    const insertAt = actualToIndex > actualFromIndex ? actualToIndex - 1 : actualToIndex;
    notes.splice(insertAt, 0, removed);

    notes.forEach((n, i) => { n.order = i; });

    if (!saveNotes(notes)) {
      notes = previousNotes;
      renderNotes();
      return;
    }
    renderNotes();
  }

  function renderNotePreview(text) {
    if (!text) return '';
    if (window.MarkdownParser && typeof window.MarkdownParser.parse === 'function') {
      try {
        return window.MarkdownParser.parse(text);
      } catch (e) {
        console.warn('MarkdownParser.parse failed, using fallback:', e);
      }
    }
    return '<p class="md-paragraph">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />') + '</p>';
  }

  function handleNotePreviewToggle(id) {
    _previewMouseDown = false;
    const isCurrentlyPreview = notePreviewModes[id] === true;
    if (!isCurrentlyPreview && debounceTimers[id]) {
      clearTimeout(debounceTimers[id]);
      delete debounceTimers[id];
      const ta = document.querySelector(`.note-textarea[data-id="${id}"]`);
      if (ta) {
        const text = ta.value || '';
        if (text) {
          updateNoteText(id, text);
        }
      }
    }
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
        scheduleResize(textarea);
      }
      if (previewBtn) {
        previewBtn.title = window.i18n ? window.i18n.t('notesPreviewTooltip') : 'Preview';
        previewBtn.innerHTML = SVG_EYE;
      }
    }
  }

  // Tag picker
  function closeTagPicker() {
    const existing = document.querySelector('.note-tag-picker');
    if (existing) existing.remove();
  }

  function openTagPicker(noteId) {
    closeTagPicker();
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const tagBtn = document.querySelector(`.note-tag-btn[data-id="${noteId}"]`);
    if (!tagBtn) return;

    const picker = document.createElement('div');
    picker.className = 'note-tag-picker';

    const existingTags = getUniqueTags();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'note-tag-input';
    input.placeholder = 'Tag name...';
    input.value = note.tag || '';
    picker.appendChild(input);

    if (existingTags.length > 0) {
      const suggestions = document.createElement('div');
      suggestions.className = 'note-tag-suggestions';
      existingTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'note-tag-suggestion' + (note.tag === tag ? ' active' : '');
        btn.textContent = tag;
        btn.dataset.tag = tag;
        suggestions.appendChild(btn);
      });
      picker.appendChild(suggestions);
    }

    const actions = document.createElement('div');
    actions.className = 'note-tag-actions';
    if (note.tag) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'note-tag-remove-btn';
      removeBtn.textContent = 'Remove tag';
      actions.appendChild(removeBtn);
    }
    picker.appendChild(actions);

    tagBtn.appendChild(picker);

    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        updateNoteTag(noteId, val);
        closeTagPicker();
      } else if (e.key === 'Escape') {
        closeTagPicker();
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        const val = input.value.trim();
        if (val !== (note.tag || '')) {
          updateNoteTag(noteId, val);
        }
        closeTagPicker();
      }, 150);
    });

    picker.addEventListener('click', (e) => {
      const suggestion = e.target.closest('.note-tag-suggestion');
      if (suggestion) {
        updateNoteTag(noteId, suggestion.dataset.tag);
        closeTagPicker();
        return;
      }
      const removeBtn = e.target.closest('.note-tag-remove-btn');
      if (removeBtn) {
        updateNoteTag(noteId, '');
        closeTagPicker();
      }
    });
  }

  // Drag and drop
  function handleDragStart(e) {
    const grip = e.target.closest('.note-grip');
    if (!grip) return;
    const card = grip.closest('.note-item');
    if (!card) return;

    _dragSourceId = card.dataset.id;
    _dragSourceEl = card;

    card.classList.add('dragging');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragSourceId);

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('drop', handleDrop);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const card = e.target.closest('.note-item');
    if (!card || card.dataset.id === _dragSourceId) {
      if (_dragPlaceholder) _dragPlaceholder.style.display = 'none';
      return;
    }

    const notesList = elements.notesList;
    if (!notesList) return;

    if (!_dragPlaceholder) {
      _dragPlaceholder = document.createElement('div');
      _dragPlaceholder.className = 'note-drag-placeholder';
    }

    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      card.parentNode.insertBefore(_dragPlaceholder, card);
    } else {
      card.parentNode.insertBefore(_dragPlaceholder, card.nextSibling);
    }
    _dragPlaceholder.style.display = '';
    _dragOverId = card.dataset.id;
  }

  function handleDrop(e) {
    e.preventDefault();
    cleanupDrag();

    if (!_dragOverId || !_dragSourceId || _dragOverId === _dragSourceId) return;

    const filtered = getFilteredNotes();
    const fromIndex = filtered.findIndex(n => n.id === _dragSourceId);
    const toIndex = filtered.findIndex(n => n.id === _dragOverId);

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderNotes(fromIndex, toIndex);
    }
  }

  function handleDragEnd() {
    cleanupDrag();
  }

  function cleanupDrag() {
    if (_dragSourceEl) {
      _dragSourceEl.classList.remove('dragging');
    }
    if (_dragPlaceholder) {
      _dragPlaceholder.remove();
      _dragPlaceholder = null;
    }
    _dragSourceId = null;
    _dragSourceEl = null;
    _dragOverId = null;
    document.removeEventListener('dragover', handleDragOver);
    document.removeEventListener('dragend', handleDragEnd);
    document.removeEventListener('drop', handleDrop);
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

    const tagBtn = e.target.closest('.note-tag-btn');
    if (tagBtn) {
      const picker = tagBtn.querySelector('.note-tag-picker');
      if (picker) {
        closeTagPicker();
      } else {
        openTagPicker(tagBtn.dataset.id);
      }
      return;
    }

    const filterBtn = e.target.closest('.note-tag-filter-btn');
    if (filterBtn) {
      const tag = filterBtn.dataset.tag || null;
      _activeTagFilter = tag === '' ? null : tag;
      renderNotes();
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
    scheduleResize(ta);
    debouncedSave(ta.dataset.id, ta.value);
  }

  function handleNotesBlur(e) {
    const ta = e.target.closest('.note-textarea');
    if (!ta) return;
    if (debounceTimers[ta.dataset.id]) {
      clearTimeout(debounceTimers[ta.dataset.id]);
      delete debounceTimers[ta.dataset.id];
    }
    if (notePreviewModes[ta.dataset.id] === true) return;
    if (_previewMouseDown) {
      _previewMouseDown = false;
      return;
    }
    const text = ta.value || '';
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

  function handlePreviewMouseDown(e) {
    _previewMouseDown = !!e.target.closest('.note-preview-btn');
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
    document.removeEventListener('mousedown', handlePreviewMouseDown, true);
    document.removeEventListener('dragstart', handleDragStart, true);
    document.addEventListener('click', handleNotesClick);
    document.addEventListener('input', handleNotesInput);
    document.addEventListener('blur', handleNotesBlur, true);
    document.addEventListener('keydown', handleNotesKeydown);
    document.addEventListener('mousedown', handlePreviewMouseDown, true);
    document.addEventListener('dragstart', handleDragStart, true);
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

// Export public API
try {
  window.initNotes = initNotes;
  window.addNote = addNote;
  window.deleteNote = deleteNote;
  window.updateNoteText = updateNoteText;
  window.updateNoteTag = updateNoteTag;
  window.reorderNotes = reorderNotes;
} catch {
  // ignore
}

})();
