import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function installMockService(state) {
  window.EmbeddingService = {
    _state: state || { status: 'idle', progress: 0, error: '', modelId: 'test-model' },
    getStatus: function () { return { ...this._state }; },
    isReady: function () { return this._state.status === 'ready'; },
    ensureModel: function () {
      this._state = { status: 'ready', progress: 1, error: '', modelId: 'test-model' };
      document.dispatchEvent(new CustomEvent('embedding-status'));
      return Promise.resolve({ id: 'harrier-int8' });
    },
    cancelLoad: function () {
      this._state = { status: 'idle', progress: 0, error: '', modelId: 'test-model' };
      document.dispatchEvent(new CustomEvent('embedding-status'));
    },
    deleteModel: function () {
      this._state = { status: 'idle', progress: 0, error: '', modelId: 'test-model' };
      document.dispatchEvent(new CustomEvent('embedding-status'));
      return Promise.resolve(true);
    }
  };
}

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ai/embeddings/embedding-registry.js');
  injectScript('src/ai/embeddings/harrier-provider.js');
  injectScript('src/ai/embeddings/notes-vector-cache.js');
  injectScript('src/ai/embeddings/embedding-service.js');
  injectScript('src/ai/embeddings/notes-semantic-search.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
});

beforeEach(() => {
  localStorage.clear();
  try { delete window.EmbeddingService; } catch { /* ignore */ }
  window.initNotesSemanticSetting();
  window.applyNotesSemanticEnabled();
});

describe('Semantic search settings', () => {
  it('is disabled by default', () => {
    expect(window.loadNotesSemanticEnabled()).toBe(false);
    expect(document.getElementById('notes-semantic-enabled-setting').checked).toBe(false);
  });

  it('reads the persisted flag', () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    expect(window.loadNotesSemanticEnabled()).toBe(true);
  });

  it('starts the model download on opt-in and shows ready state', async () => {
    installMockService();
    const checkbox = document.getElementById('notes-semantic-enabled-setting');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
    // ensureModel resolves on a microtask; flush it.
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.applyNotesSemanticEnabled();
    expect(document.getElementById('notes-semantic-delete').hidden).toBe(false);
    expect(document.getElementById('notes-semantic-progress').hidden).toBe(true);
    expect(document.getElementById('notes-semantic-settings-status').textContent).toContain('ready');
  });

  it('unchecks the toggle when host permission is denied', async () => {
    installMockService();
    const originalRequest = chrome.permissions.request;
    chrome.permissions.request = async function () { return false; };
    try {
      const checkbox = document.getElementById('notes-semantic-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('false');
      expect(checkbox.checked).toBe(false);
    } finally {
      chrome.permissions.request = originalRequest;
    }
  });

  it('shows progress while downloading', () => {
    installMockService({ status: 'loading', progress: 0.42, error: '', modelId: 'test-model' });
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.applyNotesSemanticEnabled();
    const progress = document.getElementById('notes-semantic-progress');
    expect(progress.hidden).toBe(false);
    expect(Number(progress.value)).toBe(42);
    expect(document.getElementById('notes-semantic-cancel').hidden).toBe(false);
  });

  it('cancel resets the flag', () => {
    installMockService({ status: 'loading', progress: 0.5, error: '', modelId: 'test-model' });
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.applyNotesSemanticEnabled();
    document.getElementById('notes-semantic-cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('false');
  });

  it('delete clears the model and resets the flag', async () => {
    installMockService({ status: 'ready', progress: 1, error: '', modelId: 'test-model' });
    let deleteCalled = false;
    const originalDelete = window.EmbeddingService.deleteModel;
    window.EmbeddingService.deleteModel = function () {
      deleteCalled = true;
      return originalDelete.apply(this, arguments);
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.applyNotesSemanticEnabled();
    document.getElementById('notes-semantic-delete').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteCalled).toBe(true);
    expect(window.EmbeddingService.getStatus().status).toBe('idle');
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('false');
  });

  it('failed delete keeps the toggle and Delete visible with delete copy', async () => {
    window.EmbeddingService = {
      getStatus: function () { return { status: 'error', progress: 0, error: 'Failed to delete', modelId: 'test-model' }; },
      isReady: function () { return false; },
      deleteModel: function () { return Promise.resolve(false); }
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.applyNotesSemanticEnabled();
    document.getElementById('notes-semantic-delete').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Leftover bytes stay visible/retryable: flag preserved, Delete shown,
    // status uses the delete-specific locale key (PR #1187 human review).
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
    expect(document.getElementById('notes-semantic-delete').hidden).toBe(false);
    expect(document.getElementById('notes-semantic-settings-status').textContent).toContain('delete');
  });

  it('ignores a stale delete result after re-enable during cleanup', async () => {
    let releaseDelete;
    const gate = new Promise(function (resolve) { releaseDelete = function () { resolve(true); }; });
    let deleteCalled = false;
    window.EmbeddingService = {
      // Ready so the Delete control is visible, matching the real UI state
      // a user needs to begin deletion (PR #1187 review).
      getStatus: function () { return { status: 'ready', progress: 1, error: '', modelId: 'test-model' }; },
      isReady: function () { return true; },
      ensureModel: function () { return Promise.resolve({ id: 'harrier-int8' }); },
      cancelLoad: function () {},
      deleteModel: function () { deleteCalled = true; return gate; }
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.applyNotesSemanticEnabled();
    // The race requires the visible Delete control (ready status).
    expect(document.getElementById('notes-semantic-delete').hidden).toBe(false);
    document.getElementById('notes-semantic-delete').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // The click binding must invoke deleteModel; otherwise the gate below
    // could resolve without cleanup ever starting (PR #1187 review).
    expect(deleteCalled).toBe(true);
    // Uncheck then re-check to simulate a real re-enable: the off-toggle
    // cancels (generation bump) and the on-toggle starts a fresh download
    // (second bump). The stale successful delete must not clear the fresh
    // marker nor turn the new opt-in back off (PR #1187 human review).
    const checkbox = document.getElementById('notes-semantic-enabled-setting');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    releaseDelete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
    // Fresh download owns the marker now (stale delete must not clear it).
    expect(localStorage.getItem('notesSemanticDownload')).not.toBeNull();
  });

  it('primes a fresh import for resume and leaves settled states alone', () => {
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.removeItem('notesSemanticDownload');
    window.primeNotesSemanticImport();
    // Lazy import (PR #1187 human review): an enabled flag with no marker
    // defers to the first query instead of priming 'loading', so a fresh
    // profile with an empty cache does not start a silent ~300MB download
    // right after import.
    expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.primeNotesSemanticImport();
    expect(localStorage.getItem('notesSemanticDownload')).toBe('ready');
    localStorage.setItem('notesSemanticEnabled', 'false');
    localStorage.removeItem('notesSemanticDownload');
    window.primeNotesSemanticImport();
    expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
  });

  it('clears a leftover marker when the import disables the flag', () => {
    localStorage.setItem('notesSemanticEnabled', 'false');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.primeNotesSemanticImport();
    expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
  });

  it('re-renders the notes list when toggling semantic search off', () => {
    installMockService({ status: 'ready', progress: 1, error: '', modelId: 'test-model' });
    localStorage.setItem('notesSemanticEnabled', 'true');
    window.applyNotesSemanticEnabled();
    let renderCalls = 0;
    const originalRender = window.renderNotes;
    window.renderNotes = function () { renderCalls += 1; };
    try {
      const checkbox = document.getElementById('notes-semantic-enabled-setting');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('false');
      expect(renderCalls).toBeGreaterThan(0);
    } finally {
      if (originalRender) window.renderNotes = originalRender;
      else { try { delete window.renderNotes; } catch { /* ignore */ } }
    }
  });

  it('keeps a fresh opt-in when a stale load fails', async () => {
    let rejectFirst = null;
    let scriptCalls = 0;
    window.EmbeddingScripts = {
      scriptsLoaded: function () { return true; },
      ensureScripts: function () {
        scriptCalls += 1;
        if (scriptCalls === 1) {
          return new Promise(function (_, reject) { rejectFirst = reject; });
        }
        return Promise.resolve();
      }
    };
    installMockService({ status: 'loading', progress: 0.1, error: '', modelId: 'test-model' });
    const checkbox = document.getElementById('notes-semantic-enabled-setting');
    try {
      // Stale opt-in A waits on the script chain.
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Off-toggle cancels A, re-check starts fresh opt-in B.
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // A's chain now rejects: the stale catch must not clear B.
      rejectFirst(new Error('offline'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
    } finally {
      try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    }
  });

  it('loads scripts before deleting from a deferred-ready state', async () => {
    // Fresh page: marker 'ready' from a previous session, service idle
    // (modules not yet loaded). Delete must purge via deleteModel instead
    // of clearing the marker as if cleanup succeeded (PR #1187 review).
    try { delete window.EmbeddingService; } catch { /* ignore */ }
    try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    let deleteCalled = false;
    window.EmbeddingScripts = {
      scriptsLoaded: function () { return false; },
      ensureScripts: function () {
        window.EmbeddingService = {
          getStatus: function () { return { status: 'idle', progress: 0, error: '', modelId: 'test-model' }; },
          isReady: function () { return false; },
          deleteModel: function () {
            deleteCalled = true;
            return Promise.resolve(true);
          }
        };
        return Promise.resolve();
      }
    };
    try {
      window.applyNotesSemanticEnabled();
      expect(document.getElementById('notes-semantic-delete').hidden).toBe(false);
      document.getElementById('notes-semantic-delete').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(deleteCalled).toBe(true);
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('false');
      expect(localStorage.getItem('notesSemanticDownload')).toBeNull();
    } finally {
      try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    }
  });

  it('keeps the marker when script load fails for a deferred-ready delete', async () => {
    try { delete window.EmbeddingService; } catch { /* ignore */ }
    try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.EmbeddingScripts = {
      scriptsLoaded: function () { return false; },
      ensureScripts: function () { return Promise.reject(new Error('offline')); }
    };
    try {
      window.applyNotesSemanticEnabled();
      document.getElementById('notes-semantic-delete').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
      expect(localStorage.getItem('notesSemanticDownload')).toBe('ready');
    } finally {
      try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    }
  });

  it('ignores a stale model download rejection after re-enable (PR #1187)', async () => {
    // Cancel bumps the generation; a late rejection from the cancelled load
    // must not clear the fresh run's loading marker or write error over it.
    const pending = [];
    window.EmbeddingScripts = {
      scriptsLoaded: function () { return true; },
      ensureScripts: function () { return Promise.resolve(); }
    };
    window.EmbeddingService = {
      getStatus: function () {
        return { status: 'loading', progress: 0.1, error: '', modelId: 'test-model' };
      },
      isReady: function () { return false; },
      ensureModel: function () {
        let rejectFn;
        const p = new Promise(function (_, reject) { rejectFn = reject; });
        pending.push({ promise: p, reject: rejectFn });
        // Attach a no-op catch now so the rejection is handled even before
        // the service wires its own handlers (avoids unhandled rejection).
        p.catch(function () {});
        return p;
      },
      cancelLoad: function () {}
    };
    const checkbox = document.getElementById('notes-semantic-enabled-setting');
    try {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pending).toHaveLength(1);
      expect(localStorage.getItem('notesSemanticDownload')).toBe('loading');
      // Off cancels (generation bump + marker clear), on starts a fresh run.
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pending).toHaveLength(2);
      expect(localStorage.getItem('notesSemanticDownload')).toBe('loading');
      // Stale first load rejects: fresh run must stay loading + enabled.
      pending[0].reject(new Error('offline'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
      expect(localStorage.getItem('notesSemanticDownload')).toBe('loading');
    } finally {
      try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    }
  });

  it('leaves the flag and marker intact on passive failures (PR #1187)', async () => {
    // First-query warm / page-load resume with no host grant must not turn
    // the opt-in off: clearing the 'ready' marker strands the cached
    // ~300MB bytes with no Delete control. Only the gestured path resets.
    try { delete window.EmbeddingService; } catch { /* ignore */ }
    try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'ready');
    window.applyNotesSemanticEnabled();
    // Default permissions mock grants nothing, so the passive contains()
    // check fails, matching a fresh device with no host grant.
    window.requestSemanticModelLoad();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
    expect(localStorage.getItem('notesSemanticDownload')).toBe('ready');
  });

  it('leaves the flag and marker intact on passive script failures (PR #1187)', async () => {
    // Same stranded-bytes reason as above for the module-load catch block:
    // an offline passive warm must not clear the opt-in.
    try { delete window.EmbeddingService; } catch { /* ignore */ }
    const originalContains = chrome.permissions.contains;
    chrome.permissions.contains = async function () { return true; };
    window.EmbeddingScripts = {
      scriptsLoaded: function () { return false; },
      ensureScripts: function () { return Promise.reject(new Error('offline')); }
    };
    localStorage.setItem('notesSemanticEnabled', 'true');
    localStorage.setItem('notesSemanticDownload', 'loading');
    try {
      window.resumeSemanticIfNeeded();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(localStorage.getItem('notesSemanticEnabled')).toBe('true');
      expect(localStorage.getItem('notesSemanticDownload')).toBe('loading');
    } finally {
      chrome.permissions.contains = originalContains;
      try { delete window.EmbeddingScripts; } catch { /* ignore */ }
    }
  });
});
