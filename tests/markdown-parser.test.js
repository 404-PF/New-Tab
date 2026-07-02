import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ai/markdown-parser.js');
});

beforeEach(() => {
  MarkdownParser.clearCache();
});

describe('MarkdownParser URL sanitization', () => {
  it('renders safe links and images', () => {
    const html = MarkdownParser.parse('Visit [site](https://example.com) and ![logo](https://example.com/logo.png)');

    expect(html).toContain('<a href="https://example.com/" target="_blank" rel="noopener noreferrer" class="md-link">site</a>');
    // DOMParser normalizes self-closing tags, so /> becomes >
    expect(html).toMatch(/<img src="https:\/\/example.com\/logo.png" alt="logo" class="md-image"\s*\/?>/);
  });

  it('rejects unsafe link and image protocols', () => {
    const html = MarkdownParser.parse('Bad [link](javascript:alert(1)) and ![img](javascript:alert(1))');

    expect(html).toContain('Bad link and img');
    expect(html).not.toContain('<a href="javascript:');
    expect(html).not.toContain('<img src="javascript:');
  });

  it('preserves normal non-absolute markdown URLs', () => {
    const html = MarkdownParser.parse('Read [docs](guide/intro.md)');

    expect(html).toContain('<a href="guide/intro.md" target="_blank" rel="noopener noreferrer" class="md-link">docs</a>');
  });

  it('sanitizes malformed non-protocol markdown URLs', () => {
    const html = MarkdownParser.parse('Broken [link](hello world)');

    expect(html).toContain('<a href="hello%20world" target="_blank" rel="noopener noreferrer" class="md-link">link</a>');
    expect(html).not.toContain('href="hello world"');
  });

  it('preserves query string characters in safe URLs', () => {
    const html = MarkdownParser.parse('Search [docs](https://example.com/?a=1&b=2)');

    expect(html).toContain('<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer" class="md-link">docs</a>');
    expect(html).not.toContain('&amp;amp;');
  });

  it('escapes quote characters in image alt text', () => {
    const html = MarkdownParser.parse('![a"b\'c](https://example.com/image.png)');

    // Double-quote is escaped to &quot;; single-quote may be normalized by DOMParser
    expect(html).toContain('alt="a&quot;b');
    expect(html).toMatch(/alt="a&quot;b(&#39;|')c"/);
    expect(html).toContain('<img src="https://example.com/image.png"');
    expect(html).toContain('class="md-image"');
  });

  it('preserves escaped parentheses in markdown URLs', () => {
    const html = MarkdownParser.parse('Read [docs](https://example.com/a\\(b\\))');

    expect(html).toContain('<a href="https://example.com/a(b)" target="_blank" rel="noopener noreferrer" class="md-link">docs</a>');
    expect(html).not.toContain('a/(b/)');
  });
});

describe('MarkdownParser HTML sanitization', () => {
  it('escapes script tags in raw text (defense in depth)', () => {
    const html = MarkdownParser.parse('Hello <script>alert("xss")</script> world');

    // The markdown parser escapes HTML first, so script tags become safe text
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Hello');
    expect(html).toContain('world');
  });

  it('escapes script tags inside markdown formatting', () => {
    const html = MarkdownParser.parse('**bold <script>alert("xss")</script> text**');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>');
  });

  it('escapes svg elements with event handlers', () => {
    const html = MarkdownParser.parse('Hello <svg onload="alert(1)">world</svg>');

    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;svg');
    expect(html).toContain('Hello');
    expect(html).toContain('world');
  });

  it('escapes img tags with onerror handlers in raw text', () => {
    const html = MarkdownParser.parse('<img src=x onerror="alert(1)">');

    // Escaped by escapeHTML, not rendered as actual HTML
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('preserves allowed tags from markdown parsing', () => {
    const html = MarkdownParser.parse('**bold** and *italic* and `code`');

    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('<code');
  });

  it('preserves allowed attributes on links', () => {
    const html = MarkdownParser.parse('[link](https://example.com)');

    expect(html).toContain('<a href="https://example.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('strips disallowed attributes from markdown-generated tags', () => {
    // Construct HTML that would come from markdown parsing with a disallowed attribute
    const dirtyHtml = '<p onclick="alert(1)" class="md-paragraph">text</p>';
    const sanitized = MarkdownParser.sanitizeHTML(dirtyHtml);

    expect(sanitized).not.toContain('onclick');
    expect(sanitized).toContain('<p');
    expect(sanitized).toContain('text');
  });

  it('removes iframe tags via sanitizer', () => {
    const dirtyHtml = '<p>Hello</p><iframe src="evil.com"></iframe><p>world</p>';
    const sanitized = MarkdownParser.sanitizeHTML(dirtyHtml);

    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).toContain('Hello');
    expect(sanitized).toContain('world');
  });

  it('removes object and embed tags via sanitizer', () => {
    const dirtyHtml = '<object data="evil.swf"></object><embed src="evil.swf"><p>safe</p>';
    const sanitized = MarkdownParser.sanitizeHTML(dirtyHtml);

    expect(sanitized).not.toContain('<object');
    expect(sanitized).not.toContain('<embed');
    expect(sanitized).toContain('<p>safe</p>');
  });

  it('sanitizeHTML is exposed as public API', () => {
    expect(typeof MarkdownParser.sanitizeHTML).toBe('function');
  });

  it('sanitizeHTML removes dangerous content', () => {
    const html = MarkdownParser.sanitizeHTML('<script>alert(1)</script><p>safe</p>');

    expect(html).not.toContain('<script>');
    expect(html).toContain('<p>safe</p>');
  });

  it('sanitizeHTML strips event handler attributes', () => {
    const html = MarkdownParser.sanitizeHTML('<div onmouseover="alert(1)">hover me</div>');

    expect(html).not.toContain('onmouseover');
    expect(html).toContain('hover me');
  });

  it('sanitizeHTML preserves class attributes', () => {
    const html = MarkdownParser.sanitizeHTML('<p class="md-paragraph">text</p>');

    expect(html).toContain('class="md-paragraph"');
    expect(html).toContain('text');
  });

  it('sanitizeHTML handles empty input', () => {
    expect(MarkdownParser.sanitizeHTML('')).toBe('');
    expect(MarkdownParser.sanitizeHTML(null)).toBe('');
    expect(MarkdownParser.sanitizeHTML(undefined)).toBe('');
  });
});
