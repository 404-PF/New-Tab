import { readFileSync } from 'fs';
import path from 'path';
import { beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, failStorageWritesOver } from './helpers/storage-write-failures.js';

const UTF8_ENCODER = new TextEncoder();
const utf8Length = (text) => UTF8_ENCODER.encode(text).length;

beforeAll(() => {
  injectScript('src/ai/conversation-validator.js');
  injectScript('src/ai/ai-store.js');
});

beforeEach(() => {
  localStorage.clear();
  AIStore.state.conversations = [];
  AIStore.state.currentConversationId = null;
  AIStore.state.inFlightConversationId = null;
  AIStore.state.isStreaming = false;
  AIStore.state.isLoading = false;
  AIStore.state.abortController = null;
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

    const validatorDescriptor = Object.getOwnPropertyDescriptor(window, 'isValidConversation');
    try {
      Object.defineProperty(window, 'isValidConversation', {
        ...validatorDescriptor,
        value: undefined
      });
      AIStore.loadConversations();

      expect(AIStore.state.conversations).toEqual([existingConversation]);
      expect(AIStore.state.currentConversationId).toBe(existingConversation.id);
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.conversations))
        .toBe(JSON.stringify(storedConversations));
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-stored');
    } finally {
      Object.defineProperty(window, 'isValidConversation', validatorDescriptor);
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

describe('AIStore fail-soft conversation recovery (#949)', () => {
  const RECOVERY_MESSAGE =
    'Some saved conversations could not be loaded. A backup copy of the rejected data was kept.';

  function quarantineKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.indexOf(AIStore.QUARANTINE_KEY_PREFIX) === 0) {
        keys.push(key);
      }
    }
    return keys.sort();
  }

  function stubShowToast() {
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;
    return {
      showToast,
      restore() {
        if (typeof originalShowToast === 'undefined') {
          delete window.showToast;
        } else {
          window.showToast = originalShowToast;
        }
      }
    };
  }

  it('keeps every valid conversation when a single stored record is invalid', async () => {
    const validFirst = {
      id: 'conv-a',
      title: 'First topic',
      messages: [{ role: 'user', content: 'Hello' }],
      createdAt: 1,
      updatedAt: 2
    };
    const validSecond = {
      id: 'conv-b',
      title: 'Second topic',
      messages: [],
      createdAt: 3,
      updatedAt: 4
    };
    // Whitespace-only title fails the non-empty trimmed-title check (#949).
    const rejected = {
      id: 'conv-c',
      title: ' ',
      messages: [],
      createdAt: 5,
      updatedAt: 6
    };
    const storedPayload = [validFirst, rejected, validSecond];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(storedPayload)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-b');
    const toast = stubShowToast();

    try {
      await AIStore.loadConversations();

      expect(AIStore.state.conversations.map(conversation => conversation.id))
        .toEqual(['conv-a', 'conv-b']);
      expect(AIStore.state.currentConversationId).toBe('conv-b');
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-b');

      const persisted = JSON.parse(
        localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
      );
      expect(persisted.map(conversation => conversation.id))
        .toEqual(['conv-a', 'conv-b']);

      const keys = quarantineKeys();
      expect(keys).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem(keys[0]))).toEqual(storedPayload);

      expect(toast.showToast).toHaveBeenCalledWith(RECOVERY_MESSAGE, 'error');
    } finally {
      toast.restore();
    }
  });

  it('quarantines the rejected payload and starts fresh when nothing valid survives', async () => {
    const storedPayload = [{
      id: 'conv-1',
      title: 'Topic',
      createdAt: 1,
      updatedAt: 1
    }];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(storedPayload)
    );
    const toast = stubShowToast();

    try {
      await AIStore.loadConversations();

      expect(AIStore.state.conversations).toHaveLength(1);
      expect(AIStore.state.conversations[0].messages).toEqual([]);
      expect(JSON.parse(
        localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
      )).toEqual(AIStore.state.conversations);

      const keys = quarantineKeys();
      expect(keys).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem(keys[0]))).toEqual(storedPayload);
      expect(toast.showToast).toHaveBeenCalledWith(RECOVERY_MESSAGE, 'error');
    } finally {
      toast.restore();
    }
  });

  it('quarantines the raw payload when the stored JSON cannot be parsed', () => {
    localStorage.setItem(AIStore.STORAGE_KEYS.conversations, '{invalid');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const toast = stubShowToast();

    try {
      AIStore.loadConversations();

      const keys = quarantineKeys();
      expect(keys).toHaveLength(1);
      expect(localStorage.getItem(keys[0])).toBe('{invalid');
      expect(toast.showToast).toHaveBeenCalledWith(RECOVERY_MESSAGE, 'error');
      expect(AIStore.state.conversations).toHaveLength(1);
    } finally {
      toast.restore();
      consoleWarn.mockRestore();
    }
  });

  it('neither quarantines nor notifies when a fresh load finds nothing stored', () => {
    const toast = stubShowToast();

    try {
      AIStore.loadConversations();

      expect(quarantineKeys()).toHaveLength(0);
      expect(toast.showToast).not.toHaveBeenCalled();
      expect(AIStore.state.conversations).toHaveLength(1);
    } finally {
      toast.restore();
    }
  });

  it('caps the retained quarantine copies at MAX_QUARANTINE_KEYS', async () => {
    const seeded = [];
    for (let index = 0; index < AIStore.MAX_QUARANTINE_KEYS + 2; index += 1) {
      const key = AIStore.QUARANTINE_KEY_PREFIX + (1000000000000 + index);
      seeded.push(key);
      localStorage.setItem(key, 'stale-' + index);
    }
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify([{ id: 'conv-1', title: ' ', messages: [], createdAt: 1, updatedAt: 1 }])
    );

    await AIStore.loadConversations();
    await new Promise(resolve => setTimeout(resolve, 0));

    const keys = quarantineKeys();
    expect(keys).toHaveLength(AIStore.MAX_QUARANTINE_KEYS);
    // The oldest copies are dropped first; the newest seeded ones and the
    // copy written by this load survive.
    expect(keys).not.toContain(seeded[0]);
    expect(keys).not.toContain(seeded[1]);
    expect(keys).not.toContain(seeded[2]);
    expect(localStorage.getItem(seeded[0])).toBeNull();
    expect(localStorage.getItem(seeded[AIStore.MAX_QUARANTINE_KEYS + 1])).not.toBeNull();

    const freshKeys = keys.filter(key => seeded.indexOf(key) === -1);
    expect(freshKeys).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(freshKeys[0]))).toEqual([{
      id: 'conv-1',
      title: ' ',
      messages: [],
      createdAt: 1,
      updatedAt: 1
    }]);
  });
});

describe('AIStore stale streaming flag recovery (#865)', () => {
  it('clears a persisted isStreaming flag in state and in storage on load', async () => {
    const conversations = [{
      id: 'conv-stream',
      title: 'Interrupted answer',
      messages: [
        { id: 'm-user', role: 'user', content: 'Write a long answer', timestamp: 1 },
        { id: 'm-assistant', role: 'assistant', content: 'Partial answer', timestamp: 2, isStreaming: true }
      ],
      createdAt: 1,
      updatedAt: 2
    }];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(conversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-stream');

    // Await the healing write so the assertions below observe the settled
    // bridge state, not the optimistic cache write.
    await AIStore.loadConversations();

    const loadedMessage = AIStore.state.conversations[0].messages[1];
    expect(loadedMessage.role).toBe('assistant');
    expect(loadedMessage.content).toBe('Partial answer');
    expect(loadedMessage.isStreaming).toBe(false);

    const persisted = JSON.parse(
      localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
    );
    expect(persisted[0].messages[1].isStreaming).toBe(false);
    expect(persisted[0].messages[1].content).toBe('Partial answer');
    expect(persisted).toEqual(AIStore.state.conversations);

    const stored = await chrome.storage.local.get(AIStore.STORAGE_KEYS.conversations);
    expect(JSON.parse(stored[AIStore.STORAGE_KEYS.conversations])[0].messages[1])
      .toMatchObject({ content: 'Partial answer', isStreaming: false });
  });

  it('leaves messages without a stale flag untouched', () => {
    const conversations = [{
      id: 'conv-plain',
      title: 'Normal topic',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there', timestamp: 2 }
      ],
      createdAt: 1,
      updatedAt: 2
    }];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(conversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-plain');
    const storedBefore = localStorage.getItem(AIStore.STORAGE_KEYS.conversations);

    AIStore.loadConversations();

    expect(AIStore.state.conversations[0].messages[1].isStreaming).toBeUndefined();
    expect(localStorage.getItem(AIStore.STORAGE_KEYS.conversations)).toBe(storedBefore);
  });

  it('keeps the cleared flag in memory when the healing save fails', async () => {
    const conversations = [{
      id: 'conv-stream',
      title: 'Interrupted answer',
      messages: [
        { id: 'm-user', role: 'user', content: 'Write a long answer', timestamp: 1 },
        { id: 'm-assistant', role: 'assistant', content: 'Partial answer', timestamp: 2, isStreaming: true }
      ],
      createdAt: 1,
      updatedAt: 2
    }];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(conversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-stream');

    const restoreStorageSet = failStorageWritesFor(AIStore.STORAGE_KEYS.conversations, 'async');
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(await AIStore.loadConversations()).toBe(false);

      // The failed write rolls storage back to the stale snapshot, but the
      // runtime state must stay normalized so the UI never shows a stuck
      // streaming bubble (#865).
      expect(AIStore.state.conversations[0].messages[1].isStreaming).toBe(false);
      expect(JSON.parse(
        localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
      )[0].messages[1].isStreaming).toBe(true);
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save conversations. Your last action was not saved.',
        'error'
      );
    } finally {
      restoreStorageSet();
      if (typeof originalShowToast === 'undefined') {
        delete window.showToast;
      } else {
        window.showToast = originalShowToast;
      }
      errorSpy.mockRestore();
    }
  });

  it('preserves a streaming flag owned by a live request on reload', () => {
    const conversations = [{
      id: 'conv-live',
      title: 'Streaming answer',
      messages: [
        { id: 'm-user', role: 'user', content: 'Write a long answer', timestamp: 1 },
        { id: 'm-assistant', role: 'assistant', content: 'Partial answer', timestamp: 2, isStreaming: true }
      ],
      createdAt: 1,
      updatedAt: 2
    }];
    localStorage.setItem(
      AIStore.STORAGE_KEYS.conversations,
      JSON.stringify(conversations)
    );
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-live');
    AIStore.state.isStreaming = true;

    // openModal() reloads while a request is in flight; the flag the request
    // still owns must survive, and no healing write may be issued (#865).
    expect(AIStore.loadConversations()).toBeUndefined();
    expect(AIStore.state.conversations[0].messages[1].isStreaming).toBe(true);
    expect(JSON.parse(
      localStorage.getItem(AIStore.STORAGE_KEYS.conversations)
    )[0].messages[1].isStreaming).toBe(true);
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
    // Give the store its own array: saveConversations() trims live state in
    // place to keep conversation object identities (#752), which would
    // otherwise also trim this expected fixture.
    AIStore.state.conversations = previousConversations.map(conversation => ({ ...conversation }));
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

  it('issues the currentId write and rolls it back on a bridge-reported first-write failure (#835)', async () => {
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
    // Give the store its own array: saveConversations() trims live state in
    // place to keep conversation object identities (#752), which would
    // otherwise also trim this expected fixture.
    AIStore.state.conversations = previousConversations.map(conversation => ({ ...conversation }));
    AIStore.state.currentConversationId = previousCurrentConversationId;

    const previousState = AIStore.createSaveSnapshot();
    AIStore.state.currentConversationId = 'conv-0';

    const originalSetItemAsync = localStorage.setItemAsync;
    const setItemKeys = [];

    localStorage.setItemAsync = vi.fn((key, value) => {
      setItemKeys.push(key);
      return originalSetItemAsync(key, value);
    });

    const restoreStorageSet = failStorageWritesFor(AIStore.STORAGE_KEYS.conversations, 'async');

    const bridgeWriteErrors = [];
    const onBridgeWriteError = event => bridgeWriteErrors.push(event.detail);
    window.addEventListener('storageBridgeWriteError', onBridgeWriteError);

    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;

    try {
      const save = AIStore.saveConversations(previousState);

      expect(setItemKeys).toEqual([
        AIStore.STORAGE_KEYS.conversations,
        AIStore.STORAGE_KEYS.currentId
      ]);
      expect(await save).toBe(false);

      // The current id write is issued in the same turn as the failed
      // conversations write (#835), then the succeeded key is rolled back.
      expect(localStorage.setItemAsync).toHaveBeenCalledTimes(3);
      expect(setItemKeys).toEqual([
        AIStore.STORAGE_KEYS.conversations,
        AIStore.STORAGE_KEYS.currentId,
        AIStore.STORAGE_KEYS.currentId
      ]);
      expect(bridgeWriteErrors).toHaveLength(1);
      expect(bridgeWriteErrors[0]).toMatchObject({
        key: AIStore.STORAGE_KEYS.conversations,
        message: 'QUOTA_BYTES quota exceeded',
        operation: 'set'
      });

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
    } finally {
      restoreStorageSet();
      window.removeEventListener('storageBridgeWriteError', onBridgeWriteError);
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

describe('AIStore synchronous fallback write failures (#823)', () => {
  it('treats a rejected sync fallback write as a failed save', async () => {
    const conversation = {
      id: 'conv-1',
      title: 'Topic',
      messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      createdAt: 1,
      updatedAt: 1
    };
    // Rollback restores the last persisted state, so seed it first.
    localStorage.setItem(AIStore.STORAGE_KEYS.conversations, JSON.stringify([conversation]));
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-1');
    const persistedBefore = localStorage.getItem(AIStore.STORAGE_KEYS.conversations);
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = 'conv-1';
    const previousState = AIStore.createSaveSnapshot();
    AIStore.state.conversations = [
      { ...conversation, id: 'conv-2', title: 'Unsaved' },
      conversation
    ];
    AIStore.state.currentConversationId = 'conv-2';

    const originalSetItemAsync = localStorage.setItemAsync;
    delete localStorage.setItemAsync;

    const restoreStorageSet = failStorageWritesFor(AIStore.STORAGE_KEYS.conversations, 'sync');

    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(await AIStore.saveConversations(previousState)).toBe(false);
      expect(AIStore.state.conversations).toEqual([conversation]);
      expect(AIStore.state.currentConversationId).toBe('conv-1');
      // The failed save leaves storage at its pre-save value.
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.conversations)).toBe(persistedBefore);
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save conversations. Your last action was not saved.',
        'error'
      );
    } finally {
      restoreStorageSet();
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
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('AIStore serialization failures', () => {
  it('rolls back and reports a save whose conversations cannot be serialized', async () => {
    const conversation = {
      id: 'conv-1',
      title: 'Topic',
      messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      createdAt: 1,
      updatedAt: 1
    };
    localStorage.setItem(AIStore.STORAGE_KEYS.conversations, JSON.stringify([conversation]));
    localStorage.setItem(AIStore.STORAGE_KEYS.currentId, 'conv-1');
    const persistedBefore = localStorage.getItem(AIStore.STORAGE_KEYS.conversations);
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = 'conv-1';
    const previousState = AIStore.createSaveSnapshot();

    const unserializable = {
      ...conversation,
      id: 'conv-2',
      title: 'Unsaved',
      toJSON() {
        throw new Error('cannot serialize');
      }
    };
    AIStore.state.conversations = [unserializable, conversation];
    AIStore.state.currentConversationId = 'conv-2';

    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(await AIStore.saveConversations(previousState)).toBe(false);
      expect(AIStore.state.conversations).toEqual([conversation]);
      expect(AIStore.state.currentConversationId).toBe('conv-1');
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.conversations)).toBe(persistedBefore);
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-1');
      expect(showToast).toHaveBeenCalledWith(
        'Failed to save conversations. Your last action was not saved.',
        'error'
      );
    } finally {
      if (typeof originalShowToast === 'undefined') {
        delete window.showToast;
      } else {
        window.showToast = originalShowToast;
      }
      errorSpy.mockRestore();
    }
  });
});

describe('AIStore storage bounds (#947)', () => {
  const CHUNK = 'x'.repeat(40 * 1024);
  const flushSaves = () => new Promise(resolve => setTimeout(resolve, 0));

  function makeMessages(count, prefix) {
    return Array.from({ length: count }, (_, index) => ({
      id: prefix + '-' + index,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: CHUNK,
      timestamp: index
    }));
  }

  function captureToast() {
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;
    return {
      showToast,
      restore() {
        if (typeof originalShowToast === 'undefined') {
          delete window.showToast;
        } else {
          window.showToast = originalShowToast;
        }
      }
    };
  }

  it('requests the unlimitedStorage permission', () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8'));
    expect(manifest.permissions).toContain('unlimitedStorage');
  });

  it('caps a conversation when a message is added', async () => {
    const conversation = {
      id: 'conv-cap',
      title: 'Cap',
      messages: Array.from({ length: AIStore.MAX_MESSAGES_PER_CONVERSATION }, (_, index) => ({
        id: 'm-' + index,
        role: 'user',
        content: 'message ' + index,
        timestamp: index
      })),
      createdAt: 1,
      updatedAt: 1
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    AIStore.addMessageToConversation({ role: 'user', content: 'newest' });
    await flushSaves();

    expect(conversation.messages).toHaveLength(AIStore.MAX_MESSAGES_PER_CONVERSATION);
    expect(conversation.messages[0].id).toBe('m-1');
    expect(conversation.messages[conversation.messages.length - 1].content).toBe('newest');
  });

  it('caps a conversation during save normalization', async () => {
    const overflow = 25;
    const conversation = {
      id: 'conv-loaded',
      title: 'Loaded',
      messages: Array.from({ length: AIStore.MAX_MESSAGES_PER_CONVERSATION + overflow }, (_, index) => ({
        id: 'l-' + index,
        role: 'assistant',
        content: 'history ' + index,
        timestamp: index
      })),
      createdAt: 1,
      updatedAt: 1
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    expect(await AIStore.saveConversations()).toBe(true);

    expect(conversation.messages).toHaveLength(AIStore.MAX_MESSAGES_PER_CONVERSATION);
    expect(conversation.messages[0].id).toBe('l-' + overflow);
    expect(conversation.messages[conversation.messages.length - 1].id).toBe(
      'l-' + (AIStore.MAX_MESSAGES_PER_CONVERSATION + overflow - 1)
    );
    const persisted = JSON.parse(localStorage.getItem(AIStore.STORAGE_KEYS.conversations));
    expect(persisted[0].messages).toHaveLength(AIStore.MAX_MESSAGES_PER_CONVERSATION);
  });

  // The 4.5 MB mock sits above MAX_SERIALIZED_BYTES, so the proactive cap
  // always brings a write under it and the rejecting path never fires here;
  // the rejected-write recovery is covered by the retry test below.
  it('trims the oldest messages before a write can reach the size cap', async () => {
    const toast = captureToast();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const QUOTA = 4.5 * 1024 * 1024;

    const active = { id: 'conv-active', title: 'Active', messages: makeMessages(4, 'n'), createdAt: 3, updatedAt: 3 };
    const middle = { id: 'conv-middle', title: 'Middle', messages: makeMessages(45, 'm'), createdAt: 2, updatedAt: 2 };
    const oldest = { id: 'conv-oldest', title: 'Oldest', messages: makeMessages(75, 'o'), createdAt: 1, updatedAt: 1 };
    AIStore.state.conversations = [active, middle, oldest];
    AIStore.state.currentConversationId = active.id;

    const untrimmedSize = utf8Length(JSON.stringify(AIStore.state.conversations));
    expect(untrimmedSize).toBeGreaterThan(QUOTA);
    expect(untrimmedSize).toBeGreaterThan(AIStore.MAX_SERIALIZED_BYTES);

    const restoreQuota = failStorageWritesOver(QUOTA, AIStore.STORAGE_KEYS.conversations, 'async');

    try {
      AIStore.addMessageToConversation({ role: 'user', content: 'still here' });
      await flushSaves();

      const persisted = JSON.parse(localStorage.getItem(AIStore.STORAGE_KEYS.conversations));
      expect(persisted).toEqual(AIStore.state.conversations);
      expect(utf8Length(JSON.stringify(persisted))).toBeLessThanOrEqual(AIStore.MAX_SERIALIZED_BYTES);

      const persistedActive = persisted.find(conversation => conversation.id === 'conv-active');
      expect(persistedActive.messages[persistedActive.messages.length - 1].content).toBe('still here');
      expect(active.messages).toHaveLength(5);
      expect(middle.messages).toHaveLength(45);
      expect(oldest.messages.length).toBeLessThan(75);
      expect(oldest.messages.some(message => message.id === 'o-0')).toBe(false);

      AIStore.addMessageToConversation({ role: 'assistant', content: 'reply' });
      await flushSaves();

      const persistedAgain = JSON.parse(localStorage.getItem(AIStore.STORAGE_KEYS.conversations));
      const persistedActiveAgain = persistedAgain.find(conversation => conversation.id === 'conv-active');
      expect(persistedActiveAgain.messages[persistedActiveAgain.messages.length - 1].content).toBe('reply');
      expect(persistedAgain).toEqual(AIStore.state.conversations);
      expect(toast.showToast).not.toHaveBeenCalled();
    } finally {
      restoreQuota();
      toast.restore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('re-saves a trimmed payload when a large store rejects the first write', async () => {
    const toast = captureToast();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const QUOTA = 400 * 1024;

    const active = { id: 'conv-active', title: 'Active', messages: makeMessages(4, 'n'), createdAt: 3, updatedAt: 3 };
    const oldest = { id: 'conv-oldest', title: 'Oldest', messages: makeMessages(15, 'o'), createdAt: 1, updatedAt: 1 };
    AIStore.state.conversations = [active, oldest];
    AIStore.state.currentConversationId = active.id;

    const untrimmedSize = utf8Length(JSON.stringify(AIStore.state.conversations));
    expect(untrimmedSize).toBeGreaterThan(QUOTA);
    expect(untrimmedSize).toBeGreaterThanOrEqual(AIStore.MIN_QUOTA_RETRY_BYTES);

    const restoreQuota = failStorageWritesOver(QUOTA, AIStore.STORAGE_KEYS.conversations, 'async');

    try {
      AIStore.addMessageToConversation({ role: 'user', content: 'typed through the quota' });
      await flushSaves();

      const persisted = JSON.parse(localStorage.getItem(AIStore.STORAGE_KEYS.conversations));
      const persistedActive = persisted.find(conversation => conversation.id === 'conv-active');
      const persistedOldest = persisted.find(conversation => conversation.id === 'conv-oldest');
      expect(persistedActive.messages[persistedActive.messages.length - 1].content).toBe('typed through the quota');
      expect(persistedOldest.messages.length).toBeLessThan(15);
      expect(utf8Length(JSON.stringify(persisted))).toBeLessThanOrEqual(QUOTA);
      expect(localStorage.getItem(AIStore.STORAGE_KEYS.currentId)).toBe('conv-active');
      // The re-save trims this transaction's captured snapshot, so storage
      // sheds the oldest messages without pulling them from the live view or
      // pairing them with another conversation's current id.
      expect(oldest.messages).toHaveLength(15);
      expect(active.messages).toHaveLength(5);
      expect(toast.showToast).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      restoreQuota();
      toast.restore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('never evicts the conversation an in-flight request writes into', async () => {
    const active = { id: 'conv-active', title: 'Active', messages: makeMessages(4, 'n'), createdAt: 3, updatedAt: 3 };
    const middle = { id: 'conv-middle', title: 'Middle', messages: makeMessages(45, 'm'), createdAt: 2, updatedAt: 2 };
    const oldest = { id: 'conv-oldest', title: 'Oldest', messages: makeMessages(75, 'o'), createdAt: 1, updatedAt: 1 };
    AIStore.state.conversations = [active, middle, oldest];
    AIStore.state.currentConversationId = active.id;
    // The user switched to the newest chat while a request is still writing
    // into the oldest one: eviction may drain the middle conversation but
    // must not treat the request's own messages as disposable.
    AIStore.setInFlightConversation(oldest.id);

    expect(utf8Length(JSON.stringify(AIStore.state.conversations))).toBeGreaterThan(AIStore.MAX_SERIALIZED_BYTES);

    try {
      expect(await AIStore.saveConversations()).toBe(true);

      expect(oldest.messages).toHaveLength(75);
      expect(middle.messages.length).toBeLessThan(45);
      expect(active.messages).toHaveLength(4);

      const persisted = JSON.parse(localStorage.getItem(AIStore.STORAGE_KEYS.conversations));
      const persistedOldest = persisted.find(conversation => conversation.id === 'conv-oldest');
      expect(persistedOldest.messages).toHaveLength(75);
      expect(utf8Length(JSON.stringify(persisted))).toBeLessThanOrEqual(AIStore.MAX_SERIALIZED_BYTES);
    } finally {
      AIStore.setInFlightConversation(null);
    }
  });

  it('suggests exporting when the store stays full after the trimmed re-save', async () => {
    const toast = captureToast();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const conversation = {
      id: 'conv-full',
      title: 'Full',
      messages: makeMessages(20, 'f'),
      createdAt: 1,
      updatedAt: 1
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    localStorage.setItem(AIStore.STORAGE_KEYS.conversations, JSON.stringify([conversation]));
    expect(utf8Length(JSON.stringify([conversation]))).toBeGreaterThanOrEqual(
      AIStore.MIN_QUOTA_RETRY_BYTES
    );

    const restoreWrites = failStorageWritesFor(AIStore.STORAGE_KEYS.conversations, 'async');

    try {
      expect(await AIStore.saveConversations()).toBe(false);
      expect(toast.showToast).toHaveBeenCalledWith(
        'Storage is full. Export or delete old conversations to free space.',
        'error'
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to save conversations:',
        expect.any(Error)
      );
    } finally {
      restoreWrites();
      toast.restore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
