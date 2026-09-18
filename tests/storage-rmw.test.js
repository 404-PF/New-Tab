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
});


describe('rejected storage bridge writes', () => {
  it('keeps the original base when a concurrent merge is rejected', () => {
    const base = [{
      id: 'todo-1',
      text: 'Task A',
      completed: false,
      order: 0
    }];
    const external = [
      {
        ...base[0],
        completed: true
      },
      {
        id: 'todo-2',
        text: 'Task B',
        completed: false,
        order: 1
      }
    ];
    const staleCandidate = [
      {
        ...base[0],
        text: 'Task A edited'
      },
      {
        id: 'todo-3',
        text: 'Task C',
        completed: false,
        order: 1
      }
    ];

    const persisted = new Map([
      ['todos', JSON.stringify(base)]
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
    context.localStorage.getItem('todos');

    // Another tab writes after this tab's snapshot was loaded.
    persisted.set('todos', JSON.stringify(external));

    // The concurrent merge is rejected. The original base must remain the
    // reference point for the next retry from the same stale snapshot.
    context.localStorage.setItem('todos', JSON.stringify(staleCandidate));
    expect(JSON.parse(persisted.get('todos'))).toEqual(external);

    context.localStorage.setItem('todos', JSON.stringify(staleCandidate));
    const merged = JSON.parse(persisted.get('todos'));

    expect(merged.map(todo => todo.id)).toEqual(expect.arrayContaining(['todo-1', 'todo-2', 'todo-3']));
    expect(merged.find(todo => todo.id === 'todo-1').text).toBe('Task A edited');
    expect(merged.find(todo => todo.id === 'todo-1').completed).toBe(true);
  });
});
