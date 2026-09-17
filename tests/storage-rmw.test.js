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
        { id: 'message-1', role: 'user', content: 'Hello' }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    localStorage.setItem('ai_conversations', JSON.stringify([baseConversation]));
    nativeSetItem('ai_conversations', JSON.stringify([{
      ...baseConversation,
      messages: [
        ...baseConversation.messages,
        { id: 'message-2', role: 'assistant', content: 'Hi from tab B' }
      ],
      updatedAt: 2
    }]));
    localStorage.setItem('ai_conversations', JSON.stringify([{
      ...baseConversation,
      messages: [
        ...baseConversation.messages,
        { id: 'message-3', role: 'user', content: 'Follow-up from tab A' }
      ],
      updatedAt: 3
    }]));

    const mergedConversations = JSON.parse(nativeGetItem('ai_conversations'));
    const mergedConversation = mergedConversations[0];
    expect(mergedConversation.messages.map(message => message.id)).toEqual(
      expect.arrayContaining(['message-1', 'message-2', 'message-3'])
    );
  });
});
