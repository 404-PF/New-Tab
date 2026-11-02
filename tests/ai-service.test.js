import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

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

  // Stub fetch so openrouter.js doesn't make real network calls
  globalThis.fetch = async () => {
    throw new Error('fetch is stubbed in tests');
  };

  injectScript('src/ai/network-detector.js');
  injectScript('src/ai/offline-mode.js');
  injectScript('src/ai/openrouter.js');
  injectScript('src/ai/ai-renderer.js');
  injectScript('src/ai/conversation-validator.js');
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
  OpenRouterAPI.sendMessageStreaming = async () => {
    return { success: false, error: 'mock API error' };
  };
});

describe('OpenRouterAPI.validateInput control character rejection (#422)', () => {
  it('rejects messages containing control characters', () => {
    const result = OpenRouterAPI.validateInput('hello\x00world');
    expect(result.valid).toBe(false);
  });

  it('rejects messages with null bytes', () => {
    const result = OpenRouterAPI.validateInput('test\x00message');
    expect(result.valid).toBe(false);
  });

  it('rejects messages with backspace characters', () => {
    const result = OpenRouterAPI.validateInput('test\x08message');
    expect(result.valid).toBe(false);
  });

  it('accepts messages with newlines', () => {
    const result = OpenRouterAPI.validateInput('hello\nworld');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('hello\nworld');
  });

  it('accepts messages with carriage returns', () => {
    const result = OpenRouterAPI.validateInput('hello\rworld');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('hello\rworld');
  });

  it('accepts messages with tabs', () => {
    const result = OpenRouterAPI.validateInput('hello\tworld');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('hello\tworld');
  });

  it('accepts normal messages', () => {
    const result = OpenRouterAPI.validateInput('Hello, how are you?');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('Hello, how are you?');
  });

  it('rejects empty messages', () => {
    const result = OpenRouterAPI.validateInput('');
    expect(result.valid).toBe(false);
  });

  it('rejects messages over 2000 characters', () => {
    const longMessage = 'a'.repeat(2001);
    const result = OpenRouterAPI.validateInput(longMessage);
    expect(result.valid).toBe(false);
  });
});

describe('AIService message normalization', () => {
  it('does not persist whitespace-only user messages', async () => {
    const conversation = {
      id: 'conv-whitespace',
      title: 'Whitespace',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    OpenRouterAPI.sendMessageStreaming = vi.fn();

    await AIService.sendMessage(' \t \n ');

    expect(conversation.messages).toEqual([]);
    expect(OpenRouterAPI.sendMessageStreaming).not.toHaveBeenCalled();
  });
});

describe('dead code cleanup (#1093)', () => {
  it('does not expose the removed quickSearch/isAvailable helpers', () => {
    expect(AIService.quickSearch).toBeUndefined();
    expect(AIService.isAvailable).toBeUndefined();
    expect(OpenRouterAPI.quickSearch).toBeUndefined();
    expect(typeof OpenRouterAPI.sendMessageStreaming).toBe('function');
    expect(typeof AIService.sendMessage).toBe('function');
  });
});

describe('AIService error path length guard (#282)', () => {
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

  it('removes only the failed assistant bubble when the conversation has 1 pre-existing message', async () => {
    // Sanity check: the failed request adds user + assistant (1 → 3) and the
    // error path then removes just the assistant bubble, keeping both prompts
    // so the resent question stays available for Regenerate (#997).
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

    expect(conversation.messages.length).toBe(2);
    expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'orphan' });
    expect(conversation.messages[1]).toMatchObject({ role: 'user', content: 'hello' });
  });

  it('keeps the original and resent prompts on API error (control case)', async () => {
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

    // sendMessage pushes user + assistant (3), then on API error removes the
    // assistant only: both prompts remain (#997).
    expect(conversation.messages.length).toBe(2);
    expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'previous' });
    expect(conversation.messages[1]).toMatchObject({ role: 'user', content: 'hello' });
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
    OpenRouterAPI.sendMessageStreaming = async () => {
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

describe('AIService stop streaming preserves partial content (#600)', () => {
  // Helper: seed a conversation and mock a streaming request that stays
  // pending until the test resolves/rejects it (like a real fetch that
  // aborts). Pass { seedConversation: false } to reuse the current
  // conversation instead of replacing it (e.g. for the new-message race).
  const startStreamingSend = ({ seedConversation = true } = {}) => {
    const conversation = seedConversation
      ? {
          id: 'conv_stop',
          title: 'Stop',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      : AIStore.getCurrentConversation();

    if (seedConversation) {
      AIStore.state.conversations = [conversation];
      AIStore.state.currentConversationId = conversation.id;
    }

    let onChunkCallback = null;
    let resolveRequest = null;
    let rejectRequest = null;
    let requestSignal = null;
    OpenRouterAPI.sendMessageStreaming = async (userMessage, history, onChunk, signal) => {
      onChunkCallback = onChunk;
      requestSignal = signal;
      return new Promise((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
      });
    };

    const sendPromise = AIService.sendMessage('hello');

    return {
      conversation,
      sendPromise,
      getOnChunk: () => onChunkCallback,
      getRequestSignal: () => requestSignal,
      resolveRequest,
      rejectRequest
    };
  };

  it('keeps the partially streamed text when stopping mid-stream', async () => {
    const { conversation, sendPromise, getOnChunk, getRequestSignal, resolveRequest } = startStreamingSend();

    // Let sendMessage reach the streaming call and accumulate some content
    await new Promise(resolve => setTimeout(resolve, 0));
    getOnChunk()('Partial answer');

    // Press Stop, then let the aborted request settle
    AIService.stopStreaming();
    // Stop must actually abort the signal passed to the request
    expect(getRequestSignal().aborted).toBe(true);
    resolveRequest({ success: false, error: 'Request cancelled', aborted: true });
    await sendPromise;

    const lastMsg = conversation.messages[1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.isStreaming).toBe(false);
    expect(lastMsg.content).toBe('Partial answer');

    // The partial content must survive a reload from storage
    const saved = JSON.parse(localStorage.getItem('ai_conversations'));
    expect(saved[0].messages[1].content).toBe('Partial answer');
  });

  it('stores a [Cancelled] marker when nothing was streamed before stop', async () => {
    const { conversation, sendPromise, getRequestSignal, resolveRequest } = startStreamingSend();

    await new Promise(resolve => setTimeout(resolve, 0));

    // Stop before any chunk arrives
    AIService.stopStreaming();
    expect(getRequestSignal().aborted).toBe(true);
    resolveRequest({ success: false, error: 'Request cancelled', aborted: true });
    await sendPromise;

    const lastMsg = conversation.messages[1];
    expect(lastMsg.isStreaming).toBe(false);
    expect(lastMsg.content).toBe('[Cancelled]');
  });

  it('keeps partial content when the request rejects with an AbortError', async () => {
    const { conversation, sendPromise, getOnChunk, getRequestSignal, rejectRequest } = startStreamingSend();

    await new Promise(resolve => setTimeout(resolve, 0));
    getOnChunk()('Partial answer');

    AIService.stopStreaming();
    expect(getRequestSignal().aborted).toBe(true);

    // A real aborted fetch rejects with a DOMException AbortError
    rejectRequest(new DOMException('The operation was aborted.', 'AbortError'));
    await sendPromise;

    const lastMsg = conversation.messages[1];
    expect(lastMsg.isStreaming).toBe(false);
    expect(lastMsg.content).toBe('Partial answer');

    // The partial content must survive a reload from storage
    const saved = JSON.parse(localStorage.getItem('ai_conversations'));
    expect(saved[0].messages[1].content).toBe('Partial answer');
  });

  it('finalizes the original message when a new request starts before the aborted one settles', async () => {
    const { conversation, sendPromise, getOnChunk, getRequestSignal, resolveRequest } = startStreamingSend();

    await new Promise(resolve => setTimeout(resolve, 0));
    getOnChunk()('Partial answer');

    AIService.stopStreaming();
    expect(getRequestSignal().aborted).toBe(true);

    // The input is re-enabled immediately after Stop; if the user sends a new
    // message before the aborted request settles, finalization must still
    // target the original assistant message, not the new one.
    const second = startStreamingSend({ seedConversation: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    second.getOnChunk()('Second answer');

    // The aborted request settles after the new message is in the conversation
    resolveRequest({ success: false, error: 'Request cancelled', aborted: true });
    await sendPromise;

    // The original message keeps its partial content and is finalized
    const firstAssistant = conversation.messages[1];
    expect(firstAssistant.isStreaming).toBe(false);
    expect(firstAssistant.content).toBe('Partial answer');

    // The newer request keeps its abort controller and loading state
    expect(AIStore.state.abortController).not.toBeNull();
    expect(AIStore.state.isLoading).toBe(true);

    // The new streaming message keeps its partial content visible (issue #616)
    // even before its request settles, while staying in streaming state.
    const secondAssistant = conversation.messages[3];
    expect(secondAssistant.isStreaming).toBe(true);
    expect(secondAssistant.content).toBe('Second answer');

    second.resolveRequest({ success: true, content: 'Second answer', aborted: false });
    await second.sendPromise;
    expect(secondAssistant.isStreaming).toBe(false);
    expect(secondAssistant.content).toBe('Second answer');
  });

  describe('offline answers with success:false are answers, not failures (#872)', () => {
    it('finalizes a can\'t-convert answer as the assistant message instead of deleting the question', async () => {
      const conversation = {
        id: 'conv_cant_convert',
        title: 'CantConvert',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      AIStore.state.conversations = [conversation];
      AIStore.state.currentConversationId = conversation.id;

      window.dispatchEvent(new Event('offline'));
      try {
        const cantConvert = OfflineMode.getResponse('10 km to furlong');
        expect(cantConvert.success).toBe(false);
        expect(cantConvert.content).toBeTruthy();

        await AIService.sendMessage('10 km to furlong');

        // The question and its answer both stay in the conversation
        expect(conversation.messages).toHaveLength(2);
        expect(conversation.messages[0]).toMatchObject({ role: 'user', content: '10 km to furlong' });
        expect(conversation.messages[1]).toMatchObject({ role: 'assistant', content: cantConvert.content, isStreaming: false });

        // ... and survive a reload from storage
        const saved = JSON.parse(localStorage.getItem('ai_conversations'));
        expect(saved[0].messages).toHaveLength(2);
        expect(saved[0].messages[1].content).toBe(cantConvert.content);
      } finally {
        window.dispatchEvent(new Event('online'));
      }
    });

    it('shows no transport error banner for a can\'t-convert answer', async () => {
      const conversation = {
        id: 'conv_no_banner',
        title: 'NoBanner',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      AIStore.state.conversations = [conversation];
      AIStore.state.currentConversationId = conversation.id;

      window.dispatchEvent(new Event('offline'));
      try {
        await AIService.sendMessage('10 km to furlong');

        expect(document.getElementById('ai-chat-error').textContent).toBe('');
        expect(document.getElementById('ai-chat-error').style.display).not.toBe('block');
      } finally {
        window.dispatchEvent(new Event('online'));
      }
    });
  });

  it('keeps the partial simulated response when stopping mid-stream in offline mode', async () => {
    const conversation = {
      id: 'conv_offline',
      title: 'Offline',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    // Flip the network detector into offline mode for this test
    window.dispatchEvent(new Event('offline'));
    expect(NetworkDetector.getStatus().isOffline).toBe(true);

    const fullResponse = OfflineMode.getResponse('hello').content;

    try {
      const sendPromise = AIService.sendMessage('hello');

      // Let the simulated offline stream accumulate a few chunks
      await new Promise(resolve => setTimeout(resolve, 30));

      AIService.stopStreaming();
      await sendPromise;

      const lastMsg = conversation.messages[1];
      expect(lastMsg.isStreaming).toBe(false);
      // Partial content preserved - not the full response the user stopped
      expect(lastMsg.content.length).toBeGreaterThan(0);
      expect(lastMsg.content.length).toBeLessThan(fullResponse.length);

      // The partial content must survive a reload from storage
      const saved = JSON.parse(localStorage.getItem('ai_conversations'));
      expect(saved[0].messages[1].content).toBe(lastMsg.content);
    } finally {
      // Restore online state for the remaining tests
      window.dispatchEvent(new Event('online'));
    }
  });

  it('does not leave the message stuck streaming when no request is in flight', async () => {
    const conversation = {
      id: 'conv_stuck',
      title: 'Stuck',
      messages: [
        { role: 'user', content: 'hello', timestamp: Date.now() },
        { role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    AIStore.state.abortController = null;

    AIService.stopStreaming();

    const lastMsg = conversation.messages[1];
    expect(lastMsg.isStreaming).toBe(false);
    // An empty stuck message is marked as cancelled instead of persisted blank
    expect(lastMsg.content).toBe('[Cancelled]');

    const saved = JSON.parse(localStorage.getItem('ai_conversations'));
    expect(saved[0].messages[1].content).toBe('[Cancelled]');
  });

  it('keeps existing content on a stuck message when no request is in flight', async () => {
    const conversation = {
      id: 'conv_stuck_content',
      title: 'StuckContent',
      messages: [
        { role: 'user', content: 'hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Partial thought', timestamp: Date.now(), isStreaming: true }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    AIStore.state.abortController = null;

    AIService.stopStreaming();

    const lastMsg = conversation.messages[1];
    expect(lastMsg.isStreaming).toBe(false);
    expect(lastMsg.content).toBe('Partial thought');
  });

  it('keeps partialContent as the finalized assistant message when a stream fails mid-answer (#843)', async () => {
    const conversation = {
      id: 'conv_partial_fail',
      title: 'PartialFail',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    let onChunkCallback = null;
    let resolveRequest = null;
    OpenRouterAPI.sendMessageStreaming = async (userMessage, history, onChunk) => {
      onChunkCallback = onChunk;
      return new Promise(resolve => {
        resolveRequest = resolve;
      });
    };

    const sendPromise = AIService.sendMessage('hello');
    await new Promise(resolve => setTimeout(resolve, 0));
    onChunkCallback('Partial answer');

    // A mid-stream timeout surfaces the already-streamed text via
    // partialContent instead of aborting the caller's signal
    resolveRequest({
      success: false,
      error: 'Network error occurred',
      partialContent: 'Partial answer'
    });
    await sendPromise;

    // Both messages must be kept, with the assistant message finalized
    expect(conversation.messages).toHaveLength(2);
    const lastMsg = conversation.messages[1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.isStreaming).toBe(false);
    expect(lastMsg.content).toBe('Partial answer');

    // The partial content must survive a reload from storage
    const saved = JSON.parse(localStorage.getItem('ai_conversations'));
    expect(saved[0].messages[1].content).toBe('Partial answer');
  });

  it('keeps the user prompt and drops only the empty assistant bubble when a failure delivers no partial content', async () => {
    // Run with web grounding off so the failure does not take the
    // ungrounded retry path (#739): this test checks only the
    // no-partial-content cleanup (#997).
    const originalIsWebGroundingEnabled = OpenRouterAPI.isWebGroundingEnabled;
    OpenRouterAPI.isWebGroundingEnabled = () => false;

    try {
      const conversation = {
        id: 'conv_fail_clean',
        title: 'FailClean',
        messages: [
          { role: 'user', content: 'previous', timestamp: Date.now() }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      AIStore.state.conversations = [conversation];
      AIStore.state.currentConversationId = conversation.id;

      OpenRouterAPI.sendMessageStreaming = async () => ({
        success: false,
        error: 'Network error occurred'
      });

      await AIService.sendMessage('hello');

      // No partial content: only the assistant bubble created for this
      // request is removed; both prompts stay for Regenerate.
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'previous' });
      expect(conversation.messages[1]).toMatchObject({ role: 'user', content: 'hello' });
    } finally {
      OpenRouterAPI.isWebGroundingEnabled = originalIsWebGroundingEnabled;
    }
  });

  it('keeps partial offline content when a new message starts right after stop', async () => {
    const conversation = {
      id: 'conv_offline_race',
      title: 'OfflineRace',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;

    // Flip the network detector into offline mode for this test
    window.dispatchEvent(new Event('offline'));
    expect(NetworkDetector.getStatus().isOffline).toBe(true);

    const fullResponse = OfflineMode.getResponse('hello').content;
    const secondFullResponse = OfflineMode.getResponse('again').content;

    try {
      const firstSend = AIService.sendMessage('hello');

      // Let the first simulated stream accumulate a few chunks
      await new Promise(resolve => setTimeout(resolve, 30));

      AIService.stopStreaming();

      // A new message starts before the first loop's next 5ms tick resolves.
      // It must not mask the first request's abort: the old loop must detect
      // its own signal, otherwise the full response gets persisted.
      const secondSend = AIService.sendMessage('again');

      await firstSend;
      await secondSend;

      const firstAssistant = conversation.messages[1];
      const secondAssistant = conversation.messages[3];

      // The stopped request keeps its partial content, not the full response
      expect(firstAssistant.isStreaming).toBe(false);
      expect(firstAssistant.content.length).toBeGreaterThan(0);
      expect(firstAssistant.content.length).toBeLessThan(fullResponse.length);

      // The newer request streams to completion untouched
      expect(secondAssistant.isStreaming).toBe(false);
      expect(secondAssistant.content).toBe(secondFullResponse);

      // The partial content must survive a reload from storage
      const saved = JSON.parse(localStorage.getItem('ai_conversations'));
      expect(saved[0].messages[1].content).toBe(firstAssistant.content);
      expect(saved[0].messages[3].content).toBe(secondFullResponse);
    } finally {
      // Restore online state for the remaining tests
      window.dispatchEvent(new Event('online'));
    }
  });

  it('renders the [Cancelled] marker in the DOM when nothing was streamed before stop', async () => {
    // Clear messages rendered by previous tests from the shared container
    document.querySelector('#ai-chat-container').innerHTML = '';

    const { sendPromise, getRequestSignal, resolveRequest } = startStreamingSend();

    await new Promise(resolve => setTimeout(resolve, 0));

    AIService.stopStreaming();
    expect(getRequestSignal().aborted).toBe(true);
    resolveRequest({ success: false, error: 'Request cancelled', aborted: true });
    await sendPromise;

    // The open conversation must show the marker, not a blank bubble
    const textNodes = document.querySelectorAll('#ai-chat-container .ai-message-text');
    expect(textNodes[textNodes.length - 1].textContent).toBe('[Cancelled]');
  });

  it('renders the [Cancelled] marker in the DOM when the request rejects with an AbortError before any chunk', async () => {
    // Clear messages rendered by previous tests from the shared container
    document.querySelector('#ai-chat-container').innerHTML = '';

    const { sendPromise, getRequestSignal, rejectRequest } = startStreamingSend();

    await new Promise(resolve => setTimeout(resolve, 0));

    AIService.stopStreaming();
    expect(getRequestSignal().aborted).toBe(true);
    rejectRequest(new DOMException('The operation was aborted.', 'AbortError'));
    await sendPromise;

    // The open conversation must show the marker, not a blank bubble
    const textNodes = document.querySelectorAll('#ai-chat-container .ai-message-text');
    expect(textNodes[textNodes.length - 1].textContent).toBe('[Cancelled]');
  });

  it('renders the [Cancelled] marker in the DOM for a stuck message when no request is in flight', async () => {
    const conversation = {
      id: 'conv_stuck_dom',
      title: 'StuckDom',
      messages: [
        { id: 'm_user', role: 'user', content: 'hello', timestamp: Date.now() },
        { id: 'm_assistant', role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    AIStore.state.abortController = null;

    // Clear messages rendered by previous tests from the shared container
    document.querySelector('#ai-chat-container').innerHTML = '';

    // Render the stuck conversation so the blank bubble exists in the DOM
    AIRenderer.renderMessages();

    AIService.stopStreaming();

    const textNodes = document.querySelectorAll('#ai-chat-container .ai-message-text');
    expect(textNodes[textNodes.length - 1].textContent).toBe('[Cancelled]');
  });
});

describe('Reopening AI chat mid-stream (#616)', () => {
  const reopenStartStreaming = () => {
    const conversation = {
      id: 'conv_reopen',
      title: 'Reopen',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    AIStore.state.isLoading = false;
    AIStore.state.isStreaming = false;
    AIStore.state.abortController = null;

    let onChunkCallback = null;
    let resolveRequest = null;
    OpenRouterAPI.sendMessageStreaming = async (userMessage, history, onChunk, signal) => {
      onChunkCallback = onChunk;
      return new Promise(resolve => {
        resolveRequest = resolve;
      });
    };

    document.querySelector('#ai-chat-container').innerHTML = '';
    const sendPromise = AIService.sendMessage('hello');

    return {
      conversation,
      sendPromise,
      getOnChunk: () => onChunkCallback,
      resolveRequest: value => resolveRequest(value)
    };
  };

  it('keeps streaming visible after closing and reopening the modal', async () => {
    const { conversation, sendPromise, getOnChunk, resolveRequest } = reopenStartStreaming();
    await new Promise(resolve => setTimeout(resolve, 0));

    // First chunk arrives while modal is open
    getOnChunk()('Hello ');
    await new Promise(resolve => setTimeout(resolve, 60));

    const texts = document.querySelectorAll('#ai-chat-container .ai-message-text');
    const textEl = texts[texts.length - 1];
    expect(textEl.textContent).toContain('Hello');

    // Simulate closing and reopening the modal mid-stream
    AIService.close();
    expect(document.getElementById('ai-chat-modal').classList.contains('ai-modal-open')).toBe(false);
    AIService.open();
    expect(document.getElementById('ai-chat-modal').classList.contains('ai-modal-open')).toBe(true);

    // The reopened bubble must show the partial content, not an empty streaming bubble
    const reopenedTexts = document.querySelectorAll('#ai-chat-container .ai-message-text');
    const reopenedText = reopenedTexts[reopenedTexts.length - 1];
    expect(reopenedText.textContent).toContain('Hello');
    expect(reopenedText.classList.contains('ai-message-streaming')).toBe(true);

    // Next chunk after reopen must update the *visible* bubble, not a detached one
    getOnChunk()('world');
    await new Promise(resolve => setTimeout(resolve, 60));

    const updatedTexts = document.querySelectorAll('#ai-chat-container .ai-message-text');
    const updatedText = updatedTexts[updatedTexts.length - 1];
    expect(updatedText.textContent).toContain('Hello');
    expect(updatedText.textContent).toContain('world');

    // Finalize
    resolveRequest({ success: true, content: 'Hello world', aborted: false });
    await sendPromise;

    const lastMsg = conversation.messages[1];
    expect(lastMsg.isStreaming).toBe(false);
    expect(lastMsg.content).toBe('Hello world');

    const finalTexts = document.querySelectorAll('#ai-chat-container .ai-message-text');
    const finalText = finalTexts[finalTexts.length - 1];
    expect(finalText.textContent).toBe('Hello world');
    expect(finalText.classList.contains('ai-message-streaming')).toBe(false);
  });

  it('recovers streaming bubble after a renderMessages rebuild (offline path)', async () => {
    // Use offline simulated streaming which splits fullResponse into char chunks
    window.dispatchEvent(new Event('offline'));
    expect(NetworkDetector.getStatus().isOffline).toBe(true);

    const conversation = {
      id: 'conv_reopen_offline',
      title: 'ReopenOffline',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    document.querySelector('#ai-chat-container').innerHTML = '';

    try {
      const sendPromise = AIService.sendMessage('hello');
      await new Promise(resolve => setTimeout(resolve, 30));

      // Mid-stream, force a full rebuild as openModal does (load + render)
      AIRenderer.renderMessages();
      const midTexts = document.querySelectorAll('#ai-chat-container .ai-message-text');
      const midText = midTexts[midTexts.length - 1];
      // Should not be an empty streaming bubble
      expect(midText.textContent.length).toBeGreaterThan(0);
      expect(midText.classList.contains('ai-message-streaming')).toBe(true);

      await sendPromise;

      const assistant = conversation.messages[1];
      expect(assistant.isStreaming).toBe(false);
      expect(assistant.content.length).toBeGreaterThan(0);
      const finalTexts = document.querySelectorAll('#ai-chat-container .ai-message-text');
      expect(finalTexts[finalTexts.length - 1].textContent).toBe(assistant.content);
    } finally {
      window.dispatchEvent(new Event('online'));
    }
  });
});
describe('AIService error path targets correct conversation (#617)', () => {
  // These tests drive one pending request at a time. With web grounding on,
  // a failed pre-stream request is retried ungrounded (#739), and that retry
  // would wait on a promise these mocks never settle. Grounding fallback has
  // its own coverage below, so run these with grounding off.
  let originalIsWebGroundingEnabled;
  beforeEach(() => {
    originalIsWebGroundingEnabled = OpenRouterAPI.isWebGroundingEnabled;
    OpenRouterAPI.isWebGroundingEnabled = () => false;
  });
  afterEach(() => {
    OpenRouterAPI.isWebGroundingEnabled = originalIsWebGroundingEnabled;
  });

  it('removes only the failed assistant bubble from the original conversation after switching mid-request', async () => {
    const convA = {
      id: 'conv_A',
      title: 'A',
      messages: [{ id: 'a0', role: 'user', content: 'before', timestamp: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const convB = {
      id: 'conv_B',
      title: 'B',
      messages: [{ id: 'b0', role: 'user', content: 'other convo', timestamp: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [convA, convB];
    AIStore.state.currentConversationId = convA.id;
    let resolveRequest;
    OpenRouterAPI.sendMessageStreaming = () => new Promise(resolve => { resolveRequest = resolve; });
    const sendPromise = AIService.sendMessage('hello in A');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(convA.messages.length).toBe(3);
    const failedUserId = convA.messages[1].id;
    const failedAssistantId = convA.messages[2].id;
    AIStore.switchConversation(convB.id);
    expect(AIStore.getCurrentConversation().id).toBe(convB.id);
    expect(convB.messages.length).toBe(1);
    resolveRequest({ success: false, error: 'mock API error' });
    await sendPromise;
    // Only the failed assistant bubble is removed: its prompt stays for
    // Regenerate (#997), and the other conversation is untouched.
    expect(convA.messages.length).toBe(2);
    expect(convA.messages[0].id).toBe('a0');
    expect(convA.messages[1].id).toBe(failedUserId);
    expect(convA.messages.some(m => m.id === failedAssistantId)).toBe(false);
    expect(convB.messages.length).toBe(1);
    expect(convB.messages[0].id).toBe('b0');
  });
  it('does not delete the new message when a second request starts before the first fails', async () => {
    const conversation = {
      id: 'conv_race',
      title: 'Race',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    const resolvers = [];
    OpenRouterAPI.sendMessageStreaming = () => new Promise(resolve => { resolvers.push(resolve); });
    const firstSend = AIService.sendMessage('first');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(conversation.messages.length).toBe(2);
    const firstUserId = conversation.messages[0].id;
    const firstAssistantId = conversation.messages[1].id;
    AIService.stopStreaming();
    expect(AIStore.state.isLoading).toBe(false);
    const secondSend = AIService.sendMessage('second');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(conversation.messages.length).toBe(4);
    const secondUserId = conversation.messages[2].id;
    const secondAssistantId = conversation.messages[3].id;
    resolvers[0]({ success: false, error: 'first failed' });
    await firstSend;
    // Only the first assistant bubble is dropped: the first prompt and the
    // whole second exchange survive (#997).
    expect(conversation.messages.length).toBe(3);
    expect(conversation.messages[0].id).toBe(firstUserId);
    expect(conversation.messages[1].id).toBe(secondUserId);
    expect(conversation.messages[2].id).toBe(secondAssistantId);
    expect(conversation.messages.some(m => m.id === firstAssistantId)).toBe(false);
    resolvers[1]({ success: true, content: 'ok' });
    await secondSend;
    expect(conversation.messages.length).toBe(3);
  });
  it('catch-block also removes only the failed assistant bubble from the original conversation after switch', async () => {
    const convA = {
      id: 'conv_A2',
      title: 'A2',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const convB = {
      id: 'conv_B2',
      title: 'B2',
      messages: [{ id: 'b0', role: 'user', content: 'keep me', timestamp: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [convA, convB];
    AIStore.state.currentConversationId = convA.id;
    let rejectRequest;
    OpenRouterAPI.sendMessageStreaming = () => new Promise((_, reject) => { rejectRequest = reject; });
    const sendPromise = AIService.sendMessage('will throw');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(convA.messages.length).toBe(2);
    const failedUserId = convA.messages[0].id;
    const failedAssistantId = convA.messages[1].id;
    AIStore.switchConversation(convB.id);
    rejectRequest(new Error('boom'));
    await sendPromise;
    // The prompt the user sent stays in convA; only the assistant bubble is
    // cleaned up (#997).
    expect(convA.messages.length).toBe(1);
    expect(convA.messages[0].id).toBe(failedUserId);
    expect(convA.messages.some(m => m.id === failedAssistantId)).toBe(false);
    expect(convB.messages.length).toBe(1);
  });
});


describe('AIService web grounding fallback (#707)', () => {
  it('falls back to an ungrounded answer when web search fails before streaming', async () => {
    const conv = {
      id: 'conv_grounding',
      title: 'Grounding',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conv];
    AIStore.state.currentConversationId = conv.id;

    OpenRouterAPI.sendMessageStreaming = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'web search unavailable' })
      .mockResolvedValueOnce({ success: true, content: 'Fallback answer' });

    await AIService.sendMessage('What happened today?');

    expect(OpenRouterAPI.sendMessageStreaming).toHaveBeenCalledTimes(2);
    expect(OpenRouterAPI.sendMessageStreaming.mock.calls[0][4]).toEqual({ grounding: true });
    expect(OpenRouterAPI.sendMessageStreaming.mock.calls[1][4]).toEqual({ grounding: false });

    const conversation = AIStore.getCurrentConversation();
    expect(conversation.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Fallback answer',
      grounded: false,
      isStreaming: false
    });

    expect(document.getElementById('ai-chat-error').textContent)
      .toContain('Web search is unavailable');
  });

  it('clears the grounded state when the proxy reports grounding unavailable', async () => {
    const conv = {
      id: 'conv_grounding_unavailable',
      title: 'Grounding unavailable',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conv];
    AIStore.state.currentConversationId = conv.id;
    document.getElementById('ai-chat-error').textContent = '';

    OpenRouterAPI.sendMessageStreaming = vi.fn().mockResolvedValueOnce({
      success: true,
      content: 'Ungrounded answer',
      grounding: 'unavailable'
    });

    await AIService.sendMessage('What happened today?');

    expect(OpenRouterAPI.sendMessageStreaming).toHaveBeenCalledTimes(1);
    expect(OpenRouterAPI.sendMessageStreaming.mock.calls[0][4]).toEqual({ grounding: true });

    const conversation = AIStore.getCurrentConversation();
    expect(conversation.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Ungrounded answer',
      grounded: false,
      isStreaming: false
    });

    expect(document.getElementById('ai-chat-error').textContent)
      .toContain('Web search is unavailable');
  });
});

describe('Offline chat Object.prototype key inputs (#864)', () => {
  const seedConversation = () => {
    const conversation = {
      id: 'conv_proto_keys',
      title: 'ProtoKeys',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    document.getElementById('ai-chat-error').style.display = 'none';
    return conversation;
  };

  it('streams the fallback reply without deleting the sent message', async () => {
    const conversation = seedConversation();

    window.dispatchEvent(new Event('offline'));
    expect(NetworkDetector.getStatus().isOffline).toBe(true);

    try {
      await AIService.sendMessage('constructor');

      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'constructor' });
      const assistant = conversation.messages[1];
      expect(assistant.role).toBe('assistant');
      expect(assistant.isStreaming).toBe(false);
      expect(typeof assistant.content).toBe('string');
      expect(assistant.content).toContain('couldn\'t process');
      expect(document.getElementById('ai-chat-error').style.display).not.toBe('block');
    } finally {
      window.dispatchEvent(new Event('online'));
    }
  });

  it('keeps the sent message when a malformed offline reply cannot render', async () => {
    const conversation = seedConversation();

    window.dispatchEvent(new Event('offline'));
    expect(NetworkDetector.getStatus().isOffline).toBe(true);
    const originalGetResponse = OfflineMode.getResponse;
    OfflineMode.getResponse = () => ({ success: true, content: {} });

    try {
      await AIService.sendMessage('constructor');

      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'constructor' });
      const assistant = conversation.messages[1];
      expect(assistant.role).toBe('assistant');
      expect(assistant.isStreaming).toBe(false);
      expect(typeof assistant.content).toBe('string');
      expect(assistant.content.trim().length).toBeGreaterThan(0);
      expect(document.getElementById('ai-chat-error').style.display).not.toBe('block');
    } finally {
      OfflineMode.getResponse = originalGetResponse;
      window.dispatchEvent(new Event('online'));
    }
  });
});

describe('AIService regenerate (#997)', () => {
  // Run with web grounding off by default so a failed request fails in a
  // single shot instead of taking the ungrounded retry path (#739).
  let originalIsWebGroundingEnabled;
  beforeEach(() => {
    originalIsWebGroundingEnabled = OpenRouterAPI.isWebGroundingEnabled;
    OpenRouterAPI.isWebGroundingEnabled = () => false;
  });
  afterEach(() => {
    OpenRouterAPI.isWebGroundingEnabled = originalIsWebGroundingEnabled;
  });

  const seedRegenerateConversation = (messages) => {
    const conversation = {
      id: 'conv_regen',
      title: 'Regen',
      messages,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    document.getElementById('ai-chat-error').style.display = 'none';
    document.querySelector('#ai-chat-container').innerHTML = '';
    return conversation;
  };

  it('keeps the user prompt after a failed request instead of deleting the pair', async () => {
    const conversation = seedRegenerateConversation([]);

    await AIService.sendMessage('What is 2+2?');

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'What is 2+2?' });
    expect(document.getElementById('ai-chat-error').textContent).toBe('mock API error');
  });

  it('re-sends the dangling prompt after a failure without duplicating it', async () => {
    const conversation = seedRegenerateConversation([]);

    await AIService.sendMessage('What is 2+2?');
    expect(conversation.messages).toHaveLength(1);

    const apiCall = vi.fn().mockResolvedValue({ success: true, content: '4' });
    OpenRouterAPI.sendMessageStreaming = apiCall;

    const started = await AIService.regenerate();
    expect(started).toBe(true);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall.mock.calls[0][0]).toBe('What is 2+2?');

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages.filter(m => m.role === 'user')).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({ role: 'user', content: 'What is 2+2?' });
    expect(conversation.messages[1]).toMatchObject({ role: 'assistant', content: '4', isStreaming: false });
  });

  it('replaces the last assistant response instead of appending a duplicate exchange', async () => {
    const conversation = seedRegenerateConversation([
      { id: 'u1', role: 'user', content: 'Original prompt', timestamp: Date.now() },
      { id: 'a1', role: 'assistant', content: 'Old answer', timestamp: Date.now(), isStreaming: false }
    ]);
    const apiCall = vi.fn().mockResolvedValue({ success: true, content: 'New answer' });
    OpenRouterAPI.sendMessageStreaming = apiCall;

    expect(await AIService.regenerate()).toBe(true);

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall.mock.calls[0][0]).toBe('Original prompt');
    // The prompt itself must not be sent back as history
    expect(apiCall.mock.calls[0][1]).toEqual([]);

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0].id).toBe('u1');
    expect(conversation.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'New answer',
      isStreaming: false
    });
    expect(conversation.messages[1].id).not.toBe('a1');
  });

  it('restores the previous answer when the regeneration fails', async () => {
    const conversation = seedRegenerateConversation([
      { id: 'u1', role: 'user', content: 'Prompt', timestamp: Date.now() },
      { id: 'a1', role: 'assistant', content: 'Old answer', timestamp: Date.now(), isStreaming: false }
    ]);
    const apiCall = vi.fn().mockResolvedValue({ success: false, error: 'mock API error' });
    OpenRouterAPI.sendMessageStreaming = apiCall;

    expect(await AIService.regenerate()).toBe(true);

    expect(apiCall).toHaveBeenCalledTimes(1);
    // The replaced answer survives the failed request: only the empty bubble
    // the retry created was removed, then the original came back.
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0].id).toBe('u1');
    expect(conversation.messages[1]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'Old answer',
      isStreaming: false
    });
    expect(document.getElementById('ai-chat-error').textContent).toBe('mock API error');
  });

  it('re-sends through the sendMessage pipeline with the current grounding setting', async () => {
    try {
      OpenRouterAPI.isWebGroundingEnabled = () => true;
      seedRegenerateConversation([
        { id: 'u1', role: 'user', content: 'Prompt', timestamp: Date.now() },
        { id: 'a1', role: 'assistant', content: 'Answer', timestamp: Date.now(), isStreaming: false }
      ]);
      const groundedCall = vi.fn().mockResolvedValue({ success: true, content: 'A' });
      OpenRouterAPI.sendMessageStreaming = groundedCall;
      await AIService.regenerate();
      expect(groundedCall).toHaveBeenCalledTimes(1);
      expect(groundedCall.mock.calls[0][4]).toEqual({ grounding: true });

      OpenRouterAPI.isWebGroundingEnabled = () => false;
      const plainCall = vi.fn().mockResolvedValue({ success: true, content: 'B' });
      OpenRouterAPI.sendMessageStreaming = plainCall;
      await AIService.regenerate();
      expect(plainCall).toHaveBeenCalledTimes(1);
      expect(plainCall.mock.calls[0][4]).toEqual({ grounding: false });
    } finally {
      OpenRouterAPI.isWebGroundingEnabled = originalIsWebGroundingEnabled;
    }
  });

  it('does nothing while a request is in progress', async () => {
    const conversation = seedRegenerateConversation([
      { id: 'u1', role: 'user', content: 'Prompt', timestamp: Date.now() }
    ]);
    AIStore.state.isLoading = true;
    const apiCall = vi.fn();
    OpenRouterAPI.sendMessageStreaming = apiCall;

    expect(await AIService.regenerate()).toBe(false);
    expect(apiCall).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(1);
  });

  it('returns false when there is nothing to regenerate', async () => {
    const conversation = seedRegenerateConversation([]);
    const apiCall = vi.fn();
    OpenRouterAPI.sendMessageStreaming = apiCall;

    expect(await AIService.regenerate()).toBe(false);
    expect(apiCall).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(0);
  });

  it('bails out of reuse mode when the prompt is not the last stored message', async () => {
    const conversation = seedRegenerateConversation([
      { id: 'u1', role: 'user', content: 'Prompt', timestamp: Date.now() }
    ]);
    const apiCall = vi.fn();
    OpenRouterAPI.sendMessageStreaming = apiCall;

    await AIService.sendMessage('Something else', { reuseExistingUserMessage: true });

    expect(apiCall).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(1);
  });

  it('renders a Regenerate button after the last message and re-sends on click', async () => {
    const conversation = seedRegenerateConversation([
      { id: 'u1', role: 'user', content: 'Prompt', timestamp: Date.now() },
      { id: 'a1', role: 'assistant', content: 'Answer', timestamp: Date.now(), isStreaming: false }
    ]);
    const container = document.getElementById('ai-chat-container');
    AIRenderer.renderMessages();

    const button = container.querySelector('.ai-regenerate');
    expect(button).not.toBeNull();
    expect(button).toBe(container.lastElementChild);
    expect(button.type).toBe('button');
    expect(button.title).toBe('Regenerate');
    expect(button.getAttribute('aria-label')).toBe('Regenerate');
    expect(container.querySelector('.ai-message')).not.toBeNull();

    const apiCall = vi.fn().mockResolvedValue({ success: true, content: 'Fresh answer' });
    OpenRouterAPI.sendMessageStreaming = apiCall;

    button.click();
    await vi.waitFor(() => {
      expect(conversation.messages.at(-1)).toMatchObject({
        role: 'assistant',
        content: 'Fresh answer'
      });
    });

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(conversation.messages.filter(m => m.role === 'user')).toHaveLength(1);
    expect(container.querySelector('.ai-regenerate')).not.toBeNull();
    expect(container.lastElementChild.classList.contains('ai-regenerate')).toBe(true);
  });

  it('hides the Regenerate button when no message can be re-sent', () => {
    seedRegenerateConversation([
      { id: 'a1', role: 'assistant', content: 'Answer', timestamp: Date.now(), isStreaming: false }
    ]);
    const container = document.getElementById('ai-chat-container');
    AIRenderer.renderMessages();

    expect(container.querySelector('.ai-regenerate')).toBeNull();
  });

  it('hides the Regenerate button while a request is in flight', async () => {
    seedRegenerateConversation([
      { id: 'u1', role: 'user', content: 'Prompt', timestamp: Date.now() },
      { id: 'a1', role: 'assistant', content: 'Answer', timestamp: Date.now(), isStreaming: false }
    ]);
    const container = document.getElementById('ai-chat-container');
    AIRenderer.renderMessages();
    expect(container.querySelector('.ai-regenerate')).not.toBeNull();

    let resolveRequest;
    OpenRouterAPI.sendMessageStreaming = () => new Promise(resolve => { resolveRequest = resolve; });
    const sendPromise = AIService.sendMessage('Follow-up');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.querySelector('.ai-regenerate')).toBeNull();

    resolveRequest({ success: true, content: 'Done' });
    await sendPromise;
    expect(container.querySelector('.ai-regenerate')).not.toBeNull();
  });
});

describe('AI chat multi-line composer (#1047)', () => {
  let input;
  let conversation;

  const pressEnter = (init = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...init
    });
    input.dispatchEvent(event);
    return event;
  };

  const mockScrollHeight = (value) => {
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      get: () => value
    });
  };

  beforeEach(() => {
    input = document.getElementById('ai-chat-input');
    input.value = '';
    input.style.height = '';
    delete input.scrollHeight;

    conversation = {
      id: 'conv-composer',
      title: 'Composer',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
  });

  afterEach(() => {
    input.style.height = '';
    delete input.scrollHeight;
  });

  it('sends on Enter, prevents the default, and preserves newlines', () => {
    input.value = 'function demo() {\n  return true;\n}';
    OpenRouterAPI.sendMessageStreaming = async () => ({ success: false, error: 'mock API error' });

    const event = pressEnter();

    expect(event.defaultPrevented).toBe(true);
    expect(conversation.messages[0]).toMatchObject({
      role: 'user',
      content: 'function demo() {\n  return true;\n}'
    });
    expect(input.value).toBe('');
  });

  it('does not send on Shift+Enter and leaves the newline to the browser', () => {
    input.value = 'line one';

    const event = pressEnter({ shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(conversation.messages).toHaveLength(0);
    expect(input.value).toBe('line one');
  });

  it('does not send Enter while an IME composition is active', () => {
    input.value = 'composition';

    const event = pressEnter({ isComposing: true });

    expect(event.defaultPrevented).toBe(false);
    expect(conversation.messages).toHaveLength(0);
    expect(input.value).toBe('composition');
  });

  it('auto-grows the composer on input events', () => {
    mockScrollHeight(98);
    input.value = 'three\nlines\nhere';

    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input.style.height).toBe('100px');
  });

  it('collapses the composer after a send clears it', () => {
    mockScrollHeight(150);
    input.value = 'many\nlines\nhere';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.style.height).toBe('152px');

    // jsdom has no layout: the empty composer reports a one-line height again.
    mockScrollHeight(40);
    OpenRouterAPI.sendMessageStreaming = async () => ({ success: false, error: 'mock API error' });
    pressEnter();

    expect(input.value).toBe('');
    expect(input.style.height).toBe('42px');
  });
});
