import { injectScript } from './helpers/inject-script.js';

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
