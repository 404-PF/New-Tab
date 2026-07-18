// src/ai/ai-renderer.js - AI chat rendering and DOM helpers

const AIRenderer = (function() {
  const elements = {};
  const topicsListRenderState = {
    listEl: null,
    signature: '',
    handlersAttached: false,
    callbacks: {
      onSelectConversation: () => {},
      onDeleteConversation: () => {},
      onRequestDeleteConfirm: callback => callback()
    },
    hoveredDeleteBtn: null,
    tooltip: null,
    tooltipTimeout: null
  };

  function getTranslation(key) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key);
    }
    console.warn('i18n not available, using fallback for:', key);
    return key;
  }

  function cacheElements() {
    elements.modal = document.getElementById('ai-chat-modal');
    elements.container = document.getElementById('ai-chat-container');
    elements.input = document.getElementById('ai-chat-input');
    elements.sendBtn = document.getElementById('ai-chat-send');
    elements.stopBtn = document.getElementById('ai-chat-stop');
    elements.loadingIndicator = document.getElementById('ai-chat-loading');
    elements.errorDisplay = document.getElementById('ai-chat-error');
    elements.title = document.getElementById('ai-chat-title');
    elements.newChatBtn = document.getElementById('ai-new-chat-btn');
    elements.topicsList = document.getElementById('ai-topics-list');
    elements.topicsSearch = document.getElementById('ai-topics-search-input');
    elements.topicsCount = document.getElementById('ai-topics-count');
    elements.confirmDialog = document.getElementById('ai-confirm-dialog');
    elements.confirmCancel = document.querySelector('.ai-confirm-cancel');
    elements.confirmDelete = document.querySelector('.ai-confirm-delete');
    elements.scrollToBottomBtn = document.getElementById('ai-scroll-to-bottom');
    return elements;
  }

  function getElements() {
    return elements;
  }

  function hasModal() {
    return !!document.getElementById('ai-chat-modal');
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatTopicTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return getTranslation('aiJustNow');
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    return new Date(timestamp).toLocaleDateString();
  }

  function getTopicsListSignature(filteredConversations, state) {
    const itemSignature = filteredConversations
      .map((conversation, index) => [
        conversation.id,
        conversation.title,
        conversation.updatedAt,
        conversation.id === state.currentConversationId ? '1' : '0',
        index === state.keyboardSelectedIndex ? '1' : '0'
      ].join('\u001f'))
      .join('\u001e');

    return [
      state.searchQuery.trim() ? 'search' : 'all',
      state.keyboardSelectedIndex,
      state.currentConversationId,
      itemSignature
    ].join('\u001d');
  }

  function createTopicIcon() {
    const icon = document.createElement('div');
    icon.className = 'ai-topic-icon';
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    return icon;
  }

  function createTopicDeleteButton(conversationId) {
    const button = document.createElement('button');
    button.className = 'ai-topic-delete';
    button.dataset.id = conversationId;
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3,6 5,6 21,6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    return button;
  }

  function createTopicElement(conversation, index, state) {
    const item = document.createElement('div');
    item.className = 'ai-topic-item';
    if (conversation.id === state.currentConversationId) {
      item.classList.add('active');
    }
    if (index === state.keyboardSelectedIndex) {
      item.classList.add('keyboard-selected');
    }
    item.dataset.id = conversation.id;
    item.dataset.index = index;

    const info = document.createElement('div');
    info.className = 'ai-topic-info';

    const title = document.createElement('div');
    title.className = 'ai-topic-title';
    title.textContent = conversation.title || '';

    const time = document.createElement('div');
    time.className = 'ai-topic-time';
    time.textContent = formatTopicTime(conversation.updatedAt);

    info.append(title, time);
    item.append(createTopicIcon(), info, createTopicDeleteButton(conversation.id));
    return item;
  }

  function createEmptyTopicsElement(className, text, isSearchResult) {
    const container = document.createElement('div');
    container.className = className;
    container.innerHTML = isSearchResult
      ? `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      `
      : `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      `;

    const message = document.createElement('p');
    message.textContent = text;
    container.appendChild(message);
    return container;
  }

  function getTopicsTooltip() {
    if (!topicsListRenderState.tooltip || !document.body.contains(topicsListRenderState.tooltip)) {
      topicsListRenderState.tooltip = document.createElement('div');
      topicsListRenderState.tooltip.className = 'ai-topic-tooltip';
      document.body.appendChild(topicsListRenderState.tooltip);
    }
    return topicsListRenderState.tooltip;
  }

  function positionTopicsTooltip(button, tooltip) {
    const rect = button.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 8}px`;
    tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
  }

  function clearTopicsTooltipTimeout() {
    if (topicsListRenderState.tooltipTimeout) {
      clearTimeout(topicsListRenderState.tooltipTimeout);
      topicsListRenderState.tooltipTimeout = null;
    }
  }

  function hideTopicsTooltip(button = topicsListRenderState.hoveredDeleteBtn) {
    clearTopicsTooltipTimeout();
    if (button) {
      AIStore.clearHoveredDeleteTarget(button);
      button.classList.remove('ctrl-ready');
    }
    if (topicsListRenderState.tooltip) {
      topicsListRenderState.tooltip.classList.remove('visible');
    }
    topicsListRenderState.hoveredDeleteBtn = null;
  }

  function handleTopicsClick(event) {
    const deleteButton = event.target.closest('.ai-topic-delete');
    if (deleteButton) {
      event.stopPropagation();
      const conversationId = deleteButton.dataset.id;

      if (event.ctrlKey) {
        topicsListRenderState.callbacks.onDeleteConversation(conversationId);
      } else {
        topicsListRenderState.callbacks.onRequestDeleteConfirm(() => {
          topicsListRenderState.callbacks.onDeleteConversation(conversationId);
        });
      }
      return;
    }

    const item = event.target.closest('.ai-topic-item');
    if (item && elements.topicsList?.contains(item)) {
      topicsListRenderState.callbacks.onSelectConversation(item.dataset.id);
    }
  }

  function handleTopicsMouseOver(event) {
    const button = event.target.closest('.ai-topic-delete');
    if (!button || button === topicsListRenderState.hoveredDeleteBtn) return;

    hideTopicsTooltip();
    topicsListRenderState.hoveredDeleteBtn = button;

    const tooltip = getTopicsTooltip();
    tooltip.textContent = getTranslation('aiDeleteConversation');
    positionTopicsTooltip(button, tooltip);
    AIStore.setHoveredDeleteTarget(button, tooltip);

    topicsListRenderState.tooltipTimeout = setTimeout(() => {
      tooltip.classList.add('visible');
      updateDeleteButtonFeedback();
    }, 2000);
  }

  function handleTopicsMouseOut(event) {
    const button = event.target.closest('.ai-topic-delete');
    if (!button || button.contains(event.relatedTarget)) return;
    hideTopicsTooltip(button);
  }

  function handleTopicsMouseMove(event) {
    const button = event.target.closest('.ai-topic-delete');
    if (!button || button !== topicsListRenderState.hoveredDeleteBtn || !topicsListRenderState.tooltip) return;
    positionTopicsTooltip(button, topicsListRenderState.tooltip);
  }

  function attachTopicsDelegatedHandlers() {
    if (topicsListRenderState.listEl === elements.topicsList && topicsListRenderState.handlersAttached) return;

    if (topicsListRenderState.listEl && topicsListRenderState.handlersAttached) {
      topicsListRenderState.listEl.removeEventListener('click', handleTopicsClick);
      topicsListRenderState.listEl.removeEventListener('mouseover', handleTopicsMouseOver);
      topicsListRenderState.listEl.removeEventListener('mouseout', handleTopicsMouseOut);
      topicsListRenderState.listEl.removeEventListener('mousemove', handleTopicsMouseMove);
    }

    topicsListRenderState.listEl = elements.topicsList;
    topicsListRenderState.handlersAttached = true;
    elements.topicsList.addEventListener('click', handleTopicsClick);
    elements.topicsList.addEventListener('mouseover', handleTopicsMouseOver);
    elements.topicsList.addEventListener('mouseout', handleTopicsMouseOut);
    elements.topicsList.addEventListener('mousemove', handleTopicsMouseMove);
  }

  function renderTopicsList(options = {}) {
    if (!elements.topicsList) {
      cacheElements();
    }
    if (!elements.topicsList) return;

    attachTopicsDelegatedHandlers();
    topicsListRenderState.callbacks.onSelectConversation = options.onSelectConversation || (() => {});
    topicsListRenderState.callbacks.onDeleteConversation = options.onDeleteConversation || (() => {});
    topicsListRenderState.callbacks.onRequestDeleteConfirm = options.onRequestDeleteConfirm || ((callback) => callback());

    const state = AIStore.state;
    const filteredConversations = AIStore.getFilteredConversations();
    const renderSignature = getTopicsListSignature(filteredConversations, state);

    if (elements.topicsCount) {
      const total = state.conversations.length;
      const shown = filteredConversations.length;
      elements.topicsCount.textContent = shown === total ? total : `${shown}/${total}`;
    }

    if (topicsListRenderState.signature === renderSignature && elements.topicsList.childElementCount > 0) {
      return;
    }
    topicsListRenderState.signature = renderSignature;
    hideTopicsTooltip();
    document.querySelectorAll('.ai-topic-tooltip').forEach(tooltip => {
      if (tooltip !== topicsListRenderState.tooltip) {
        tooltip.remove();
      }
    });

    const fragment = document.createDocumentFragment();

    if (filteredConversations.length === 0) {
      if (state.searchQuery.trim()) {
        fragment.appendChild(createEmptyTopicsElement(
          'ai-topics-no-results',
          getTranslation('aiNoSearchResults'),
          true
        ));
      } else {
        fragment.appendChild(createEmptyTopicsElement(
          'ai-topics-empty',
          getTranslation('aiNoConversations'),
          false
        ));
      }
      elements.topicsList.replaceChildren(fragment);
      return;
    }

    filteredConversations.forEach((conversation, index) => {
      fragment.appendChild(createTopicElement(conversation, index, state));
    });
    elements.topicsList.replaceChildren(fragment);

    if (AIStore.state.keyboardSelectedIndex >= 0) {
      const selectedItem = elements.topicsList.querySelector('.keyboard-selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function getMessageHTML(message) {
    const isUser = message.role === 'user';
    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';
    const isStreaming = message.isStreaming;
    const content = isStreaming ? (message.content || '') : message.content;

    const renderedContent = isUser
      ? escapeHTML(content)
      : window.MarkdownParser ? window.MarkdownParser.parse(content) : escapeHTML(content);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="ai-message ${isUser ? 'ai-message-user' : 'ai-message-assistant'}">
        <div class="ai-message-avatar">
          ${isUser
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><line x1="12" y1="9.5" x2="12" y2="5"/><circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none"/><line x1="14.3" y1="10.2" x2="17" y2="7"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/><line x1="14.5" y1="12" x2="19" y2="12"/><circle cx="19.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><line x1="14.3" y1="13.8" x2="17" y2="17"/><circle cx="17.5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/><line x1="12" y1="14.5" x2="12" y2="19"/><circle cx="12" cy="20" r="1.2" fill="currentColor" stroke="none"/><line x1="9.7" y1="13.8" x2="7" y2="17"/><circle cx="6.5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/><line x1="9.5" y1="12" x2="5" y2="12"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><line x1="9.7" y1="10.2" x2="7" y2="7"/><circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>'}
        </div>
        <div class="ai-message-content">
          <div class="ai-message-text ${isStreaming ? 'ai-message-streaming' : ''}">${renderedContent}</div>
          <div class="ai-message-meta">
            <div class="ai-message-time">${time}</div>
            <button class="ai-message-copy" aria-label="Copy message" tabindex="0">
              <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="copy-text">Copy</span>
            </button>
          </div>
        </div>
    `;

    const el = wrapper.firstElementChild;
    if (el && message.id) {
      el.dataset.messageId = message.id;
    }
    return el;
  }

  function renderMessages() {
    if (!elements.container) {
      cacheElements();
    }
    if (!elements.container) return;

    const messages = AIStore.getCurrentMessages();

    if (messages.length === 0) {
      elements.container.innerHTML = `
        <div class="ai-welcome">
          <div class="ai-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
              <line x1="12" y1="9.5" x2="12" y2="5"/>
              <circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="14.3" y1="10.2" x2="17" y2="7"/>
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="14.5" y1="12" x2="19" y2="12"/>
              <circle cx="19.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="14.3" y1="13.8" x2="17" y2="17"/>
              <circle cx="17.5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="12" y1="14.5" x2="12" y2="19"/>
              <circle cx="12" cy="20" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="9.7" y1="13.8" x2="7" y2="17"/>
              <circle cx="6.5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="9.5" y1="12" x2="5" y2="12"/>
              <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
              <line x1="9.7" y1="10.2" x2="7" y2="7"/>
              <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <div class="ai-welcome-title">${getTranslation('aiWelcome')}</div>
          <div class="ai-welcome-subtitle">${getTranslation('aiWelcomeSubtitle')}</div>
        </div>
      `;
      AIStore.setUserScrolledUp(false);
      updateScrollToBottomButton();
      return;
    }

    // Incremental render: reuse existing message elements when possible so we
    // don't tear down and rebuild the entire conversation on every update
    // (e.g. during streaming). Only the changed/new messages are touched.
    // Clear any stale non-message nodes (e.g. the welcome block) left over
    // from the empty-conversation state before inserting the message list.
    Array.from(elements.container.children).forEach(child => {
      if (!child.classList.contains('ai-message')) {
        child.remove();
      }
    });
    const existing = new Map();
    elements.container.querySelectorAll('.ai-message').forEach(el => {
      const id = el.getAttribute('data-message-id');
      if (id) existing.set(id, el);
    });

    const usedElements = new Set();
    const newElements = [];
    let referenceNode = null;

    messages.forEach(message => {
      const id = message.id || '';

      const isStreaming = message.isStreaming;
      const renderedContent = message.role === 'user'
        ? escapeHTML(message.content || '')
        : (window.MarkdownParser ? window.MarkdownParser.parse(message.content || '') : escapeHTML(message.content || ''));

      let el = id ? existing.get(id) : null;

      if (el) {
        // Don't touch the actively-streaming message; updateStreamingContent
        // owns its text during streaming.
        if (!isStreaming) {
          const textEl = el.querySelector('.ai-message-text');
          if (textEl && textEl.innerHTML !== renderedContent) {
            textEl.innerHTML = renderedContent;
          }
          textEl.classList.remove('ai-message-streaming');
        }
      } else {
        el = getMessageHTML(message);
        newElements.push(el);
      }

      usedElements.add(el);


      // Ensure DOM order matches message order.
      const expectedNext = referenceNode ? referenceNode.nextSibling : elements.container.firstChild;
      if (expectedNext !== el) {
        elements.container.insertBefore(el, expectedNext);
      }
      referenceNode = el;
    });

    // Remove any message element that was not reused or created this pass,
    // including orphans that lack a data-message-id.
    elements.container.querySelectorAll('.ai-message').forEach(el => {
      if (!usedElements.has(el)) {
        el.remove();
      }
    });

    if (newElements.length > 0) {
      initCopyButtons();
    }

    if (!AIStore.state.isUserScrolledUp) {
      scrollToBottom(false);
    }
  }

  function initCopyButtons() {
    const copyButtons = elements.container?.querySelectorAll('.ai-message-copy');
    if (!copyButtons) return;

    copyButtons.forEach(button => {
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);

      newButton.addEventListener('click', event => {
        event.stopPropagation();
        handleCopyClick(newButton);
      });

      newButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          handleCopyClick(newButton);
        }
      });
    });
  }

  async function handleCopyClick(button) {
    const messageText = button.closest('.ai-message-content')?.querySelector('.ai-message-text');
    const content = messageText?.innerText?.trim();
    if (!content) return;

    const copyIcon = button.querySelector('.copy-icon');
    const copyText = button.querySelector('.copy-text');
    const originalText = copyText?.textContent || 'Copy';

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        await fallbackCopyText(content);
      }

      showCopyFeedback(button, true, originalText, copyIcon, copyText);
    } catch (error) {
      console.error('Copy failed:', error);
      showCopyFeedback(button, false, originalText, copyIcon, copyText);
      showCopyError();
    }
  }

  function fallbackCopyText(text) {
    return new Promise((resolve, reject) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          resolve();
        } else {
          reject(new Error('Fallback copy failed'));
        }
      } catch (error) {
        document.body.removeChild(textArea);
        reject(error);
      }
    });
  }

  function showCopyFeedback(button, success, originalText, copyIcon, copyText) {
    if (success) {
      if (copyIcon) {
        copyIcon.innerHTML = '<polyline points="20,6 9,17 4,12"></polyline>';
      }
      if (copyText) {
        copyText.textContent = 'Copied!';
      }
      button.classList.add('copy-success');
    } else {
      if (copyText) {
        copyText.textContent = 'Failed';
      }
      button.classList.add('copy-error');
    }

    setTimeout(() => {
      if (copyIcon) {
        copyIcon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
      }
      if (copyText) {
        copyText.textContent = originalText;
      }
      button.classList.remove('copy-success', 'copy-error');
    }, 2000);
  }

  function showCopyError() {
    let notification = document.querySelector('.ai-copy-error-notification');

    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'ai-copy-error-notification';
      document.body.appendChild(notification);
    }

    notification.textContent = 'Failed to copy text. Please select and copy manually.';
    notification.classList.add('visible');

    setTimeout(() => {
      notification.classList.remove('visible');
    }, 3000);
  }

  function isAtBottom() {
    if (!elements.container) return true;
    const { scrollTop, scrollHeight, clientHeight } = elements.container;
    return scrollHeight - scrollTop - clientHeight < AIStore.state.scrollThreshold;
  }

  function scrollToBottom(smooth = true) {
    if (!elements.container) return;
    elements.container.scrollTo({
      top: elements.container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
    AIStore.setUserScrolledUp(false);
    updateScrollToBottomButton();
  }

  function updateScrollToBottomButton() {
    if (!elements.scrollToBottomBtn) return;

    if (AIStore.state.isUserScrolledUp) {
      elements.scrollToBottomBtn.classList.add('visible');
    } else {
      elements.scrollToBottomBtn.classList.remove('visible');
    }
  }

  function handleScroll() {
    const wasScrolledUp = AIStore.state.isUserScrolledUp;
    AIStore.setUserScrolledUp(!isAtBottom());

    if (wasScrolledUp !== AIStore.state.isUserScrolledUp) {
      updateScrollToBottomButton();
    }
  }

  function updateDeleteButtonFeedback() {
    document.querySelectorAll('.ai-topic-delete').forEach(button => {
      if (AIStore.state.isCtrlPressed) {
        button.classList.add('ctrl-ready');
      } else {
        button.classList.remove('ctrl-ready');
      }
    });
  }

  function initCtrlKeyTracking() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Control' && !AIStore.state.isCtrlPressed) {
        AIStore.setCtrlPressed(true);
        updateDeleteButtonFeedback();

        if (AIStore.state.hoveredDeleteTooltip && AIStore.state.hoveredDeleteBtn) {
          AIStore.state.hoveredDeleteTooltip.textContent = getTranslation('aiDeleteConversation');
          AIStore.state.hoveredDeleteBtn.classList.add('ctrl-ready');
        }
      }
    });

    document.addEventListener('keyup', event => {
      if (event.key === 'Control') {
        AIStore.setCtrlPressed(false);
        updateDeleteButtonFeedback();

        if (AIStore.state.hoveredDeleteTooltip && AIStore.state.hoveredDeleteBtn) {
          AIStore.state.hoveredDeleteTooltip.textContent = getTranslation('aiDeleteConversation');
          AIStore.state.hoveredDeleteBtn.classList.remove('ctrl-ready');
        }
      }
    });

    window.addEventListener('blur', () => {
      AIStore.setCtrlPressed(false);
      updateDeleteButtonFeedback();

      if (AIStore.state.hoveredDeleteTooltip) {
        AIStore.state.hoveredDeleteTooltip.classList.remove('visible');
        if (AIStore.state.hoveredDeleteBtn) {
          AIStore.state.hoveredDeleteBtn.classList.remove('ctrl-ready');
        }
      }
    });
  }

  function loadTheme() {
    return localStorage.getItem('theme') || 'dark';
  }

  function applyThemeToAI() {
    const theme = loadTheme();
    const modal = document.getElementById('ai-chat-modal');
    if (!modal) return;

    if (theme === 'light') {
      modal.classList.add('light-theme');
    } else {
      modal.classList.remove('light-theme');
    }
  }

  function updateConnectionStatus(isOfflineMode) {
    const statusIndicator = document.getElementById('ai-connection-status');
    if (!statusIndicator) return;

    const onlineText = getTranslation('aiOnline');
    const offlineText = getTranslation('aiOffline');

    if (isOfflineMode) {
      statusIndicator.className = 'ai-connection-status offline';
      statusIndicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg><span>' + offlineText + '</span>';
    } else {
      statusIndicator.className = 'ai-connection-status online';
      statusIndicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg><span>' + onlineText + '</span>';
    }
  }

  function createConnectionStatusIndicator(isOfflineMode) {
    const titleArea = document.querySelector('.ai-chat-header');
    if (!titleArea) return;

    const statusDiv = document.createElement('div');
    statusDiv.id = 'ai-connection-status';

    const onlineText = getTranslation('aiOnline');
    const offlineText = getTranslation('aiOffline');

    statusDiv.className = isOfflineMode ? 'ai-connection-status offline' : 'ai-connection-status online';
    statusDiv.innerHTML = isOfflineMode
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg><span>' + offlineText + '</span>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg><span>' + onlineText + '</span>';

    titleArea.appendChild(statusDiv);
  }

  function updateStreamingContent(element, content) {
    if (element && window.MarkdownParser) {
      element.innerHTML = window.MarkdownParser.parse(content);
    } else if (element) {
      element.textContent = content;
    }
  }

  function clearMarkdownCache() {
    if (window.MarkdownParser && window.MarkdownParser.clearCache) {
      window.MarkdownParser.clearCache();
    }
  }

  function getMarkdownCacheStats() {
    if (window.MarkdownParser && window.MarkdownParser.getCacheStats) {
      return window.MarkdownParser.getCacheStats();
    }
    return { size: 0, maxSize: 0 };
  }

  return {
    cacheElements,
    getElements,
    hasModal,
    renderTopicsList,
    renderMessages,
    initCopyButtons,
    isAtBottom,
    scrollToBottom,
    updateScrollToBottomButton,
    handleScroll,
    updateDeleteButtonFeedback,
    initCtrlKeyTracking,
    applyThemeToAI,
    loadTheme,
    updateConnectionStatus,
    createConnectionStatusIndicator,
    updateStreamingContent,
    clearMarkdownCache,
    getMarkdownCacheStats,
    formatTopicTime,
    escapeHTML
  };
})();

window.AIRenderer = AIRenderer;
