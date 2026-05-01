// src/ai/ai-service.js - AI service controller

const AIService = (function() {
  const elements = AIRenderer.getElements();
  let activeConfirmKeydownHandler = null;

  function getTranslation(key) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key);
    }
    console.warn('i18n not available, using fallback for:', key);
    return key;
  }

  function cacheElements() {
    AIRenderer.cacheElements();
  }

  function renderConversationUI(options = {}) {
    const { renderMessages = true } = options;

    AIRenderer.renderTopicsList({
      onSelectConversation: switchConversation,
      onDeleteConversation: deleteConversation,
      onRequestDeleteConfirm: showDeleteConfirm
    });

    if (renderMessages) {
      AIRenderer.renderMessages();
    }
  }

  function showDeleteConfirm(onConfirm) {
    cacheElements();

    if (!elements.confirmDialog) return;

    // Always clean up a stale handler first so we never leak listeners
    if (activeConfirmKeydownHandler) {
      document.removeEventListener('keydown', activeConfirmKeydownHandler);
      activeConfirmKeydownHandler = null;
    }

    const cancelBtn = elements.confirmDialog.querySelector('.ai-confirm-cancel');
    const deleteBtn = elements.confirmDialog.querySelector('.ai-confirm-delete');
    const overlay = elements.confirmDialog.querySelector('.ai-confirm-overlay');

    if (!cancelBtn || !deleteBtn || !overlay) return;

    AIStore.setConfirmDialogCallback(onConfirm);
    elements.confirmDialog.classList.add('ai-confirm-open');

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

    const newOverlay = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(newOverlay, overlay);

    newCancelBtn.addEventListener('click', hideDeleteConfirm);
    newDeleteBtn.addEventListener('click', () => {
      const callback = AIStore.state.confirmDialogCallback;
      hideDeleteConfirm();
      if (callback) {
        callback();
      }
    });
    newOverlay.addEventListener('click', hideDeleteConfirm);

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        hideDeleteConfirm();
      } else if (event.key === 'Enter') {
        const callback = AIStore.state.confirmDialogCallback;
        hideDeleteConfirm();
        if (callback) {
          callback();
        }
      }
    };

    activeConfirmKeydownHandler = handleKeydown;

    document.addEventListener('keydown', handleKeydown);
  }

  function hideDeleteConfirm() {
    cacheElements();

    if (elements.confirmDialog) {
      elements.confirmDialog.classList.remove('ai-confirm-open');
    }

    if (activeConfirmKeydownHandler) {
      document.removeEventListener('keydown', activeConfirmKeydownHandler);
      activeConfirmKeydownHandler = null;
    }

    AIStore.clearConfirmDialogCallback();
  }

  function showLoading() {
    AIStore.setLoading(true);
    AIStore.setStreaming(true);

    if (elements.loadingIndicator) {
      elements.loadingIndicator.style.display = 'flex';
    }
    if (elements.sendBtn) {
      elements.sendBtn.style.display = 'none';
    }
    if (elements.stopBtn) {
      elements.stopBtn.style.display = 'flex';
    }
    if (elements.input) {
      elements.input.disabled = true;
    }
    if (elements.errorDisplay) {
      elements.errorDisplay.textContent = '';
      elements.errorDisplay.style.display = 'none';
    }
  }

  function hideLoading() {
    AIStore.setLoading(false);
    AIStore.setStreaming(false);
    AIStore.setAbortController(null);

    if (elements.loadingIndicator) {
      elements.loadingIndicator.style.display = 'none';
    }
    if (elements.sendBtn) {
      elements.sendBtn.style.display = 'flex';
    }
    if (elements.stopBtn) {
      elements.stopBtn.style.display = 'none';
    }
    if (elements.input) {
      elements.input.disabled = false;
      elements.input.focus();
    }
  }

  function showError(error) {
    if (elements.errorDisplay) {
      elements.errorDisplay.textContent = error;
      elements.errorDisplay.style.display = 'block';
    }
  }

  function openModal() {
    if (!AIRenderer.hasModal()) return;

    cacheElements();
    if (!elements.modal) return;

    elements.modal.classList.add('ai-modal-open');
    AIRenderer.applyThemeToAI();

    AIStore.loadConversations();
    renderConversationUI();

    console.log('[AI Debug] openModal called - State:', {
      isLoading: AIStore.state.isLoading,
      isStreaming: AIStore.state.isStreaming,
      hasAbortController: AIStore.state.abortController !== null
    });

    if (AIStore.state.isLoading || AIStore.state.isStreaming) {
      console.log('[AI Debug] openModal - Request in progress, updating UI');
      if (elements.loadingIndicator) {
        elements.loadingIndicator.style.display = 'flex';
      }
      if (elements.sendBtn) {
        elements.sendBtn.style.display = 'none';
      }
      if (elements.stopBtn) {
        elements.stopBtn.style.display = 'flex';
      }
      if (elements.input) {
        elements.input.disabled = true;
      }
    }

    setTimeout(() => {
      if (elements.input && !AIStore.state.isLoading) {
        elements.input.focus();
      }
    }, 100);
  }

  function closeModal() {
    cacheElements();

    if (elements.modal) {
      elements.modal.classList.remove('ai-modal-open');
    }

    console.log('[AI Debug] closeModal called - State:', {
      isLoading: AIStore.state.isLoading,
      isStreaming: AIStore.state.isStreaming,
      hasAbortController: AIStore.state.abortController !== null
    });
  }

  function createNewChat() {
    AIStore.createNewChat();
    renderConversationUI();

    if (elements.input) {
      elements.input.focus();
    }
  }

  function switchConversation(conversationId) {
    if (!AIStore.switchConversation(conversationId)) return;

    AIStore.setKeyboardSelectedIndex(-1);
    renderConversationUI();
  }

  function deleteConversation(conversationId) {
    if (!AIStore.deleteConversation(conversationId)) return;

    AIStore.setKeyboardSelectedIndex(-1);
    renderConversationUI();
  }

  function handleTopicsKeydown(event) {
    const filteredConversations = AIStore.getFilteredConversations();
    if (filteredConversations.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        AIStore.setKeyboardSelectedIndex(Math.min(AIStore.state.keyboardSelectedIndex + 1, filteredConversations.length - 1));
        renderConversationUI({ renderMessages: false });
        break;

      case 'ArrowUp':
        event.preventDefault();
        AIStore.setKeyboardSelectedIndex(Math.max(AIStore.state.keyboardSelectedIndex - 1, 0));
        renderConversationUI({ renderMessages: false });
        break;

      case 'Enter':
        event.preventDefault();
        if (AIStore.state.keyboardSelectedIndex >= 0 && AIStore.state.keyboardSelectedIndex < filteredConversations.length) {
          switchConversation(filteredConversations[AIStore.state.keyboardSelectedIndex].id);
        }
        break;

      case 'Delete':
      case 'Backspace':
        if (AIStore.state.keyboardSelectedIndex >= 0 && AIStore.state.keyboardSelectedIndex < filteredConversations.length) {
          const conversationId = filteredConversations[AIStore.state.keyboardSelectedIndex].id;
          showDeleteConfirm(() => deleteConversation(conversationId));
        }
        break;
    }
  }

  function handleNetworkStatusChange(status) {
    const wasOffline = AIStore.state.isOfflineMode;
    AIStore.setOfflineMode(status.isOffline);

    if (wasOffline !== AIStore.state.isOfflineMode) {
      if (!document.getElementById('ai-connection-status')) {
        AIRenderer.createConnectionStatusIndicator(AIStore.state.isOfflineMode);
      } else {
        AIRenderer.updateConnectionStatus(AIStore.state.isOfflineMode);
      }

      if (AIStore.state.isOfflineMode) {
        console.info('AI Service: Switched to offline mode');
      } else {
        console.info('AI Service: Back to online mode');
      }
    }
  }

  function initNetworkListener() {
    NetworkDetector.addListener(handleNetworkStatusChange);
    handleNetworkStatusChange(NetworkDetector.getStatus());
  }

  function handleSend() {
    cacheElements();
    if (!elements.input) return;

    const message = elements.input.value;
    if (message.trim()) {
      sendMessage(message);
    }
  }

  async function sendMessage(userMessage) {
    console.log('[AI Debug] sendMessage called - State:', {
      hasMessage: !!userMessage,
      isLoading: AIStore.state.isLoading,
      isStreaming: AIStore.state.isStreaming,
      hasAbortController: AIStore.state.abortController !== null
    });

    if (!userMessage || AIStore.state.isLoading) {
      console.log('[AI Debug] sendMessage returning early - isLoading:', AIStore.state.isLoading);
      if (AIStore.state.isLoading) {
        showError(getTranslation('aiRequestInProgress') || 'A request is already in progress. Please wait for it to complete.');
      }
      return;
    }

    const networkStatus = NetworkDetector.getStatus();
    const userMsg = {
      role: 'user',
      content: userMessage.trim(),
      timestamp: Date.now()
    };

    AIStore.addMessageToConversation(userMsg);
    renderConversationUI();

    if (elements.input) {
      elements.input.value = '';
    }

    showLoading();

    const abortController = new AbortController();
    AIStore.setAbortController(abortController);

    const messages = AIStore.getCurrentMessages();
    const historyForAPI = messages
      .filter(message => message.role !== 'system')
      .slice(0, -1)
      .map(message => ({ role: message.role, content: message.content }));

    const assistantMsg = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };

    AIStore.addMessageToConversation(assistantMsg);
    renderConversationUI();

    const assistantElements = elements.container?.querySelectorAll('.ai-message-assistant');
    const streamingElement = assistantElements ? assistantElements[assistantElements.length - 1] : null;
    const streamingTextElement = streamingElement?.querySelector('.ai-message-text');

    let accumulatedContent = '';
    let lastRenderTime = 0;
    const RENDER_THROTTLE_MS = 50;

    try {
      let result;

      if (networkStatus.isOffline) {
        result = OfflineMode.getResponse(userMessage);

        if (result.success && result.content) {
          const chunks = result.content.split('');

          for (let index = 0; index < chunks.length; index++) {
            if (AIStore.state.abortController === null) {
              break;
            }

            accumulatedContent += chunks[index];

            const now = Date.now();
            if (now - lastRenderTime >= RENDER_THROTTLE_MS || index === chunks.length - 1) {
              AIRenderer.updateStreamingContent(streamingTextElement, accumulatedContent);
              lastRenderTime = now;

              if (!AIStore.state.isUserScrolledUp) {
                AIRenderer.scrollToBottom(false);
              }
            }

            if (index % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
            }
          }

          if (AIStore.state.abortController !== null) {
            AIRenderer.updateStreamingContent(streamingTextElement, accumulatedContent);
          }
        }
      } else {
        result = await OpenRouterAPI.sendMessageStreaming(
          userMessage,
          historyForAPI,
          chunk => {
            accumulatedContent += chunk;

            const now = Date.now();
            if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
              AIRenderer.updateStreamingContent(streamingTextElement, accumulatedContent);
              lastRenderTime = now;

              if (!AIStore.state.isUserScrolledUp) {
                AIRenderer.scrollToBottom(false);
              }
            }
          },
          abortController.signal
        );

        if (streamingTextElement && accumulatedContent && !result.aborted) {
          AIRenderer.updateStreamingContent(streamingTextElement, accumulatedContent);
        }
      }

      if (result.success) {
        const conversation = AIStore.getCurrentConversation();
        const lastMsg = conversation.messages[conversation.messages.length - 1];

        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.isStreaming = false;
          lastMsg.content = accumulatedContent || result.content || '';
        }

        if (streamingTextElement) {
          streamingTextElement.classList.remove('ai-message-streaming');
        }

        if (streamingElement) {
          const copyBtn = streamingElement.querySelector('.ai-message-copy');
          if (copyBtn && accumulatedContent) {
            copyBtn.dataset.content = accumulatedContent.replace(/<[^>]*>/g, '').trim();
          }
        }

        AIStore.saveConversations();
        renderConversationUI();
      } else if (result.aborted) {
        const conversation = AIStore.getCurrentConversation();
        const lastMsg = conversation.messages[conversation.messages.length - 1];

        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.isStreaming = false;
          lastMsg.content = accumulatedContent || '[Cancelled]';
        }

        if (streamingElement && accumulatedContent) {
          const copyBtn = streamingElement.querySelector('.ai-message-copy');
          if (copyBtn) {
            copyBtn.dataset.content = accumulatedContent.replace(/<[^>]*>/g, '').trim();
          }
        }

        AIStore.saveConversations();
      } else {
        showError(result.error);
        const conversation = AIStore.getCurrentConversation();
        conversation.messages.pop();
        conversation.messages.pop();
        AIRenderer.renderMessages();
      }
    } catch (error) {
      if (error.name === 'AbortError' || AIStore.state.abortController === null) {
        const conversation = AIStore.getCurrentConversation();
        const lastMsg = conversation.messages[conversation.messages.length - 1];

        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.isStreaming = false;
          lastMsg.content = accumulatedContent || '[Cancelled]';
        }
        AIStore.saveConversations();
      } else {
        showError(getTranslation('aiError'));
        console.error('AI sendMessage error:', error);
        const conversation = AIStore.getCurrentConversation();
        if (conversation.messages.length >= 2) {
          conversation.messages.pop();
          conversation.messages.pop();
          AIRenderer.renderMessages();
        }
      }
    }

    hideLoading();
  }

  function stopStreaming() {
    if (AIStore.state.abortController) {
      AIStore.state.abortController.abort();
      AIStore.setAbortController(null);
    }

    const conversation = AIStore.getCurrentConversation();
    if (conversation && conversation.messages.length > 0) {
      const lastMsg = conversation.messages[conversation.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
        lastMsg.isStreaming = false;
        AIStore.saveConversations();

        const assistantElements = elements.container?.querySelectorAll('.ai-message-assistant');
        if (assistantElements) {
          const lastAssistantElement = assistantElements[assistantElements.length - 1];
          if (lastAssistantElement && lastMsg.content) {
            const copyBtn = lastAssistantElement.querySelector('.ai-message-copy');
            if (copyBtn) {
              copyBtn.dataset.content = lastMsg.content.replace(/<[^>]*>/g, '').trim();
            }
          }
        }
      }
    }

    const streamingElements = elements.container?.querySelectorAll('.ai-message-streaming');
    if (streamingElements) {
      streamingElements.forEach(element => element.classList.remove('ai-message-streaming'));
    }

    hideLoading();
  }

  async function quickSearch(query) {
    if (!query || !query.trim()) return '';

    const networkStatus = NetworkDetector.getStatus();

    try {
      const result = networkStatus.isOffline
        ? OfflineMode.getResponse(query)
        : await OpenRouterAPI.quickSearch(query);

      if (result.success) {
        return result.content;
      }

      console.error('AI Search error:', result.error);
      return '';
    } catch (error) {
      console.error('AI Search error:', error);
      return '';
    }
  }

  function isAvailable() {
    return !!OpenRouterAPI && !NetworkDetector.getStatus().isOffline;
  }

  function initEventListeners() {
    if (elements.sendBtn) {
      elements.sendBtn.addEventListener('click', handleSend);
    }

    if (elements.stopBtn) {
      elements.stopBtn.addEventListener('click', stopStreaming);
    }

    if (elements.input) {
      elements.input.addEventListener('keypress', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleSend();
        }
      });
    }

    if (elements.scrollToBottomBtn) {
      elements.scrollToBottomBtn.addEventListener('click', () => AIRenderer.scrollToBottom(true));
    }

    if (elements.container) {
      elements.container.addEventListener('scroll', AIRenderer.handleScroll);
    }

    if (elements.newChatBtn) {
      elements.newChatBtn.addEventListener('click', createNewChat);
    }

    if (elements.topicsSearch) {
      elements.topicsSearch.addEventListener('input', event => {
        AIStore.setSearchQuery(event.target.value);
        renderConversationUI({ renderMessages: false });
      });

      elements.topicsSearch.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          elements.topicsSearch.value = '';
          AIStore.setSearchQuery('');
          renderConversationUI({ renderMessages: false });
          elements.topicsSearch.blur();
        }
      });
    }

    if (elements.topicsList) {
      elements.topicsList.addEventListener('keydown', handleTopicsKeydown);
    }

    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
      modal.addEventListener('click', event => {
        if (event.target === modal) {
          closeModal();
        }
      });
    }

    if (elements.modal) {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.attributeName === 'class' && elements.modal.classList.contains('ai-modal-open')) {
            AIStore.setUserScrolledUp(false);
            AIRenderer.updateScrollToBottomButton();
          }
        });
      });
      observer.observe(elements.modal, { attributes: true });
    }

    document.addEventListener('themeChanged', () => AIRenderer.applyThemeToAI());

    window.addEventListener('storage', event => {
      if (event.key === 'theme') {
        AIRenderer.applyThemeToAI();
      }
    });
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    cacheElements();
    AIStore.loadConversations();
    initEventListeners();
    AIRenderer.initCtrlKeyTracking();
    renderConversationUI();
    initNetworkListener();
  }

  init();

  return {
    open: openModal,
    close: closeModal,
    sendMessage,
    stopStreaming,
    quickSearch,
    isAvailable
  };
})();

window.AIService = AIService;