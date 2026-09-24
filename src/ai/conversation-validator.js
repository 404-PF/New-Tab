// src/ai/conversation-validator.js - Shared AI conversation shape validation
// Keep import and runtime validation in one place so their accepted shape stays aligned.

(function () {
  const VALID_MESSAGE_ROLES = ['user', 'assistant', 'system'];

  /** Validates the persisted shape of a single AI conversation message. */
  function isValidMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (typeof message.role !== 'string') return false;
    if (!VALID_MESSAGE_ROLES.includes(message.role)) return false;
    if (typeof message.content !== 'string') return false;

    return message.id === undefined ||
      message.id === null ||
      typeof message.id === 'string';
  }

  /** Validates the persisted AI conversation shape used by runtime and imports. */
  function isValidConversation(conversation) {
    if (!conversation || typeof conversation !== 'object') return false;
    if (typeof conversation.id !== 'string' || !conversation.id) return false;
    if (typeof conversation.title !== 'string' || !conversation.title.trim()) return false;
    if (!Array.isArray(conversation.messages)) return false;
    if (!conversation.messages.every(isValidMessage)) return false;
    if (!Number.isFinite(conversation.createdAt)) return false;
    if (!Number.isFinite(conversation.updatedAt)) return false;

    return true;
  }

  window.isValidConversation = isValidConversation;
})();
