import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const stubElement = (id, tag = 'div') => {
  const el = document.createElement(tag);
  el.id = id;
  document.body.appendChild(el);
  return el;
};

beforeAll(() => {
  // DOM stubs required by AIRenderer / AIService initialization
  stubElement('ai-chat-modal');
  const container = stubElement('ai-chat-container');
  container.scrollTo = () => {};
  stubElement('ai-chat-input', 'textarea');
  stubElement('ai-chat-send', 'button');
  stubElement('ai-chat-stop', 'button');
  stubElement('ai-chat-loading');
  stubElement('ai-chat-error');
  stubElement('ai-chat-title');
  stubElement('ai-new-chat-btn', 'button');
  stubElement('ai-export-all-btn', 'button');
  stubElement('ai-topics-list');
  stubElement('ai-topics-search-input', 'input');
  stubElement('ai-topics-count');
  stubElement('ai-confirm-dialog');
  stubElement('ai-scroll-to-bottom', 'button');

  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    get: () => true
  });
  globalThis.confirm = () => false;
  globalThis.alert = () => {};
  // jsdom does not implement scrollIntoView (used when a topic row is
  // keyboard-selected during render)
  Element.prototype.scrollIntoView = () => {};
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

// jsdom lacks Blob URL support for downloads; swap in recording fakes around
// every test so AIService's download path can be exercised end to end.
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let objectUrls;

beforeEach(() => {
  localStorage.clear();
  AIStore.state.conversations = [];
  AIStore.state.currentConversationId = null;
  AIStore.state.searchQuery = '';
  AIStore.state.keyboardSelectedIndex = -1;
  document.querySelectorAll('.toast-notification').forEach(el => el.remove());

  objectUrls = [];
  URL.createObjectURL = blob => {
    objectUrls.push(blob);
    return 'blob:mock-' + objectUrls.length;
  };
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  document.getElementById('ai-topics-list').replaceChildren();
  document.querySelectorAll('.ai-topic-tooltip').forEach(tooltip => tooltip.remove());
});

function seedConversations() {
  AIStore.state.conversations = [{
    id: 'conv-1',
    title: 'Trip planning',
    messages: [
      { role: 'user', content: 'What should I pack?', timestamp: new Date(2026, 0, 15, 9, 30).getTime() },
      { role: 'assistant', content: '**Pack light:**\n\n- One jacket\n- Two shirts', timestamp: new Date(2026, 0, 15, 9, 31).getTime() }
    ],
    createdAt: 1,
    updatedAt: 2
  }, {
    id: 'conv-2',
    title: 'Second topic',
    messages: [{ role: 'user', content: 'Hello', timestamp: 5 }],
    createdAt: 3,
    updatedAt: 4
  }];
  AIStore.state.currentConversationId = 'conv-1';
}

describe('AIStore conversation Markdown serialization (#647)', () => {
  it('renders the title as an h1 and each message with a bold role label and locale timestamp', () => {
    seedConversations();

    const markdown = AIStore.exportConversation('conv-1').content;
    const lines = markdown.split('\n');

    expect(lines[0]).toBe('# Trip planning');
    expect(markdown).toContain('**You** _(' + new Date(new Date(2026, 0, 15, 9, 30).getTime()).toLocaleString() + ')_');
    expect(markdown).toContain('**Assistant** _(' + new Date(new Date(2026, 0, 15, 9, 31).getTime()).toLocaleString() + ')_');
    // Raw message content is preserved verbatim (assistant output is already Markdown)
    expect(markdown).toContain('**Pack light:**\n\n- One jacket\n- Two shirts');
    // Exactly one bold role-label header per message (the assistant body also
    // contains a **-prefixed line, so match the label + timestamp shape)
    expect(lines.filter(line => /^\*\*(?:You|Assistant)\*\*/.test(line))).toHaveLength(2);
  });

  it('omits the parenthesized timestamp when a message has none', () => {
    seedConversations();
    AIStore.state.conversations[0].messages[0].timestamp = undefined;

    const markdown = AIStore.exportConversation('conv-1').content;

    expect(markdown).toContain('**You**\n\nWhat should I pack?');
  });

  it('derives a sanitized filename from the title and today\'s ISO date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 24, 12, 0));

    try {
      seedConversations();
      // Filename-illegal characters and control characters are stripped;
      // interior spaces and hyphens stay readable
      AIStore.state.conversations[0].title = 'Ideas: "quotes"/back\\slash*?<>|';

      const exported = AIStore.exportConversation('conv-1');

      expect(exported.filename).toBe('Ideas quotesbackslash-2026-08-24.md');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a generic name when the title has no usable characters', () => {
    seedConversations();
    AIStore.state.conversations[0].title = '???';

    expect(AIStore.exportConversation('conv-1').filename).toMatch(/^conversation-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('returns null for an unknown conversation id', () => {
    seedConversations();

    expect(AIStore.exportConversation('does-not-exist')).toBeNull();
  });

  it('joins all conversations with a horizontal rule separator for export-all', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 24, 12, 0));

    try {
      seedConversations();

      const exported = AIStore.exportAllConversations();

      expect(exported.filename).toBe('ai-conversations-2026-08-24.md');
      expect(exported.content).toContain('# Trip planning');
      expect(exported.content).toContain('# Second topic');
      expect(exported.content).toContain('\n---\n\n# Second topic');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when there is nothing to export', () => {
    expect(AIStore.exportAllConversations()).toBeNull();
  });
});

describe('AIRenderer topic export affordance (#647)', () => {
  it('renders an export button before the delete button in every topic row', () => {
    seedConversations();
    AIRenderer.renderTopicsList();

    const items = document.querySelectorAll('#ai-topics-list .ai-topic-item');
    expect(items).toHaveLength(2);

    items.forEach(item => {
      const children = Array.from(item.children);
      const exportIndex = children.findIndex(el => el.classList.contains('ai-topic-export'));
      const deleteIndex = children.findIndex(el => el.classList.contains('ai-topic-delete'));
      expect(exportIndex).toBeGreaterThan(-1);
      expect(deleteIndex).toBeGreaterThan(exportIndex);
      expect(children[exportIndex].dataset.id).toBe(item.dataset.id);
    });
  });

  it('invokes the export callback without opening the conversation when clicked', () => {
    seedConversations();
    const onSelectConversation = vi.fn();
    const onExportConversation = vi.fn();
    AIRenderer.renderTopicsList({ onSelectConversation, onExportConversation });

    const button = document.querySelector('#ai-topics-list .ai-topic-export[data-id="conv-2"]');
    button.click();

    expect(onExportConversation).toHaveBeenCalledWith('conv-2');
    expect(onSelectConversation).not.toHaveBeenCalled();
  });
});

describe('AIService export flow (#647)', () => {
  function lastToast() {
    return document.querySelector('.toast-notification')?.textContent || '';
  }

  it('downloads a .md file and shows a success toast when exporting via the row button', () => {
    seedConversations();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    try {
      AIRenderer.renderTopicsList({
        onSelectConversation: () => {},
        onDeleteConversation: () => {},
        onExportConversation: id => AIService.exportConversation(id)
      });

      document.querySelector('#ai-topics-list .ai-topic-export[data-id="conv-1"]').click();

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(objectUrls[0]).toBeInstanceOf(Blob);
      expect(lastToast()).toBe('aiExportSuccess');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('exports the keyboard-selected conversation with the E shortcut', async () => {
    seedConversations();
    AIStore.setKeyboardSelectedIndex(1);
    AIRenderer.renderTopicsList();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    try {
      const event = new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true });
      document.getElementById('ai-topics-list').dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(objectUrls[0]).toBeInstanceOf(Blob);
      // The second conversation was exported, not the first
      const exportedContent = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(objectUrls[0]);
      });
      expect(exportedContent).toContain('# Second topic');
      expect(lastToast()).toBe('aiExportSuccess');
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('shows an error toast when there is nothing to export', () => {
    AIStore.state.conversations = [];

    AIService.exportAllConversations();

    expect(objectUrls).toHaveLength(0);
    expect(lastToast()).toBe('aiExportError');
  });
});
