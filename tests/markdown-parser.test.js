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

  it('rejects SVG data URI images (can contain embedded scripts)', () => {
    const html = MarkdownParser.parse('![svg](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+)');

    expect(html).not.toContain('data:image/svg+xml');
    expect(html).not.toContain('<img');
  });

  it('allows safe raster data URI images', () => {
    const html = MarkdownParser.parse('![png](data:image/png;base64,iVBORw0KGgo=)');

    expect(html).toContain('data:image/png;base64');
  });

  it('rejects data URI images without base64 encoding', () => {
    const html = MarkdownParser.parse('![png](data:image/png;charset=utf8,evil)');

    expect(html).not.toContain('data:image/png');
    expect(html).not.toContain('<img');
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

  it('sanitizeHTML strips javascript: protocol URLs', () => {
    const html = MarkdownParser.sanitizeHTML('<a href="javascript:alert(1)">click me</a>');

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('href');
    expect(html).toContain('click me');
  });

  it('sanitizeHTML restricts input type to checkbox', () => {
    const html = MarkdownParser.sanitizeHTML('<input type="hidden" name="evil" value="payload">');

    expect(html).not.toContain('type=');
    expect(html).not.toContain('name=');
    expect(html).not.toContain('value=');
  });

  it('sanitizeHTML preserves checkbox input', () => {
    const html = MarkdownParser.sanitizeHTML('<input type="checkbox" checked disabled>');

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
    expect(html).toContain('disabled');
  });

  it('sanitizeHTML handles empty input', () => {
    expect(MarkdownParser.sanitizeHTML('')).toBe('');
    expect(MarkdownParser.sanitizeHTML(null)).toBe('');
    expect(MarkdownParser.sanitizeHTML(undefined)).toBe('');
  });

  it('sanitizeHTML blocks javascript: URLs that bypass URL parsing', () => {
    // Use malformed URLs that cause new URL() to throw
    const html = MarkdownParser.sanitizeHTML('<a href="javascript:alert(1)">xss</a>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('href');
    expect(html).toContain('xss');
  });

  it('sanitizeHTML blocks vbscript: URLs', () => {
    const html = MarkdownParser.sanitizeHTML('<a href="vbscript:MsgBox(1)">click</a>');
    expect(html).not.toContain('vbscript:');
    expect(html).not.toContain('href');
    expect(html).toContain('click');
  });

  it('sanitizeHTML blocks protocol-relative URLs', () => {
    const html = MarkdownParser.sanitizeHTML('<a href="//evil.com">click</a>');
    expect(html).not.toContain('//evil.com');
    expect(html).not.toContain('href');
    expect(html).toContain('click');
  });

  it('sanitizeHTML blocks SVG data URI images', () => {
    const html = MarkdownParser.sanitizeHTML('<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+" alt="svg">');
    expect(html).not.toContain('data:image/svg+xml');
    expect(html).not.toContain('src=');
  });

  it('sanitizeHTML allows safe raster data URI images', () => {
    const html = MarkdownParser.sanitizeHTML('<img src="data:image/png;base64,iVBORw0KGgo=" alt="png">');
    expect(html).toContain('data:image/png;base64');
    expect(html).toContain('src=');
  });

  it('sanitizeHTML rejects data URI images without base64 encoding', () => {
    const html = MarkdownParser.sanitizeHTML('<img src="data:image/png;charset=utf8,evil" alt="png">');
    expect(html).not.toContain('data:image/png');
    expect(html).not.toContain('src=');
  });

  it('sanitizeHTML adds rel="noopener noreferrer" to target="_blank" links missing rel', () => {
    const html = MarkdownParser.sanitizeHTML('<a href="https://example.com" target="_blank">link</a>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('sanitizeHTML preserves existing rel with noopener on target="_blank" links', () => {
    const html = MarkdownParser.sanitizeHTML('<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('sanitizeHTML does not add rel to links without target="_blank"', () => {
    const html = MarkdownParser.sanitizeHTML('<a href="https://example.com">link</a>');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('rel=');
  });
});

describe('MarkdownParser blockquote and list rendering', () => {
  /**
   * Parse markdown into a DOM container so tests can assert structural
   * relationships (e.g. a list being a descendant of a blockquote)
   * instead of matching independent HTML fragments.
   * @param {string} markdown - Markdown input
   * @returns {HTMLDivElement} Container with parsed HTML
   */
  function parseToContainer(markdown) {
    const container = document.createElement('div');
    container.innerHTML = MarkdownParser.parse(markdown);
    return container;
  }

  it('renders unordered list items inside a blockquote', () => {
    const container = parseToContainer('> - item1\n> - item2');
    const blockquote = container.querySelector('blockquote.md-blockquote');
    const items = blockquote.querySelectorAll('li.md-list-item');

    expect(blockquote).not.toBeNull();
    expect(blockquote.querySelector('ul.md-list-ul')).not.toBeNull();
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('item1');
    expect(items[1].textContent).toBe('item2');
    // Items must render as list items, not literal text
    expect(blockquote.textContent).not.toContain('- item1');
  });

  it('renders a single list item inside a blockquote', () => {
    const container = parseToContainer('> - only item');
    const blockquote = container.querySelector('blockquote.md-blockquote');

    expect(blockquote).not.toBeNull();
    expect(blockquote.querySelector('ul.md-list-ul')).not.toBeNull();
    expect(blockquote.querySelectorAll('li.md-list-item')).toHaveLength(1);
    expect(blockquote.querySelector('li.md-list-item').textContent).toBe('only item');
  });

  it('renders ordered lists inside a blockquote', () => {
    const container = parseToContainer('> 1. first\n> 2. second');
    const blockquote = container.querySelector('blockquote.md-blockquote');
    const items = blockquote.querySelectorAll('li.md-list-item');

    expect(blockquote).not.toBeNull();
    expect(blockquote.querySelector('ol.md-list-ol')).not.toBeNull();
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('first');
    expect(items[1].textContent).toBe('second');
  });

  it('renders task lists inside a blockquote', () => {
    const container = parseToContainer('> - [ ] todo\n> - [x] done');
    const blockquote = container.querySelector('blockquote.md-blockquote');

    expect(blockquote).not.toBeNull();
    expect(blockquote.querySelector('ul.md-task-list')).not.toBeNull();
    expect(blockquote.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(blockquote.querySelectorAll('input[type="checkbox"]')[1].checked).toBe(true);
    expect(blockquote.querySelector('span.md-task-checked').textContent).toBe('done');
  });

  it('keeps text and list items inside a blockquote', () => {
    const container = parseToContainer('> intro text\n> - item1\n> - item2');
    const blockquote = container.querySelector('blockquote.md-blockquote');

    expect(blockquote).not.toBeNull();
    expect(blockquote.textContent).toContain('intro text');
    expect(blockquote.querySelector('ul.md-list-ul')).not.toBeNull();
    expect(blockquote.querySelectorAll('li.md-list-item')).toHaveLength(2);
  });

  it('renders inline formatting in plain blockquote text', () => {
    const container = parseToContainer('> **bold** and *italic* and `code`');
    const blockquote = container.querySelector('blockquote.md-blockquote');

    expect(blockquote.querySelector('strong')).not.toBeNull();
    expect(blockquote.querySelector('em')).not.toBeNull();
    expect(blockquote.querySelector('code.md-inline-code')).not.toBeNull();
  });

  it('renders links in plain blockquote text', () => {
    const container = parseToContainer('> see [site](https://example.com)');
    const blockquote = container.querySelector('blockquote.md-blockquote');
    const link = blockquote.querySelector('a.md-link');

    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://example.com/');
    expect(link.textContent).toBe('site');
  });

  it('escapes raw HTML in plain blockquote text', () => {
    const container = parseToContainer('> hello <b>world</b>');
    const blockquote = container.querySelector('blockquote.md-blockquote');

    expect(blockquote.querySelector('b')).toBeNull();
    expect(blockquote.textContent).toContain('<b>world</b>');
  });

  it('keeps quoted fenced code blocks intact when content looks like markdown', () => {
    const container = parseToContainer('> ```\n> - item\n> # header\n> ---\n> ```');
    const blockquote = container.querySelector('blockquote.md-blockquote');
    const code = blockquote.querySelector('div.md-code-block code');

    expect(blockquote).not.toBeNull();
    expect(code).not.toBeNull();
    expect(code.textContent).toBe('- item\n# header\n---');
    expect(blockquote.querySelector('li.md-list-item')).toBeNull();
    expect(blockquote.querySelector('h1')).toBeNull();
    expect(blockquote.querySelector('hr')).toBeNull();
  });

  it('keeps quoted fenced code blocks with table-like content intact', () => {
    const container = parseToContainer('> ```\n> | a | b |\n> |---|---|\n> ```');
    const blockquote = container.querySelector('blockquote.md-blockquote');
    const code = blockquote.querySelector('div.md-code-block code');

    expect(blockquote).not.toBeNull();
    expect(code).not.toBeNull();
    expect(code.textContent).toBe('| a | b |\n|---|---|');
    expect(blockquote.querySelector('table')).toBeNull();
  });

  it('keeps multiline code blocks intact when content looks like markdown', () => {
    const container = parseToContainer('```\nline one\n- item\n# header\n```');
    const code = container.querySelector('div.md-code-block code');

    expect(code).not.toBeNull();
    expect(code.textContent).toBe('line one\n- item\n# header');
    expect(container.querySelector('li.md-list-item')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('renders plain unordered lists (lines are not dropped)', () => {
    const container = parseToContainer('- item1\n- item2');

    expect(container.querySelector('ul.md-list-ul')).not.toBeNull();
    expect(container.querySelectorAll('li.md-list-item')).toHaveLength(2);
    expect(container.querySelectorAll('li.md-list-item')[0].textContent).toBe('item1');
    expect(container.querySelectorAll('li.md-list-item')[1].textContent).toBe('item2');
  });

  it('renders plain ordered lists (lines are not dropped)', () => {
    const container = parseToContainer('1. first\n2. second');

    expect(container.querySelector('ol.md-list-ol')).not.toBeNull();
    expect(container.querySelectorAll('li.md-list-item')).toHaveLength(2);
  });

  it('renders a regular list item after closing an open task list', () => {
    const container = parseToContainer('- [ ] task\n- plain item');
    const lists = container.querySelectorAll('ul.md-list');

    expect(lists).toHaveLength(2);
    expect(lists[0].classList.contains('md-task-list')).toBe(true);
    expect(lists[1].classList.contains('md-task-list')).toBe(false);
    expect(lists[1].textContent).toContain('plain item');
  });
});
