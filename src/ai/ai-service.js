// src/ai/ai-service.js - AI service controller

const AIService = (function() {
  const elements = AIRenderer.getElements();
  const TRANSLATION_FALLBACKS = {
    aiThinking: 'Thinking…',
    aiSearchingWeb: 'Searching the web…',
    aiGroundingFallback: 'Web search is unavailable. Answering without live web data.'
  };
  let activeConfirmKeydownHandler = null;
  // The dialog is only faded out, so its buttons stay focusable after it
  // closed and keep swallowing the keyboard. The closed dialog is therefore
  // marked inert, and the focus it took is remembered so it can be handed
  // back when the dialog closes.
  let confirmDialogReturnFocus = null;

  /**
   * Remembers the element that has focus before the delete confirmation
   * dialog takes it, so it can be handed back when the dialog closes.
   */
  function captureConfirmDialogReturnFocus() {
    const active = document.activeElement;
    // Only a focus outside the dialog is worth remembering, and an already
    // open dialog keeps the target it captured the first time.
    if (active instanceof HTMLElement &&
      active !== document.body &&
      !elements.confirmDialog.contains(active)) {
      confirmDialogReturnFocus = active;
    }
  }

  /**
   * Restores the focus the delete confirmation dialog captured, falling back
   * to the topics list when a confirmed delete detached the original element.
   */
  function restoreConfirmDialogReturnFocus() {
    const previous = confirmDialogReturnFocus;
    confirmDialogReturnFocus = null;
    if (!previous) return;

    // Confirming the delete re-renders the topics list, which detaches the
    // row that opened the dialog; fall back to the list itself so the arrow
    // and Delete keys keep working.
    const target = previous.isConnected ? previous : elements.topicsList;
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    }
  }

  function getTranslation(key) {
    if (window.i18n && window.i18n.t) {
      const translated = window.i18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return TRANSLATION_FALLBACKS[key] || key;
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
      onRenameConversation: renameConversation,
      onRequestDeleteConfirm: showDeleteConfirm
    });

    if (renderMessages) {
      AIRenderer.renderMessages();
    }
  }

  function rerenderOnSaveFailure(saveResult) {
    void Promise.resolve(saveResult).then(
      success => {
        if (success === false) {
          renderConversationUI();
        }
      },
      () => {
        renderConversationUI();
      }
    );
  }

  function showToast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.warn('[ai-service] showToast unavailable; message dropped:', message);
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

  /**
   * Opens the delete confirmation dialog for a conversation.
   *
   * Only the dialog's own buttons act on Enter (Cancel cancels, Delete
   * deletes): the document-level handler deliberately confirms nothing, so a
   * keypress that is not on the Delete button can never delete (#889).
   * @param {Function} onConfirm Callback that runs when the delete is confirmed.
   */
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
    // The closed dialog is inert so its (invisible) buttons cannot be
    // reached by Tab; opening it makes them available again.
    elements.confirmDialog.removeAttribute('inert');

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

    const newOverlay = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(newOverlay, overlay);

    newCancelBtn.addEventListener('click', closeDeleteConfirm);
    newDeleteBtn.addEventListener('click', () => {
      const callback = AIStore.state.confirmDialogCallback;
      hideDeleteConfirm();
      if (callback) {
        callback();
      }
      // The confirmed delete re-renders the topics list, which detaches the
      // row that had focus, so the focus is only restored afterwards.
      restoreConfirmDialogReturnFocus();
    });
    newOverlay.addEventListener('click', closeDeleteConfirm);

    // Focus moves into the dialog when it opens: the cloneNode() calls above
    // replace the buttons (and the focused element with them), which would
    // otherwise drop focus back to wherever the user was. The Cancel button
    // is the dialog's first control and its safe default.
    captureConfirmDialogReturnFocus();
    newCancelBtn.focus();

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        closeDeleteConfirm();
      }
      // Enter is deliberately not handled here: the dialog's own buttons
      // activate natively on Enter (Cancel cancels, Delete deletes), so
      // confirming from the document level as well made Enter on Cancel
      // destroy the conversation (#889).
    };

    activeConfirmKeydownHandler = handleKeydown;

    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * Closes the delete confirmation dialog without running the stored
   * callback, and makes its buttons unreachable while it is invisible.
   */
  function hideDeleteConfirm() {
    cacheElements();

    if (elements.confirmDialog) {
      elements.confirmDialog.classList.remove('ai-confirm-open');
      // The dialog is only faded out, so its buttons would stay focusable and
      // keep swallowing the keyboard. Marking it inert also stops the shared
      // modal helper (accessibility.js) from restoring focus to a button the
      // user can no longer see.
      elements.confirmDialog.setAttribute('inert', '');
    }

    if (activeConfirmKeydownHandler) {
      document.removeEventListener('keydown', activeConfirmKeydownHandler);
      activeConfirmKeydownHandler = null;
    }

    AIStore.clearConfirmDialogCallback();
  }

  /**
   * Dismisses the delete confirmation dialog the way the user asked
   * (Escape, Cancel or the overlay) and hands focus back to where it was.
   */
  function closeDeleteConfirm() {
    hideDeleteConfirm();
    restoreConfirmDialogReturnFocus();
  }

  function setLoadingStatus(message) {
    if (!elements.loadingIndicator) return;
    let status = elements.loadingIndicator.querySelector('.ai-loading-status');
    if (!status) {
      status = document.createElement('span');
      status.className = 'ai-loading-status';
      elements.loadingIndicator.appendChild(status);
    }
    status.textContent = message || '';
    status.hidden = !message;
  }

  function showLoading(statusMessage = null) {
    AIStore.setLoading(true);
    AIStore.setStreaming(true);

    if (elements.loadingIndicator) {
      elements.loadingIndicator.style.display = 'flex';
      setLoadingStatus(statusMessage || getTranslation('aiThinking'));
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
      setLoadingStatus('');
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

    // The final render runs while isLoading is still true (which hides the
    // button), so re-evaluate it once the request is fully over.
    AIRenderer.updateRegenerateButton();
  }

  function showError(error) {
    if (elements.errorDisplay) {
      elements.errorDisplay.textContent = error;
      elements.errorDisplay.style.display = 'block';
    }
  }

  /**
   * Removes the empty assistant bubble a failed request created (#997).
   *
   * The user's prompt deliberately stays in the conversation: the Regenerate
   * action (and a plain follow-up) can re-send it, so a network error, rate
   * limit or bad answer no longer forces the user to retype the question.
   * The old cleanup deleted both messages and left an empty thread.
   */
  function removeFailedAssistantMessage(targetConversationId, assistantId) {
    if (!targetConversationId || !assistantId) return false;
    // Resolve the live conversation object by id: the captured reference may
    // be stale if AIStore.loadConversations() ran while the request was in
    // flight (e.g. reopening the modal), which replaces state.conversations
    // with fresh clones.
    let conversation = null;
    if (typeof targetConversationId === 'string') {
      conversation = AIStore.state.conversations.find(c => c.id === targetConversationId) || null;
    } else if (targetConversationId && typeof targetConversationId.id === 'string') {
      conversation = AIStore.state.conversations.find(c => c.id === targetConversationId.id) || targetConversationId;
    }
    if (!conversation || !Array.isArray(conversation.messages)) return false;
    const previousState = AIStore.createSaveSnapshot();
    let removed = false;
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const messageId = conversation.messages[i] && conversation.messages[i].id;
      if (messageId === assistantId) {
        conversation.messages.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      conversation.updatedAt = Date.now();

      const renderCurrentConversation = () => {
        const current = AIStore.getCurrentConversation && AIStore.getCurrentConversation();
        if (current && current.id === conversation.id) {
          AIRenderer.renderMessages();
        } else {
          AIRenderer.renderTopicsList({
            onSelectConversation: switchConversation,
            onDeleteConversation: deleteConversation,
            onExportConversation: exportConversation,
            onRenameConversation: renameConversation,
            onRequestDeleteConfirm: showDeleteConfirm
          });
        }
      };

      const saveResult = AIStore.saveConversations(previousState);
      renderCurrentConversation();

      void Promise.resolve(saveResult)
        .then(success => {
          if (success === false) {
            renderCurrentConversation();
          }
        })
        .catch(() => {
          renderCurrentConversation();
        });
    }
    return removed;
  }

  function openModal() {
    if (!AIRenderer.hasModal()) return;

    cacheElements();
    if (!elements.modal) return;

    elements.modal.classList.add('ai-modal-open');
    AIRenderer.applyThemeToAI();

    const streamingSnapshot = (AIStore.state.isStreaming || AIStore.state.isLoading)
      ? (() => {
        const cur = AIStore.getCurrentConversation();
        const msg = cur?.messages?.find(message => message.isStreaming);
        return msg ? { conversationId: cur.id, messageId: msg.id, content: msg.content, isStreaming: msg.isStreaming } : null;
      })()
      : null;

    AIStore.loadConversations();

    if (streamingSnapshot) {
      const restoredConversation = AIStore.state.conversations.find(conversation => conversation.id === streamingSnapshot.conversationId);
      if (restoredConversation) {
        const restoredMsg = restoredConversation.messages.find(message => message.id === streamingSnapshot.messageId);
        if (restoredMsg) {
          restoredMsg.content = streamingSnapshot.content;
          restoredMsg.isStreaming = streamingSnapshot.isStreaming;
        }
      }
    }

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

      const streamingMsg = AIStore.getCurrentMessages().find(message => message.isStreaming);
      if (streamingMsg && streamingMsg.content) {
        const liveEl = document.getElementById('ai-chat-container')
          ?.querySelector('[data-message-id="' + streamingMsg.id + '"] .ai-message-text');
        if (liveEl) {
          AIRenderer.updateStreamingContent(liveEl, streamingMsg.content);
          liveEl.classList.add('ai-message-streaming');
        }
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

  function renameConversation(conversationId, title) {
    if (!AIStore.renameConversation(conversationId, title, rerenderOnSaveFailure)) return false;

    // Only the sidebar label changed, so skip the chat repaint; the topics
    // list signature carries conversation.title, which refreshes the row. A
    // storage rejection is rolled back by AIStore and observed above, so the
    // sidebar repaints from rerenderOnSaveFailure instead of staying stale.
    renderConversationUI({ renderMessages: false });
    return true;
  }

  function handleTopicsKeydown(event) {
    // Native button activation wins when an action button inside the list has
    // focus: otherwise Enter on the export/delete/rename button (or a keystroke
    // in the inline rename editor) would be hijacked to switch conversations
    // instead of acting on the control.
    if (event.target?.closest?.('.ai-topic-export, .ai-topic-delete, .ai-topic-rename, .ai-topic-rename-input')) {
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
    if (typeof AIRenderer.updateWebGroundingControl === 'function') {
      AIRenderer.updateWebGroundingControl(status.isOffline);
    }

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

  /**
   * Sends a user message after trimming and rejecting blank input.
   * @param {string} userMessage The message text to send.
   * @param {object} [options] Request options.
   * @param {boolean} [options.reuseExistingUserMessage] Regenerate mode: the
   *   prompt is already the last stored user message (its content must match),
   *   so do not append a duplicate copy of it. Used by regenerate().
   * @param {Function} [options.onFailure] Runs when the request produced no
   *   answer at all (reuse bail-out, API error without content, thrown
   *   request). Regenerate mode uses it to restore the answer it replaced.
   */
  async function sendMessage(userMessage, options = {}) {
    const reuseExistingUserMessage = options.reuseExistingUserMessage === true;
    const onFailure = typeof options.onFailure === 'function' ? options.onFailure : null;
    console.log('[AI Debug] sendMessage called - State:', {
      hasMessage: !!userMessage,
      isLoading: AIStore.state.isLoading,
      isStreaming: AIStore.state.isStreaming,
      hasAbortController: AIStore.state.abortController !== null
    });

    const normalizedUserMessage = typeof userMessage === 'string' ? userMessage.trim() : '';

    if (!normalizedUserMessage || AIStore.state.isLoading) {
      console.log('[AI Debug] sendMessage returning early - isLoading:', AIStore.state.isLoading);
      if (AIStore.state.isLoading) {
        showError(getTranslation('aiRequestInProgress') || 'A request is already in progress. Please wait for it to complete.');
      }
      return;
    }

    const networkStatus = NetworkDetector.getStatus();
    const groundingEnabled = !networkStatus.isOffline
      && window.OpenRouterAPI.isWebGroundingEnabled();
    const currentMessages = AIStore.getCurrentMessages();
    const lastStoredMessage = currentMessages[currentMessages.length - 1];

    if (
      reuseExistingUserMessage
      && (!lastStoredMessage
        || lastStoredMessage.role !== 'user'
        || lastStoredMessage.content !== normalizedUserMessage)
    ) {
      // regenerate() validated this before mutating anything; if the
      // conversation changed underneath us, bail out instead of appending a
      // second copy of the prompt (or sending a prompt that was removed).
      if (onFailure) onFailure();
      return;
    }

    if (!reuseExistingUserMessage) {
      AIStore.addMessageToConversation({
        role: 'user',
        content: normalizedUserMessage,
        timestamp: Date.now()
      });
      renderConversationUI();

      if (elements.input) {
        elements.input.value = '';
      }
    }

    showLoading(
      groundingEnabled
        ? getTranslation('aiSearchingWeb')
        : getTranslation('aiThinking')
    );

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
      isStreaming: true,
      grounded: groundingEnabled
    };

    AIStore.addMessageToConversation(assistantMsg);
    renderConversationUI();

    const targetConversationId = AIStore.getCurrentConversation()?.id || null;
    const targetAssistantId = assistantMsg.id;
    // Keep this conversation out of size trimming while the request is open:
    // switching chats mid-request must not evict the messages written here.
    AIStore.setInFlightConversation(targetConversationId);

    function getLiveStreamingTextEl() {
      const container = document.getElementById('ai-chat-container');
      if (!container || !assistantMsg.id) return null;
      return container.querySelector('[data-message-id="' + assistantMsg.id + '"] .ai-message-text');
    }

    function getLiveStreamingEl() {
      const container = document.getElementById('ai-chat-container');
      if (!container || !assistantMsg.id) return null;
      return container.querySelector('[data-message-id="' + assistantMsg.id + '"]');
    }

    function getLiveStoredMessage() {
      if (!assistantMsg.id) return null;
      for (let index = 0; index < AIStore.state.conversations.length; index++) {
        const conversation = AIStore.state.conversations[index];
        const found = conversation.messages.find(message => message.id === assistantMsg.id);
        if (found) return found;
      }
      return null;
    }

    function syncContentToStore(content) {
      assistantMsg.content = content;
      const live = getLiveStoredMessage();
      if (live && live !== assistantMsg) {
        live.content = content;
      }
    }

    function syncStreamingFlag(flag) {
      assistantMsg.isStreaming = flag;
      const live = getLiveStoredMessage();
      if (live && live !== assistantMsg) {
        live.isStreaming = flag;
      }
    }

    function syncGroundingFlag(flag) {
      assistantMsg.grounded = flag;
      const live = getLiveStoredMessage();
      if (live && live !== assistantMsg) {
        live.grounded = flag;
      }
    }

    let accumulatedContent = '';
    let lastRenderTime = 0;
    const RENDER_THROTTLE_MS = 50;
    let streamAborted = false;

    try {
      let result;

      if (networkStatus.isOffline) {
        result = OfflineMode.getResponse(userMessage);

        if (result.success && typeof result.content !== 'string') {
          result = { ...result, content: OfflineMode.getAcknowledgment().content };
        }

        // An offline answer is a completed answer, not a transport failure:
        // getResponse also answers with success:false and a content (a unit
        // conversion it cannot make, e.g. "10 km to furlong"). Streaming that
        // content keeps the question and its answer in the conversation; the
        // old success check fell through to the failure cleanup, which
        // destroyed the user's message (#872).
        if (result.content) {
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
            syncContentToStore(accumulatedContent);

            const now = Date.now();
            if (now - lastRenderTime >= RENDER_THROTTLE_MS || index === chunks.length - 1) {
              const liveEl = getLiveStreamingTextEl();
              if (liveEl) AIRenderer.updateStreamingContent(liveEl, accumulatedContent);
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
            syncContentToStore(accumulatedContent);
            const liveEl = getLiveStreamingTextEl();
            if (liveEl) AIRenderer.updateStreamingContent(liveEl, accumulatedContent);
          }
        }
      } else {
        const handleStreamingChunk = chunk => {
          accumulatedContent += chunk;
          syncContentToStore(accumulatedContent);

          if (groundingEnabled) {
            setLoadingStatus(getTranslation('aiThinking'));
          }

          const now = Date.now();
            if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
              const liveEl = getLiveStreamingTextEl();
              if (liveEl) AIRenderer.updateStreamingContent(liveEl, accumulatedContent);
              lastRenderTime = now;

              if (!AIStore.state.isUserScrolledUp) {
                AIRenderer.scrollToBottom(false);
              }
            }
          };

        result = await window.OpenRouterAPI.sendMessageStreaming(
          userMessage,
          historyForAPI,
          handleStreamingChunk,
          abortController.signal,
          { grounding: groundingEnabled }
        );

        if (
          groundingEnabled
          && !result.success
          && !result.aborted
          && !accumulatedContent
        ) {
          showError(getTranslation('aiGroundingFallback'));
          syncGroundingFlag(false);
          setLoadingStatus(getTranslation('aiThinking'));

          result = await window.OpenRouterAPI.sendMessageStreaming(
            userMessage,
            historyForAPI,
            handleStreamingChunk,
            abortController.signal,
            { grounding: false }
          );
        }

        if (groundingEnabled && result.success && result.grounding === 'unavailable') {
          showError(getTranslation('aiGroundingFallback'));
          syncGroundingFlag(false);
        }

        if (accumulatedContent && !result.aborted) {
          syncContentToStore(accumulatedContent);
          const liveEl = getLiveStreamingTextEl();
          if (liveEl) AIRenderer.updateStreamingContent(liveEl, accumulatedContent);
        }
      }

      // An offline answer finished the moment getResponse returned it, whatever
      // its success flag says: a conversion the offline engine cannot make
      // answers with success:false AND the content to show, which is a
      // completed answer, not a transport failure that should destroy the
      // user's message (#872).
      if (result.success || result.mode === 'offline') {
        // Finalize the exact assistant message created for this request, not
        // whatever is last in the current conversation: a newer request may
        // have started (or the conversation switched) before this one settled.
        if (assistantMsg?.isStreaming) {
          const finalContent = streamAborted
            ? accumulatedContent || '[Cancelled]'
            : accumulatedContent || result.content || '';
          syncStreamingFlag(false);
          syncContentToStore(finalContent);
        }

        {
          const liveEl = getLiveStreamingTextEl();
          if (liveEl) liveEl.classList.remove('ai-message-streaming');
        }

        {
          const liveEl = getLiveStreamingEl();
          const copyBtn = liveEl?.querySelector('.ai-message-copy');
          if (copyBtn && accumulatedContent) {
            copyBtn.dataset.content = accumulatedContent.replace(/<[^<>]*>/g, '').trim();
          }
        }

        rerenderOnSaveFailure(AIStore.saveConversations());
        renderConversationUI();
      } else if (result.aborted) {
        if (assistantMsg?.isStreaming) {
          syncStreamingFlag(false);
          syncContentToStore(accumulatedContent || '[Cancelled]');
        }

        {
          const liveEl = getLiveStreamingEl();
          const copyBtn = liveEl?.querySelector('.ai-message-copy');
          if (copyBtn && accumulatedContent) {
            copyBtn.dataset.content = accumulatedContent.replace(/<[^<>]*>/g, '').trim();
          }
        }

        rerenderOnSaveFailure(AIStore.saveConversations());
        // Re-render so the '[Cancelled]' marker (or the partial content)
        // becomes visible: the streaming text node was blank when the user
        // stopped before the first chunk, and stopStreaming only removed the
        // streaming class.
        renderConversationUI();
      } else {
        const failedPartialContent = result.partialContent || accumulatedContent || '';

        if (failedPartialContent) {
          // The stream failed after content was already delivered: keep the
          // partial answer as the finalized assistant message instead of
          // deleting it (#843).
          showError(result.error);

          if (assistantMsg?.isStreaming) {
            syncStreamingFlag(false);
            syncContentToStore(failedPartialContent);
          }

          {
            const liveEl = getLiveStreamingEl();
            const copyBtn = liveEl?.querySelector('.ai-message-copy');
            if (copyBtn) {
              copyBtn.dataset.content = failedPartialContent.replace(/<[^<>]*>/g, '').trim();
            }
          }

          rerenderOnSaveFailure(AIStore.saveConversations());
          renderConversationUI();
        } else {
          showError(result.error);
          removeFailedAssistantMessage(targetConversationId, targetAssistantId);
          if (onFailure) onFailure();
        }
      }
    } catch (error) {
      if (error.name === 'AbortError' || AIStore.state.abortController === null) {
        if (assistantMsg?.isStreaming) {
          syncStreamingFlag(false);
          syncContentToStore(accumulatedContent || '[Cancelled]');
        }
        rerenderOnSaveFailure(AIStore.saveConversations());
        // Re-render so the '[Cancelled]' marker (or the partial content)
        // becomes visible when the user stopped before the first chunk.
        renderConversationUI();
      } else {
        showError(getTranslation('aiError'));
        console.error('AI sendMessage error:', error);
        removeFailedAssistantMessage(targetConversationId, targetAssistantId);
        if (onFailure) onFailure();
      }
    }

    // Only the latest request may clear the loading state: when a newer
    // request started before this one settled (Stop re-enables the input
    // immediately), leave its state and abort controller intact.
    if (AIStore.state.abortController === null || AIStore.state.abortController === abortController) {
      AIStore.setInFlightConversation(null);
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
          rerenderOnSaveFailure(AIStore.saveConversations());
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

  /**
   * Re-sends the last user prompt through sendMessage() and replaces the
   * answer it produced (issue #997).
   *
   * Works on a dangling prompt too: after a failed request the prompt is the
   * last message, so it is re-sent without appending a duplicate copy.
   * @returns {Promise<boolean>} true when a new request was started.
   */
  async function regenerate() {
    if (AIStore.state.isLoading) {
      showError(getTranslation('aiRequestInProgress') || 'A request is already in progress. Please wait for it to complete.');
      return false;
    }

    const conversation = AIStore.getCurrentConversation();
    const messages = conversation ? conversation.messages : [];
    if (!Array.isArray(messages) || messages.length === 0) return false;

    const lastMessage = messages[messages.length - 1];
    let prompt;

    if (lastMessage.role === 'assistant') {
      // Nearest user prompt above the last answer (usually the message right
      // before it); scan instead of slicing -1 in case the answer was cleaned
      // up or an empty message sits in between.
      for (let index = messages.length - 2; index >= 0; index--) {
        if (messages[index].role === 'user') {
          prompt = messages[index].content;
          break;
        }
      }
    } else if (lastMessage.role === 'user') {
      prompt = lastMessage.content;
    }

    if (typeof prompt !== 'string' || !prompt.trim()) return false;

    let replacedAnswer = null;
    if (lastMessage.role === 'assistant') {
      // Validate first: never drop the answer if there is nothing to re-send.
      const previousState = AIStore.createSaveSnapshot();
      replacedAnswer = messages[messages.length - 1];
      messages.splice(messages.length - 1, 1);
      conversation.updatedAt = Date.now();
      rerenderOnSaveFailure(AIStore.saveConversations(previousState));
      renderConversationUI();
    }

    const sendOptions = { reuseExistingUserMessage: true };
    if (replacedAnswer) {
      // The old answer only leaves the conversation once a replacement is on
      // the way; a request that fails without producing one brings it back.
      const conversationId = conversation.id;
      sendOptions.onFailure = () => restoreReplacedAnswer(conversationId, prompt, replacedAnswer);
    }

    await sendMessage(prompt, sendOptions);
    return true;
  }

  /**
   * Puts back the answer a failed regeneration replaced (issue #997).
   *
   * The answer is removed before the request starts so it is not sent to the
   * API as history; when that request then fails without producing any
   * content (network error, rate limit), the original answer must not be
   * lost. It is only re-inserted while the reused prompt is still the last
   * message: a newer request that already answered owns the tail then, and a
   * stopped or partial answer is a replacement in its own right.
   * @param {string} conversationId Conversation that held the answer.
   * @param {string} prompt The regenerated user prompt.
   * @param {object} replacedAnswer The removed assistant message.
   */
  function restoreReplacedAnswer(conversationId, prompt, replacedAnswer) {
    const conversation = AIStore.state.conversations.find(item => item.id === conversationId);
    if (!conversation || !Array.isArray(conversation.messages)) return;

    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const promptIsLast = lastMessage
      && lastMessage.role === 'user'
      && lastMessage.content === prompt;
    if (!promptIsLast) return;
    if (conversation.messages.some(message => message.id === replacedAnswer.id)) return;

    const previousState = AIStore.createSaveSnapshot();
    conversation.messages.push(replacedAnswer);
    conversation.updatedAt = Date.now();
    rerenderOnSaveFailure(AIStore.saveConversations(previousState));
    renderConversationUI();
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

      elements.container.addEventListener('click', event => {
        const regenerateBtn = event.target && event.target.closest
          ? event.target.closest('.ai-regenerate')
          : null;
        if (regenerateBtn) {
          void regenerate();
        }
      });
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

    if (typeof AIRenderer.initWebGroundingControl === 'function') {
      AIRenderer.initWebGroundingControl();
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
    regenerate,
    stopStreaming,
    quickSearch,
    isAvailable,
    exportConversation,
    exportAllConversations,
    renameConversation
  };
})();

window.AIService = AIService;