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
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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

  function loadConversations() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.conversations);
      state.conversations = stored ? JSON.parse(stored) : [];

      const currentId = localStorage.getItem(STORAGE_KEYS.currentId);

      if (currentId && state.conversations.find(conversation => conversation.id === currentId)) {
        state.currentConversationId = currentId;
      } else if (state.conversations.length > 0) {
        state.currentConversationId = state.conversations[0].id;
      } else {
        const newConversation = createNewConversation();
        state.conversations.push(newConversation);
        state.currentConversationId = newConversation.id;
        saveConversations();
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      state.conversations = [];
      const newConversation = createNewConversation();
      state.conversations.push(newConversation);
      state.currentConversationId = newConversation.id;
    }
  }

  function saveConversations() {
    try {
      if (state.conversations.length > MAX_CONVERSATIONS) {
        state.conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
      }

      localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(state.conversations));
      localStorage.setItem(STORAGE_KEYS.currentId, state.currentConversationId);
    } catch (error) {
      console.error('Failed to save conversations:', error);
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

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    if (conversation.messages.length === 1 && message.role === 'user') {
      conversation.title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
    }

    saveConversations();
  }

  function createNewChat() {
    const conversation = createNewConversation();
    state.conversations.unshift(conversation);
    state.currentConversationId = conversation.id;
    saveConversations();
    return conversation;
  }

  function switchConversation(conversationId) {
    if (state.currentConversationId === conversationId) {
      return false;
    }

    state.currentConversationId = conversationId;
    saveConversations();
    return true;
  }

  function deleteConversation(conversationId) {
    const index = state.conversations.findIndex(conversation => conversation.id === conversationId);
    if (index === -1) return false;

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

    saveConversations();
    return true;
  }

  function setSearchQuery(query) {
    state.searchQuery = query;
    state.keyboardSelectedIndex = -1;
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