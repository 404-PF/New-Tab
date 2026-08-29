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
      onExportConversation: exportConversation,
      onRequestDeleteConfirm: showDeleteConfirm
    });

    if (renderMessages) {
      AIRenderer.renderMessages();
    }
  }

  function showToast(message, type) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    if (type) toast.classList.add('toast-' + type);
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function downloadMarkdownFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function exportConversation(conversationId) {
    const exported = AIStore.exportConversation(conversationId);
    if (!exported) {
      showToast(getTranslation('aiExportError'), 'error');
      return;
    }

    try {
      downloadMarkdownFile(exported.filename, exported.content);
      showToast(getTranslation('aiExportSuccess'), 'success');
    } catch (error) {
      console.error('Failed to export conversation:', error);
      showToast(getTranslation('aiExportError'), 'error');
    }
  }

  function exportAllConversations() {
    const exported = AIStore.exportAllConversations();
    if (!exported) {
      showToast(getTranslation('aiExportError'), 'error');
      return;
    }

    try {
      downloadMarkdownFile(exported.filename, exported.content);
      showToast(getTranslation('aiExportAllSuccess'), 'success');
    } catch (error) {
      console.error('Failed to export conversations:', error);
      showToast(getTranslation('aiExportError'), 'error');
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

  function removeFailedMessages(conversation, userId, assistantId) {
    if (!conversation || !Array.isArray(conversation.messages)) return false;
    if (!userId && !assistantId) return false;
    let removed = false;
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const messageId = conversation.messages[i] && conversation.messages[i].id;
      if ((userId && messageId === userId) || (assistantId && messageId === assistantId)) {
        conversation.messages.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      conversation.updatedAt = Date.now();
      AIStore.saveConversations();
      const current = AIStore.getCurrentConversation && AIStore.getCurrentConversation();
      if (current && current.id === conversation.id) {
        AIRenderer.renderMessages();
      } else {
        AIRenderer.renderTopicsList({
          onSelectConversation: switchConversation,
          onDeleteConversation: deleteConversation,
          onExportConversation: exportConversation,
          onRequestDeleteConfirm: showDeleteConfirm
        });
      }
    }
    return removed;
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
    // Native button activation wins when an action button inside the list has
    // focus: otherwise Enter on the export/delete button would be hijacked to
    // switch conversations instead of clicking the button.
    if (event.target?.closest?.('.ai-topic-export, .ai-topic-delete')) {
      return;
    }

    // While the delete confirmation overlay is open its document-level
    // handler owns Enter/Escape, and stray keypresses (focus still sits on
    // the list after Delete/Backspace) must not act underneath it.
    if (AIStore.state.confirmDialogCallback) {
      return;
    }

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

      case 'e':
      case 'E':
        event.preventDefault();
        if (AIStore.state.keyboardSelectedIndex >= 0 && AIStore.state.keyboardSelectedIndex < filteredConversations.length) {
          exportConversation(filteredConversations[AIStore.state.keyboardSelectedIndex].id);
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

    const targetConversation = AIStore.getCurrentConversation();
    const targetUserId = userMsg.id;
    const targetAssistantId = assistantMsg.id;

    const assistantElements = elements.container?.querySelectorAll('.ai-message-assistant');
    const streamingElement = assistantElements ? assistantElements[assistantElements.length - 1] : null;
    const streamingTextElement = streamingElement?.querySelector('.ai-message-text');

    let accumulatedContent = '';
    let lastRenderTime = 0;
    const RENDER_THROTTLE_MS = 50;
    let streamAborted = false;

    try {
      let result;

      if (networkStatus.isOffline) {
        result = OfflineMode.getResponse(userMessage);

        if (result.success && result.content) {
          const chunks = result.content.split('');

          for (let index = 0; index < chunks.length; index++) {
            // Check this request's own signal, not the global controller: a
            // new message sent right after Stop replaces the global abort
            // controller, which would mask this request's abort and let the
            // full offline response persist instead of the partial content
            // the user stopped (issue #600).
            if (abortController.signal.aborted) {
              streamAborted = true;
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

          if (!streamAborted) {
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
        // Finalize the exact assistant message created for this request, not
        // whatever is last in the current conversation: a newer request may
        // have started (or the conversation switched) before this one settled.
        if (assistantMsg?.isStreaming) {
          assistantMsg.isStreaming = false;
          // Offline mode simulates streaming with a chunk loop that breaks on
          // stop; keep the partial content or mark the message as cancelled
          // instead of persisting the full response the user chose to stop.
          assistantMsg.content = streamAborted
            ? accumulatedContent || '[Cancelled]'
            : accumulatedContent || result.content || '';
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
        if (assistantMsg?.isStreaming) {
          assistantMsg.isStreaming = false;
          assistantMsg.content = accumulatedContent || '[Cancelled]';
        }

        if (streamingElement && accumulatedContent) {
          const copyBtn = streamingElement.querySelector('.ai-message-copy');
          if (copyBtn) {
            copyBtn.dataset.content = accumulatedContent.replace(/<[^>]*>/g, '').trim();
          }
        }

        AIStore.saveConversations();
        // Re-render so the '[Cancelled]' marker (or the partial content)
        // becomes visible: the streaming text node was blank when the user
        // stopped before the first chunk, and stopStreaming only removed the
        // streaming class.
        renderConversationUI();
      } else {
        showError(result.error);
        removeFailedMessages(targetConversation, targetUserId, targetAssistantId);
      }
    } catch (error) {
      if (error.name === 'AbortError' || AIStore.state.abortController === null) {
        if (assistantMsg?.isStreaming) {
          assistantMsg.isStreaming = false;
          assistantMsg.content = accumulatedContent || '[Cancelled]';
        }
        AIStore.saveConversations();
        // Re-render so the '[Cancelled]' marker (or the partial content)
        // becomes visible when the user stopped before the first chunk.
        renderConversationUI();
      } else {
        showError(getTranslation('aiError'));
        console.error('AI sendMessage error:', error);
        removeFailedMessages(targetConversation, targetUserId, targetAssistantId);
      }
    }

    // Only the latest request may clear the loading state: when a newer
    // request started before this one settled (Stop re-enables the input
    // immediately), leave its state and abort controller intact.
    if (AIStore.state.abortController === null || AIStore.state.abortController === abortController) {
      hideLoading();
    }
  }

  function stopStreaming() {
    if (AIStore.state.abortController) {
      AIStore.state.abortController.abort();
      AIStore.setAbortController(null);
    } else {
      // No in-flight request will settle the message state later, so finalize
      // defensively to avoid leaving a message stuck in the streaming state.
      const conversation = AIStore.getCurrentConversation();
      if (conversation && conversation.messages.length > 0) {
        const lastMsg = conversation.messages[conversation.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          lastMsg.content = lastMsg.content || '[Cancelled]';
          lastMsg.isStreaming = false;
          AIStore.saveConversations();
          // Re-render so the '[Cancelled]' marker (or existing partial
          // content) becomes visible instead of a blank streaming bubble.
          renderConversationUI();
        }
      }
    }

    // When a request IS in flight, do NOT finalize the message here: the
    // partial text lives in sendMessage's local accumulatedContent, and the
    // aborted request writes it into lastMsg.content (or a '[Cancelled]'
    // marker) when it settles. Finalizing synchronously would persist an
    // empty message instead (issue #600).

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

    if (elements.exportAllBtn) {
      elements.exportAllBtn.addEventListener('click', exportAllConversations);
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

    window.addEventListener('themeChanged', () => AIRenderer.applyThemeToAI());

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
    isAvailable,
    exportConversation,
    exportAllConversations
  };
})();

window.AIService = AIService;