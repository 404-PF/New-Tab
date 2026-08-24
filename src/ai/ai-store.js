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
    return Boolean(
      conversation &&
      typeof conversation === 'object' &&
      typeof conversation.id === 'string' &&
      conversation.id &&
      typeof conversation.title === 'string' &&
      Array.isArray(conversation.messages) &&
      conversation.messages.every(message =>
        message &&
        typeof message === 'object' &&
        typeof message.role === 'string' &&
        typeof message.content === 'string'
      ) &&
      typeof conversation.createdAt === 'number' &&
      typeof conversation.updatedAt === 'number'
    );
  }

  function recoverConversations() {
    const newConversation = createNewConversation();
    state.conversations = [newConversation];
    state.currentConversationId = newConversation.id;
    saveConversations();
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
        const newConversation = createNewConversation();
        state.conversations.push(newConversation);
        state.currentConversationId = newConversation.id;
        saveConversations();
      }
    } catch (error) {
      console.warn('Failed to load conversations:', error);
      recoverConversations();
    }
  }

  function saveConversations() {
    try {
      if (state.conversations.length > MAX_CONVERSATIONS) {
        // Keep the newest MAX_CONVERSATIONS conversations, but never silently
        // drop the active one (issue #586): if it falls outside the newest
        // window, swap it in for the oldest survivor so an in-progress session
        // is not lost from storage.
        const kept = state.conversations.slice(0, MAX_CONVERSATIONS);
        const active = state.conversations.find(conversation => conversation.id === state.currentConversationId);
        if (active && !kept.some(conversation => conversation.id === active.id)) {
          kept[kept.length - 1] = active;
        }
        state.conversations = kept;
      }

      // currentConversationId should always resolve to a survivor, whether or
      // not the cap was applied; only reset it when it referenced a
      // conversation that no longer exists.
      if (!state.conversations.some(conversation => conversation.id === state.currentConversationId)) {
        state.currentConversationId = state.conversations[0] ? state.conversations[0].id : null;
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

    if (!message.id) {
      message.id = generateId();
    }

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
    // message); flatten them so the heading stays on a single line.
    // [^\S\r\n] = whitespace excluding CR/LF; disjoint classes avoid the
    // backtracking shape SonarCloud S8786 flags on \s*[\r\n]+\s*.
    const title = String(conversation.title || '')
      .replace(/[^\S\r\n]*[\r\n]+[^\S\r\n]*/g, ' ')
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