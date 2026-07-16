// src/ai/puter.js - Puter AI integration (serverless, keyless)
// Uses the Puter.js SDK (vendored locally at src/ai/vendor/puter.js) which
// exposes the global `puter` object. Each user pays for their own usage via
// their Puter account, so no API key or proxy server is required.

const PuterAPI = (function() {
  // Configuration
  const CONFIG = {
    // Default model used for chat completions. Puter routes to 500+ models
    // across OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek, etc.
    // Override via localStorage('aiModel') if desired.
    model: 'openai/gpt-5.4-nano',
    maxTokens: 4096,
    maxRetries: 2,
    retryDelay: 1000
  };

  /**
   * Read the configured model, falling back to the default.
   * @returns {string} Model identifier
   */
  function getModel() {
    try {
      const custom = localStorage.getItem('aiModel');
      if (custom && typeof custom === 'string' && custom.trim()) {
        return custom.trim();
      }
    } catch {
      // localStorage may be unavailable; ignore and use default
    }
    return CONFIG.model;
  }

  /**
   * Get current language
   * @returns {string} Current language code
   */
  function getCurrentLanguage() {
    if (window.i18n && window.i18n.currentLanguage) {
      return window.i18n.currentLanguage();
    }
    try {
      return localStorage.getItem('language') || 'en';
    } catch {
      return 'en';
    }
  }

  /**
   * Get translation for a key
   * @param {string} key - Translation key
   * @returns {string} Translated string or key
   */
  function getTranslation(key) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key);
    }
    // Fallback - should not happen if languages.js loads first
    console.warn('i18n not available, using fallback for:', key);
    return key;
  }

  /**
   * Get language-aware system prompt
   * @returns {string} System prompt in the user's language
   */
  function getSystemPrompt() {
    const lang = getCurrentLanguage();

    const prompts = {
      en: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.',
      zh: '你是一个有用的AI助手。请提供清晰、简洁和准确的回复。'
    };

    return prompts[lang] || prompts.en;
  }

  /**
   * Validate user input
   * @param {string} message - User message
   * @returns {Object} Validation result
   */
  function validateInput(message) {
    if (!message || typeof message !== 'string') {
      return { valid: false, error: getTranslation('aiMessageRequired') };
    }
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: getTranslation('aiMessageEmpty') };
    }
    if (trimmed.length > 2000) {
      return { valid: false, error: getTranslation('aiMessageTooLong') };
    }
    // Reject control characters except newline, carriage return, and tab
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(trimmed)) {
      return { valid: false, error: getTranslation('aiMessageInvalidChars') };
    }
    return { valid: true, message: trimmed };
  }

  /**
   * Determine whether an error represents a Puter sign-in requirement.
   * Puter prompts users to authenticate before AI usage; the SDK surfaces
   * this as a thrown error with an auth-related code/message.
   * @param {Error} error - Error thrown by puter.ai.chat
   * @returns {boolean} True if the error indicates missing authentication
   */
  function isAuthError(error) {
    if (!error) return false;
    const hasAuthIndicator = (code, message) => {
      const normalizedMessage = (message || '').toLowerCase();
      return (
        code === 'auth_required' ||
        code === 'auth_canceled' ||
        code === 'unauthorized' ||
        code === 'not_authenticated' ||
        normalizedMessage.includes('sign in') ||
        normalizedMessage.includes('signin') ||
        normalizedMessage.includes('sign-in') ||
        normalizedMessage.includes('not signed in') ||
        normalizedMessage.includes('authentication required') ||
        normalizedMessage.includes('please log in') ||
        normalizedMessage.includes('login required')
      );
    };
    const nestedError = error.error || {};
    return (
      error.status === 401 ||
      hasAuthIndicator(error.code || '', error.message || '') ||
      hasAuthIndicator(nestedError.code || '', nestedError.message || '')
    );
  }

  /**
   * Call Puter's chat API while wiring cancellation to its internal XHR.
   * The vendored SDK currently drops unknown options, including `signal`.
   * @param {Array} messages - Chat messages
   * @param {Object} options - Puter chat options
   * @param {AbortSignal|null} signal - Optional cancellation signal
   * @returns {Promise<Object>} Puter chat response
   */
  function callPuterChat(messages, options, signal) {
    if (!signal || !window.XMLHttpRequest) {
      return window.puter.ai.chat(messages, options);
    }

    const xhrPrototype = window.XMLHttpRequest.prototype;
    const originalSend = xhrPrototype.send;
    let restored = false;
    const restoreSend = () => {
      if (!restored && xhrPrototype.send === interceptedSend) {
        xhrPrototype.send = originalSend;
      }
      restored = true;
    };

    function interceptedSend(body) {
      let isChatRequest = false;
      try {
        const payload = typeof body === 'string' ? JSON.parse(body) : null;
        isChatRequest = payload && payload.interface === 'puter-chat-completion';
      } catch {
        // Ignore non-JSON requests made while Puter initializes the chat call.
      }

      if (isChatRequest) {
        const xhr = this;
        const abortRequest = () => xhr.abort();
        signal.addEventListener('abort', abortRequest, { once: true });
        xhr.addEventListener('loadend', () => {
          signal.removeEventListener('abort', abortRequest);
        }, { once: true });
        if (signal.aborted) {
          abortRequest();
          restoreSend();
          return undefined;
        }
        restoreSend();
      }

      return originalSend.call(this, body);
    }

    xhrPrototype.send = interceptedSend;
    try {
      const request = window.puter.ai.chat(messages, options);
      Promise.resolve(request).then(restoreSend, restoreSend);
      return request;
    } catch (error) {
      restoreSend();
      throw error;
    }
  }

  /**
   * Send streaming chat completion request via Puter.
   * @param {string} userMessage - User's message
   * @param {Array} conversationHistory - Previous messages
   * @param {Function} onChunk - Callback for each chunk received
   * @param {AbortSignal} signal - Optional abort signal for cancellation
   * @returns {Promise<Object>} Final result object
   */
  async function sendMessageStreaming(userMessage, conversationHistory = [], onChunk, signal = null) {
    // Validate input
    const validation = validateInput(userMessage);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Ensure the Puter SDK is available
    if (!window.puter || !window.puter.ai || typeof window.puter.ai.chat !== 'function') {
      return {
        success: false,
        error: getTranslation('aiNetworkError')
      };
    }

    // Build messages array with language-aware system prompt
    const messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      }
    ];

    // Add conversation history (last 10 messages)
    const recentHistory = conversationHistory.slice(-10);
    messages.push(...recentHistory);

    // Add current user message
    messages.push({ role: 'user', content: validation.message });

    let iterator = null;
    let abortHandler = null;

    try {
      const abortPromise = signal
        ? new Promise((_, reject) => {
          abortHandler = () => {
            const abortError = new Error('Request cancelled');
            abortError.name = 'AbortError';
            reject(abortError);
          };
          signal.addEventListener('abort', abortHandler, { once: true });
          if (signal.aborted) abortHandler();
        })
        : null;
      const request = callPuterChat(messages, {
        model: getModel(),
        max_tokens: CONFIG.maxTokens,
        stream: true
      }, signal);
      const response = abortPromise
        ? await Promise.race([request, abortPromise])
        : await request;

      // Response is an async iterable of chunks when stream: true
      let fullContent = '';
      let sawError = null;

      iterator = response[Symbol.asyncIterator]();

      while (true) {
        const next = iterator.next();
        const result = abortPromise
          ? await Promise.race([next, abortPromise])
          : await next;
        if (result.done) break;
        const part = result.value;
        // Streaming error chunk (Puter emits error parts within the stream)
        if (part && part.type === 'error') {
          sawError = part.message || getTranslation('aiError');
          continue;
        }

        const chunkText =
          (part && (part.text ?? part.content ?? part.message)) || '';
        if (chunkText) {
          fullContent += chunkText;
          if (onChunk) {
            try {
              onChunk(chunkText);
            } catch (chunkError) {
              console.error('Error in streaming callback:', chunkError);
            }
          }
        }
      }

      if (sawError) {
        return { success: false, error: sawError };
      }

      return {
        success: true,
        content: fullContent,
        usage: null,
        model: getModel()
      };

    } catch (e) {
      // Check if the request was aborted
      if (e && (e.name === 'AbortError' || (signal && signal.aborted))) {
        if (iterator && typeof iterator.return === 'function') {
          Promise.resolve(iterator.return()).catch(() => {});
        }
        return {
          success: false,
          error: 'Request cancelled',
          aborted: true
        };
      }

      // Missing Puter authentication - surface a friendly sign-in prompt
      if (isAuthError(e)) {
        return {
          success: false,
          error: getTranslation('aiPuterSignIn'),
          authRequired: true
        };
      }

      console.error('Puter AI error:', e);
      return {
        success: false,
        error: getTranslation('aiNetworkError')
      };
    } finally {
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  }

  /**
   * Quick search (single message, no history)
   * @param {string} query - Search query
   * @returns {Promise<Object>} Result object
   */
  async function quickSearch(query) {
    return sendMessageStreaming(query, []);
  }

  // ============== Public API ==============

  return {
    // Configuration
    config: CONFIG,

    // Validation
    validateInput,

    // API
    sendMessageStreaming,
    quickSearch
  };

})();

// Export to global scope
window.PuterAPI = PuterAPI;
