import { injectScript } from './helpers/inject-script.js';

const originalFetch = globalThis.fetch;

beforeAll(() => {
  injectScript('src/ai/openrouter.js');
});

describe('OpenRouterAPI', () => {
  it('rejects empty, oversized, and control-character input', () => {
    expect(OpenRouterAPI.validateInput('  ').valid).toBe(false);
    expect(OpenRouterAPI.validateInput('x'.repeat(2001)).valid).toBe(false);
    expect(OpenRouterAPI.validateInput(`hello${String.fromCharCode(0)}`).valid).toBe(false);
    expect(OpenRouterAPI.validateInput('  hello  ')).toEqual({ valid: true, message: 'hello' });
  });

  it('builds a streaming request and returns decoded SSE content', async () => {
    const encoder = new TextEncoder();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n') })
            .mockResolvedValueOnce({ done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"!"}}]}\n') })
            .mockResolvedValue({ done: true })
        })
      }
    });

    try {
      const chunks = [];
      const result = await OpenRouterAPI.sendMessageStreaming('Hi', [], chunk => chunks.push(chunk));

      expect(result).toMatchObject({ success: true, content: 'Hello!' });
      expect(chunks).toEqual(['Hello', '!']);
      expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });
      expect(JSON.parse(fetch.mock.calls[0][1].body).messages.at(-1)).toEqual({ role: 'user', content: 'Hi' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function createStreamingResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          return { done: false, value: encoder.encode(chunks[index++]) };
        }),
        cancel: vi.fn().mockResolvedValue(undefined)
      })
    }
  };
}

function createErrorResponse(status) {
  return {
    ok: false,
    status,
    statusText: 'HTTP ' + status,
    headers: { get: vi.fn().mockReturnValue(null) },
    json: vi.fn().mockResolvedValue({ error: { message: 'HTTP ' + status } })
  };
}

describe('OpenRouter streaming resilience (#714)', () => {
  it('retries transient fetch failures using maxRetries and retryDelay backoff', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalRetryDelay = OpenRouterAPI.config.retryDelay;

    try {
      OpenRouterAPI.config.maxRetries = 2;
      OpenRouterAPI.config.retryDelay = 100;
      globalThis.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('network failure'))
        .mockRejectedValueOnce(new Error('network failure'))
        .mockResolvedValueOnce(createStreamingResponse([
          'data: {"choices":[{"delta":{"content":"Recovered"}}]}\n'
        ]));

      const promise = OpenRouterAPI.sendMessageStreaming('hello');
      await Promise.resolve();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(99);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(199);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(result).toMatchObject({ success: true, content: 'Recovered' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.retryDelay = originalRetryDelay;
      vi.useRealTimers();
    }
  });

  it('retries rate-limit and server-error responses', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalRetryDelay = OpenRouterAPI.config.retryDelay;

    try {
      OpenRouterAPI.config.maxRetries = 2;
      OpenRouterAPI.config.retryDelay = 0;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(createErrorResponse(429))
        .mockResolvedValueOnce(createErrorResponse(500))
        .mockResolvedValueOnce(createStreamingResponse([
          'data: {"choices":[{"delta":{"content":"Recovered"}}]}\n'
        ]));

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(result).toMatchObject({ success: true, content: 'Recovered' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.retryDelay = originalRetryDelay;
    }
  });

  it('does not retry when an active stream times out after partial content', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalTimeout = OpenRouterAPI.config.requestTimeout;
    const encoder = new TextEncoder();

    try {
      OpenRouterAPI.config.maxRetries = 1;
      OpenRouterAPI.config.requestTimeout = 100;

      globalThis.fetch = vi.fn((_url, options) => {
        let readCount = 0;
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn(() => {
                if (readCount++ === 0) {
                  return Promise.resolve({
                    done: false,
                    value: encoder.encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n')
                  });
                }

                return new Promise((_resolve, reject) => {
                  options.signal.addEventListener('abort', () => {
                    reject(new Error('aborted'));
                  }, { once: true });
                });
              })
            })
          }
        });
      });

      const chunks = [];
      const promise = OpenRouterAPI.sendMessageStreaming('hello', [], chunk => chunks.push(chunk));
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(chunks).toEqual(['Partial']);
      expect(result).toMatchObject({ success: false, error: 'Network error occurred' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.requestTimeout = originalTimeout;
      vi.useRealTimers();
    }
  });

  it('cancels during retry backoff without starting another fetch', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalRetryDelay = OpenRouterAPI.config.retryDelay;
    const controller = new AbortController();

    try {
      OpenRouterAPI.config.maxRetries = 2;
      OpenRouterAPI.config.retryDelay = 1000;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network failure'));

      const promise = OpenRouterAPI.sendMessageStreaming('hello', [], undefined, controller.signal);
      await Promise.resolve();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      controller.abort();
      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        success: false,
        error: 'Request cancelled',
        aborted: true
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.retryDelay = originalRetryDelay;
      vi.useRealTimers();
    }
  });

  it('times out an active stream read after fetch succeeds', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalTimeout = OpenRouterAPI.config.requestTimeout;
    let readStarted = false;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      OpenRouterAPI.config.requestTimeout = 100;

      globalThis.fetch = vi.fn((_url, options) => Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(() => {
              readStarted = true;
              return new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => {
                  reject(new Error('aborted'));
                }, { once: true });
              });
            })
          })
        }
      }));

      const promise = OpenRouterAPI.sendMessageStreaming('hello');

      // Fetch/stream setup crosses promise boundaries; wait for the observable
      // read to start instead of depending on a fixed microtask count.
      for (let attempts = 0; attempts < 10 && !readStarted; attempts += 1) {
        await Promise.resolve();
      }
      expect(readStarted).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(result).toMatchObject({ success: false, error: 'Network error occurred' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.requestTimeout = originalTimeout;
      vi.useRealTimers();
    }
  });

  it('cancels and fails when an SSE line exceeds the maximum size', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;

      const cancel = vi.fn().mockResolvedValue(undefined);
      const chunk = 'x'.repeat(1024 * 1024 + 1);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({
              done: false,
              value: new TextEncoder().encode(chunk)
            }),
            cancel
          })
        }
      });

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        success: false,
        error: 'OpenRouter SSE line exceeds maximum size'
      });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('aborts a hung request when the internal timeout expires', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalTimeout = OpenRouterAPI.config.requestTimeout;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      OpenRouterAPI.config.requestTimeout = 100;

      globalThis.fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      }));

      const promise = OpenRouterAPI.sendMessageStreaming('hello');
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(result).toMatchObject({ success: false });
      expect(result.aborted).not.toBe(true);
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.requestTimeout = originalTimeout;
      vi.useRealTimers();
    }
  });

  it('returns a network error instead of calling getReader on a null body', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: null });

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({
        success: false,
        error: 'Network error occurred'
      });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('retries a stream reader failure before any content is delivered', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalRetryDelay = OpenRouterAPI.config.retryDelay;

    try {
      OpenRouterAPI.config.maxRetries = 1;
      OpenRouterAPI.config.retryDelay = 0;

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockRejectedValue(new Error('stream dropped'))
            })
          }
        })
        .mockResolvedValueOnce(createStreamingResponse([
          'data: {"choices":[{"delta":{"content":"Recovered"}}]}\n'
        ]));

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ success: true, content: 'Recovered' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.retryDelay = originalRetryDelay;
    }
  });

  it('merges caller cancellation with the internal request signal', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, { once: true });
    }));

    const promise = OpenRouterAPI.sendMessageStreaming('hello', [], undefined, controller.signal);
    controller.abort();
    const result = await promise;

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, aborted: true, error: 'Request cancelled' });
  });

  it('logs malformed SSE JSON and continues parsing subsequent chunks', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(createStreamingResponse([
      'data: {not valid json}\n',
      'data: {"choices":[{"delta":{"content":"Valid"}}]}\n'
    ]));

    try {
      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({ success: true, content: 'Valid' });
      expect(debugSpy).toHaveBeenCalledWith(
        'Failed to parse OpenRouter SSE data:',
        expect.any(Error)
      );
    } finally {
      debugSpy.mockRestore();
    }
  });
});



describe('OpenRouter web grounding (#707)', () => {
  it('adds the web plugin with five results when grounding is enabled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(createStreamingResponse([
      'data: {"choices":[{"delta":{"content":"Grounded"}}]}\n'
    ]));

    const result = await OpenRouterAPI.sendMessageStreaming(
      'What happened today?',
      [],
      undefined,
      null,
      { grounding: true }
    );

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);

    expect(result).toMatchObject({ success: true, content: 'Grounded' });
    expect(body.plugins).toEqual([{
      id: 'web',
      max_results: 5,
      search_prompt: expect.stringContaining('Cite factual claims')
    }]);
  });

  it('omits the web plugin when grounding is disabled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(createStreamingResponse([
      'data: {"choices":[{"delta":{"content":"Ungrounded"}}]}\n'
    ]));

    const result = await OpenRouterAPI.sendMessageStreaming(
      'What happened today?',
      [],
      undefined,
      null,
      { grounding: false }
    );

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);

    expect(result).toMatchObject({ success: true, content: 'Ungrounded' });
    expect(body).not.toHaveProperty('plugins');
  });

  it('refreshes the cached grounding preference after an external storage change', async () => {
    const storageKey = OpenRouterAPI.groundingStorageKey;
    const previous = OpenRouterAPI.isWebGroundingEnabled();
    const previousStored = localStorage.getItem(storageKey);
    const previousChromeStored = (await chrome.storage.local.get(storageKey))[storageKey];

    try {
      await chrome.storage.local.set({ [storageKey]: 'false' });
      localStorage.setItem(storageKey, 'false');

      expect(OpenRouterAPI.isWebGroundingEnabled()).toBe(false);
    } finally {
      if (previousChromeStored === undefined) {
        await chrome.storage.local.remove(storageKey);
      } else {
        await chrome.storage.local.set({ [storageKey]: previousChromeStored });
      }

      OpenRouterAPI.setWebGroundingEnabled(previous);

      if (previousStored === null) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, previousStored);
      }
    }
  });

  it('keeps the requested grounding value in memory when persistence fails', () => {
    const previous = OpenRouterAPI.isWebGroundingEnabled();
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    try {
      expect(OpenRouterAPI.setWebGroundingEnabled(false)).toBe(false);
      expect(OpenRouterAPI.isWebGroundingEnabled()).toBe(false);
    } finally {
      setItem.mockRestore();
      OpenRouterAPI.setWebGroundingEnabled(previous);
    }
  });
});
