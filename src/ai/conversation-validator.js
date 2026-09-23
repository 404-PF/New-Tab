// src/ai/conversation-validator.js - Shared AI conversation shape validation

(function () {
  function isValidConversation(conversation) {
    return Boolean(
      conversation &&
      typeof conversation === 'object' &&
      typeof conversation.id === 'string' &&
      conversation.id &&
      typeof conversation.title === 'string' &&
      Array.isArray(conversation.messages) &&
      conversation.messages.every(function (message) {
        if (!message || typeof message !== 'object') return false;
        if (typeof message.role !== 'string' || typeof message.content !== 'string') return false;
        return message.id === undefined || message.id === null || typeof message.id === 'string';
      }) &&
      typeof conversation.createdAt === 'number' &&
      typeof conversation.updatedAt === 'number'
    );
  }

  window.isValidConversation = isValidConversation;
})();
