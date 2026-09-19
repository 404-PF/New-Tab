// src/ai/openrouter.js - OpenRouter API Integration via Cloudflare Proxy
// For security, API requests are proxied through Cloudflare Workers
// API key is stored server-side and never exposed to the client

const OpenRouterAPI = (function() {
  // Configuration
  const GROUNDING_STORAGE_KEY = 'aiGroundWithWeb';
  const GROUNDING_DEFAULT_ENABLED = true;
  let webGroundingEnabled = null;

  const CONFIG = {
    // Cloudflare Worker URL - UPDATE THIS AFTER DEPLOYMENT
    // Run: cd cloudflare && wrangler deploy
    // Then copy the worker URL here
    baseURL: 'https://new-tab-openrouter-proxy.lucas20220605.workers.dev',
    model: 'openrouter/free',
    maxTokens: 4096,
    maxRetries: 2,
    retryDelay: 1000,
    requestTimeout: 15000
  };

  /**
   * Get current language
   * @returns {string} Current language code
   */
  function getCurrentLanguage() {
    if (window.i18n && window.i18n.currentLanguage) {
      return window.i18n.currentLanguage();
    }
    return localStorage.getItem('language') || 'en';
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
   * Read the user's web-grounding preference.
   * @returns {boolean} Whether web grounding is enabled
   */
  function isWebGroundingEnabled() {
    if (webGroundingEnabled !== null) {
      return webGroundingEnabled;
    }

    try {
      const stored = localStorage.getItem(GROUNDING_STORAGE_KEY);
      webGroundingEnabled = stored === null ? GROUNDING_DEFAULT_ENABLED : stored === 'true';
    } catch (error) {
      console.warn('Failed to read web grounding preference:', error);
      webGroundingEnabled = GROUNDING_DEFAULT_ENABLED;
    }

    return webGroundingEnabled;
  }

  /**
   * Persist the user's web-grounding preference.
   * @param {boolean} enabled - Whether web grounding should be enabled
   * @returns {boolean} Whether the setting was persisted
   */
  function setWebGroundingEnabled(enabled) {
    webGroundingEnabled = enabled === true;

    try {
      localStorage.setItem(GROUNDING_STORAGE_KEY, webGroundingEnabled ? 'true' : 'false');
      return true;
    } catch (error) {
      console.warn('Failed to save web grounding preference:', error);
      return false;
    }
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
   * Build request headers for Cloudflare Worker proxy
   * No API key needed - it's handled server-side
   * @returns {Object} Headers object
   */
  function buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'HTTP-Referer': window.location.href,
      'X-Title': 'New Tab AI Assistant'
    };
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
   * Handle API errors
   * @param {Response} response - Fetch response
   * @returns {Object} Error information
   */
  async function handleError(response) {
    let errorMessage = getTranslation('aiError');
    let errorCode = 'UNKNOWN';

    try {
      const errorData = await response.json();
      
      switch (response.status) {
        case 401:
          errorCode = 'AUTH_ERROR';
          errorMessage = getTranslation('aiAuthError');
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          errorMessage = getTranslation('aiForbidden');
          break;
        case 429: {
          errorCode = 'RATE_LIMIT';
          const retryAfter = response.headers.get('Retry-After');
          errorMessage = retryAfter
            ? `Rate limited. Try again in ${retryAfter} seconds`
            : getTranslation('aiRateLimit');
          break;
        }
        case 500:
        case 502:
        case 503:
          errorCode = 'SERVER_ERROR';
          errorMessage = getTranslation('aiServerError');
          break;
        default:
          errorCode = errorData.error?.code || 'API_ERROR';
          errorMessage = errorData.error?.message || errorMessage;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    return { code: errorCode, message: errorMessage };
  }

  /**
   * Create a request signal that combines the caller's cancellation signal
   * with an internal controller used for the request timeout.
   * @param {AbortSignal|null} callerSignal - Optional caller-provided signal
   * @returns {{controller: AbortController, signal: AbortSignal, cleanup: Function}}
   */
  function createRequestSignal(callerSignal) {
    const controller = new AbortController();
    let cleanup = () => {};

    if (!callerSignal) {
      return { controller, signal: controller.signal, cleanup };
    }

    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      return {
        controller,
        signal: AbortSignal.any([controller.signal, callerSignal]),
        cleanup
      };
    }

    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
      return { controller, signal: controller.signal, cleanup };
    }

    const handleCallerAbort = () => controller.abort(callerSignal.reason);
    callerSignal.addEventListener('abort', handleCallerAbort, { once: true });
    cleanup = () => callerSignal.removeEventListener('abort', handleCallerAbort);

    return { controller, signal: controller.signal, cleanup };
  }

  /**
   * Wait for a retry delay while remaining responsive to caller cancellation.
   * @param {number} delay - Delay in milliseconds
   * @param {AbortSignal|null} signal - Optional caller-provided signal
   * @returns {Promise<boolean>} Whether the retry delay completed normally
   */
  function waitForRetryDelay(delay, signal) {
    if (delay <= 0) {
      return Promise.resolve(!signal?.aborted);
    }

    return new Promise(resolve => {
      let timerId = null;
      let settled = false;

      const cleanup = () => {
        if (timerId !== null) {
          clearTimeout(timerId);
        }
        if (signal) {
          signal.removeEventListener('abort', handleAbort);
        }
      };

      const finish = shouldRetry => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(shouldRetry);
      };

      const handleAbort = () => finish(false);

      if (signal) {
        if (signal.aborted) {
          finish(false);
          return;
        }
        signal.addEventListener('abort', handleAbort, { once: true });
        if (signal.aborted) {
          finish(false);
          return;
        }
      }

      timerId = setTimeout(() => finish(true), delay);
    });
  }

  /**
   * Send streaming chat completion request
   * @param {string} userMessage - User's message
   * @param {Array} conversationHistory - Previous messages
   * @param {Function} onChunk - Callback for each chunk received
   * @param {AbortSignal} signal - Optional abort signal for cancellation
   * @param {Object} options - Optional request options
   * @param {boolean} options.grounding - Enable OpenRouter web search grounding
   * @returns {Promise<Object>} Final result object
   */
  async function sendMessageStreaming(userMessage, conversationHistory = [], onChunk, signal = null, options = {}) {
    // Validate input
    const validation = validateInput(userMessage);
    if (!validation.valid) {
      return { success: false, error: validation.error };
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

    const groundingEnabled = options.grounding === true;

    // Web search runs server-side through OpenRouter, so no host permissions are added.
    const requestBody = {
      model: CONFIG.model,
      messages: messages,
      max_tokens: CONFIG.maxTokens,
      stream: true,
      ...(groundingEnabled
        ? {
            plugins: [{
              id: 'web',
              max_results: 5,
              search_prompt: 'Use these live web results to answer the user. Cite factual claims with markdown links to the source domain and prefer the most relevant sources.'
            }]
          }
        : {})
    };

    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
      if (signal?.aborted) {
        return {
          success: false,
          error: 'Request cancelled',
          aborted: true
        };
      }

      let fullContent = '';
      let retryableFailure;
      let requestState = null;
      let reader;
      let timeoutId = null;

      try {
        requestState = createRequestSignal(signal);
        timeoutId = setTimeout(() => requestState.controller.abort(), CONFIG.requestTimeout);

        const fetchOptions = {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(requestBody),
          signal: requestState.signal
        };

        const response = await fetch(CONFIG.baseURL, fetchOptions);

        // Handle non-OK responses. Retry rate limits and server failures because
        // they are commonly transient; surface other client errors immediately.
        if (!response.ok) {
          const errorInfo = await handleError(response);
          const retryableStatus = response.status === 429 || response.status >= 500;

          if (retryableStatus && attempt < CONFIG.maxRetries) {
            retryableFailure = true;
          } else {
            return { success: false, error: errorInfo.message, code: errorInfo.code };
          }
        } else {
          if (!response.body || typeof response.body.getReader !== 'function') {
            throw new Error('OpenRouter response body is unavailable');
          }

          reader = response.body.getReader();
          const decoder = new TextDecoder();
          const MAX_SSE_LINE_SIZE = 1024 * 1024;
          let buffer = ''; // Buffer for incomplete SSE data

          const processSseLine = (line) => {
            if (!line.startsWith('data: ')) {
              return;
            }

            const data = line.slice(6).trim();

            // Check for [DONE] signal
            if (data === '[DONE]') {
              return;
            }

            if (!data) {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                if (onChunk) {
                  try {
                    onChunk(content);
                  } catch (chunkError) {
                    console.error('Error in streaming callback:', chunkError);
                  }
                }
              }
            } catch (parseError) {
              console.debug('Failed to parse OpenRouter SSE data:', parseError);
            }
          };

          // Read the stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });

            if (buffer.length + chunk.length > MAX_SSE_LINE_SIZE) {
              await reader.cancel().catch(() => {});
              return {
                success: false,
                error: 'OpenRouter SSE line exceeds maximum size'
              };
            }

            // Append to buffer
            buffer += chunk;

            // Parse SSE format - handle multiple events in buffer
            const lines = buffer.split('\n');

            // Keep the last potentially incomplete line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              processSseLine(line);
            }
          }

          // Process any remaining data in buffer
          if (buffer) {
            processSseLine(buffer);
          }

          return {
            success: true,
            content: fullContent,
            usage: null,
            model: CONFIG.model
          };
        }
      } catch (e) {
        // A caller-triggered abort should never be retried.
        if (signal?.aborted) {
          return {
            success: false,
            error: 'Request cancelled',
            aborted: true
          };
        }

        // Internal timeout and other transport errors are retryable when no
        // content has been delivered yet. Retrying a partially streamed answer
        // would duplicate content in the caller, so surface that failure.
        if (!fullContent) {
          if (attempt < CONFIG.maxRetries) {
            retryableFailure = true;
          } else {
            console.error('OpenRouter streaming request failed:', e);
            return {
              success: false,
              error: getTranslation('aiNetworkError')
            };
          }
        } else {
          console.error('OpenRouter streaming request failed after partial response:', e);
          return {
            success: false,
            error: getTranslation('aiNetworkError')
          };
        }
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (requestState) {
          requestState.cleanup();
        }
      }

      if (retryableFailure) {
        const delay = CONFIG.retryDelay * 2 ** attempt;
        const shouldRetry = await waitForRetryDelay(delay, signal);

        if (!shouldRetry && signal?.aborted) {
          return {
            success: false,
            error: 'Request cancelled',
            aborted: true
          };
        }
      }
    }

    return {
      success: false,
      error: getTranslation('aiNetworkError')
    };
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
    groundingStorageKey: GROUNDING_STORAGE_KEY,

    // Validation
    validateInput,

    // Web grounding
    isWebGroundingEnabled,
    setWebGroundingEnabled,

    // API
    sendMessageStreaming,
    quickSearch
  };

})();

// Export to global scope
window.OpenRouterAPI = OpenRouterAPI;
