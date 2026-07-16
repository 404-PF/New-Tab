import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

let realSendMessageStreaming;

// ------------------------------------------------------------------
// DOM stubs required by AIRenderer / AIService
// ------------------------------------------------------------------
const stubElement = (id, tag = 'div') => {
  const el = document.createElement(tag);
  el.id = id;
  document.body.appendChild(el);
  return el;
};

const stubElements = () => {
  stubElement('ai-chat-modal');
  const container = stubElement('ai-chat-container');
  // jsdom doesn't implement scrollTo on elements
  container.scrollTo = () => {};
  stubElement('ai-chat-input', 'textarea');
  stubElement('ai-chat-send', 'button');
  stubElement('ai-chat-stop', 'button');
  stubElement('ai-chat-loading');
  stubElement('ai-chat-error');
  stubElement('ai-chat-title');
  stubElement('ai-new-chat-btn', 'button');
  stubElement('ai-topics-list');
  stubElement('ai-topics-search-input', 'input');
  stubElement('ai-topics-count');
  stubElement('ai-confirm-dialog');
  stubElement('ai-scroll-to-bottom', 'button');
};

beforeAll(() => {
  stubElements();

  // Stub navigator.onLine so NetworkDetector reports online
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    get: () => true
  });

  // Stub window.confirm/alert so initialization doesn't prompt
  globalThis.confirm = () => false;
  globalThis.alert = () => {};

  // Stub fetch so puter.js doesn't make real network calls
  globalThis.fetch = async () => {
    throw new Error('fetch is stubbed in tests');
  };

  // Provide a fake Puter SDK global. puter.js calls window.puter.ai.chat.
  globalThis.puter = {
    auth: {
      signIn: async () => {}
    },
    ai: {
      chat: async () => {
        // Default: emulate a streamed response via an async iterable
        async function* gen() {
          yield { text: 'mock ' };
          yield { text: 'response' };
        }
        return gen();
      }
    }
  };

  injectScript('src/ai/network-detector.js');
  injectScript('src/ai/offline-mode.js');
  injectScript('src/ai/puter.js');
  realSendMessageStreaming = PuterAPI.sendMessageStreaming;
  injectScript('src/ai/ai-renderer.js');
  injectScript('src/ai/ai-store.js');
  injectScript('src/ai/ai-service.js');
});

beforeEach(() => {
  // Reset conversation state and mock implementations between tests
  localStorage.clear();
  AIStore.state.conversations = [];
  AIStore.state.currentConversationId = null;
  AIStore.state.isLoading = false;
  AIStore.state.isStreaming = false;
  AIStore.state.abortController = null;

  // Default mock: API error result
  PuterAPI.sendMessageStreaming = async () => {
    return { success: false, error: 'mock API error' };
  };
  window.puter.auth.signIn = async () => {};
});

describe('PuterAPI.validateInput control character rejection (#422)', () => {
  it('rejects messages containing control characters', () => {
    const result = PuterAPI.validateInput('hello\x00world');
    expect(result.valid).toBe(false);
  });

  it('rejects messages with null bytes', () => {
    const result = PuterAPI.validateInput('test\x00message');
    expect(result.valid).toBe(false);
  });

  it('rejects messages with backspace characters', () => {
    const result = PuterAPI.validateInput('test\x08message');
    expect(result.valid).toBe(false);
  });

  it('accepts messages with newlines', () => {
    const result = PuterAPI.validateInput('hello\nworld');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('hello\nworld');
  });

  it('accepts messages with carriage returns', () => {
    const result = PuterAPI.validateInput('hello\rworld');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('hello\rworld');
  });

  it('accepts messages with tabs', () => {
    const result = PuterAPI.validateInput('hello\tworld');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('hello\tworld');
  });

  it('accepts normal messages', () => {
    const result = PuterAPI.validateInput('Hello, how are you?');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('Hello, how are you?');
  });

  it('rejects empty messages', () => {
    const result = PuterAPI.validateInput('');
    expect(result.valid).toBe(false);
  });

  it('rejects messages over 2000 characters', () => {
    const longMessage = 'a'.repeat(2001);
    const result = PuterAPI.validateInput(longMessage);
    expect(result.valid).toBe(false);
  });
});

describe('PuterAPI resilience', () => {
  it('passes the configured token limit to Puter', async () => {
    let sentOptions;
    window.puter.ai.chat = async (_messages, options) => {
      sentOptions = options;
      return (async function*() {})();
    };

    const result = await realSendMessageStreaming('hello');

    expect(result.success).toBe(true);
    expect(sentOptions.max_tokens).toBe(4096);
  });

  it('falls back to English when localStorage language access throws', async () => {
    const originalI18n = window.i18n;
    const originalGetItem = Storage.prototype.getItem;
    let sentMessages;
    window.i18n = null;
    Storage.prototype.getItem = () => {
      throw new Error('storage unavailable');
    };
    window.puter.ai.chat = async messages => {
      sentMessages = messages;
      return (async function*() {})();
    };

    try {
      const result = await realSendMessageStreaming('hello');
      expect(result.success).toBe(true);
      expect(sentMessages[0].content).toContain('helpful AI assistant');
    } finally {
      Storage.prototype.getItem = originalGetItem;
      window.i18n = originalI18n;
    }
  });

  it.each([
    { status: 401 },
    { error: { code: 'auth_canceled', message: 'Authentication canceled' } },
    { error: { code: 'unauthorized' } },
    { error: { message: 'Authentication required' } }
  ])('recognizes nested and HTTP auth errors: %o', async authError => {
    window.puter.ai.chat = async () => {
      throw authError;
    };

    const result = await realSendMessageStreaming('hello');
    expect(result.authRequired).toBe(true);
  });

  it('stops a stalled stream promptly and closes its iterator on abort', async () => {
    const controller = new AbortController();
    let returnCalled = false;
    const iterator = {
      next: () => new Promise(() => {}),
      return: () => {
        returnCalled = true;
        return Promise.resolve({ done: true });
      }
    };
    window.puter.ai.chat = async () => ({
      [Symbol.asyncIterator]: () => iterator
    });

    const pending = realSendMessageStreaming('hello', [], null, controller.signal);
    controller.abort();
    const result = await pending;

    expect(result).toMatchObject({ success: false, aborted: true });
    expect(returnCalled).toBe(true);
  });

  it('stops promptly when stream creation is stalled', async () => {
    const controller = new AbortController();
    window.puter.ai.chat = () => new Promise(() => {});

    const pending = realSendMessageStreaming('hello', [], null, controller.signal);
    controller.abort();
    const result = await pending;

    expect(result).toMatchObject({ success: false, aborted: true });
  });

  it('aborts the Puter chat XHR when cancellation is requested', async () => {
    const controller = new AbortController();
    const originalSend = XMLHttpRequest.prototype.send;
    const originalAbort = XMLHttpRequest.prototype.abort;
    let abortCalled = false;

    XMLHttpRequest.prototype.send = function() {};
    XMLHttpRequest.prototype.abort = function() {
      abortCalled = true;
    };
    window.puter.ai.chat = () => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/drivers/call');
      xhr.send(JSON.stringify({ interface: 'puter-chat-completion' }));
      return new Promise(() => {});
    };

    try {
      const pending = realSendMessageStreaming('hello', [], null, controller.signal);
      controller.abort();
      const result = await pending;

      expect(result).toMatchObject({ success: false, aborted: true });
      expect(abortCalled).toBe(true);
    } finally {
      XMLHttpRequest.prototype.send = originalSend;
      XMLHttpRequest.prototype.abort = originalAbort;
    }
  });
});
describe('AIService error path length guard (#282)', () => {
  it('uses the Puter SDK sign-in flow when authentication is required', async () => {
    const conversation = {
      id: 'conv_auth',
      title: 'Auth',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    PuterAPI.sendMessageStreaming = async () => ({
      success: false,
      error: 'Sign in required',
      authRequired: true
    });

    let signInCalls = 0;
    window.puter.auth.signIn = async () => {
      signInCalls += 1;
    };

    await AIService.sendMessage('hello');
    const signInLink = document.querySelector('#ai-chat-error a');
    expect(signInLink).not.toBeNull();

    signInLink.click();
    await Promise.resolve();

    expect(signInCalls).toBe(1);
  });
  it('does not pop messages when the API returns a non-success result on a 0-message conversation', async () => {
    // Seed an empty conversation
    const conversation = {
      id: 'conv_empty',
      title: 'Empty',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    // Simulate the race-condition reproduction step from the issue:
    // sendMessage appends user + assistant, but right after each push
    // we empty the array so the error path sees an empty conversation.
    const originalAdd = AIStore.addMessageToConversation;
    AIStore.addMessageToConversation = (msg) => {
      const c = AIStore.getCurrentConversation();
      c.messages.push(msg);
      // Force the conversation back to empty to exercise the guard
      c.messages.length = 0;
    };

    // Override pop on the array so we can detect whether the guard
    // prevents the call. We track call count manually.
    const popCalls = [];
    const originalPop = conversation.messages.pop;
    conversation.messages.pop = function() {
      popCalls.push(this.length);
      return originalPop.call(this);
    };

    try {
      await AIService.sendMessage('hello');
    } finally {
      AIStore.addMessageToConversation = originalAdd;
      conversation.messages.pop = originalPop;
    }

    // The guard must prevent popping on an empty array
    expect(conversation.messages.length).toBe(0);
    expect(popCalls).toEqual([]);
  });

  it('pops messages normally when the API returns a non-success result and the conversation has 1 pre-existing message', async () => {
    // Sanity check: with at least 1 pre-existing message, the normal
    // add-user + add-assistant + pop-2 behaviour applies (length 1 → 3 → 1).
    // This proves the guard does not over-fire on healthy conversations.
    const conversation = {
      id: 'conv_one',
      title: 'One',
      messages: [{ role: 'user', content: 'orphan', timestamp: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    await AIService.sendMessage('hello');

    // Normal flow: push user + assistant (3 total), then pop 2 on error → 1.
    expect(conversation.messages.length).toBe(1);
    expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'orphan' });
  });

  it('pops two messages on API error when conversation has enough messages (control case)', async () => {
    const conversation = {
      id: 'conv_normal',
      title: 'Normal',
      messages: [
        { role: 'user', content: 'previous', timestamp: Date.now() }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    await AIService.sendMessage('hello');

    // sendMessage pushes user + assistant (2), then on API error pops 2.
    // Net effect: just the original message remains.
    expect(conversation.messages.length).toBe(1);
    expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'previous' });
  });

  it('catch-block error path also leaves messages intact when fewer than 2 exist', async () => {
    const conversation = {
      id: 'conv_throw',
      title: 'Throw',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    // Force the API call to throw a non-AbortError
    PuterAPI.sendMessageStreaming = async () => {
      throw new Error('boom');
    };

    // Strip the user/assistant messages that sendMessage would normally
    // add before the throw, so the catch block sees an empty array.
    const originalAdd = AIStore.addMessageToConversation;
    AIStore.addMessageToConversation = (msg) => {
      const c = AIStore.getCurrentConversation();
      c.messages.push(msg);
      c.messages.length = 0;
    };

    const popCalls = [];
    const originalPop = conversation.messages.pop;
    conversation.messages.pop = function() {
      popCalls.push(this.length);
      return originalPop.call(this);
    };

    try {
      await AIService.sendMessage('hello');
    } finally {
      AIStore.addMessageToConversation = originalAdd;
      conversation.messages.pop = originalPop;
    }

    expect(conversation.messages.length).toBe(0);
    expect(popCalls).toEqual([]);
  });
});
