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
    expect(html).toContain('<img src="https://example.com/logo.png" alt="logo" class="md-image" />');
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

    expect(html).toContain('alt="a&quot;b&#39;c"');
    expect(html).toContain('<img src="https://example.com/image.png" alt="a&quot;b&#39;c" class="md-image" />');
  });

  it('preserves escaped parentheses in markdown URLs', () => {
    const html = MarkdownParser.parse('Read [docs](https://example.com/a\\(b\\))');

    expect(html).toContain('<a href="https://example.com/a(b)" target="_blank" rel="noopener noreferrer" class="md-link">docs</a>');
    expect(html).not.toContain('a/(b/)');
  });
});