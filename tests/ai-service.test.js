import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
