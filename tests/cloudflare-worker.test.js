import worker from '../cloudflare/worker.js';

const originalFetch = globalThis.fetch;

const EXTENSION_TOKEN = 'test-shared-secret';
const WORKER_ENV = { EXTENSION_TOKEN, OPENROUTER_API_KEY: 'test-openrouter-key' };
const WORKER_URL = 'https://new-tab-openrouter-proxy.test/';
const UPSTREAM_URL = 'https://openrouter.ai/api/v1/chat/completions';

let upstreamFetch;
let ipCursor = 0;

function nextIp() {
  ipCursor += 1;
  return `10.0.${Math.floor(ipCursor / 250)}.${ipCursor % 250}`;
}

function chatBody(overrides = {}) {
  return {
    model: 'openrouter/free',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    ...overrides
  };
}

function postRequest(body, { token = EXTENSION_TOKEN, ip = nextIp(), env = WORKER_ENV } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (token !== null) {
    headers['X-New-Tab-Token'] = token;
  }
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  return worker.fetch(new Request(WORKER_URL, { method: 'POST', headers, body: rawBody }), env);
}

function upstreamResponse() {
  return {
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: null
  };
}

beforeEach(() => {
  upstreamFetch = vi.fn().mockImplementation(() => Promise.resolve(upstreamResponse()));
  globalThis.fetch = upstreamFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OpenRouter proxy hardening (#1086)', () => {
  it('answers the preflight with the token header allowed', async () => {
    const res = await worker.fetch(new Request(WORKER_URL, { method: 'OPTIONS' }), WORKER_ENV);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-New-Tab-Token');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects non-POST methods', async () => {
    const res = await worker.fetch(new Request(WORKER_URL, { method: 'GET' }), WORKER_ENV);

    expect(res.status).toBe(405);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects a POST without the shared-secret header', async () => {
    const res = await postRequest(chatBody(), { token: null });

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects a POST with an incorrect token', async () => {
    const res = await postRequest(chatBody(), { token: 'wrong-secret' });

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('fails closed when the EXTENSION_TOKEN secret is not configured', async () => {
    const res = await postRequest(chatBody(), { env: {} });

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('forwards an authorized request to OpenRouter', async () => {
    const res = await postRequest(chatBody());

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Grounding')).toBe('off');
    expect(upstreamFetch).toHaveBeenCalledTimes(1);

    const [url, options] = upstreamFetch.mock.calls[0];
    expect(url).toBe(UPSTREAM_URL);
    expect(options.headers.Authorization).toBe('Bearer test-openrouter-key');
    expect(JSON.parse(options.body).messages).toEqual(chatBody().messages);
  });

  it('accepts the largest request the client can build (system + 10 history + user)', async () => {
    const messages = [
      { role: 'system', content: 'system prompt' },
      ...Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `history ${i}` })),
      { role: 'user', content: 'current question' }
    ];

    const res = await postRequest(chatBody({ messages }));

    expect(res.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects more than 12 messages before calling OpenRouter', async () => {
    const messages = Array.from({ length: 13 }, (_, i) => ({ role: 'user', content: `message ${i}` }));

    const res = await postRequest(chatBody({ messages }));

    expect(res.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects a body larger than 64 KB before calling OpenRouter', async () => {
    const res = await postRequest(
      chatBody({ messages: [{ role: 'user', content: 'x'.repeat(64 * 1024 + 1) }] })
    );

    expect(res.status).toBe(413);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body', async () => {
    const res = await postRequest('{not json');

    expect(res.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After once the per-IP window is exhausted', async () => {
    const ip = nextIp();
    let attempts = 0;
    let limited = null;

    while (attempts < 25 && limited === null) {
      attempts += 1;
      const res = await postRequest(chatBody(), { ip });
      if (res.status === 429) {
        limited = res;
      } else {
        expect(res.status).toBe(200);
      }
    }

    expect(limited).not.toBeNull();
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    // The limited request never reaches OpenRouter.
    expect(upstreamFetch).toHaveBeenCalledTimes(attempts - 1);
  });

  it('keeps the rate limit per IP so other callers still succeed', async () => {
    const blockedIp = nextIp();
    let blocked = false;

    for (let i = 0; i < 25 && !blocked; i++) {
      const res = await postRequest(chatBody(), { ip: blockedIp });
      blocked = res.status === 429;
    }

    expect(blocked).toBe(true);

    const res = await postRequest(chatBody());
    expect(res.status).toBe(200);
  });
});
