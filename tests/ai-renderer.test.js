import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const stubElement = (id, tag = 'div') => {
  const el = document.createElement(tag);
  el.id = id;
  document.body.appendChild(el);
  return el;
};

const stubElements = () => {
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
  stubElement('ai-topics-list');
  stubElement('ai-topics-search-input', 'input');
  stubElement('ai-topics-count');
  stubElement('ai-confirm-dialog');
  stubElement('ai-scroll-to-bottom', 'button');
};

beforeAll(() => {
  stubElements();
  injectScript('src/ai/ai-store.js');
  injectScript('src/ai/ai-renderer.js');
});

beforeEach(() => {
  document.getElementById('ai-topics-list').replaceChildren();
  document.querySelectorAll('.ai-topic-tooltip').forEach(tooltip => tooltip.remove());

  AIStore.state.conversations = [
    {
      id: 'conv-1',
      title: 'First topic',
      messages: [{ role: 'user', content: 'hello' }],
      createdAt: 1000,
      updatedAt: 1000
    },
    {
      id: 'conv-2',
      title: 'Second topic',
      messages: [{ role: 'assistant', content: 'answer' }],
      createdAt: 2000,
      updatedAt: 2000
    }
  ];
  AIStore.state.currentConversationId = 'conv-1';
  AIStore.state.searchQuery = '';
  AIStore.state.keyboardSelectedIndex = -1;
  AIStore.state.hoveredDeleteBtn = null;
  AIStore.state.hoveredDeleteTooltip = null;
});

describe('AIRenderer.renderTopicsList', () => {
  it('skips DOM replacement when filtered conversations have not changed', () => {
    const list = document.getElementById('ai-topics-list');
    const replaceSpy = vi.spyOn(list, 'replaceChildren');

    AIRenderer.renderTopicsList();
    const firstItem = list.querySelector('.ai-topic-item');

    AIRenderer.renderTopicsList();

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(list.querySelector('.ai-topic-item')).toBe(firstItem);
  });

  it('uses delegated topic select and delete handlers after a skipped render', () => {
    const onSelectConversation = vi.fn();
    const onDeleteConversation = vi.fn();
    const onRequestDeleteConfirm = vi.fn(callback => callback());

    AIRenderer.renderTopicsList({
      onSelectConversation,
      onDeleteConversation,
      onRequestDeleteConfirm
    });
    AIRenderer.renderTopicsList({
      onSelectConversation,
      onDeleteConversation,
      onRequestDeleteConfirm
    });

    document.querySelector('[data-id="conv-2"]').click();
    document.querySelector('.ai-topic-delete[data-id="conv-2"]').click();

    expect(onSelectConversation).toHaveBeenCalledWith('conv-2');
    expect(onRequestDeleteConfirm).toHaveBeenCalledTimes(1);
    expect(onDeleteConversation).toHaveBeenCalledWith('conv-2');
  });
});

describe('AIRenderer.renderMessages', () => {
  it('escapes message id so it cannot inject markup into the attribute', () => {
    const maliciousId = 'x" onload="alert(1)" data-x="y';
    AIStore.state.conversations = [
      {
        id: 'conv-1',
        title: 'Topic',
        messages: [{ role: 'user', content: 'hi', id: maliciousId }],
        createdAt: 1000,
        updatedAt: 1000
      }
    ];
    AIStore.state.currentConversationId = 'conv-1';

    AIRenderer.renderMessages();

    const el = document.querySelector('.ai-message');
    expect(el.dataset.messageId).toBe(maliciousId);
  });
});
