import vm from 'vm';
import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Regression suite for issue #904: settings import persists todos/notes via
// the storage bridge's setItemAsync/removeItemAsync, which never passed
// through the storage-rmw merge wrapper. The stale merge base resurrected
// imported items on the next delete. This suite loads storage-rmw.js and
// data-manager.js together so the real import path runs against the wrapper.

async function importBackup(data, mode) {
  const fileInput = document.getElementById('data-import-file');
  const descriptor = Object.getOwnPropertyDescriptor(fileInput, 'files');
  Object.defineProperty(fileInput, 'files', {
    value: [new File([JSON.stringify({ version: 1, data })], 'backup.json', { type: 'application/json' })],
    configurable: true
  });

  try {
    fileInput.dispatchEvent(new Event('change'));

    // Re-query inside the wait: showImportDialog clones/replaces the dialog
    // node when the FileReader finishes, so pre-dispatch references go stale.
    await vi.waitFor(() => {
      const dialog = document.getElementById('data-import-dialog');
      expect(dialog.classList.contains('ai-confirm-open')).toBe(true);
      return dialog;
    });
    document.getElementById(mode === 'replace' ? 'data-import-replace-btn' : 'data-import-merge-btn').click();
    // applyData waits for every pending write (including the merge-base
    // reseed chain) before it reports the outcome via the result toast.
    const toast = await vi.waitFor(() => {
      const el = document.querySelector('.toast-notification');
      expect(el).not.toBeNull();
      return el;
    });
    return { type: toast.classList.contains('toast-warning') ? 'warning' : 'success', text: toast.textContent };
  } finally {
    if (descriptor) {
      Object.defineProperty(fileInput, 'files', descriptor);
    } else {
      delete fileInput.files;
    }
    document.querySelectorAll('.toast-notification').forEach(el => el.remove());
  }
}

describe('settings import merge-base reseeding (issue #904)', () => {
  let nativeGetItem;
  let nativeSetItem;
  let nativeRemoveItem;
  let nativeSetItemAsync;
  let nativeRemoveItemAsync;

  beforeAll(() => {
    nativeGetItem = localStorage.getItem.bind(localStorage);
    nativeSetItem = localStorage.setItem.bind(localStorage);
    nativeRemoveItem = localStorage.removeItem.bind(localStorage);
    nativeSetItemAsync = localStorage.setItemAsync.bind(localStorage);
    nativeRemoveItemAsync = localStorage.removeItemAsync.bind(localStorage);
    injectScript('src/core/toast.js');
    injectScript('src/core/storage-rmw.js');
    injectScript('src/features/data-manager.js');
  });

  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('.toast-notification').forEach(el => el.remove());
  });

  afterAll(() => {
    localStorage.getItem = nativeGetItem;
    localStorage.setItem = nativeSetItem;
    localStorage.removeItem = nativeRemoveItem;
    localStorage.setItemAsync = nativeSetItemAsync;
    localStorage.removeItemAsync = nativeRemoveItemAsync;
    localStorage.clear();
    document.querySelectorAll('.toast-notification').forEach(el => el.remove());
  });

  it('keeps imported todos deleted after a real settings import without a tab reload', async () => {
    const priorTodo = { id: 'todo-prior', text: 'Prior session todo', completed: false, order: 0 };
    const importedTodo = { id: 'todo-imported', text: 'Imported todo', completed: false, order: 1 };

    // Prior session state: the todos key exists and the wrapper recorded it
    // as the merge base (a fresh tab seeds the base through a wrapped write
    // or the first wrapped read).
    localStorage.setItem('todos', JSON.stringify([priorTodo]));
    expect(JSON.parse(nativeGetItem('todos'))).toEqual([priorTodo]);

    // Settings import persists the backup's todos through setItemAsync.
    const result = await importBackup({ todos: [priorTodo, importedTodo] }, 'merge');
    expect(result.type).toBe('success');
    expect(JSON.parse(nativeGetItem('todos'))).toEqual([priorTodo, importedTodo]);

    // Delete the imported todo exactly like todo.js does after finishImport.
    localStorage.setItem('todos', JSON.stringify([priorTodo]));

    // The delete must stick for the rest of the session: without the reseed
    // the three-way merge resurrects the import-introduced todo.
    expect(JSON.parse(nativeGetItem('todos'))).toEqual([priorTodo]);

    // A second delete (empty list) must also stick.
    localStorage.setItem('todos', JSON.stringify([]));
    expect(JSON.parse(nativeGetItem('todos'))).toEqual([]);
  });

  it('reseeds the notes merge base after an import-style setItemAsync write', async () => {
    const seedNote = { id: 'note-1', text: 'Note A', tag: '', order: 0 };
    const importedNote = { id: 'note-2', text: 'Note B', tag: 'work', order: 1 };

    localStorage.setItem('notes', JSON.stringify([seedNote]));

    await localStorage.setItemAsync('notes', JSON.stringify([seedNote, importedNote]));
    expect(JSON.parse(nativeGetItem('notes'))).toEqual([seedNote, importedNote]);

    // Delete of the import-introduced note must not be resurrected.
    localStorage.setItem('notes', JSON.stringify([seedNote]));
    expect(JSON.parse(nativeGetItem('notes'))).toEqual([seedNote]);
  });

  it('reseeds the merge base after removeItemAsync so later writes cannot resurrect the removed snapshot', async () => {
    const todoA = { id: 'todo-a', text: 'A', completed: false, order: 0 };
    const todoB = { id: 'todo-b', text: 'B', completed: false, order: 1 };

    localStorage.setItem('todos', JSON.stringify([todoA]));

    // A replace-mode import clears todos the backup does not carry.
    await localStorage.removeItemAsync('todos');
    expect(nativeGetItem('todos')).toBeNull();

    // Another tab adds a new todo after the removal.
    nativeSetItem('todos', JSON.stringify([todoB]));

    // This tab writes from its stale in-memory empty list; the write must
    // win instead of merging against the pre-removal snapshot.
    localStorage.setItem('todos', JSON.stringify([]));
    expect(JSON.parse(nativeGetItem('todos'))).toEqual([]);
  });

  it('keeps a newer sync write base when a pending async settlement resolves later', async () => {
    const todoA = { id: 'todo-a', text: 'A', completed: false, order: 0 };
    const importedTodo = { id: 'todo-imported', text: 'Imported', completed: false, order: 1 };
    const todoB = { id: 'todo-b', text: 'B', completed: false, order: 1 };

    let resolveAsyncWrite;
    const persisted = new Map();
    const fakeStorage = {
      getItem(key) {
        return persisted.has(key) ? persisted.get(key) : null;
      },
      setItem(key, value) {
        persisted.set(key, String(value));
        return true;
      },
      setItemAsync(key, value) {
        // Mirror the bridge: the visible value updates immediately while the
        // persistence settles later.
        persisted.set(key, String(value));
        return new Promise(resolve => {
          resolveAsyncWrite = () => resolve(true);
        });
      },
      removeItemAsync(key) {
        persisted.delete(key);
        return Promise.resolve(true);
      }
    };
    const context = vm.createContext({ localStorage: fakeStorage, console });
    injectScript('src/core/storage-rmw.js', context);
    const storage = context.localStorage;

    // Session base established through a wrapped sync write.
    storage.setItem('todos', JSON.stringify([todoA]));

    // An import-style async write starts and stays pending.
    const pendingWrite = storage.setItemAsync('todos', JSON.stringify([todoA, importedTodo]));

    // A sync write from the pre-import in-memory snapshot settles first. The
    // merge keeps the import-introduced todo and records the caller's
    // snapshot as the new base.
    storage.setItem('todos', JSON.stringify([todoA]));
    expect(JSON.parse(persisted.get('todos'))).toEqual([todoA, importedTodo]);

    // The pending async settlement must not overwrite that newer base.
    resolveAsyncWrite();
    await pendingWrite;

    // The next write from the same pre-import snapshot must still preserve
    // the import-introduced todo instead of discarding it wholesale.
    storage.setItem('todos', JSON.stringify([todoA, todoB]));
    const merged = JSON.parse(persisted.get('todos'));
    expect(merged.map(todo => todo.id)).toEqual(expect.arrayContaining(['todo-a', 'todo-b', 'todo-imported']));
    expect(merged).toHaveLength(3);
  });

  it('propagates rejected async bridge writes and keeps storage unchanged', async () => {
    const persisted = new Map([
      ['todos', JSON.stringify([{ id: 'todo-1', text: 'Still here', completed: false, order: 0 }])]
    ]);
    const fakeStorage = {
      getItem(key) {
        return persisted.has(key) ? persisted.get(key) : null;
      },
      setItem(key, value) {
        persisted.set(key, String(value));
        return true;
      },
      setItemAsync() {
        return Promise.reject(new Error('bridge write failed'));
      },
      removeItemAsync(key) {
        persisted.delete(key);
        return Promise.resolve(true);
      }
    };
    const context = vm.createContext({ localStorage: fakeStorage, console });

    injectScript('src/core/storage-rmw.js', context);

    await expect(context.localStorage.setItemAsync('todos', '[]')).rejects.toThrow('bridge write failed');
    expect(persisted.get('todos')).toBe(JSON.stringify([{ id: 'todo-1', text: 'Still here', completed: false, order: 0 }]));

    // The base was reseeded from the still-persisted value, so a normal
    // delete through the wrapper keeps working after the rejected write.
    context.localStorage.getItem('todos');
    context.localStorage.setItem('todos', '[]');
    expect(persisted.get('todos')).toBe('[]');
  });

  it('leaves non-target async writes delegated to the bridge unchanged', async () => {
    await localStorage.setItemAsync('theme', 'dark');
    expect(nativeGetItem('theme')).toBe('dark');

    await localStorage.removeItemAsync('theme');
    expect(nativeGetItem('theme')).toBeNull();
  });
});
