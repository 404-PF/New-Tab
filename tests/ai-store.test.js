import { beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/conversation-validator.js');
  injectScript('src/ai/ai-store.js');
});

beforeEach(() => {
  localStorage.clear();
  AIStore.state.conversations = [];
  AIStore.state.currentConversationId = null;
});

describe('AIStore conversation identifiers', () => {
  it('uses the platform CSPRNG for the unique suffix', () => {
    const getRandomValues = vi.fn(values => {
      values[0] = 35;
      values[1] = 36;
      return values;
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.stubGlobal('crypto', { getRandomValues });

    try {
      expect(AIStore.generateId()).toBe('conv_123_z10');
      expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint32Array));
    } finally {
      now.mockRestore();
      vi.unstubAllGlobals();
    }
  });
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

  it('preserves conversations when the validator is unavailable', () => {
    const storedConversations = [{
      id: 'conv-stored',
      title: 'Stored topic',
      messages: [],
      createdAt: 1,
      updatedAt: 2
    }];
    const existingConversation = {
      id: 'conv-existing',
      title: 'Existing topic',
      messages: [],
      createdAt: 3,
      updatedAt: 4
    };

    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(storedConversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-stored');
    AIStore.state.conversations = [existingConversation];
    AIStore.state.currentConversationId = existingConversation.id;

    const validator = window.isValidConversation;
    try {
      delete window.isValidConversation;
      AIStore.loadConversations();

      expect(AIStore.state.conversations).toEqual([existingConversation]);
      expect(AIStore.state.currentConversationId).toBe(existingConversation.id);
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.conversations))
        .toBe(JSON.stringify(storedConversations));
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-stored');
    } finally {
      window.isValidConversation = validator;
    }
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

describe('AIStore conversation cap (#586)', () => {
  function buildConversations(count) {
    // Newest conversations live at the front, mirroring createNewChat's unshift.
    return Array.from({ length: count }, (_, index) => ({
      id: `conv-${index}`,
      title: `Conversation ${index}`,
      messages: [],
      createdAt: index,
      updatedAt: index
    }));
  }

  it('keeps the newest MAX conversations when the active conversation is among them', async () => {
    AIStore.state.conversations = buildConversations(AIStore.MAX_CONVERSATIONS + 5);
    AIStore.state.currentConversationId = 'conv-0';

    await AIStore.saveConversations();

    expect(AIStore.state.conversations).toHaveLength(AIStore.MAX_CONVERSATIONS);
    expect(AIStore.state.conversations[0].id).toBe('conv-0');
    expect(AIStore.state.conversations[AIStore.MAX_CONVERSATIONS - 1].id)
      .toBe(`conv-${AIStore.MAX_CONVERSATIONS - 1}`);
    expect(AIStore.state.currentConversationId).toBe('conv-0');
  });

  it('never drops the active conversation when it falls outside the newest window', async () => {
    const activeId = `conv-${AIStore.MAX_CONVERSATIONS + 2}`;
    AIStore.state.conversations = buildConversations(AIStore.MAX_CONVERSATIONS + 5);
    AIStore.state.currentConversationId = activeId;

    await AIStore.saveConversations();

    expect(AIStore.state.conversations).toHaveLength(AIStore.MAX_CONVERSATIONS);
    expect(AIStore.state.conversations.some(c => c.id === activeId)).toBe(true);
    expect(AIStore.state.currentConversationId).toBe(activeId);

    const persisted = JSON.parse(
      localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
    );
    expect(persisted.some(c => c.id === activeId)).toBe(true);
    expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe(activeId);
  });

  it('evicts the oldest survivor when swapping the active conversation in', async () => {
    AIStore.state.conversations = buildConversations(AIStore.MAX_CONVERSATIONS + 5);
    AIStore.state.currentConversationId = `conv-${AIStore.MAX_CONVERSATIONS + 2}`;

    await AIStore.saveConversations();

    const ids = AIStore.state.conversations.map(c => c.id);
    expect(ids).not.toContain(`conv-${AIStore.MAX_CONVERSATIONS - 1}`);
    expect(ids).toContain(`conv-${AIStore.MAX_CONVERSATIONS + 2}`);
  });

  it('keeps the active conversation in storage across repeated saves', async () => {
    const activeId = `conv-${AIStore.MAX_CONVERSATIONS + 2}`;
    AIStore.state.conversations = buildConversations(AIStore.MAX_CONVERSATIONS + 5);
    AIStore.state.currentConversationId = activeId;

    await AIStore.saveConversations();
    await AIStore.saveConversations();

    expect(AIStore.state.conversations).toHaveLength(AIStore.MAX_CONVERSATIONS);
    expect(AIStore.state.conversations.some(c => c.id === activeId)).toBe(true);
    expect(AIStore.state.currentConversationId).toBe(activeId);
  });

  it('falls back to the newest survivor when the current id no longer resolves', async () => {
    AIStore.state.conversations = buildConversations(AIStore.MAX_CONVERSATIONS + 5);
    AIStore.state.currentConversationId = 'does-not-exist';

    await AIStore.saveConversations();

    expect(AIStore.state.conversations).toHaveLength(AIStore.MAX_CONVERSATIONS);
    expect(AIStore.state.currentConversationId).toBe('conv-0');
    expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-0');
  });

  it('resets an unresolved current id even when under the cap', async () => {
    AIStore.state.conversations = buildConversations(AIStore.MAX_CONVERSATIONS);
    AIStore.state.currentConversationId = 'does-not-exist';

    await AIStore.saveConversations();

    expect(AIStore.state.conversations).toHaveLength(AIStore.MAX_CONVERSATIONS);
    expect(AIStore.state.currentConversationId).toBe('conv-0');
    expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-0');
  });
});

describe('AIStore persistence atomicity (#716)', () => {
  it('rolls back storage and in-memory normalization on a bridge-reported second-write failure', async () => {
    const previousConversations = Array.from(
      { length: AIStore.MAX_CONVERSATIONS + 5 },
      (_, index) => ({
        id: `conv-${index}`,
        title: `Conversation ${index}`,
        messages: [],
        createdAt: index,
        updatedAt: index
      })
    );
    const previousCurrentConversationId = `conv-${AIStore.MAX_CONVERSATIONS + 2}`;

    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(previousConversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, previousCurrentConversationId);
    AIStore.state.conversations = previousConversations;
    AIStore.state.currentConversationId = previousCurrentConversationId;

    const previousState = AIStore.createSaveSnapshot();
    const originalSetItemAsync = localStorage.setItemAsync;
    let setItemCalls = 0;

    localStorage.setItemAsync = vi.fn((key, value) => {
      setItemCalls += 1;

      if (setItemCalls === 2) {
        window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
          detail: {
            key,
            message: 'QUOTA_BYTES quota exceeded',
            operation: 'set',
            value
          }
        }));
        return Promise.resolve(false);
      }

      localStorage.setItem(key, value);
      return Promise.resolve(true);
    });

    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;

    try {
      expect(await AIStore.saveConversations(previousState)).toBe(false);

      expect(AIStore.state.conversations).toEqual(previousConversations);
      expect(AIStore.state.conversations).toHaveLength(AIStore.MAX_CONVERSATIONS + 5);
      expect(AIStore.state.currentConversationId).toBe(previousCurrentConversationId);
      expect(JSON.parse(
        localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
      )).toEqual(previousConversations);
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe(
        previousCurrentConversationId
      );
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save conversations. Your last action was not saved.',
        'error'
      );
      expect(localStorage.setItemAsync).toHaveBeenCalledTimes(3);
    } finally {
      if (typeof originalSetItemAsync === 'undefined') {
        delete localStorage.setItemAsync;
      } else {
        localStorage.setItemAsync = originalSetItemAsync;
      }
      if (typeof originalShowToast === 'undefined') {
        delete window.showToast;
      } else {
        window.showToast = originalShowToast;
      }
    }
  });
});
