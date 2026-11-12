// src/features/notes.js - Quick Notes Scratchpad with tags and reordering

(function () {
  'use strict';

  let notes = [];

  const elements = {};

  // Null-prototype so note ids such as "__proto__" are stored as own keys.
  const debounceTimers = Object.create(null);

  const notePreviewModes = {};

  let _previewMouseDown = false;
  let _previewMouseDownIsPreview = false;
  const _resizeSet = new Set();
  let _resizeRaf = null;
  let _suppressRenderPreserve = false;

  // Drag state
  let _dragSourceId = null;
  let _dragSourceEl = null;
  let _dragPlaceholder = null;
  let _dragOverId = null;
  let _dragInsertAfter = false;

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

  function migrateNotes(data, { persist = true } = {}) {
    let changed = false;
    const orders = data.map(note => note?.order);
    const hasInvalidOrder = orders.some(order => !Number.isFinite(order));
    const hasDuplicateOrder = new Set(orders).size !== orders.length;
    const hasOutOfOrderEntries = orders.some((order, index) => (
      index > 0 && order < orders[index - 1]
    ));
    const shouldNormalizeOrders = hasInvalidOrder || hasDuplicateOrder || hasOutOfOrderEntries;

    if (shouldNormalizeOrders) {
      changed = true;
    }

    const migrated = data.map((note, index) => {
      const n = { ...note };
      if (shouldNormalizeOrders) {
        // A merged import can contain the same order range as the existing
        // notes. Reassign in array order so existing notes stay before imports.
        n.order = index;
      } else if (typeof n.order !== 'number') {
        n.order = index;
        changed = true;
      }
      if (typeof n.tag !== 'string') {
        n.tag = '';
        changed = true;
      }
      return n;
    });
    migrated.sort((a, b) => a.order - b.order);
    if (changed && persist) {
      saveNotes(migrated);
    }
    return migrated;
  }

  function showNotesSaveError() {
    const message = window.i18n ? window.i18n.t('notesSaveError') : 'Failed to save note. Your changes were not saved.';
    if (typeof showToast === 'function') {
      showToast(message, 'error');
    } else {
      console.warn('showToast unavailable: ' + message);
    }
  }

  function saveNotes(data) {
    try {
      const result = localStorage.setItem('notes', JSON.stringify(data));
      if (result !== false) return true; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
      console.warn('Storage bridge rejected the notes write');
    } catch (error) {
      console.warn('Failed to save notes to localStorage:', error);
    }
    showNotesSaveError();
    return false;
  }

  function readPersistedNotes() {
    try {
      const raw = localStorage.getItem('notes');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Re-apply the order/tag repairs from loadNotes without writing back.
      return Array.isArray(parsed) ? migrateNotes(parsed, { persist: false }) : null;
    } catch (error) {
      console.warn('Failed to read notes for storage error recovery:', error);
      return null;
    }
  }

  window.addEventListener('storageBridgeWriteError', (event) => {
    if (event?.detail?.key !== 'notes') return;

    const recover = () => {
      // Wait for pending debounced saves to drain instead of dropping the
      // only failure notification for this write.
      if (Object.keys(debounceTimers).length > 0) {
        setTimeout(recover, 50);
        return;
      }
      const persisted = readPersistedNotes();
      if (persisted === null) return;
      if (JSON.stringify(persisted) === JSON.stringify(notes)) return;
      notes = persisted;
      renderNotes();
      showNotesSaveError();
    };
    setTimeout(recover, 0);
  });

  function generateNoteId() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
    randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;
    const hex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function getUniqueTags() {
    const tagSet = new Set();
    notes.forEach(n => {
      if (n.tag) tagSet.add(n.tag);
    });
    return [...tagSet].sort((a, b) => a.localeCompare(b));
  }

  let _activeTagFilter = null;
  let _activeSearchQuery = '';

  function getSearchQuery() {
    return _activeSearchQuery;
  }

  function setSearchQuery(query) {
    _activeSearchQuery = (query || '').trim();
  }

  function renderTagFilter() {
    const filterBar = document.getElementById('notes-tag-filter');
    if (!filterBar) return;

    const tags = getUniqueTags();
    if (_activeTagFilter !== null && !tags.includes(_activeTagFilter)) {
      _activeTagFilter = null;
    }
    filterBar.innerHTML = '';

    if (tags.length === 0) {
      filterBar.style.display = 'none';
      return;
    }

    filterBar.style.display = 'flex';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'note-tag-filter-btn' + (_activeTagFilter === null ? ' active' : '');
    allBtn.textContent = window.i18n ? window.i18n.t('notesFilterAll') : 'All';
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
    let filtered = notes;
    if (_activeTagFilter !== null) {
      filtered = filtered.filter(n => n.tag === _activeTagFilter);
    }
    if (_activeSearchQuery) {
      const q = _activeSearchQuery.toLowerCase();
      filtered = filtered.filter(n => {
        const textMatch = typeof n.text === 'string' && n.text.toLowerCase().includes(q);
        const tagMatch = typeof n.tag === 'string' && n.tag.toLowerCase().includes(q);
        return textMatch || tagMatch;
      });
    }
    return filtered;
  }

  // Semantic retrieval (issue #1186): hybrid single-box search. The sync
  // getFilteredNotes above stays the keyword fast-path; this async layer
  // cosine re-ranks once the opt-in Harrier model is ready. Tag filter
  // always applies first.
  let _semanticGeneration = 0;
  // Ids in currently displayed order (sync keyword pass or semantic
  // re-rank). Drag/keyboard reorder resolves against these, never against a
  // stale filter pass.
  let _lastRenderedIds = [];
  // True while the list shows semantic relevance order (computed, not
  // user-owned): manual reorder is disabled there so the next re-rank does
  // not undo the move.
  let _semanticRankedView = false;

  // Any notes mutation invalidates in-flight semantic reranks: ranked
  // results capture `base` at start, so a delete/edit/reorder/add racing
  // inference would otherwise render ghosts or stale order on resolve.
  function bumpSemanticGeneration() {
    _semanticGeneration += 1;
  }

  // Public invalidation for disable/delete paths in settings.js
  // (PR #1187 human review): applyNotesSemanticEnabled funnels through
  // renderNotes (which bumps), but an early-return there (no DOM yet)
  // must still drop the in-flight chain.
  function invalidateSemanticRerank() {
    bumpSemanticGeneration();
    clearSemanticDebounce();
  }

  function isNotesSemanticEnabled() {
    try {
      if (typeof window.loadNotesSemanticEnabled === 'function') {
        return window.loadNotesSemanticEnabled();
      }
      return localStorage.getItem('notesSemanticEnabled') === 'true';
    } catch (e) {
      console.warn('Failed to read semantic search flag:', e);
      return false;
    }
  }

  function isNotesSemanticReady() {
    try {
      if (!isNotesSemanticEnabled()) return false;
      if (window.EmbeddingService && typeof window.EmbeddingService.isReady === 'function') {
        return window.EmbeddingService.isReady();
      }
    } catch { /* ignore */ }
    return false;
  }

  function getVisibleNotes() {
    if (Array.isArray(_lastRenderedIds) && _lastRenderedIds.length > 0) {
      const byId = new Map(notes.map(n => [n.id, n]));
      const mapped = _lastRenderedIds.map(id => byId.get(id)).filter(Boolean);
      if (mapped.length === _lastRenderedIds.length) return mapped;
    }
    return getFilteredNotes();
  }

  function getTagFilteredNotes() {
    if (_activeTagFilter !== null) {
      return notes.filter(n => n.tag === _activeTagFilter);
    }
    return notes.slice();
  }

  function getSemanticModelId() {
    try {
      if (window.EmbeddingService && typeof window.EmbeddingService.getStatus === 'function') {
        const s = window.EmbeddingService.getStatus();
        if (s && s.modelId) return s.modelId;
      }
    } catch { /* ignore */ }
    try {
      if (window.HarrierProvider && window.HarrierProvider.HARRIER_MODEL_ID) {
        return window.HarrierProvider.HARRIER_MODEL_ID;
      }
    } catch { /* ignore */ }
    return 'onnx-community/harrier-oss-v1-270m-ONNX';
  }

  function noteToEmbeddingText(note) {
    const tag = typeof note.tag === 'string' && note.tag ? note.tag + ' ' : '';
    const text = typeof note.text === 'string' ? note.text : '';
    // Coarse pre-cap only (bounds hashing/transport); the exact 512-token
    // truncate happens in embedding-service.js via the real tokenizer.
    return (tag + text).slice(0, 4000);
  }

  function hideSemanticStatus(el) {
    el.hidden = true;
    el.textContent = '';
    // A stale data-i18n would re-translate (and reveal) a hidden node on
    // language change; clear it alongside hiding.
    try {
      delete el.dataset.i18n;
    } catch { /* ignore */ }
  }

  function updateSemanticStatus(mode) {
    const el = document.getElementById('notes-semantic-status');
    if (!el) return;
    if (!isNotesSemanticEnabled() || !_activeSearchQuery) {
      hideSemanticStatus(el);
      return;
    }
    let key;
    let fallback;
    if (mode === 'searching') {
      key = 'notesSemanticSearching';
      fallback = 'Semantic search…';
    } else if (mode === 'loading') {
      key = 'notesSemanticLoading';
      fallback = 'Loading on-device model…';
    } else {
      hideSemanticStatus(el);
      return;
    }
    el.hidden = false;
    try {
      el.textContent = window.i18n ? window.i18n.t(key) : fallback;
    } catch {
      el.textContent = fallback;
    }
    el.dataset.i18n = key;
  }

  function getFilteredNotesRanked() {
    const query = _activeSearchQuery;
    if (!query || !isNotesSemanticEnabled() || !isNotesSemanticReady()) {
      return Promise.resolve(getFilteredNotes());
    }
    let ranker;
    try {
      ranker = window.NotesSemanticSearch || null;
    } catch { ranker = null; }
    let service = null;
    try {
      service = window.EmbeddingService || null;
    } catch { service = null; }
    let cache = null;
    try {
      cache = window.NotesVectorCache || null;
    } catch { cache = null; }
    if (!ranker || !service || !cache) {
      return Promise.resolve(getFilteredNotes());
    }
    const base = getTagFilteredNotes();
    if (base.length === 0) return Promise.resolve([]);
    const modelId = getSemanticModelId();
    const inputs = base.map(noteToEmbeddingText);

    function embedQuery(q) {
      return service.embedQuery(q);
    }

    // Batch: one cache pass for all notes, then a single embedTexts call for
    // every cache miss — not N inferences. Partial failures keep the cached
    // vectors and null the rest (cosine 0) instead of dropping to keyword.
    return Promise.all(base.map(function (note, i) {
      return cache.getCachedVector(note.id, inputs[i], modelId).catch(function () { return null; });
    })).then(function (cached) {
      const vectors = new Array(base.length);
      const missIndexes = [];
      cached.forEach(function (record, i) {
        if (record && Array.isArray(record.vector) && record.vector.length > 0) {
          vectors[i] = record.vector;
        } else if (!inputs[i].trim()) {
          vectors[i] = null;
        } else {
          vectors[i] = null;
          missIndexes.push(i);
        }
      });
      if (missIndexes.length === 0) return vectors;
      // O(1) live-note lookup for the write-back guard below: a per-miss
      // Array.find over notes would be O(N*M) on the UI thread for an
      // uncached search (PR #1187 review).
      return service.embedTexts(missIndexes.map(function (i) { return inputs[i]; })).then(function (missed) {
        const liveById = new Map(notes.map(function (n) { return [n.id, n]; }));
        missIndexes.forEach(function (noteIndex, j) {
          const vec = Array.isArray(missed) && Array.isArray(missed[j]) ? missed[j] : null;
          if (vec && vec.length > 0) {
            vectors[noteIndex] = vec;
            // The note may have been deleted (or edited) while the batch
            // inference was in flight: deleteNote already invalidated its
            // vectors, so writing them back would orphan rows until the
            // model is cleared (PR #1187 human review). Only cache when
            // the note still exists with unchanged embedding text.
            const current = liveById.get(base[noteIndex].id);
            if (!current || noteToEmbeddingText(current) !== inputs[noteIndex]) return;
            // Delete/disable during inference must not resurrect vectors:
            // deleteModel() clears rows for this modelId, so an
            // unguarded put would write them back and break the Delete
            // purge promise (PR #1187 human review). Skip when the model
            // is no longer live.
            if (!isNotesSemanticReady()) return;
            cache.putCachedVector(base[noteIndex].id, inputs[noteIndex], modelId, vec)
              .catch(function () { /* ignore */ });
          }
        });
        return vectors;
      }).catch(function () { return vectors; });
    }).then(function (vectors) {
      const byId = new Map();
      base.forEach(function (note, i) { byId.set(note.id, vectors[i] || null); });
      return ranker.rankNotesForQuery(base, query, {
        embedQuery,
        getNoteVector: function (note) { return Promise.resolve(byId.get(note.id) || null); }
      });
    }).catch(function () {
      return getFilteredNotes();
    });
  }

  function invalidateNoteVector(noteId) {
    try {
      if (window.NotesVectorCache && typeof window.NotesVectorCache.deleteCachedVectorsForNote === 'function') {
        window.NotesVectorCache.deleteCachedVectorsForNote(noteId).catch(function () { /* ignore */ });
      }
    } catch { /* ignore */ }
  }

  // The embedding modules stay out of the bootstrap scriptSources path
  // (issue #1186): they load on demand the first time semantic search is
  // enabled, mirroring the games-app lazy loader. The canonical source list
  // and loader live in src/ai/embeddings/embedding-scripts.js (loaded via
  // bootstrap before settings.js); the functions below delegate to
  // window.EmbeddingScripts when present and fall back to the embedded twin
  // only when that shared file has not been loaded (unit tests that inject
  // this module in isolation).
  const EMBEDDING_SCRIPT_SOURCES = [
    'src/ai/embeddings/embedding-registry.js',
    'src/ai/embeddings/harrier-provider.js',
    'src/ai/embeddings/notes-vector-cache.js',
    'src/ai/embeddings/embedding-service.js',
    'src/ai/embeddings/notes-semantic-search.js'
  ];

  let _embeddingScriptsPromise = null;

  function embeddingScriptsLoaded() {
    try {
      if (window.EmbeddingScripts && typeof window.EmbeddingScripts.scriptsLoaded === 'function') {
        return window.EmbeddingScripts.scriptsLoaded();
      }
    } catch { /* fall through to local check */ }
    try {
      return !!(window.EmbeddingRegistry && window.HarrierProvider
        && window.NotesVectorCache && window.EmbeddingService && window.NotesSemanticSearch);
    } catch {
      return false;
    }
  }

  function loadEmbeddingScript(src) {
    try {
      if (window.EmbeddingScripts && typeof window.EmbeddingScripts.loadScript === 'function') {
        return window.EmbeddingScripts.loadScript(src);
      }
    } catch { /* fall through to local loader */ }
    return new Promise(function (resolve, reject) {
      const fail = function (message) {
        reject(new Error(message || ('Failed to load ' + src)));
      };
      try {
        const existing = document.querySelector('script[data-embeddings-src="' + src + '"]');
        if (existing) {
          // Another caller (e.g. Settings) is already loading this module:
          // wait for ITS load instead of resolving early. Resolving here
          // would recurse schedule→ensure in microtasks and starve the
          // module-execution task forever.
          if (existing.dataset.embeddingsLoaded === 'true') {
            resolve();
            return;
          }
          existing.addEventListener('load', function () { resolve(); });
          existing.addEventListener('error', function () { fail(); });
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.dataset.embeddingsSrc = src;
        script.addEventListener('load', function () {
          script.dataset.embeddingsLoaded = 'true';
          resolve();
        });
        script.addEventListener('error', function () {
          // Remove the dead tag so the next attempt recreates it instead of
          // attaching to a tag that will never fire again.
          if (script.parentNode) {
            try { script.parentNode.removeChild(script); } catch { /* ignore */ }
          }
          fail();
        });
        document.body.appendChild(script);
      } catch (e) {
        reject(e);
      }
    });
  }

  function ensureEmbeddingScripts() {
    try {
      if (window.EmbeddingScripts && typeof window.EmbeddingScripts.ensureScripts === 'function') {
        return window.EmbeddingScripts.ensureScripts();
      }
    } catch { /* fall through to local chain */ }
    if (embeddingScriptsLoaded()) return Promise.resolve();
    if (_embeddingScriptsPromise) return _embeddingScriptsPromise;
    let chain = Promise.resolve();
    EMBEDDING_SCRIPT_SOURCES.forEach(function (src) {
      chain = chain.then(function () { return loadEmbeddingScript(src); });
    });
    _embeddingScriptsPromise = chain.catch(function (err) {
      _embeddingScriptsPromise = null;
      throw err;
    });
    return _embeddingScriptsPromise;
  }

  // Debounced so fast typing issues one inference pass per pause, not one
  // per keystroke. The generation counter drops stale results; the debounce
  // avoids starting the in-flight work at all.
  const SEMANTIC_RERANK_DEBOUNCE_MS = 200;
  let _semanticDebounceId = null;

  function clearSemanticDebounce() {
    if (_semanticDebounceId) {
      clearTimeout(_semanticDebounceId);
      _semanticDebounceId = null;
    }
  }

  function scheduleSemanticRerank() {
    if (!_activeSearchQuery || !isNotesSemanticEnabled()) {
      clearSemanticDebounce();
      updateSemanticStatus('idle');
      if (_semanticRankedView) {
        _semanticRankedView = false;
        renderNotes();
      }
      return;
    }
    if (!embeddingScriptsLoaded()) {
      // First enable: fetch the small embedding modules in the background,
      // then re-rank. The 300MB model itself still downloads only via the
      // Settings opt-in flow (embedding-service.js).
      updateSemanticStatus('loading');
      const queryAtStart = _activeSearchQuery;
      ensureEmbeddingScripts().then(function () {
        if (queryAtStart === _activeSearchQuery) scheduleSemanticRerank();
      }).catch(function () {
        updateSemanticStatus('idle');
      });
      return;
    }
    if (!isNotesSemanticReady()) {
      clearSemanticDebounce();
      let loading;
      try {
        loading = window.EmbeddingService && typeof window.EmbeddingService.getStatus === 'function'
          ? window.EmbeddingService.getStatus().status === 'loading'
          : false;
      } catch { loading = false; }
      // Lazy load (PR #1187 human review): the page-load resume no longer
      // warms the ~300MB model, so the first query with the flag on starts
      // a passive (silent) load here. Already-loading short-circuits
      // inside requestSemanticModelLoad via the service status guard.
      if (!loading) {
        try {
          if (typeof window.requestSemanticModelLoad === 'function') {
            window.requestSemanticModelLoad();
          }
        } catch { /* ignore lazy-load failures; status line covers it */ }
      }
      updateSemanticStatus(loading ? 'loading' : 'idle');
      // Deleting the ready model must not leave a stale semantic order on
      // screen: drop the ranked view and re-render keyword results.
      if (_semanticRankedView) {
        _semanticRankedView = false;
        renderNotes();
      }
      return;
    }
    clearSemanticDebounce();
    const scheduledQuery = _activeSearchQuery;
    updateSemanticStatus('searching');
    _semanticDebounceId = setTimeout(function () {
      _semanticDebounceId = null;
      if (scheduledQuery !== _activeSearchQuery) return;
      runSemanticRerank(scheduledQuery);
    }, SEMANTIC_RERANK_DEBOUNCE_MS);
  }

  function runSemanticRerank(queryAtStart) {
    const generation = ++_semanticGeneration;
    getFilteredNotesRanked().then(function (ranked) {
      if (generation !== _semanticGeneration) return;
      if (queryAtStart !== _activeSearchQuery) return;
      // Disabled/deleted while inference was in flight: the sync pass in
      // renderNotes (via applyNotesSemanticEnabled) already shows the
      // keyword order, so dropping here avoids repainting a stale
      // semantic order with the feature off (PR #1187 human review).
      if (!isNotesSemanticEnabled() || !isNotesSemanticReady()) return;
      updateSemanticStatus('idle');
      // Never wipe an in-progress edit: if the user is typing in a note,
      // keep the sync render (the next renderNotes will re-rank anyway).
      const activeEl = document.activeElement;
      if (activeEl && activeEl.classList && activeEl.classList.contains('note-textarea')
        && activeEl.closest('#notes-list')) {
        return;
      }
      // Second-pass render: only re-render when the order actually changed
      // on screen, to avoid focus churn while typing. An empty result must
      // still render so the hidden empty state (see renderNotes) is restored
      // instead of leaving a blank list when both passes are empty.
      const currentIds = Array.isArray(_lastRenderedIds) ? _lastRenderedIds : [];
      const sameOrder = ranked.length === currentIds.length
        && ranked.every(function (n, i) { return currentIds[i] === n.id; });
      if (sameOrder && ranked.length > 0) return;
      renderSemanticResults(ranked);
    }).catch(function () {
      if (generation === _semanticGeneration) updateSemanticStatus('idle');
    });
  }

  function renderSemanticResults(ranked) {
    const notesList = elements.notesList || document.getElementById('notes-list');
    const notesEmpty = elements.notesEmpty || document.getElementById('notes-empty');
    if (!notesList || !notesEmpty) return;
    notesList.innerHTML = '';
    // Mirror renderNotes(): drop preview state for ids that no longer exist.
    const activeIds = new Set(notes.map(n => n.id));
    for (const key of Object.keys(notePreviewModes)) {
      if (!activeIds.has(key)) delete notePreviewModes[key];
    }
    // Like renderNotes(): a second-pass rerank must not jump the scroll.
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    if (ranked.length === 0) {
      notesEmpty.style.display = 'block';
      updateNotesEmptyState(notesEmpty, notes.length === 0);
      _lastRenderedIds = [];
      _semanticRankedView = false;
      return;
    }
    notesEmpty.style.display = 'none';
    ranked.forEach(function (note, index) {
      notesList.appendChild(createNoteCard(note, index));
    });
    _lastRenderedIds = ranked.map(n => n.id);
    _semanticRankedView = true;
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
  }

  function updateNotesEmptyState(emptyEl, isEmpty) {
    const emptyParagraph = emptyEl.querySelector('p');
    if (!emptyParagraph) return;
    const key = isEmpty ? 'notesEmpty' : 'notesNoResults';
    const fallback = isEmpty ? 'No notes yet. Click + to add one!' : 'No matching notes.';
    emptyParagraph.textContent = window.i18n ? window.i18n.t(key) : fallback;
    emptyParagraph.dataset.i18n = key;
  }

  function renderNotes() {
    const { notesList, notesEmpty } = elements;
    if (!notesList || !notesEmpty) return;
    // Any sync re-render invalidates in-flight reranks: ranked results
    // capture the tag base at start, so a tag click or import racing
    // inference would otherwise paint stale tag-A order under tag B
    // (PR #1187 human review). The disable/delete paths funnel through
    // here via applyNotesSemanticEnabled for the same reason.
    bumpSemanticGeneration();
    _semanticRankedView = false;

    const active = document.activeElement;
    const isEditingNote = !_suppressRenderPreserve && active
      && active.classList.contains('note-textarea')
      && active.closest('#notes-list');
    let scrollPos = null;
    let selection = null;
    let activeId = null;
    if (isEditingNote) {
      scrollPos = { x: window.scrollX, y: window.scrollY };
      activeId = active.dataset.id;
      try {
        selection = {
          start: active.selectionStart,
          end: active.selectionEnd,
          dir: active.selectionDirection
        };
      } catch {
        // Ignore unavailable selection APIs; the note content remains usable.
      }
    }

    notes.sort((a, b) => a.order - b.order);
    notesList.innerHTML = '';

    const activeIds = new Set(notes.map(n => n.id));
    for (const key of Object.keys(notePreviewModes)) {
      if (!activeIds.has(key)) delete notePreviewModes[key];
    }

    renderTagFilter();

    const filtered = getFilteredNotes();

    if (filtered.length === 0) {
      const semanticPending = notes.length > 0 && _activeSearchQuery && isNotesSemanticReady();
      notesEmpty.style.display = semanticPending ? 'none' : 'block';
      if (!semanticPending) updateNotesEmptyState(notesEmpty, notes.length === 0);
      _lastRenderedIds = [];
      if (scrollPos && (window.scrollX !== scrollPos.x || window.scrollY !== scrollPos.y)) {
        window.scrollTo(scrollPos.x, scrollPos.y);
      }
      scheduleSemanticRerank();
      return;
    }

    notesEmpty.style.display = 'none';

    filtered.forEach((note, index) => {
      const card = createNoteCard(note, index);
      notesList.appendChild(card);
    });
    // The order the user actually sees: reorder/drag operate on this so a
    // semantic re-rank never makes a drag move the wrong slot.
    _lastRenderedIds = filtered.map(n => n.id);

    if (isEditingNote && activeId) {
      if (scrollPos && (window.scrollX !== scrollPos.x || window.scrollY !== scrollPos.y)) {
        window.scrollTo(scrollPos.x, scrollPos.y);
      }
      const restored = [...notesList.querySelectorAll('.note-textarea')].find(ta => ta.dataset.id === activeId);
      if (restored) {
        try {
          restored.focus({ preventScroll: true });
        } catch {
          restored.focus();
        }
        if (selection) {
          try {
            restored.setSelectionRange(selection.start, selection.end, selection.dir);
          } catch {
            // Ignore failed setSelectionRange; focus is already restored.
          }
        }
        if (scrollPos && (window.scrollX !== scrollPos.x || window.scrollY !== scrollPos.y)) {
          window.scrollTo(scrollPos.x, scrollPos.y);
        }
      } else if (scrollPos && (window.scrollX !== scrollPos.x || window.scrollY !== scrollPos.y)) {
        window.scrollTo(scrollPos.x, scrollPos.y);
      }
    }
    scheduleSemanticRerank();
  }

  function createNoteCard(note, index) {
    const card = document.createElement('div');
    card.className = 'note-item';
    card.dataset.id = note.id;
    card.style.animationDelay = (index * 0.05) + 's';

    const isPreview = notePreviewModes[note.id] === true;

    const grip = document.createElement('span');
    grip.className = 'note-grip';
    grip.draggable = true;
    grip.tabIndex = 0;
    grip.innerHTML = SVG_GRIP;
    grip.title = window.i18n ? window.i18n.t('notesDragToReorder') : 'Drag to reorder';

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
    tagBtn.title = note.tag || (window.i18n ? window.i18n.t('notesAddTag') : 'Add tag');
    tagBtn.innerHTML = SVG_TAG;
    if (note.tag) {
      const tagLabel = document.createElement('span');
      tagLabel.className = 'note-tag-label';
      tagLabel.textContent = note.tag;
      tagBtn.appendChild(tagLabel);
      tagBtn.classList.add('has-tag');
    }

    const tagWrapper = document.createElement('div');
    tagWrapper.className = 'note-tag-wrapper';
    tagWrapper.appendChild(tagBtn);

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
    card.appendChild(tagWrapper);
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
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    tas.forEach(t => { t.style.height = 'auto'; });
    const heights = tas.map(t => t.scrollHeight);
    tas.forEach((t, i) => { t.style.height = heights[i] + 'px'; });
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
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
        } else if (!isImportedEmptyNote(id)) {
          deleteNote(id);
        }
      }
    });
  }

  // Drop in-flight debounced saves without persisting them. The settings
  // import flow calls this before writing the backup (issue #824) so a
  // pre-import edit cannot overwrite imported notes when its timer fires.
  function cancelPendingNoteSaves() {
    Object.keys(debounceTimers).forEach(id => {
      clearTimeout(debounceTimers[id]);
      delete debounceTimers[id];
    });
  }

  function addNote() {
    if (_activeSearchQuery) {
      setSearchQuery('');
      if (elements.notesSearch) {
        elements.notesSearch.value = '';
      }
    }
    const minOrder = notes.length > 0
      ? notes.reduce((min, n) => Math.min(min, n.order), notes[0].order)
      : 0;
    const note = {
      id: generateNoteId(),
      text: '',
      tag: _activeTagFilter || '',
      order: minOrder - 1,
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
    bumpSemanticGeneration();
    _suppressRenderPreserve = true;
    renderNotes();
    _suppressRenderPreserve = false;
    focusNewNote(note.id);
  }

  function focusNewNote(id) {
    const ta = document.querySelector(`.note-textarea[data-id="${id}"]`);
    if (ta) {
      ta.focus();
    }
  }

  function isImportedEmptyNote(id) {
    const note = notes.find(n => n.id === id);
    // Only guard while the stored text is still empty: once the user fills
    // the note, clearing it must delete/save again so stale text cannot
    // return from storage after a reload.
    return !!(note && note.importedEmpty && !note.text);
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
    invalidateNoteVector(id);
    bumpSemanticGeneration();
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
      return;
    }
    invalidateNoteVector(id);
    // Drop in-flight reranks (their base predates this edit) but do NOT
    // re-render here: the textarea is focused and typing must never churn
    // the list. Blur re-ranks via handleNotesBlur so stale membership
    // (edited text no longer matching the query) settles once editing ends.
    bumpSemanticGeneration();
    updateSemanticStatus('idle');
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
    invalidateNoteVector(id);
    bumpSemanticGeneration();
    renderNotes();
  }

  function reorderNotes(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    // Semantic relevance order is computed, not user-owned: the next rerank
    // would undo a move made inside it. Leave relevance view first (clearing
    // the query like addNote does) so the manual order persists on screen.
    if (_semanticRankedView) {
      setSearchQuery('');
      try {
        const searchInput = elements.notesSearch || document.getElementById('notes-search');
        if (searchInput) searchInput.value = '';
      } catch { /* ignore */ }
      updateSemanticStatus('idle');
    }
    // Operate on the displayed order (sync pass or semantic re-rank), so a
    // drag while ranked moves the card the user actually grabbed.
    const filtered = getVisibleNotes();
    if (fromIndex < 0 || fromIndex >= filtered.length || toIndex < 0 || toIndex > filtered.length) return;

    const previousNotes = notes.map(n => ({ ...n }));
    const movedNote = filtered[fromIndex];
    if (!movedNote) return;
    const activeElement = document.activeElement;
    const shouldRestoreFocus = activeElement && activeElement.classList.contains('note-grip')
      && activeElement.closest('.note-item')?.dataset.id === movedNote.id;

    const reorderedFiltered = [...filtered];
    const [removed] = reorderedFiltered.splice(fromIndex, 1);
    const insertionIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
    reorderedFiltered.splice(Math.min(insertionIndex, reorderedFiltered.length), 0, removed);

    // When any filter is active, only replace the visible notes in their
    // existing slots so hidden notes keep their relative positions.
    const activeIds = new Set(filtered.map(n => n.id));
    const filteredSlots = notes
      .map((note, index) => (activeIds.has(note.id) ? index : -1))
      .filter(index => index !== -1);
    filteredSlots.forEach((slot, index) => {
      notes[slot] = reorderedFiltered[index];
    });

    notes.forEach((n, i) => { n.order = i; });

    if (!saveNotes(notes)) {
      notes = previousNotes;
      renderNotes();
      if (shouldRestoreFocus) {
        document.querySelector(`.note-item[data-id="${movedNote.id}"] .note-grip`)?.focus();
      }
      return;
    }
    bumpSemanticGeneration();
    renderNotes();
    if (shouldRestoreFocus) {
      document.querySelector(`.note-item[data-id="${movedNote.id}"] .note-grip`)?.focus();
    }
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
    _previewMouseDownIsPreview = false;
    if (!notes.find(n => n.id === id)) {
      delete notePreviewModes[id];
      return;
    }
    const isCurrentlyPreview = notePreviewModes[id] === true;
    if (!isCurrentlyPreview && debounceTimers[id]) {
      clearTimeout(debounceTimers[id]);
      delete debounceTimers[id];
      const ta = document.querySelector(`.note-textarea[data-id="${id}"]`);
      if (ta) {
        const text = ta.value || '';
        if (text) {
          updateNoteText(id, text);
        } else if (!isImportedEmptyNote(id)) {
          deleteNote(id);
          return;
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
  function closeTagPicker({ commit = true } = {}) {
    const existing = document.querySelector('.note-tag-picker');
    if (existing) {
      const card = existing.closest('.note-item');
      const input = existing.querySelector('.note-tag-input');
      const noteId = card?.dataset.id;
      const tag = input ? input.value.trim() : '';
      const note = noteId ? notes.find(n => n.id === noteId) : null;
      if (card) card.classList.remove('tag-picker-open');
      existing.remove();
      if (commit && note && input && tag !== (note.tag || '')) {
        updateNoteTag(noteId, tag);
      }
    }
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
    input.placeholder = window.i18n ? window.i18n.t('notesTagPlaceholder') : 'Tag name...';
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
      removeBtn.textContent = window.i18n ? window.i18n.t('notesRemoveTag') : 'Remove tag';
      actions.appendChild(removeBtn);
    }
    picker.appendChild(actions);

    const tagWrapper = tagBtn.closest('.note-tag-wrapper');
    if (!tagWrapper) return;
    const card = tagBtn.closest('.note-item');
    if (card) card.classList.add('tag-picker-open');
    tagWrapper.appendChild(picker);

    input.focus();

    let blurTimer = null;
    const cancelBlur = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cancelBlur();
        const val = input.value.trim();
        updateNoteTag(noteId, val);
        closeTagPicker();
      } else if (e.key === 'Escape') {
        cancelBlur();
        closeTagPicker({ commit: false });
      }
    });

    input.addEventListener('blur', () => {
      cancelBlur();
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (!picker.isConnected) {
          const val = input.value.trim();
          if (val !== (note.tag || '')) {
            updateNoteTag(noteId, val);
          }
          return;
        }
        if (picker.contains(document.activeElement)) return;
        const val = input.value.trim();
        if (val !== (note.tag || '')) {
          updateNoteTag(noteId, val);
        }
        const card = picker.closest('.note-item');
        if (card) card.classList.remove('tag-picker-open');
        picker.remove();
      }, 150);
    });

    picker.addEventListener('focusout', (e) => {
      const next = e.relatedTarget;
      if (next && picker.contains(next)) {
        cancelBlur();
        return;
      }
      cancelBlur();
      if (!picker.isConnected) return;
      const val = input.value.trim();
      if (val !== (note.tag || '')) {
        updateNoteTag(noteId, val);
      }
      const card = picker.closest('.note-item');
      if (card) card.classList.remove('tag-picker-open');
      picker.remove();
    });

    picker.addEventListener('mousedown', (e) => {
      if (e.target.closest('.note-tag-suggestion, .note-tag-remove-btn')) {
        cancelBlur();
      }
    });

    picker.addEventListener('click', (e) => {
      const suggestion = e.target.closest('.note-tag-suggestion');
      if (suggestion) {
        cancelBlur();
        updateNoteTag(noteId, suggestion.dataset.tag);
        closeTagPicker();
        return;
      }
      const removeBtn = e.target.closest('.note-tag-remove-btn');
      if (removeBtn) {
        cancelBlur();
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
      _dragOverId = null;
      _dragInsertAfter = false;
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

    _dragInsertAfter = e.clientY >= midY;
    if (!_dragInsertAfter) {
      card.parentNode.insertBefore(_dragPlaceholder, card);
    } else {
      card.parentNode.insertBefore(_dragPlaceholder, card.nextSibling);
    }
    _dragPlaceholder.style.display = '';
    _dragOverId = card.dataset.id;
  }

  function handleDrop(e) {
    e.preventDefault();
    const sourceId = _dragSourceId;
    const overId = _dragOverId;
    const insertAfter = _dragInsertAfter;
    cleanupDrag();

    if (!overId || !sourceId || overId === sourceId) return;

    const filtered = getVisibleNotes();
    const fromIndex = filtered.findIndex(n => n.id === sourceId);
    const overIndex = filtered.findIndex(n => n.id === overId);
    const toIndex = overIndex + (insertAfter ? 1 : 0);

    if (fromIndex !== -1 && overIndex !== -1) {
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
    _dragInsertAfter = false;
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

    if (e.target.closest('.note-tag-picker')) return;

    const tagBtn = e.target.closest('.note-tag-btn');
    if (tagBtn) {
      const tagWrapper = tagBtn.closest('.note-tag-wrapper');
      const picker = tagWrapper?.querySelector('.note-tag-picker');
      if (picker) {
        closeTagPicker();
      } else {
        openTagPicker(tagBtn.dataset.id);
      }
      return;
    }

    const filterBtn = e.target.closest('.note-tag-filter-btn');
    if (filterBtn) {
      closeTagPicker();
      _activeTagFilter = filterBtn.dataset.tag || null;
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

  function finishPreviewMouseDownBlur(ta, id, hadPending) {
    const wasPreview = _previewMouseDownIsPreview;
    _previewMouseDown = false;
    _previewMouseDownIsPreview = false;
    const text = ta.value || '';
    if (text) {
      updateNoteText(id, text);
      return true;
    }
    if (wasPreview) {
      const note = notes.find(n => n.id === id);
      if ((hadPending || (note && note.text)) && !isImportedEmptyNote(id)) {
        deleteNote(id);
      }
    }
    return true;
  }

  function handleNotesBlur(e) {
    const ta = e.target.closest('.note-textarea');
    if (!ta) return;
    const id = ta.dataset.id;
    const hadPending = !!debounceTimers[id];
    if (debounceTimers[id]) {
      clearTimeout(debounceTimers[id]);
      delete debounceTimers[id];
    }
    if (notePreviewModes[id] === true) return;
    if (_previewMouseDown) {
      finishPreviewMouseDownBlur(ta, id, hadPending);
      return;
    }
    const text = ta.value || '';
    if (!text) {
      if (!isImportedEmptyNote(id)) deleteNote(id);
      return;
    }
    updateNoteText(ta.dataset.id, text);
    // Editing may have changed search membership; re-rank now that the
    // editor is blurred (runSemanticRerank skips while a textarea is focused).
    if (_activeSearchQuery && isNotesSemanticEnabled()) scheduleSemanticRerank();
  }

  function handleNotesKeydown(e) {
    const grip = e.target.closest('.note-grip');
    if (grip) {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const card = grip.closest('.note-item');
      if (!card) return;

      const filtered = getVisibleNotes();
      const fromIndex = filtered.findIndex(note => note.id === card.dataset.id);
      if (fromIndex !== -1) {
        const toIndex = fromIndex + (e.key === 'ArrowUp' ? -1 : 2);
        reorderNotes(fromIndex, toIndex);
      }
      e.preventDefault();
      return;
    }

    const ta = e.target.closest('.note-textarea');
    if (!ta) return;
    if (e.key === 'Escape') {
      ta.blur();
    }
  }

  function handlePreviewMouseDown(e) {
    const isPreview = !!e.target.closest('.note-preview-btn');
    const isTag = !!e.target.closest('.note-tag-btn');
    _previewMouseDown = isPreview || isTag;
    _previewMouseDownIsPreview = isPreview;
  }

  function handleNotesSearchInput(e) {
    setSearchQuery(e.target.value);
    renderNotes();
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function exportNotes() {
    flushPendingSaves();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes: notes.map(n => ({ ...n }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = formatDateISO(new Date());
    const a = document.createElement('a');
    a.href = url;
    a.download = `new-tab-notes-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function importNotes() {
    const fileInput = document.getElementById('notes-import-file');
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.click();
  }

  function validateNotesData(data) {
    if (!data || typeof data !== 'object') return false;
    const items = data.notes;
    if (!Array.isArray(items)) return false;
    const seenIds = new Set();
    for (const item of items) {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id)) return false;
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      if (typeof item.text !== 'string') return false;
      if (item.tag !== undefined && item.tag !== null && typeof item.tag !== 'string') return false;
      if (item.order !== undefined && item.order !== null && (typeof item.order !== 'number' || !Number.isFinite(item.order))) return false;
      if (item.createdAt !== undefined && item.createdAt !== null && typeof item.createdAt !== 'string') return false;
      if (item.updatedAt !== undefined && item.updatedAt !== null && typeof item.updatedAt !== 'string') return false;
    }
    return true;
  }

  function mergeImportedNotes(importedItems) {
    // Persist any in-flight debounced edits first so a merge cannot drop them.
    flushPendingSaves();
    const previousNotes = notes.map(n => ({ ...n }));
    const existingIds = new Set(notes.map(n => n.id));
    let maxOrder = notes.reduce((max, n) => Math.max(max, Number.isFinite(n.order) ? n.order : -1), -1);
    let addedCount = 0;

    for (const item of importedItems) {
      if (existingIds.has(item.id)) continue;
      maxOrder += 1;
      const note = {
        id: item.id,
        text: item.text,
        tag: typeof item.tag === 'string' ? item.tag : '',
        order: maxOrder,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString()
      };
      notes.push(note);
      if (!note.text) {
        note.importedEmpty = true;
      }
      existingIds.add(note.id);
      addedCount += 1;
    }

    if (addedCount === 0) {
      if (typeof showToast === 'function') {
        showToast(window.i18n ? window.i18n.t('notesImportNoNew') : 'No new notes to import.', 'info');
      }
      return 0;
    }

    if (!saveNotes(notes)) {
      notes = previousNotes;
      renderNotes();
      return 0;
    }

    renderNotes();
    if (typeof showToast === 'function') {
      const msg = window.i18n
        ? window.i18n.t('notesImportSuccess', { count: addedCount })
        : 'Imported ' + addedCount + ' notes successfully.';
      showToast(msg, 'success');
    }
    return addedCount;
  }

  function handleNotesImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = function() {
      console.error('Failed to read notes import file');
      if (typeof showToast === 'function') {
        showToast(window.i18n ? window.i18n.t('importReadError') : 'Failed to read the selected file.', 'error');
      }
    };
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!validateNotesData(data)) {
          if (typeof showToast === 'function') {
            showToast(window.i18n ? window.i18n.t('notesImportInvalid') : 'Invalid notes data. Please select a valid JSON file.', 'error');
          }
          return;
        }
        mergeImportedNotes(data.notes);
      } catch (err) {
        console.error('Failed to parse notes import file:', err);
        if (typeof showToast === 'function') {
          showToast(window.i18n ? window.i18n.t('notesImportInvalid') : 'Invalid notes data. Please select a valid JSON file.', 'error');
        }
      }
    };
    reader.readAsText(file);
  }

  function initNotes() {
    // Drop any rerank debounced before re-init (e.g. between tests) so a
    // stale timer cannot render into the fresh state, and invalidate any
    // inference already in flight for the same reason.
    clearSemanticDebounce();
    bumpSemanticGeneration();
    const notesSection = document.querySelector('.notes-section');
    if (!notesSection) {
      return;
    }

    elements.notesSection = notesSection;
    elements.notesList = document.getElementById('notes-list');
    elements.notesEmpty = document.getElementById('notes-empty');
    elements.addNoteBtn = document.getElementById('add-note-btn');
    elements.notesSearch = document.getElementById('notes-search');
    elements.exportNotesBtn = document.getElementById('export-notes');
    elements.importNotesBtn = document.getElementById('import-notes');
    elements.notesImportFile = document.getElementById('notes-import-file');

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

    if (elements.exportNotesBtn) {
      elements.exportNotesBtn.removeEventListener('click', exportNotes);
      elements.exportNotesBtn.addEventListener('click', exportNotes);
    }

    if (elements.importNotesBtn) {
      elements.importNotesBtn.removeEventListener('click', importNotes);
      elements.importNotesBtn.addEventListener('click', importNotes);
    }

    if (elements.notesImportFile) {
      elements.notesImportFile.removeEventListener('change', handleNotesImportFile);
      elements.notesImportFile.addEventListener('change', handleNotesImportFile);
    }

    if (elements.notesSearch) {
      elements.notesSearch.removeEventListener('input', handleNotesSearchInput);
      elements.notesSearch.addEventListener('input', handleNotesSearchInput);
      elements.notesSearch.placeholder = window.i18n ? window.i18n.t('notesSearchPlaceholder') : 'Search notes...';
      // Restore current query value in case renderNotes cleared it
      if (elements.notesSearch.value !== _activeSearchQuery) {
        elements.notesSearch.value = _activeSearchQuery;
      }
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
    // 'embedding-status' is subscribed once at file scope below; DOM
    // dedupes identical listeners, so initNotes must not re-add it here.
  }

  window.addEventListener('beforeunload', () => {
    closeTagPicker();
    flushPendingSaves();
  });

  window.addEventListener('languageChanged', () => {
    flushPendingSaves();
    if (elements.addNoteBtn) {
      elements.addNoteBtn.title = window.i18n ? window.i18n.t('addNoteTooltip') : 'Add note';
    }
    if (elements.notesSearch) {
      elements.notesSearch.placeholder = window.i18n ? window.i18n.t('notesSearchPlaceholder') : 'Search notes...';
    }
    // renderNotes() re-ranks (debounced) and sets the correct semantic
    // status for the current ready state; do not force one here.
    renderNotes();
  });

  // The embedding service dispatches embedding-status on every download
  // progress tick. Scheduling a rerank per tick is wasteful: while the model
  // is still loading there is nothing to rank yet, and the status text has
  // no percent to update. Rerank only on the transition into ready (when
  // results can actually change) or out of ready (to drop the relevance
  // view); loading ticks get a cheap status update with no debounce churn.
  let _lastEmbeddingStatus = null;
  function handleEmbeddingStatusEvent(event) {
    let status = null;
    try {
      const detail = event && event.detail;
      status = detail ? detail.status : null;
    } catch { /* keep null */ }
    if (!status) {
      try {
        status = window.EmbeddingService && typeof window.EmbeddingService.getStatus === 'function'
          ? window.EmbeddingService.getStatus().status
          : null;
      } catch { /* keep null */ }
    }
    const prev = _lastEmbeddingStatus;
    _lastEmbeddingStatus = status;
    if (status === 'ready') {
      if (prev !== 'ready') scheduleSemanticRerank();
      return;
    }
    if (prev === 'ready') {
      scheduleSemanticRerank();
      return;
    }
    if (status === 'loading') {
      if (prev !== 'loading') updateSemanticStatus('loading');
      return;
    }
    if (prev !== status) updateSemanticStatus('idle');
  }

  try {
    document.addEventListener('embedding-status', handleEmbeddingStatusEvent);
  } catch { /* ignore */ }

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
  window.renderNotes = renderNotes;
  window.getFilteredNotes = getFilteredNotes;
  window.getFilteredNotesRanked = getFilteredNotesRanked;
  window.isNotesSemanticEnabled = isNotesSemanticEnabled;
  window.isNotesSemanticReady = isNotesSemanticReady;
  window.invalidateSemanticRerank = invalidateSemanticRerank;
  window.setNotesSearchQuery = setSearchQuery;
  window.getNotesSearchQuery = getSearchQuery;
  window.cancelPendingNoteSaves = cancelPendingNoteSaves;
  window.exportNotes = exportNotes;
  window.importNotes = importNotes;
  window.validateNotesData = validateNotesData;
  window.mergeImportedNotes = mergeImportedNotes;
  window.handleNotesImportFile = handleNotesImportFile;
} catch {
  // ignore
}

})();
