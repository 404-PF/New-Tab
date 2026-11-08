import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

function getNotes() {
  try {
    const raw = localStorage.getItem('notes');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setNotes(data) {
  localStorage.setItem('notes', JSON.stringify(data));
}

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/toast.js');
  injectScript('src/features/notes.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelector('.notes-list').innerHTML = '';
  document.querySelector('.notes-empty').style.display = 'block';
  document.querySelectorAll('.toast-notification').forEach(el => el.remove());
  initNotes();
});

afterEach(() => {
  document.querySelectorAll('.toast-notification').forEach(el => el.remove());
});

async function exportNotesForTest() {
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  let capturedJson = null;
  URL.createObjectURL = (blob) => {
    const reader = new FileReader();
    reader.onload = () => { capturedJson = reader.result; };
    reader.readAsText(blob);
    return 'blob:mock-url';
  };
  URL.revokeObjectURL = () => {};
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  try {
    exportNotes();
    await vi.waitFor(() => expect(capturedJson).not.toBeNull());
    return JSON.parse(capturedJson);
  } finally {
    clickSpy.mockRestore();
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  }
}

async function importNotesFile(payload) {
  const fileInput = document.getElementById('notes-import-file');
  const descriptor = Object.getOwnPropertyDescriptor(fileInput, 'files');
  Object.defineProperty(fileInput, 'files', {
    value: [new File([JSON.stringify(payload)], 'notes.json', { type: 'application/json' })],
    configurable: true
  });

  try {
    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(document.querySelector('.toast-notification')).not.toBeNull();
    });
    return document.querySelector('.toast-notification');
  } finally {
    if (descriptor) {
      Object.defineProperty(fileInput, 'files', descriptor);
    } else {
      delete fileInput.files;
    }
  }
}

describe('Notes export', () => {
  it('downloads a JSON file preserving tags and order', async () => {
    setNotes([
      { id: 'n1', text: 'First', tag: 'work', order: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'n2', text: 'Second', tag: 'personal', order: 1, createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' }
    ]);
    initNotes();

    const data = await exportNotesForTest();

    expect(data.version).toBe(1);
    expect(data.count).toBe(2);
    expect(data.exportedAt).toBeTypeOf('string');
    expect(data.notes).toHaveLength(2);
    expect(data.notes[0]).toMatchObject({ id: 'n1', text: 'First', tag: 'work', order: 0 });
    expect(data.notes[1]).toMatchObject({ id: 'n2', text: 'Second', tag: 'personal', order: 1 });
  });

  it('exports an empty list without error', async () => {
    const data = await exportNotesForTest();
    expect(data).toMatchObject({ version: 1, count: 0, notes: [] });
  });

  it('is triggered by the export button', async () => {
    setNotes([{ id: 'btn-note', text: 'From button', tag: '', order: 0 }]);
    initNotes();

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    let capturedJson = null;
    URL.createObjectURL = (blob) => {
      const reader = new FileReader();
      reader.onload = () => { capturedJson = reader.result; };
      reader.readAsText(blob);
      return 'blob:mock-url';
    };
    URL.revokeObjectURL = () => {};
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      document.getElementById('export-notes').click();
      await vi.waitFor(() => expect(capturedJson).not.toBeNull());
      const data = JSON.parse(capturedJson);
      expect(data.notes.map(n => n.id)).toEqual(['btn-note']);
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});

describe('Notes import', () => {
  it('merges new notes, skips id collisions, and preserves tags', async () => {
    setNotes([
      { id: 'existing', text: 'Keep me', tag: 'keep', order: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    ]);
    initNotes();

    const toast = await importNotesFile({
      version: 1,
      notes: [
        { id: 'existing', text: 'Should not replace', tag: 'other', order: 0 },
        { id: 'new-1', text: 'Imported A', tag: 'imported', order: 0, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
        { id: 'new-2', text: 'Imported B', tag: '', order: 5 }
      ]
    });

    const notes = getNotes();
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatchObject({ id: 'existing', text: 'Keep me', tag: 'keep' });
    const imported = notes.filter(n => n.id.startsWith('new-'));
    expect(imported.map(n => n.id)).toEqual(['new-1', 'new-2']);
    expect(imported[0].tag).toBe('imported');
    expect(imported[0].order).toBe(1);
    expect(imported[1].order).toBe(2);
    expect(toast.textContent).toContain('Imported 2 notes successfully.');
    expect(toast.classList.contains('toast-success')).toBe(true);
  });

  it('reports when every imported id already exists', async () => {
    setNotes([{ id: 'only', text: 'Existing', tag: '', order: 0 }]);
    initNotes();

    const toast = await importNotesFile({
      version: 1,
      notes: [{ id: 'only', text: 'Duplicate', tag: '', order: 0 }]
    });

    expect(getNotes()).toHaveLength(1);
    expect(getNotes()[0].text).toBe('Existing');
    expect(toast.textContent).toContain('No new notes to import.');
  });

  it('rejects invalid notes payloads', async () => {
    setNotes([{ id: 'keep', text: 'Stay', tag: '', order: 0 }]);
    initNotes();

    const toast = await importNotesFile({ version: 1, notes: 'not-an-array' });

    expect(getNotes()).toHaveLength(1);
    expect(toast.textContent).toContain('Invalid notes data.');
  });

  it('rejects malformed item shapes', () => {
    expect(validateNotesData({ notes: [] })).toBe(true);
    expect(validateNotesData(null)).toBe(false);
    expect(validateNotesData({ notes: [{ id: '', text: 'x' }] })).toBe(false);
    expect(validateNotesData({ notes: [{ id: 'a', text: 1 }] })).toBe(false);
    expect(validateNotesData({ notes: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })).toBe(false);
    expect(validateNotesData({ notes: [{ id: 'a', text: 'x', order: 'bad' }] })).toBe(false);
    expect(validateNotesData({ notes: [{ id: 'a', text: 'x', tag: 5 }] })).toBe(false);
    expect(validateNotesData({ notes: [{ id: 'a"] b', text: 'x' }] })).toBe(false);
    expect(validateNotesData({ notes: [{ id: 'a b', text: 'x' }] })).toBe(false);
  });

  it('preserves an imported empty note through focus and blur', async () => {
    setNotes([]);
    initNotes();

    await importNotesFile({
      version: 1,
      notes: [{ id: 'empty-1', text: '', tag: 'keep', order: 0 }]
    });

    expect(getNotes()).toHaveLength(1);
    const ta = document.querySelector('.note-textarea[data-id="empty-1"]');
    expect(ta).not.toBeNull();

    ta.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(getNotes()).toHaveLength(1);
    expect(getNotes()[0]).toMatchObject({ id: 'empty-1', text: '', tag: 'keep' });
  });

  it('round-trips through export and import', async () => {
    setNotes([
      { id: 'rt-1', text: 'Alpha', tag: 'a', order: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'rt-2', text: 'Beta', tag: 'b', order: 1, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }
    ]);
    initNotes();
    const exported = await exportNotesForTest();

    localStorage.clear();
    initNotes();
    expect(getNotes()).toHaveLength(0);

    await importNotesFile(exported);

    const restored = getNotes();
    expect(restored).toHaveLength(2);
    expect(restored.map(n => n.id)).toEqual(['rt-1', 'rt-2']);
    expect(restored[0]).toMatchObject({ text: 'Alpha', tag: 'a', order: 0 });
    expect(restored[1]).toMatchObject({ text: 'Beta', tag: 'b', order: 1 });
  });

  it('opens the file picker from the import button', () => {
    const fileInput = document.getElementById('notes-import-file');
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
    try {
      document.getElementById('import-notes').click();
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
    }
  });
});
