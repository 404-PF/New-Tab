import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor } from './helpers/storage-write-failures.js';

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

function createStreamingResponse(chunks, headers = {}) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    headers: { get: vi.fn(name => headers[name] ?? null) },
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

function createNonJsonErrorResponse(status, { statusText = 'HTTP ' + status, headers = {} } = {}) {
  return {
    ok: false,
    status,
    statusText,
    headers: {
      get: vi.fn(name => headers[name] ?? null)
    },
    json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON'))
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

  it('does not retry when a stream stalls after partial content', async () => {
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
      expect(result).toMatchObject({
        success: false,
        error: 'Network error occurred',
        partialContent: 'Partial'
      });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.requestTimeout = originalTimeout;
      vi.useRealTimers();
    }
  });

  it('completes an actively streaming response that outlives the request timeout (#843)', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalTimeout = OpenRouterAPI.config.requestTimeout;
    const encoder = new TextEncoder();
    const parts = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

    try {
      OpenRouterAPI.config.maxRetries = 0;
      OpenRouterAPI.config.requestTimeout = 100;

      let index = 0;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(() => {
              if (index >= parts.length) {
                return Promise.resolve({ done: true, value: undefined });
              }

              const part = parts[index++];
              // Each read takes 40ms, so the stream spans 200ms total — twice
              // requestTimeout — but no single gap reaches the idle deadline,
              // which must keep re-arming as chunks arrive.
              return new Promise(resolve => {
                setTimeout(() => {
                  resolve({
                    done: false,
                    value: encoder.encode(`data: {"choices":[{"delta":{"content":"${part}"}}]}\n`)
                  });
                }, 40);
              });
            }),
            cancel: vi.fn().mockResolvedValue(undefined)
          })
        }
      });

      const chunks = [];
      const promise = OpenRouterAPI.sendMessageStreaming('hello', [], chunk => chunks.push(chunk));
      await vi.advanceTimersByTimeAsync(400);
      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(false);
      expect(chunks).toEqual(parts);
      expect(result).toMatchObject({ success: true, content: parts.join('') });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.requestTimeout = originalTimeout;
      vi.useRealTimers();
    }
  });

  it('aborts a slow-but-alive stream once the absolute deadline elapses (#843)', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalTimeout = OpenRouterAPI.config.requestTimeout;
    const originalMaxStreamDuration = OpenRouterAPI.config.maxStreamDuration;
    const encoder = new TextEncoder();

    try {
      OpenRouterAPI.config.maxRetries = 0;
      OpenRouterAPI.config.requestTimeout = 50;
      OpenRouterAPI.config.maxStreamDuration = 200;

      globalThis.fetch = vi.fn((_url, options) => Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(() => new Promise((resolve, reject) => {
              // Every 40ms chunk keeps the idle timeout re-arming, so only the
              // absolute deadline can stop this stream.
              const timer = setTimeout(() => {
                resolve({
                  done: false,
                  value: encoder.encode('data: {"choices":[{"delta":{"content":"tick"}}]}\n')
                });
              }, 40);
              options.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('aborted'));
              }, { once: true });
            })),
            cancel: vi.fn().mockResolvedValue(undefined)
          })
        }
      }));

      const chunks = [];
      const promise = OpenRouterAPI.sendMessageStreaming('hello', [], chunk => chunks.push(chunk));
      await vi.advanceTimersByTimeAsync(400);
      const result = await promise;

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      expect(result).toMatchObject({
        success: false,
        error: 'Network error occurred',
        partialContent: chunks.join('')
      });
      expect(result.aborted).not.toBe(true);
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.requestTimeout = originalTimeout;
      OpenRouterAPI.config.maxStreamDuration = originalMaxStreamDuration;
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
    let resolveReadStarted;
    const readStartedPromise = new Promise(resolve => {
      resolveReadStarted = resolve;
    });

    try {
      OpenRouterAPI.config.maxRetries = 0;
      OpenRouterAPI.config.requestTimeout = 100;

      globalThis.fetch = vi.fn((_url, options) => Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(() => {
              resolveReadStarted();
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
      await readStartedPromise;

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



describe('OpenRouter non-JSON error bodies (#866)', () => {
  it('classifies a 401 with an HTML body as AUTH_ERROR', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createNonJsonErrorResponse(401, { statusText: 'Unauthorized' })
    );

    const result = await OpenRouterAPI.sendMessageStreaming('hello');

    expect(result).toMatchObject({ success: false, code: 'AUTH_ERROR', error: 'aiAuthError' });
  });

  it('classifies a 403 with a non-JSON body as FORBIDDEN', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(createNonJsonErrorResponse(403));

    const result = await OpenRouterAPI.sendMessageStreaming('hello');

    expect(result).toMatchObject({ success: false, code: 'FORBIDDEN', error: 'aiForbidden' });
  });

  it('classifies a 502 with an HTML body as SERVER_ERROR instead of statusText', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      globalThis.fetch = vi.fn().mockResolvedValue(
        createNonJsonErrorResponse(502, { statusText: 'Bad Gateway' })
      );

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({ success: false, code: 'SERVER_ERROR', error: 'aiServerError' });
      expect(result.error).not.toBe('Bad Gateway');
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('surfaces the Retry-After message for a body-less 429', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      globalThis.fetch = vi.fn().mockResolvedValue(
        createNonJsonErrorResponse(429, { headers: { 'Retry-After': '30' } })
      );

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({
        success: false,
        code: 'RATE_LIMIT',
        error: 'Rate limited. Try again in 30 seconds'
      });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('falls back to aiRateLimit for a body-less 429 without Retry-After', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      globalThis.fetch = vi.fn().mockResolvedValue(createNonJsonErrorResponse(429));

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({ success: false, code: 'RATE_LIMIT', error: 'aiRateLimit' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('falls back to statusText for an unknown status without a JSON body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createNonJsonErrorResponse(418, { statusText: 'Teapot' })
    );

    const result = await OpenRouterAPI.sendMessageStreaming('hello');

    expect(result).toMatchObject({ success: false, code: 'API_ERROR', error: 'Teapot' });
  });

  it('still uses error.error.code and error.error.message for JSON bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({ error: { code: 'CUSTOM_CODE', message: 'Custom message' } })
    });

    const result = await OpenRouterAPI.sendMessageStreaming('hello');

    expect(result).toMatchObject({ success: false, code: 'CUSTOM_CODE', error: 'Custom message' });
  });

  it('retries a non-JSON 502 before succeeding', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalRetryDelay = OpenRouterAPI.config.retryDelay;

    try {
      OpenRouterAPI.config.maxRetries = 1;
      OpenRouterAPI.config.retryDelay = 0;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(createNonJsonErrorResponse(502, { statusText: 'Bad Gateway' }))
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

  it('classifies a 521 with an HTML body as SERVER_ERROR', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      globalThis.fetch = vi.fn().mockResolvedValue(
        createNonJsonErrorResponse(521, { statusText: 'Service Unavailable' })
      );

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({ success: false, code: 'SERVER_ERROR', error: 'aiServerError' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('converts an HTTP-date Retry-After into a duration in seconds', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      const retryAt = new Date(Date.now() + 90 * 1000).toUTCString();
      globalThis.fetch = vi.fn().mockResolvedValue(
        createNonJsonErrorResponse(429, { headers: { 'Retry-After': retryAt } })
      );

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({ success: false, code: 'RATE_LIMIT' });
      // toUTCString drops sub-second precision, so the duration lands at 89 or 90.
      expect(result.error).toMatch(/^Rate limited\. Try again in (89|90) seconds$/);
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('falls back to aiRateLimit for an unparseable Retry-After value', async () => {
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;

    try {
      OpenRouterAPI.config.maxRetries = 0;
      globalThis.fetch = vi.fn().mockResolvedValue(
        createNonJsonErrorResponse(429, { headers: { 'Retry-After': 'soon' } })
      );

      const result = await OpenRouterAPI.sendMessageStreaming('hello');

      expect(result).toMatchObject({ success: false, code: 'RATE_LIMIT', error: 'aiRateLimit' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
    }
  });

  it('keeps the localized fallback for a JSON body without error.message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({})
    });

    const result = await OpenRouterAPI.sendMessageStreaming('hello');

    expect(result).toMatchObject({ success: false, code: 'API_ERROR', error: 'aiError' });
    expect(result.error).not.toBe('Bad Request');
  });

  it('reports cancellation when the caller aborts during body parsing', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockImplementation(async () => {
        controller.abort();
        const abortError = new Error('The operation was aborted.');
        abortError.name = 'AbortError';
        throw abortError;
      })
    }));

    const result = await OpenRouterAPI.sendMessageStreaming('hello', [], null, controller.signal);

    expect(result).toMatchObject({ success: false, aborted: true, error: 'Request cancelled' });
  });

  it('classifies a 401 when an internal timeout aborts body parsing', async () => {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: vi.fn().mockReturnValue(null) },
      // The request timeout aborts the body read; no caller signal exists.
      json: vi.fn().mockRejectedValue(abortError)
    });

    const result = await OpenRouterAPI.sendMessageStreaming('hello');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, code: 'AUTH_ERROR', error: 'aiAuthError' });
  });

  it('waits for a longer Retry-After before retrying a 429', async () => {
    vi.useFakeTimers();
    const originalMaxRetries = OpenRouterAPI.config.maxRetries;
    const originalRetryDelay = OpenRouterAPI.config.retryDelay;

    try {
      OpenRouterAPI.config.maxRetries = 1;
      OpenRouterAPI.config.retryDelay = 0;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(createNonJsonErrorResponse(429, { headers: { 'Retry-After': '30' } }))
        .mockResolvedValueOnce(createStreamingResponse([
          'data: {"choices":[{"delta":{"content":"Recovered"}}]}\n'
        ]));

      const promise = OpenRouterAPI.sendMessageStreaming('hello');
      await vi.advanceTimersByTimeAsync(0);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // The 0ms backoff would already have retried; Retry-After must win.
      await vi.advanceTimersByTimeAsync(1000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(29000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      expect(await promise).toMatchObject({ success: true, content: 'Recovered' });
    } finally {
      OpenRouterAPI.config.maxRetries = originalMaxRetries;
      OpenRouterAPI.config.retryDelay = originalRetryDelay;
      vi.useRealTimers();
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

  it('surfaces the proxy X-Grounding header in the result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createStreamingResponse(
        ['data: {"choices":[{"delta":{"content":"Plain"}}]}\n'],
        { 'X-Grounding': 'unavailable' }
      )
    );

    const result = await OpenRouterAPI.sendMessageStreaming(
      'What happened today?',
      [],
      undefined,
      null,
      { grounding: true }
    );

    expect(result).toMatchObject({ success: true, content: 'Plain', grounding: 'unavailable' });
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

      await OpenRouterAPI.setWebGroundingEnabled(previous);

      if (previousStored === null) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, previousStored);
      }
    }
  });

  it('reverts the in-memory grounding value when the write throws (#971)', async () => {
    const previous = OpenRouterAPI.isWebGroundingEnabled();
    const setItemAsync = vi.spyOn(window.localStorage, 'setItemAsync').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    try {
      await expect(OpenRouterAPI.setWebGroundingEnabled(!previous)).resolves.toBe(false);
      expect(OpenRouterAPI.isWebGroundingEnabled()).toBe(previous);
    } finally {
      setItemAsync.mockRestore();
      await OpenRouterAPI.setWebGroundingEnabled(previous);
    }
  });

  it('returns false and reverts the in-memory value when the write rejects (#971)', async () => {
    const previous = OpenRouterAPI.isWebGroundingEnabled();
    const setItemAsync = vi.spyOn(window.localStorage, 'setItemAsync')
      .mockRejectedValue(new Error('storage unavailable'));

    try {
      await expect(OpenRouterAPI.setWebGroundingEnabled(!previous)).resolves.toBe(false);
      expect(OpenRouterAPI.isWebGroundingEnabled()).toBe(previous);
    } finally {
      setItemAsync.mockRestore();
      await OpenRouterAPI.setWebGroundingEnabled(previous);
    }
  });

  it('rolls the in-memory value back when an accepted write fails asynchronously (#971)', async () => {
    const storageKey = OpenRouterAPI.groundingStorageKey;
    const previous = OpenRouterAPI.isWebGroundingEnabled();
    const previousStored = localStorage.getItem(storageKey);
    const restoreWrites = failStorageWritesFor(storageKey, 'async');

    try {
      // The bridge accepts the write optimistically and only reports the
      // chrome.storage failure after it settles, so success must not be
      // reported before then.
      const persisted = OpenRouterAPI.setWebGroundingEnabled(!previous);
      expect(OpenRouterAPI.isWebGroundingEnabled()).toBe(!previous);

      await expect(persisted).resolves.toBe(false);
      expect(OpenRouterAPI.isWebGroundingEnabled()).toBe(previous);
      expect(localStorage.getItem(storageKey)).toBe(previousStored);
    } finally {
      restoreWrites();
      await OpenRouterAPI.setWebGroundingEnabled(previous);
    }
  });
});
