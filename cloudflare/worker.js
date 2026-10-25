/**
 * New Tab AI Assistant: OpenRouter proxy with Tavily web grounding.
 *
 * The extension posts an OpenAI-style chat body. When it asks for web
 * grounding (plugins: [{ id: 'web', ... }], the shape src/ai/openrouter.js
 * already sends), this worker runs the search itself on Tavily and hands the
 * results to the model as a system message. OpenRouter's own web plugin is
 * billed per search, and the New Tab OpenRouter key has a $0 budget, so the
 * plugin is never forwarded.
 *
 * Secrets (wrangler secret put <NAME>):
 *   OPENROUTER_API_KEY  OpenRouter key (free models only, $0 limit is fine)
 *   TAVILY_API_KEY      Optional Tavily key (free tier: 1,000 credits/month,
 *                       basic search = 1 credit). When unset, searches use
 *                       Tavily's keyless mode (free, rate-limited).
 *
 * Response header X-Grounding: used | unavailable | off
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';
const ALLOWED_MODELS = new Set(['openrouter/free']);
const MAX_TOKENS_CAP = 4096;
const MAX_RESULTS_CAP = 5;
const SEARCH_TIMEOUT_MS = 8000;
const MAX_QUERY_CHARS = 400;
const MAX_SNIPPET_CHARS = 1200;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, HTTP-Referer, X-Title',
  'Access-Control-Expose-Headers': 'X-Grounding',
  'Access-Control-Max-Age': '86400'
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra }
  });
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.filter(p => p && p.type === 'text').map(p => p.text).join(' ');
      }
    }
  }
  return '';
}

async function tavilySearch(apiKey, query, maxResults) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: apiKey
        ? { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        : { 'X-Tavily-Access-Mode': 'keyless', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.slice(0, MAX_QUERY_CHARS),
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false
      }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.filter(r => r && r.url).slice(0, maxResults);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function groundingMessage(results, searchPrompt) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = results.map((r, i) => {
    const snippet = String(r.content || '').replace(/\s+/g, ' ').slice(0, MAX_SNIPPET_CHARS);
    return `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${snippet}`;
  });
  return {
    role: 'system',
    content:
      `Live web search results (retrieved ${today} UTC). ` +
      (searchPrompt ||
        'Use these results to answer the user. Cite factual claims with markdown links to the source URL.') +
      ' You do have live web access through these results; do not say you cannot browse.\n\n' +
      lines.join('\n\n')
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json(405, { error: { message: 'Method not allowed', code: 405 } });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: { message: 'Invalid JSON body', code: 400 } });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return json(400, { error: { message: 'messages is required', code: 400 } });
    }

    const model = ALLOWED_MODELS.has(body.model) ? body.model : 'openrouter/free';
    const plugins = Array.isArray(body.plugins) ? body.plugins : [];
    const webPlugin = plugins.find(p => p && p.id === 'web');

    let grounding = 'off';
    let outMessages = messages;

    if (webPlugin) {
      const query = lastUserText(messages).trim();
      const maxResults = Math.min(Math.max(Number(webPlugin.max_results) || 5, 1), MAX_RESULTS_CAP);
      const results = query
        ? await tavilySearch(env.TAVILY_API_KEY || '', query, maxResults)
        : null;

      if (results && results.length > 0) {
        grounding = 'used';
        const ctx = groundingMessage(results, webPlugin.search_prompt);
        // Keep the extension's own system prompt first, then the search context.
        const firstNonSystem = messages.findIndex(m => m.role !== 'system');
        const at = firstNonSystem === -1 ? messages.length : firstNonSystem;
        outMessages = [...messages.slice(0, at), ctx, ...messages.slice(at)];
      } else {
        grounding = 'unavailable';
      }
    }

    // Never forward plugins: OpenRouter bills web search, and the key's budget is $0.
    const upstreamBody = {
      model,
      messages: outMessages,
      max_tokens: Math.min(Number(body.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP),
      stream: body.stream === true
    };

    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': request.headers.get('HTTP-Referer') || 'https://github.com/404-PF/New-Tab',
        'X-Title': request.headers.get('X-Title') || 'New Tab AI Assistant'
      },
      body: JSON.stringify(upstreamBody)
    });

    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    headers.set('X-Grounding', grounding);
    const retryAfter = upstream.headers.get('Retry-After');
    if (retryAfter) headers.set('Retry-After', retryAfter);

    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
