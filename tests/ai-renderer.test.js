import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
  injectScript('src/core/toast.js');
  injectScript('src/ai/conversation-validator.js');
  injectScript('src/ai/ai-store.js');
  injectScript('src/ai/markdown-parser.js');
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


describe('AIRenderer conversation rename affordance (#1014)', () => {
  const renderWithCallbacks = (callbacks = {}) => {
    AIRenderer.renderTopicsList(callbacks);
  };

  it('renders a rename button before the export and delete buttons', () => {
    renderWithCallbacks();

    const items = document.querySelectorAll('#ai-topics-list .ai-topic-item');
    expect(items).toHaveLength(2);

    items.forEach(item => {
      const children = Array.from(item.children);
      const renameIndex = children.findIndex(el => el.classList.contains('ai-topic-rename'));
      const exportIndex = children.findIndex(el => el.classList.contains('ai-topic-export'));
      const deleteIndex = children.findIndex(el => el.classList.contains('ai-topic-delete'));
      expect(renameIndex).toBeGreaterThan(-1);
      expect(renameIndex).toBeLessThan(exportIndex);
      expect(deleteIndex).toBeGreaterThan(exportIndex);
      expect(children[renameIndex].dataset.id).toBe(item.dataset.id);
    });
  });

  it('opens an inline editor with the current title and renames on Enter', () => {
    const onSelectConversation = vi.fn();
    const onRenameConversation = vi.fn();
    renderWithCallbacks({ onSelectConversation, onRenameConversation });

    document.querySelector('.ai-topic-rename[data-id="conv-2"]').click();

    const input = document.querySelector('.ai-topic-rename-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Second topic');
    expect(input.maxLength).toBe(AIStore.MAX_TITLE_LENGTH);
    expect(onSelectConversation).not.toHaveBeenCalled();

    input.value = '  Renamed topic  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(onRenameConversation).toHaveBeenCalledWith('conv-2', 'Renamed topic');
    expect(onSelectConversation).not.toHaveBeenCalled();
    expect(document.querySelector('.ai-topic-rename-input')).toBeNull();
    expect(document.querySelector('.ai-topic-item[data-id="conv-2"] .ai-topic-title').textContent)
      .toBe('Renamed topic');
  });

  it('restores the original title on Escape without renaming', () => {
    const onSelectConversation = vi.fn();
    const onRenameConversation = vi.fn();
    renderWithCallbacks({ onSelectConversation, onRenameConversation });

    document.querySelector('.ai-topic-rename[data-id="conv-1"]').click();
    const input = document.querySelector('.ai-topic-rename-input');
    input.value = 'Discarded name';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(onRenameConversation).not.toHaveBeenCalled();
    expect(document.querySelector('.ai-topic-rename-input')).toBeNull();
    expect(document.querySelector('.ai-topic-item[data-id="conv-1"] .ai-topic-title').textContent)
      .toBe('First topic');
    expect(onSelectConversation).not.toHaveBeenCalled();
  });

  it('drops empty and whitespace-only names instead of renaming', () => {
    const onRenameConversation = vi.fn();
    renderWithCallbacks({ onRenameConversation });

    document.querySelector('.ai-topic-rename[data-id="conv-1"]').click();
    const input = document.querySelector('.ai-topic-rename-input');
    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(onRenameConversation).not.toHaveBeenCalled();
    expect(document.querySelector('.ai-topic-rename-input')).toBeNull();
    expect(document.querySelector('.ai-topic-item[data-id="conv-1"] .ai-topic-title').textContent)
      .toBe('First topic');
  });

  it('does not select the conversation for clicks inside the name editor', () => {
    const onSelectConversation = vi.fn();
    const onRenameConversation = vi.fn();
    renderWithCallbacks({ onSelectConversation, onRenameConversation });

    document.querySelector('.ai-topic-rename[data-id="conv-2"]').click();
    document.querySelector('.ai-topic-rename-input').click();

    expect(onSelectConversation).not.toHaveBeenCalled();
    expect(onRenameConversation).not.toHaveBeenCalled();
  });

  it('does not submit the rename for Enter pressed during IME composition', () => {
    const onRenameConversation = vi.fn();
    renderWithCallbacks({ onRenameConversation });

    document.querySelector('.ai-topic-rename[data-id="conv-1"]').click();
    const input = document.querySelector('.ai-topic-rename-input');
    input.value = 'Composing candidate';
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true
    }));

    expect(onRenameConversation).not.toHaveBeenCalled();
    expect(document.querySelector('.ai-topic-rename-input')).not.toBeNull();
  });

  it('defers the blur commit until the current task finishes', async () => {
    const onRenameConversation = vi.fn();
    renderWithCallbacks({ onRenameConversation });

    document.querySelector('.ai-topic-rename[data-id="conv-1"]').click();
    const input = document.querySelector('.ai-topic-rename-input');
    input.value = 'Renamed on blur';
    input.dispatchEvent(new Event('blur'));

    expect(document.querySelector('.ai-topic-rename-input')).not.toBeNull();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onRenameConversation).toHaveBeenCalledWith('conv-1', 'Renamed on blur');
    expect(document.querySelector('.ai-topic-rename-input')).toBeNull();
    expect(document.querySelector('.ai-topic-item[data-id="conv-1"] .ai-topic-title').textContent)
      .toBe('Renamed on blur');
  });

  it('refreshes the topic action labels after a language change', () => {
    renderWithCallbacks();

    document.querySelector('.ai-topic-rename[data-id="conv-1"]').click();
    const input = document.querySelector('.ai-topic-rename-input');
    expect(input).not.toBeNull();

    const originalT = window.i18n.t;
    window.i18n.t = key => (key === 'aiRenameConversation' ? 'Renommer la conversation' : originalT(key));
    try {
      window.dispatchEvent(new CustomEvent('languageChanged'));

      const button = document.querySelector('.ai-topic-rename[data-id="conv-1"]');
      expect(button.getAttribute('aria-label')).toBe('Renommer la conversation');
      expect(button.title).toBe('Renommer la conversation');
      // An editor left open across the switch keeps the new label too.
      expect(input.getAttribute('aria-label')).toBe('Renommer la conversation');
    } finally {
      window.i18n.t = originalT;
    }
  });
});

describe('AIRenderer grounded source rendering (#707)', () => {
  it('renders cited links below grounded assistant messages', () => {
    const conversation = {
      id: 'grounded',
      title: 'Grounded',
      messages: [{
        id: 'assistant-grounded',
        role: 'assistant',
        content: 'Latest update: [Example](https://example.com/article)',
        timestamp: Date.now(),
        isStreaming: false,
        grounded: true
      }]
    };

    AIStore.state.conversations = [conversation];
    AIStore.state.currentConversationId = conversation.id;
    AIRenderer.renderMessages();

    const message = document.querySelector('[data-message-id="assistant-grounded"]');
    const sources = message.querySelector('.ai-message-sources');

    expect(sources).not.toBeNull();
    expect(sources.textContent).toContain('Sources');
    expect(sources.querySelector('a').getAttribute('href'))
      .toBe('https://example.com/article');
  });
});

describe('AIRenderer copy failure notification (#839)', () => {
  it('shows the copyFailed translation when the clipboard write fails', async () => {
    const container = document.getElementById('ai-chat-container');
    container.innerHTML =
      '<div class="ai-message-content">' +
      '<div class="ai-message-text">hello world</div>' +
      '<button type="button" class="ai-message-copy"><span class="copy-text">Copy</span></button>' +
      '</div>';
    const messageText = container.querySelector('.ai-message-text');
    Object.defineProperty(messageText, 'innerText', { value: 'hello world', configurable: true });

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true
    });

    const localizedCopyFailed = 'No se pudo copiar el texto. Selecciona y copia manualmente.';
    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'copyFailed' ? localizedCopyFailed : originalT(key));

    try {
      AIRenderer.initCopyButtons();
      container.querySelector('.ai-message-copy').click();

      await vi.waitFor(() => {
        expect(document.querySelector('.toast-notification.toast-error')).not.toBeNull();
      });

      const notification = document.querySelector('.toast-notification.toast-error');
      expect(notification.textContent).toBe(localizedCopyFailed);

      notification.remove();
    } finally {
      window.i18n.t = originalT;
      const leftover = document.querySelector('.toast-notification');
      if (leftover) leftover.remove();
      container.replaceChildren();
    }
  });
});

describe('AIRenderer copy button label translations (#970)', () => {
  const setupCopyButton = () => {
    const container = document.getElementById('ai-chat-container');
    container.innerHTML =
      '<div class="ai-message-content">' +
      '<div class="ai-message-text">hello world</div>' +
      '<button type="button" class="ai-message-copy"><span class="copy-text">Copy</span></button>' +
      '</div>';
    const messageText = container.querySelector('.ai-message-text');
    Object.defineProperty(messageText, 'innerText', { value: 'hello world', configurable: true });
    return container;
  };

  it('shows the copySuccess translation on the button label after a successful copy', async () => {
    const container = setupCopyButton();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true
    });

    const localizedCopySuccess = '¡Copiado!';
    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'copySuccess' ? localizedCopySuccess : originalT(key));

    try {
      AIRenderer.initCopyButtons();
      container.querySelector('.ai-message-copy').click();

      await vi.waitFor(() => {
        expect(container.querySelector('.copy-text').textContent).toBe(localizedCopySuccess);
      });
      expect(container.querySelector('.copy-text').textContent).not.toBe('Copied!');
    } finally {
      window.i18n.t = originalT;
      container.replaceChildren();
    }
  });

  it('shows the copyFailedShort translation on the button label when the clipboard write fails', async () => {
    const container = setupCopyButton();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true
    });

    const localizedCopyFailedShort = 'Fehlgeschlagen';
    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'copyFailedShort' ? localizedCopyFailedShort : originalT(key));

    try {
      AIRenderer.initCopyButtons();
      container.querySelector('.ai-message-copy').click();

      await vi.waitFor(() => {
        expect(container.querySelector('.copy-text').textContent).toBe(localizedCopyFailedShort);
      });
      expect(container.querySelector('.copy-text').textContent).not.toBe('Failed');

      const notification = document.querySelector('.toast-notification');
      if (notification) notification.remove();
    } finally {
      window.i18n.t = originalT;
      const leftover = document.querySelector('.toast-notification');
      if (leftover) leftover.remove();
      container.replaceChildren();
    }
  });
});

describe('AIRenderer web grounding toggle write failure (#971)', () => {
  it('restores the checkbox from the stored preference when persistence fails', async () => {
    const getCheckbox = () => document.querySelector('.ai-grounding-toggle input[type="checkbox"]');
    const originalAPI = window.OpenRouterAPI;

    window.OpenRouterAPI = {
      isWebGroundingEnabled: () => true,
      setWebGroundingEnabled: vi.fn().mockResolvedValue(false)
    };

    try {
      AIRenderer.initWebGroundingControl();
      expect(getCheckbox().checked).toBe(true);

      getCheckbox().checked = false;
      getCheckbox().dispatchEvent(new Event('change'));

      expect(window.OpenRouterAPI.setWebGroundingEnabled).toHaveBeenCalledWith(false);

      await vi.waitFor(() => {
        expect(getCheckbox().checked).toBe(true);
      });
    } finally {
      if (originalAPI === undefined) {
        delete window.OpenRouterAPI;
      } else {
        window.OpenRouterAPI = originalAPI;
      }
      document.querySelector('.ai-grounding-toggle')?.remove();
      AIRenderer.getElements().webGroundingControl = null;
    }
  });
});

describe('AI modal theme follows a stored system theme (issue #1011)', () => {
  afterEach(() => {
    delete window.resolveTheme;
    localStorage.removeItem('theme');
    document.getElementById('ai-chat-modal').classList.remove('light-theme');
  });

  it('delegates a stored system theme to window.resolveTheme', () => {
    window.resolveTheme = (theme) => (theme === 'system' ? 'light' : theme);
    localStorage.setItem('theme', 'system');

    expect(AIRenderer.loadTheme()).toBe('light');

    AIRenderer.applyThemeToAI();
    expect(document.getElementById('ai-chat-modal').classList.contains('light-theme')).toBe(true);
  });

  it('keeps concrete stored themes untouched and falls back to dark for system without the resolver', () => {
    // The assertions below are only meaningful with the resolver absent.
    delete window.resolveTheme;

    localStorage.setItem('theme', 'light');
    expect(AIRenderer.loadTheme()).toBe('light');

    localStorage.setItem('theme', 'dark');
    expect(AIRenderer.loadTheme()).toBe('dark');

    // Stored 'system' with no resolver passes through unchanged, and
    // applyThemeToAI therefore falls back to the dark modal styles.
    localStorage.setItem('theme', 'system');
    expect(AIRenderer.loadTheme()).toBe('system');
    const modal = document.getElementById('ai-chat-modal');
    modal.classList.add('light-theme');
    AIRenderer.applyThemeToAI();
    expect(modal.classList.contains('light-theme')).toBe(false);
  });
});
