import { beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/ai-store.js');
});

beforeEach(() => {
  localStorage.clear();
  AIStore.state.conversations = [];
  AIStore.state.currentConversationId = null;
});

describe('AIStore conversation recovery (#458)', () => {
  it('persists a canonical conversation after malformed JSON', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(AIStore.STORAGE_KEYS.conversations, '{invalid');

    AIStore.loadConversations();

    expect(AIStore.state.conversations).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(AIStore.STORAGE_KEYS.conversations))).toEqual(
      AIStore.state.conversations
    );
    expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe(
      AIStore.state.currentConversationId
    );
    consoleWarn.mockRestore();
  });

  it.each([
    ['a non-array value', { id: 'conv-1' }],
    ['a conversation without a title', [{
      id: 'conv-1',
      messages: [],
      createdAt: 1,
      updatedAt: 1
    }]],
    ['a conversation without messages', [{
      id: 'conv-1',
      title: 'Topic',
      createdAt: 1,
      updatedAt: 1
    }]],
    ['a conversation with a malformed message', [{
      id: 'conv-1',
      title: 'Topic',
      messages: [{ role: 'user' }],
      createdAt: 1,
      updatedAt: 1
    }]]
  ])('repairs and persists %s', (_, storedValue) => {
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(storedValue)
    );

    AIStore.loadConversations();

    const persisted = JSON.parse(
      localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
    );
    expect(persisted).toEqual(AIStore.state.conversations);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      messages: [],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number)
    });
    expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe(
      persisted[0].id
    );
  });

  it('keeps valid stored conversations, assigns ids to messages, and selects the saved current ID', () => {
    const conversations = [{
      id: 'conv-1',
      title: 'First topic',
      messages: [{ role: 'user', content: 'Hello' }],
      createdAt: 1,
      updatedAt: 2
    }, {
      id: 'conv-2',
      title: 'Second topic',
      messages: [],
      createdAt: 3,
      updatedAt: 4
    }];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(conversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-2');

    AIStore.loadConversations();

    expect(AIStore.state.conversations[0].id).toBe('conv-1');
    expect(AIStore.state.conversations[0].messages[0].role).toBe('user');
    expect(typeof AIStore.state.conversations[0].messages[0].id).toBe('string');
    expect(AIStore.state.conversations[0].messages[0].id.length).toBeGreaterThan(0);
    expect(AIStore.state.currentConversationId).toBe('conv-2');
  });
});
