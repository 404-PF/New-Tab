// src/ai/openrouter.js - OpenRouter API Integration via Cloudflare Proxy
// For security, API requests are proxied through Cloudflare Workers
// API key is stored server-side and never exposed to the client

const OpenRouterAPI = (function() {
  // Configuration
  const CONFIG = {
    // Cloudflare Worker URL - UPDATE THIS AFTER DEPLOYMENT
    // Run: cd cloudflare && wrangler deploy
    // Then copy the worker URL here
    baseURL: 'https://new-tab-openrouter-proxy.lucas20220605.workers.dev',
    model: 'openrouter/free',
    maxTokens: 4096,
    maxRetries: 2,
    retryDelay: 1000
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
    return { valid: true, message: trimmed };
  }

  /**
   * Parse OpenRouter API response
   * @param {Object} data - Response data
   * @returns {Object} Parsed result
   */
  function parseResponse(data) {
    try {
      if (!data || !data.choices || !data.choices[0]) {
        return { success: false, error: getTranslation('aiInvalidResponse') };
      }
      
      const choice = data.choices[0];
      if (!choice.message || !choice.message.content) {
        return { success: false, error: getTranslation('aiNoContent') };
      }

      return {
        success: true,
        content: choice.message.content,
        usage: data.usage || null,
        model: data.model || CONFIG.model
      };
    } catch (e) {
      return { success: false, error: getTranslation('aiInvalidResponse') };
    }
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
        case 429:
          errorCode = 'RATE_LIMIT';
          const retryAfter = response.headers.get('Retry-After');
          errorMessage = retryAfter 
            ? `Rate limited. Try again in ${retryAfter} seconds` 
            : getTranslation('aiRateLimit');
          break;
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
    } catch (e) {
      errorMessage = response.statusText || errorMessage;
    }

    return { code: errorCode, message: errorMessage };
  }

  /**
   * Send streaming chat completion request
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

    // Build request body with streaming enabled
    const requestBody = {
      model: CONFIG.model,
      messages: messages,
      max_tokens: CONFIG.maxTokens,
      stream: true
    };

    try {
      const fetchOptions = {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(requestBody)
      };
      
      // Add abort signal if provided
      if (signal) {
        fetchOptions.signal = signal;
      }
      
      const response = await fetch(CONFIG.baseURL, fetchOptions);

      // Handle non-OK responses
      if (!response.ok) {
        const errorInfo = await handleError(response);
        return { success: false, error: errorInfo.message, code: errorInfo.code };
      }

      // Get the reader for streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = ''; // Buffer for incomplete SSE data

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        
        // Append to buffer
        buffer += chunk;
        
        // Parse SSE format - handle multiple events in buffer
        const lines = buffer.split('\n');
        
        // Keep the last potentially incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            // Check for [DONE] signal
            if (data === '[DONE]') {
              continue;
            }
            
            if (data) {
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
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
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
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      return {
        success: true,
        content: fullContent,
        usage: null,
        model: CONFIG.model
      };

    } catch (e) {
      // Check if the request was aborted
      if (e.name === 'AbortError') {
        return { 
          success: false, 
          error: 'Request cancelled',
          aborted: true
        };
      }
      return { 
        success: false, 
        error: getTranslation('aiNetworkError')
      };
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
    
    // API
    sendMessageStreaming,
    quickSearch
  };

})();

// Export to global scope
window.OpenRouterAPI = OpenRouterAPI;
