import vm from 'vm';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

describe('cross-tab storage read-modify-write merging', () => {
  let nativeGetItem;
  let nativeSetItem;
  let nativeRemoveItem;

  beforeAll(() => {
    nativeGetItem = localStorage.getItem.bind(localStorage);
    nativeSetItem = localStorage.setItem.bind(localStorage);
    nativeRemoveItem = localStorage.removeItem.bind(localStorage);
    injectScript('src/core/storage-rmw.js');
  });

  afterAll(() => {
    nativeRemoveItem('todos');
    nativeRemoveItem('notes');
    nativeRemoveItem('ai_conversations');
    localStorage.getItem = nativeGetItem;
    localStorage.setItem = nativeSetItem;
    localStorage.removeItem = nativeRemoveItem;
  });

  it('preserves independent todo, note, and AI conversation edits from a stale snapshot', () => {
    const baseTodo = {
      id: 'todo-1',
      text: 'Task A',
      completed: false,
      order: 0
    };

    localStorage.setItem('todos', JSON.stringify([baseTodo]));

    // Simulate another tab writing a newer snapshot after this tab loaded.
    nativeSetItem('todos', JSON.stringify([
      {
        ...baseTodo,
        completed: true
      },
      {
        id: 'todo-2',
        text: 'Task B',
        completed: false,
        order: 1
      }
    ]));

    // This write is based on the stale base: it edits todo-1 and adds todo-3.
    localStorage.setItem('todos', JSON.stringify([
      {
        ...baseTodo,
        text: 'Task A edited'
      },
      {
        id: 'todo-3',
        text: 'Task C',
        completed: false,
        order: 1
      }
    ]));

    const mergedTodos = JSON.parse(nativeGetItem('todos'));
    const mergedTodo = mergedTodos.find(todo => todo.id === 'todo-1');
    expect(mergedTodos.map(todo => todo.id)).toEqual(expect.arrayContaining(['todo-1', 'todo-2', 'todo-3']));
    expect(mergedTodo.text).toBe('Task A edited');
    expect(mergedTodo.completed).toBe(true);

    // A second write from the same stale in-memory snapshot must reconcile
    // against the original base rather than dropping todo-2.
    localStorage.setItem('todos', JSON.stringify([
      {
        ...baseTodo,
        text: 'Task A edited twice'
      },
      {
        id: 'todo-3',
        text: 'Task C',
        completed: false,
        order: 1
      }
    ]));
    const mergedTodosAgain = JSON.parse(nativeGetItem('todos'));
    expect(mergedTodosAgain.map(todo => todo.id)).toEqual(expect.arrayContaining(['todo-1', 'todo-2', 'todo-3']));
    expect(mergedTodosAgain.find(todo => todo.id === 'todo-1').text).toBe('Task A edited twice');
    expect(mergedTodosAgain.find(todo => todo.id === 'todo-1').completed).toBe(true);

    const baseNote = {
      id: 'note-1',
      text: 'Note A',
      tag: '',
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    localStorage.setItem('notes', JSON.stringify([baseNote]));
    nativeSetItem('notes', JSON.stringify([
      baseNote,
      {
        id: 'note-2',
        text: 'Note B',
        tag: 'work',
        order: 1,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z'
      }
    ]));
    localStorage.setItem('notes', JSON.stringify([{
      ...baseNote,
      tag: 'personal'
    }]));

    const mergedNotes = JSON.parse(nativeGetItem('notes'));
    expect(mergedNotes.map(note => note.id)).toEqual(expect.arrayContaining(['note-1', 'note-2']));
    expect(mergedNotes.find(note => note.id === 'note-1').tag).toBe('personal');

    const baseConversation = {
      id: 'conversation-1',
      title: 'Chat',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    localStorage.setItem('ai_conversations', JSON.stringify([baseConversation]));
    nativeSetItem('ai_conversations', JSON.stringify([{
      ...baseConversation,
      messages: [
        { id: 'message-from-b', role: 'user', content: 'Hello' },
        { id: 'message-2', role: 'assistant', content: 'Hi from tab B' }
      ],
      updatedAt: 2
    }]));
    localStorage.setItem('ai_conversations', JSON.stringify([{
      ...baseConversation,
      messages: [
        { id: 'message-from-a', role: 'user', content: 'Hello' },
        { id: 'message-3', role: 'user', content: 'Follow-up from tab A' }
      ],
      updatedAt: 3
    }]));

    const mergedConversations = JSON.parse(nativeGetItem('ai_conversations'));
    const mergedConversation = mergedConversations[0];
    expect(mergedConversation.messages).toHaveLength(3);
    expect(mergedConversation.messages.filter(message => message.content === 'Hello')).toHaveLength(1);
    expect(mergedConversation.messages.map(message => message.id)).toEqual(
      expect.arrayContaining(['message-from-a', 'message-2', 'message-3'])
    );
  });

  it('preserves later external field edits after a concurrent merge', () => {
    const baseNote = {
      id: 'note-merge-base',
      text: 'Note A',
      tag: 'original',
      order: 0
    };
    const externalNote = {
      id: 'note-from-b',
      text: 'Note B',
      tag: 'work',
      order: 1
    };

    nativeRemoveItem('notes');
    localStorage.setItem('notes', JSON.stringify([baseNote]));

    // Tab B changes the tag and adds a note after tab A loaded its base.
    nativeSetItem('notes', JSON.stringify([
      {
        ...baseNote,
        tag: 'external-1'
      },
      externalNote
    ]));

    // Tab A writes from its stale snapshot, changing only the text.
    const firstCandidate = [{
      ...baseNote,
      text: 'local edit 1'
    }];
    localStorage.setItem('notes', JSON.stringify(firstCandidate));

    const firstMerge = JSON.parse(nativeGetItem('notes'));
    expect(firstMerge.find(note => note.id === 'note-merge-base')).toMatchObject({
      text: 'local edit 1',
      tag: 'external-1'
    });
    expect(firstMerge.map(note => note.id)).toEqual(
      expect.arrayContaining(['note-merge-base', 'note-from-b'])
    );

    // Tab B edits the same field again after the first merge.
    nativeSetItem('notes', JSON.stringify([
      {
        ...baseNote,
        tag: 'external-2'
      },
      externalNote
    ]));

    // Tab A still writes from its original stale snapshot, updating text only.
    localStorage.setItem('notes', JSON.stringify([
      {
        ...baseNote,
        text: 'local edit 2'
      }
    ]));

    const secondMerge = JSON.parse(nativeGetItem('notes'));
    const mergedNote = secondMerge.find(note => note.id === 'note-merge-base');
    expect(mergedNote.text).toBe('local edit 2');
    expect(mergedNote.tag).toBe('external-2');
    expect(secondMerge.map(note => note.id)).toEqual(
      expect.arrayContaining(['note-merge-base', 'note-from-b'])
    );
  });
});


describe('null merge base for keys absent at session start', () => {
  function createStorageContext(initialValues = {}) {
    const persisted = new Map(Object.entries(initialValues));
    const fakeStorage = {
      getItem(key) {
        return persisted.has(key) ? persisted.get(key) : null;
      },
      setItem(key, value) {
        persisted.set(key, String(value));
        return true;
      }
    };
    const context = vm.createContext({ localStorage: fakeStorage, console });
    injectScript('src/core/storage-rmw.js', context);
    return { context, persisted };
  }

  it('preserves a concurrent todo written by another tab when the local base was null', () => {
    const { context, persisted } = createStorageContext();

    // Session start: the key is absent, so the merge base seeds as null.
    expect(context.localStorage.getItem('todos')).toBe(null);

    // Another tab writes first.
    const externalTodo = { id: 'todo-external', text: 'From tab B', completed: false, order: 0 };
    persisted.set('todos', JSON.stringify([externalTodo]));

    // This tab then adds a different todo from its own in-memory snapshot.
    const localTodo = { id: 'todo-local', text: 'From tab A', completed: false, order: 0 };
    context.localStorage.setItem('todos', JSON.stringify([localTodo]));

    const merged = JSON.parse(persisted.get('todos'));
    expect(merged.map(todo => todo.id)).toEqual(expect.arrayContaining(['todo-external', 'todo-local']));
  });

  it('preserves concurrent notes and AI conversations when the base was null', () => {
    const { context, persisted } = createStorageContext();
    expect(context.localStorage.getItem('notes')).toBe(null);
    expect(context.localStorage.getItem('ai_conversations')).toBe(null);

    const externalNote = { id: 'note-external', text: 'Note B', tag: 'work', order: 0 };
    const localNote = { id: 'note-local', text: 'Note A', tag: '', order: 0 };
    persisted.set('notes', JSON.stringify([externalNote]));
    context.localStorage.setItem('notes', JSON.stringify([localNote]));

    const mergedNotes = JSON.parse(persisted.get('notes'));
    expect(mergedNotes.map(note => note.id)).toEqual(expect.arrayContaining(['note-external', 'note-local']));

    const externalConversation = {
      id: 'conversation-external',
      title: 'Chat B',
      messages: [{ id: 'message-1', role: 'user', content: 'Hi' }],
      createdAt: 1,
      updatedAt: 1
    };
    const localConversation = {
      id: 'conversation-local',
      title: 'Chat A',
      messages: [{ id: 'message-2', role: 'user', content: 'Hello' }],
      createdAt: 2,
      updatedAt: 2
    };
    persisted.set('ai_conversations', JSON.stringify([externalConversation]));
    context.localStorage.setItem('ai_conversations', JSON.stringify([localConversation]));

    const mergedConversations = JSON.parse(persisted.get('ai_conversations'));
    expect(mergedConversations.map(conversation => conversation.id)).toEqual(
      expect.arrayContaining(['conversation-external', 'conversation-local'])
    );
  });

  it('stores the candidate verbatim on the first write into an absent key', () => {
    const { context, persisted } = createStorageContext();
    expect(context.localStorage.getItem('todos')).toBe(null);

    const firstTodo = { id: 'todo-first', text: 'First write', completed: false, order: 0 };
    context.localStorage.setItem('todos', JSON.stringify([firstTodo]));

    expect(JSON.parse(persisted.get('todos'))).toEqual([firstTodo]);
  });

  it('merges concurrent items after a rejected first write kept the base null', () => {
    const persisted = new Map();
    let rejectNextWrite = true;
    const fakeStorage = {
      getItem(key) {
        return persisted.has(key) ? persisted.get(key) : null;
      },
      setItem(key, value) {
        if (rejectNextWrite) {
          rejectNextWrite = false;
          return false;
        }
        persisted.set(key, String(value));
        return true;
      }
    };
    const context = vm.createContext({ localStorage: fakeStorage, console });
    injectScript('src/core/storage-rmw.js', context);
    expect(context.localStorage.getItem('todos')).toBe(null);

    const externalTodo = { id: 'todo-external', text: 'From tab B', completed: false, order: 0 };
    const localTodo = { id: 'todo-local', text: 'From tab A', completed: false, order: 0 };

    // The rejected write leaves the null base untouched.
    expect(context.localStorage.setItem('todos', JSON.stringify([localTodo]))).toBe(false);
    persisted.set('todos', JSON.stringify([externalTodo]));

    // The retry still holds a null base and must preserve the concurrent item.
    expect(context.localStorage.setItem('todos', JSON.stringify([localTodo]))).toBe(true);
    const merged = JSON.parse(persisted.get('todos'));
    expect(merged.map(todo => todo.id)).toEqual(expect.arrayContaining(['todo-external', 'todo-local']));
  });
});


describe('rejected storage bridge writes', () => {
  it('keeps the original base when a non-concurrent write is rejected', () => {
    const base = [{
      id: 'note-1',
      text: 'Note A',
      tag: 'original',
      order: 0
    }];
    const firstCandidate = [{
      ...base[0],
      tag: 'failed-local-edit'
    }];
    const retryCandidate = [{
      ...base[0],
      tag: 'original'
    }];
    const external = [{
      ...base[0],
      tag: 'external-edit'
    }];

    const persisted = new Map([
      ['notes', JSON.stringify(base)]
    ]);
    let rejectNextWrite = true;
    const fakeStorage = {
      getItem(key) {
        return persisted.has(key) ? persisted.get(key) : null;
      },
      setItem(key, value) {
        if (rejectNextWrite) {
          rejectNextWrite = false;
          return false;
        }
        persisted.set(key, String(value));
        return true;
      }
    };
    const context = vm.createContext({ localStorage: fakeStorage, console });

    injectScript('src/core/storage-rmw.js', context);
    context.localStorage.getItem('notes');

    // This local write is rejected, so the stored value remains the original base.
    context.localStorage.setItem('notes', JSON.stringify(firstCandidate));
    expect(JSON.parse(persisted.get('notes'))).toEqual(base);

    // Another tab then changes the same field from the original base.
    persisted.set('notes', JSON.stringify(external));

    // The stale tab changes that field back to its original value and succeeds.
    // With the original base retained, the external edit is recognized as the
    // independent change and survives the retry.
    context.localStorage.setItem('notes', JSON.stringify(retryCandidate));
    const merged = JSON.parse(persisted.get('notes'));

    expect(merged[0].tag).toBe('external-edit');
  });

  it('returns the bridge result for target keys so callers see rejected writes', () => {
    const persisted = new Map([
      ['todos', '[]'],
      ['notes', '[]'],
      ['ai_conversations', '[]']
    ]);
    let rejectWrites = false;
    const fakeStorage = {
      getItem(key) {
        return persisted.has(key) ? persisted.get(key) : null;
      },
      setItem(key, value) {
        if (rejectWrites) return false;
        persisted.set(key, String(value));
        return true;
      }
    };
    const context = vm.createContext({ localStorage: fakeStorage, console });
    injectScript('src/core/storage-rmw.js', context);
    context.localStorage.getItem('todos');
    context.localStorage.getItem('notes');
    context.localStorage.getItem('ai_conversations');

    rejectWrites = true;
    expect(context.localStorage.setItem('todos', JSON.stringify([{ id: 'todo-1' }]))).toBe(false);
    expect(context.localStorage.setItem('notes', JSON.stringify([{ id: 'note-1' }]))).toBe(false);
    expect(persisted.get('todos')).toBe('[]');
    expect(context.localStorage.setItem('ai_conversations', JSON.stringify([{ id: 'conv-1' }]))).toBe(false);
    expect(persisted.get('notes')).toBe('[]');
    expect(persisted.get('ai_conversations')).toBe('[]');

    rejectWrites = false;
    expect(context.localStorage.setItem('todos', JSON.stringify([{ id: 'todo-1' }]))).toBe(true);
    expect(persisted.get('todos')).toBe(JSON.stringify([{ id: 'todo-1' }]));
    expect(context.localStorage.setItem('ai_conversations', JSON.stringify([{ id: 'conv-1' }]))).toBe(true);
    expect(persisted.get('ai_conversations')).toBe(JSON.stringify([{ id: 'conv-1' }]));
  });
});
