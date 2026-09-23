// src/ai/ai-store.js - AI conversation state and persistence

const AIStore = (function() {
  function getTranslation(key) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key);
    }
    return key;
  }

  const STORAGE_KEYS = {
    conversations: 'ai_conversations',
    currentId: 'ai_current_conversation_id'
  };

  const MAX_CONVERSATIONS = 50;

  const state = {
    currentConversationId: null,
    conversations: [],
    isLoading: false,
    isOfflineMode: false,
    abortController: null,
    isStreaming: false,
    isUserScrolledUp: false,
    scrollThreshold: 100,
    confirmDialogCallback: null,
    searchQuery: '',
    keyboardSelectedIndex: -1,
    isCtrlPressed: false,
    hoveredDeleteBtn: null,
    hoveredDeleteTooltip: null
  };

  function generateId() {
    const randomValues = new Uint32Array(2);
    crypto.getRandomValues(randomValues);
    const randomSuffix = Array.from(randomValues, value => value.toString(36)).join('');
    return 'conv_' + Date.now() + '_' + randomSuffix;
  }

  function createNewConversation() {
    return {
      id: generateId(),
      title: getTranslation('aiNewConversation'),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function isValidConversation(conversation) {
    return typeof window.isValidConversation === 'function' &&
      window.isValidConversation(conversation);
  }

  function recoverConversations() {
    const previousState = createSaveSnapshot();
    const newConversation = createNewConversation();
    state.conversations = [newConversation];
    state.currentConversationId = newConversation.id;
    saveConversationsSafely(previousState);
  }

  function loadConversations() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.conversations);
      const conversations = stored ? JSON.parse(stored) : [];

      if (!Array.isArray(conversations) || !conversations.every(isValidConversation)) {
        recoverConversations();
        return;
      }

      state.conversations = conversations;

      // Ensure every message has a stable id so the renderer can update
      // individual messages in place instead of rebuilding the whole list.
      state.conversations.forEach(conversation => {
        if (Array.isArray(conversation.messages)) {
          conversation.messages.forEach(message => {
            if (!message.id) {
              message.id = generateId();
            }
          });
        }
      });

      const currentId = localStorage.getItem(STORAGE_KEYS.currentId);

      if (currentId && state.conversations.find(conversation => conversation.id === currentId)) {
        state.currentConversationId = currentId;
      } else if (state.conversations.length > 0) {
        state.currentConversationId = state.conversations[0].id;
      } else {
        const previousState = createSaveSnapshot();
        const newConversation = createNewConversation();
        state.conversations.push(newConversation);
        state.currentConversationId = newConversation.id;
        saveConversationsSafely(previousState);
      }
    } catch (error) {
      console.warn('Failed to load conversations:', error);
      recoverConversations();
    }
  }

  function cloneSaveSnapshot(snapshot) {
    return createSaveSnapshot(snapshot.conversations, snapshot.currentConversationId);
  }

  function createSaveSnapshot(
    conversations = state.conversations,
    currentConversationId = state.currentConversationId
  ) {
    return {
      conversations: conversations.map(conversation => ({
        ...conversation,
        messages: conversation.messages.map(message => ({ ...message }))
      })),
      currentConversationId
    };
  }

  function showSaveErrorToast() {
    const message = getTranslation('aiSaveError');
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
    } else {
      console.warn(message);
    }
  }

  function persistStorageValue(key, value) {
    if (typeof localStorage.setItemAsync === 'function') {
      return localStorage.setItemAsync(key, value);
    }

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('Failed to persist conversation storage value:', error);
      return false;
    }
  }

  function restoreStorageValue(key, value) {
    if (value === null || typeof value === 'undefined') {
      if (typeof localStorage.removeItemAsync === 'function') {
        return localStorage.removeItemAsync(key);
      }

      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.warn('Failed to restore conversation storage value:', error);
        return false;
      }
    }

    return persistStorageValue(key, value);
  }

  function isPromiseLike(value) {
    return value && typeof value.then === 'function';
  }

  function settlePersistence(result, onSuccess, onFailure) {
    if (isPromiseLike(result)) {
      return result.then(onSuccess, onFailure);
    }

    return onSuccess(result);
  }

  function getPersistedStateSnapshot(conversationsValue, currentConversationId, fallbackState) {
    try {
      const conversations = conversationsValue ? JSON.parse(conversationsValue) : [];
      if (Array.isArray(conversations) && conversations.every(isValidConversation)) {
        return {
          conversations,
          currentConversationId
        };
      }
    } catch (error) {
      console.warn('Failed to parse persisted conversations for rollback:', error);
    }

    return fallbackState;
  }

  function reportSaveFailure(error, rollbackState, saveGeneration) {
    const isLatestSave = saveGeneration === saveSequence;
    if (isLatestSave && rollbackState) {
      const restoredState = cloneSaveSnapshot(rollbackState);
      state.conversations = restoredState.conversations;
      state.currentConversationId = restoredState.currentConversationId;
    }
    console.error('Failed to save conversations:', error);
    if (isLatestSave) {
      showSaveErrorToast();
    }
    return false;
  }

  function handleSaveFailure(
    error,
    conversationsWritten,
    persistedConversations,
    rollbackState,
    saveGeneration
  ) {
    const reportFailure = () => reportSaveFailure(error, rollbackState, saveGeneration);

    if (!conversationsWritten) {
      return reportFailure();
    }

    let rollbackResult;
    try {
      rollbackResult = restoreStorageValue(STORAGE_KEYS.conversations, persistedConversations);
    } catch (rollbackError) {
      console.error('Failed to roll back conversations after save failure:', rollbackError);
      return reportFailure();
    }

    return settlePersistence(
      rollbackResult,
      restored => {
        if (restored === false) {
          console.error('Failed to roll back conversations after save failure');
        }
        return reportFailure();
      },
      rollbackError => {
        console.error('Failed to roll back conversations after save failure:', rollbackError);
        return reportFailure();
      }
    );
  }

  function saveConversationsTransaction(
    nextConversations,
    nextCurrentConversationId,
    previousState,
    saveGeneration
  ) {
    let persistedConversations;
    let persistedCurrentConversationId;

    try {
      persistedConversations = localStorage.getItem(STORAGE_KEYS.conversations);
      persistedCurrentConversationId = localStorage.getItem(STORAGE_KEYS.currentId);
    } catch (error) {
      return reportSaveFailure(error, previousState, saveGeneration);
    }

    const rollbackState = getPersistedStateSnapshot(
      persistedConversations,
      persistedCurrentConversationId,
      previousState
    );
    let conversationsWritten = false;

    const handleCurrentIdWrite = success => {
      if (!success) {
        return handleSaveFailure(
          new Error('Current conversation storage write was rejected'),
          conversationsWritten,
          persistedConversations,
          rollbackState,
          saveGeneration
        );
      }

      // State is normalized before the transaction starts. Keep the live
      // conversation objects intact while committing the persisted snapshot.
      return true;
    };

    const handleConversationsWrite = success => {
      if (!success) {
        return handleSaveFailure(
          new Error('Conversation storage write was rejected'),
          conversationsWritten,
          persistedConversations,
          rollbackState,
          saveGeneration
        );
      }

      conversationsWritten = true;

      let currentIdWrite;
      try {
        currentIdWrite = persistStorageValue(
          STORAGE_KEYS.currentId,
          nextCurrentConversationId
        );
      } catch (error) {
        return handleSaveFailure(
          error,
          conversationsWritten,
          persistedConversations,
          rollbackState,
          saveGeneration
        );
      }

      return settlePersistence(
        currentIdWrite,
        handleCurrentIdWrite,
        error => handleSaveFailure(
          error,
          conversationsWritten,
          persistedConversations,
          rollbackState,
          saveGeneration
        )
      );
    };

    let conversationsWrite;
    try {
      conversationsWrite = persistStorageValue(
        STORAGE_KEYS.conversations,
        JSON.stringify(nextConversations)
      );
    } catch (error) {
      return handleSaveFailure(
        error,
        conversationsWritten,
        persistedConversations,
        rollbackState,
        saveGeneration
      );
    }

    return settlePersistence(
      conversationsWrite,
      handleConversationsWrite,
      error => handleSaveFailure(
        error,
        conversationsWritten,
        persistedConversations,
        rollbackState,
        saveGeneration
      )
    );
  }

  let saveSequence = 0;
  let saveQueue = null;

  function enqueueSave(saveTransaction) {
    const run = () => {
      try {
        return Promise.resolve(saveTransaction());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    // Start the first transaction immediately so fire-and-forget recovery saves
    // update the storage bridge in the same turn. Later saves remain serialized.
    const queuedSave = saveQueue ? saveQueue.then(run, run) : run();
    saveQueue = queuedSave;
    queuedSave.then(
      () => {
        if (saveQueue === queuedSave) saveQueue = null;
      },
      () => {
        if (saveQueue === queuedSave) saveQueue = null;
      }
    );
    return queuedSave;
  }

  function saveConversations(previousState = createSaveSnapshot()) {
    const saveGeneration = ++saveSequence;

    // Apply state normalization synchronously so callers observe the same
    // state that will be persisted, while retaining the existing conversation
    // object identities for in-flight requests and UI references.
    if (state.conversations.length > MAX_CONVERSATIONS) {
      const kept = state.conversations.slice(0, MAX_CONVERSATIONS);
      const active = state.conversations.find(
        conversation => conversation.id === state.currentConversationId
      );
      if (active && !kept.some(conversation => conversation.id === active.id)) {
        kept[kept.length - 1] = active;
      }
      state.conversations.splice(0, state.conversations.length, ...kept);
    }

    if (!state.conversations.some(
      conversation => conversation.id === state.currentConversationId
    )) {
      state.currentConversationId = state.conversations[0]
        ? state.conversations[0].id
        : null;
    }

    const nextState = createSaveSnapshot();
    const saveTransaction = () => saveConversationsTransaction(
      nextState.conversations,
      nextState.currentConversationId,
      previousState,
      saveGeneration
    );

    if (typeof localStorage.setItemAsync === 'function') {
      return enqueueSave(saveTransaction);
    }

    return saveTransaction();
  }

  function saveConversationsSafely(previousState = createSaveSnapshot()) {
    const result = saveConversations(previousState);
    if (isPromiseLike(result)) {
      void result.catch(error => {
        console.error('Unexpected conversation save rejection:', error);
      });
    }
  }

  function getCurrentConversation() {
    return state.conversations.find(conversation => conversation.id === state.currentConversationId) || state.conversations[0];
  }

  function getCurrentMessages() {
    const conversation = getCurrentConversation();
    return conversation ? conversation.messages : [];
  }

  function getFilteredConversations() {
    let filtered = [...state.conversations];

    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(conversation =>
        conversation.title.toLowerCase().includes(query) ||
        conversation.messages.some(message => message.content && message.content.toLowerCase().includes(query))
      );
    }

    return filtered;
  }

  function addMessageToConversation(message) {
    const conversation = getCurrentConversation();
    if (!conversation) return;

    const previousState = createSaveSnapshot();

    if (!message.id) {
      message.id = generateId();
    }

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    if (conversation.messages.length === 1 && message.role === 'user') {
      conversation.title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
    }

    saveConversationsSafely(previousState);
  }

  function createNewChat() {
    const previousState = createSaveSnapshot();
    const conversation = createNewConversation();
    state.conversations.unshift(conversation);
    state.currentConversationId = conversation.id;
    saveConversationsSafely(previousState);
    return conversation;
  }

  function switchConversation(conversationId) {
    if (state.currentConversationId === conversationId) {
      return false;
    }

    const previousState = createSaveSnapshot();
    state.currentConversationId = conversationId;
    saveConversationsSafely(previousState);
    return true;
  }

  function deleteConversation(conversationId) {
    const index = state.conversations.findIndex(conversation => conversation.id === conversationId);
    if (index === -1) return false;

    const previousState = createSaveSnapshot();
    state.conversations.splice(index, 1);

    if (state.currentConversationId === conversationId) {
      if (state.conversations.length > 0) {
        state.currentConversationId = state.conversations[0].id;
      } else {
        const newConversation = createNewConversation();
        state.conversations.push(newConversation);
        state.currentConversationId = newConversation.id;
      }
    }

    saveConversationsSafely(previousState);
    return true;
  }

  function setSearchQuery(query) {
    state.searchQuery = query;
    state.keyboardSelectedIndex = -1;
  }

  function sanitizeFilenameTitle(title) {
    let cleaned = String(title || '')
      // Strip characters that are illegal in filenames on common platforms
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
      .trim();
    // Drop trailing extension dots (e.g. "..." titles) without a quantified
    // overlap regex, which SonarCloud S8786 flags as super-linear.
    while (cleaned.endsWith('.')) {
      cleaned = cleaned.slice(0, -1).trimEnd();
    }
    return cleaned.slice(0, 80).trim() || 'conversation';
  }

  function formatExportTime(timestamp) {
    return typeof timestamp === 'number' ? new Date(timestamp).toLocaleString() : '';
  }

  // Same local-date shape as the todo/settings export filenames.
  function formatExportDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // Role labels stay untranslated so exported files read consistently when shared.
  function serializeConversationToMarkdown(conversation) {
    // Auto-generated titles can contain newlines (they preview the first
    // message); flatten them so the heading stays on a single line. Splitting
    // instead of a whitespace regex keeps the matcher free of quantifier
    // adjacency (SonarCloud S8786).
    const title = String(conversation.title || '')
      .split(/[\r\n]+/)
      .map(part => part.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    const lines = ['# ' + title, ''];
    (conversation.messages || []).forEach(message => {
      const label = message.role === 'user' ? 'You' : 'Assistant';
      const time = formatExportTime(message.timestamp);
      lines.push(
        (time ? '**' + label + '** _(' + time + ')_' : '**' + label + '**'),
        '',
        message.content || '',
        ''
      );
    });
    return lines.join('\n');
  }

  function exportConversation(conversationId) {
    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) return null;

    return {
      filename: sanitizeFilenameTitle(conversation.title) + '-' + formatExportDate(new Date()) + '.md',
      content: serializeConversationToMarkdown(conversation)
    };
  }

  function exportAllConversations() {
    if (!state.conversations.length) return null;

    return {
      filename: 'ai-conversations-' + formatExportDate(new Date()) + '.md',
      content: state.conversations.map(serializeConversationToMarkdown).join('\n---\n\n')
    };
  }

  function setKeyboardSelectedIndex(index) {
    state.keyboardSelectedIndex = index;
  }

  function setLoading(value) {
    state.isLoading = value;
  }

  function setStreaming(value) {
    state.isStreaming = value;
  }

  function setOfflineMode(value) {
    state.isOfflineMode = value;
  }

  function setAbortController(controller) {
    state.abortController = controller;
  }

  function setUserScrolledUp(value) {
    state.isUserScrolledUp = value;
  }

  function setConfirmDialogCallback(callback) {
    state.confirmDialogCallback = callback;
  }

  function clearConfirmDialogCallback() {
    state.confirmDialogCallback = null;
  }

  function setCtrlPressed(value) {
    state.isCtrlPressed = value;
  }

  function setHoveredDeleteTarget(button, tooltip) {
    state.hoveredDeleteBtn = button;
    state.hoveredDeleteTooltip = tooltip;
  }

  function clearHoveredDeleteTarget(button) {
    if (!button || state.hoveredDeleteBtn === button) {
      state.hoveredDeleteBtn = null;
      state.hoveredDeleteTooltip = null;
    }
  }

  return {
    state,
    STORAGE_KEYS,
    createSaveSnapshot,
    MAX_CONVERSATIONS,
    generateId,
    createNewConversation,
    loadConversations,
    saveConversations,
    getCurrentConversation,
    getCurrentMessages,
    getFilteredConversations,
    addMessageToConversation,
    createNewChat,
    switchConversation,
    deleteConversation,
    setSearchQuery,
    serializeConversationToMarkdown,
    exportConversation,
    exportAllConversations,
    setKeyboardSelectedIndex,
    setLoading,
    setStreaming,
    setOfflineMode,
    setAbortController,
    setUserScrolledUp,
    setConfirmDialogCallback,
    clearConfirmDialogCallback,
    setCtrlPressed,
    setHoveredDeleteTarget,
    clearHoveredDeleteTarget
  };
})();

window.AIStore = AIStore;