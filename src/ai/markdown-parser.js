// src/ai/markdown-parser.js - Optimized Markdown Parser
// High-performance markdown parser with caching, syntax highlighting, and task list support

const MarkdownParser = (function() {
  'use strict';

  // ============== LRU Cache ==============
  
  /**
   * LRU Cache for parsed markdown results
   */
  class LRUCache {
    constructor(maxSize = 100) {
      this.cache = new Map();
      this.maxSize = maxSize;
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    get(key) {
      if (this.cache.has(key)) {
        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
      }
      return null;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     */
    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Delete oldest entry (first in map)
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    /**
     * Clear the cache
     */
    clear() {
      this.cache.clear();
    }

    /**
     * Get cache size
     * @returns {number}
     */
    get size() {
      return this.cache.size;
    }
  }

  // Create cache instance
  const cache = new LRUCache(100);

  /**
   * Generate cache key from markdown string
   * @param {string} markdown - Markdown text
   * @returns {string} Cache key
   */
  function getCacheKey(markdown) {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < markdown.length; i++) {
      const char = markdown.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `md_${hash}_${markdown.length}`;
  }

  // ============== Syntax Highlighting ==============
  
  /**
   * Syntax patterns for different languages
   */
  const syntaxPatterns = {
    javascript: {
      keywords: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof|switch|case|break|continue|default|do|in|of|yield|static|get|set|extends|super)\b/g,
      strings: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
      comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
      numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi,
      booleans: /\b(true|false|null|undefined|NaN|Infinity)\b/g,
      functions: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g
    },
    typescript: {
      keywords: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof|switch|case|break|continue|default|do|in|of|yield|static|get|set|extends|super|interface|type|enum|namespace|abstract|implements|public|private|protected|readonly|declare|module|require|as|keyof|infer|never|unknown|any|void|number|string|boolean|object|symbol|bigint)\b/g,
      strings: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
      comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
      numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi,
      booleans: /\b(true|false|null|undefined|NaN|Infinity)\b/g,
      functions: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g
    },
    python: {
      keywords: /\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|raise|pass|break|continue|and|or|not|in|is|lambda|global|nonlocal|assert|del|True|False|None)\b/g,
      strings: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
      comments: /(#.*$)/gm,
      numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?j?)\b/gi,
      functions: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
      decorators: /(@[a-zA-Z_][a-zA-Z0-9_]*)/g
    },
    html: {
      tags: /(<\/?[a-zA-Z][a-zA-Z0-9]*|>)/g,
      attributes: /\s([a-zA-Z-]+)(?==)/g,
      strings: /(["'])(?:(?!\1)[^\\]|\\.)*\1/g,
      comments: /(<!--[\s\S]*?-->)/g
    },
    css: {
      properties: /\b([a-zA-Z-]+)\s*(?=:)/g,
      values: /:\s*([^;{}]+)/g,
      selectors: /([.#]?[a-zA-Z][a-zA-Z0-9_-]*)\s*(?={)/g,
      comments: /(\/\*[\s\S]*?\*\/)/g,
      numbers: /\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|deg|s|ms)?)\b/gi
    },
    json: {
      keys: /("(?:[^"\\]|\\.)*")\s*(?=:)/g,
      strings: /:\s*("(?:[^"\\]|\\.)*")/g,
      numbers: /:\s*(\d+\.?\d*(?:e[+-]?\d+)?)/gi,
      booleans: /:\s*(true|false|null)/g
    },
    bash: {
      keywords: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|cd|ls|mkdir|rm|cp|mv|cat|grep|sed|awk|export|source|alias|unalias)\b/g,
      strings: /(["'])(?:(?!\1)[^\\]|\\.)*\1/g,
      comments: /(#.*$)/gm,
      variables: /(\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\})/g,
      commands: /\b([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?=\()/g
    }
  };

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Escape HTML attribute values.
   * @param {string} str - Raw attribute value
   * @returns {string} Escaped attribute-safe string
   */
  function escapeAttribute(str) {
    return escapeHTML(str)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Decode HTML entities from already-escaped markdown fragments.
   * @param {string} str - Escaped fragment
   * @returns {string} Decoded text
   */
  function decodeHTML(str) {
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || '';
  }

  /**
   * Remove markdown escape backslashes from URL fragments.
   * @param {string} str - Raw URL fragment
   * @returns {string} Unescaped URL fragment
   */
  function unescapeMarkdownUrl(str) {
    return str.replace(/\\(.)/g, '$1');
  }

  /**
   * Validate markdown URLs before rendering them into HTML.
   * @param {string} url - URL extracted from markdown
   * @param {boolean} isImage - Whether the URL belongs to an image
   * @returns {string|null} Sanitized URL or null when unsafe
   */
  function sanitizeMarkdownUrl(url, isImage = false) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }

    const protocolMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (protocolMatch) {
      const protocol = protocolMatch[1].toLowerCase();
      const allowedProtocols = isImage
        ? ['http', 'https', 'data', 'blob']
        : ['http', 'https', 'mailto', 'tel'];

      if (!allowedProtocols.includes(protocol)) {
        return null;
      }

      if (isImage && protocol === 'data' && !/^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|tiff);base64,/i.test(trimmed)) {
        return null;
      }

      try {
        return new URL(trimmed).href;
      } catch {
        return encodeURI(trimmed);
      }
    }

    return encodeURI(trimmed);
  }

  /**
   * Replace markdown links and images while preserving balanced parentheses in URLs.
   * @param {string} html - HTML-escaped inline text
   * @returns {string} HTML with sanitized links and images
   */
  function replaceMarkdownLinksAndImages(html) {
    let result = '';
    let index = 0;

    while (index < html.length) {
      const isImage = html[index] === '!' && html[index + 1] === '[';
      const isLink = html[index] === '[';

      if (!isImage && !isLink) {
        result += html[index];
        index++;
        continue;
      }

      const textStart = index + (isImage ? 2 : 1);
      const textEnd = html.indexOf(']', textStart);

      if (textEnd === -1 || html[textEnd + 1] !== '(') {
        result += html[index];
        index++;
        continue;
      }

      const urlStart = textEnd + 2;
      let cursor = urlStart;
      let depth = 1;

      while (cursor < html.length && depth > 0) {
        const currentChar = html[cursor];

        if (currentChar === '\\' && cursor + 1 < html.length) {
          cursor += 2;
          continue;
        }

        if (currentChar === '(') {
          depth++;
        } else if (currentChar === ')') {
          depth--;
        }

        cursor++;
      }

      if (depth !== 0) {
        result += html[index];
        index++;
        continue;
      }

      const text = html.slice(textStart, textEnd);
      const url = unescapeMarkdownUrl(decodeHTML(html.slice(urlStart, cursor - 1)));
      const safeUrl = sanitizeMarkdownUrl(url, isImage);

      if (safeUrl) {
        result += isImage
          ? `<img src="${escapeAttribute(safeUrl)}" alt="${escapeAttribute(text)}" class="md-image" />`
          : `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer" class="md-link">${text}</a>`;
      } else {
        result += text;
      }

      index = cursor;
    }

    return result;
  }

  /**
   * Apply syntax highlighting to code
   * @param {string} code - Code to highlight
   * @param {string} language - Programming language
   * @returns {string} Highlighted HTML
   */
  function highlightCode(code, language) {
    if (!language || !syntaxPatterns[language]) {
      return escapeHTML(code);
    }

    let highlighted = escapeHTML(code);
    const patterns = syntaxPatterns[language];

    // Store original strings to avoid double-escaping
    const placeholders = [];
    let placeholderIndex = 0;

    // Extract and protect strings first
    if (patterns.strings) {
      highlighted = highlighted.replace(patterns.strings, (match) => {
        const placeholder = `__PLACEHOLDER_${placeholderIndex++}__`;
        placeholders.push({ placeholder, value: `<span class="syntax-string">${match}</span>` });
        return placeholder;
      });
    }

    // Extract and protect comments
    if (patterns.comments) {
      highlighted = highlighted.replace(patterns.comments, (match) => {
        const placeholder = `__PLACEHOLDER_${placeholderIndex++}__`;
        placeholders.push({ placeholder, value: `<span class="syntax-comment">${match}</span>` });
        return placeholder;
      });
    }

    // Apply keyword highlighting
    if (patterns.keywords) {
      highlighted = highlighted.replace(patterns.keywords, '<span class="syntax-keyword">$1</span>');
    }

    // Apply number highlighting
    if (patterns.numbers) {
      highlighted = highlighted.replace(patterns.numbers, '<span class="syntax-number">$1</span>');
    }

    // Apply boolean/null highlighting
    if (patterns.booleans) {
      highlighted = highlighted.replace(patterns.booleans, '<span class="syntax-boolean">$1</span>');
    }

    // Apply function highlighting
    if (patterns.functions) {
      highlighted = highlighted.replace(patterns.functions, '<span class="syntax-function">$1</span>');
    }

    // Apply decorator highlighting (Python)
    if (patterns.decorators) {
      highlighted = highlighted.replace(patterns.decorators, '<span class="syntax-decorator">$1</span>');
    }

    // Apply variable highlighting (Bash)
    if (patterns.variables) {
      highlighted = highlighted.replace(patterns.variables, '<span class="syntax-variable">$1</span>');
    }

    // Restore placeholders
    for (const { placeholder, value } of placeholders) {
      highlighted = highlighted.replace(placeholder, value);
    }

    return highlighted;
  }

  // ============== Inline Parsing ==============

  /**
   * Parse inline markdown (bold, italic, code, links)
   * @param {string} text - Text to parse
   * @returns {string} HTML string
   */
  function parseInline(text) {
    // Escape HTML first
    let html = escapeHTML(text);
    
    // Code (inline) - must be done before other inline elements
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    
    // Bold and Italic (***text*** or ___text___)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    
    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_)
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Strikethrough (~~text~~)
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    
    // Images and links - images first so the link pass does not consume them
    html = replaceMarkdownLinksAndImages(html);
    
    return html;
  }

  // ============== Block Parsing ==============

  // Generated HTML blocks are temporarily replaced with placeholder tokens so
  // later line-based parsers treat them as opaque text. Each parse() call
  // draws a fresh random token namespace, so the full token string is
  // unguessable: user content that merely looks like a token
  // (\uE000...BLOCKn...) can never collide with a real placeholder, be
  // mistaken for a block boundary, or be substituted for generated HTML.
  // (A bare Private Use Area character is NOT enough — PUA characters are
  // valid Unicode and can appear in any markdown input.)
  let tokenNamespace = '';

  /**
   * Generate a fresh unguessable namespace for this parse's block tokens.
   * Restricted to [0-9a-z] so the value is safe to embed in the regexes
   * used by restoreBlockTokens and parseParagraphs. crypto.getRandomValues
   * is a CSPRNG available in every context the parser runs in (the
   * Chromium extension page and the Node test environment), so no
   * Math.random fallback is used — a predictable fallback would let user
   * content forge placeholder tokens.
   * @returns {string}
   */
  function makeTokenNamespace() {
    const randomPart = () => {
      const buf = new Uint32Array(2);
      crypto.getRandomValues(buf);
      return buf[0].toString(36) + buf[1].toString(36);
    };
    return randomPart() + randomPart();
  }

  const blockToken = (index) => `\uE000${tokenNamespace}BLOCK${index}\uE000`;

  /**
   * Restore placeholder tokens back into the protected HTML blocks.
   * @param {string} text - Text containing placeholder tokens
   * @param {string[]} protectedBlocks - Pool of protected HTML blocks
   * @returns {string} Text with placeholders restored
   */
  function restoreBlockTokens(text, protectedBlocks) {
    // Nested blocks (e.g. inner lists are protected before their parents)
    // can embed child tokens inside their HTML, and replace() never rescans
    // its replacement strings. Restore in reverse index order so a parent's
    // embedded child tokens are still present in the text when their own
    // restore pass runs. A function replacement avoids $& / $1 interpolation
    // of the block HTML. Only tokens carrying the current parse's random
    // namespace are restored — identical-looking user text is left alone.
    let result = text;
    for (let i = protectedBlocks.length - 1; i >= 0; i--) {
      const tokenRe = new RegExp(`\uE000${tokenNamespace}BLOCK${i}\uE000`, 'g');
      result = result.replace(tokenRe, () => protectedBlocks[i]);
    }
    return result;
  }

  /**
   * Parse code blocks with syntax highlighting
   * @param {string} text - Text containing code blocks
   * @param {Function} [protect] - Callback that replaces generated block HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseCodeBlocks(text, protect) {
    // Fenced code blocks with language. The fence must start a line: lines
    // like '> ```' (a fence inside a blockquote) are left for
    // parseBlockquoteContent to handle after the '>' prefixes are stripped.
    text = text.replace(/(^|\n)```(\w*)\n([\s\S]*?)```/g, (match, lineStart, lang, code) => {
      const language = lang ? lang.toLowerCase() : '';
      const languageLabel = lang ? `<span class="md-code-lang">${escapeHTML(lang)}</span>` : '';
      const highlightedCode = highlightCode(code.trim(), language);
      // Preserve the newline before the fence so the block stays on its own
      // line and line-based parsers treat it as a block element. The block is
      // tokenized here, at the point of generation, so later parsers never
      // regex-match user-authored HTML that mimics its markup.
      const blockHtml = `<div class="md-code-block">${languageLabel}<pre><code>${highlightedCode}</code></pre></div>`;
      return lineStart + (protect ? protect(blockHtml) : blockHtml);
    });
    
    // Fenced code blocks without language
    text = text.replace(/(^|\n)```\n?([\s\S]*?)```/g, (match, lineStart, code) => {
      const blockHtml = `<div class="md-code-block"><pre><code>${escapeHTML(code.trim())}</code></pre></div>`;
      return lineStart + (protect ? protect(blockHtml) : blockHtml);
    });
    
    return text;
  }

  /**
   * Parse block-level markdown inside a blockquote's content.
   * Runs the same block parsers as the main pipeline, except blockquotes
   * themselves (to avoid infinite recursion) and paragraphs (so plain quote
   * text keeps its existing inline-only rendering).
   * @param {string} content - Raw blockquote content (after '>' prefixes are stripped)
   * @returns {string} HTML string
   */
  function parseBlockquoteContent(content) {
    const protectedBlocks = [];

    // Replace a generated HTML block with a placeholder token so later passes
    // treat it as opaque text (they cannot re-parse or inline-parse inside it)
    const protect = (match) => {
      protectedBlocks.push(match);
      return blockToken(protectedBlocks.length - 1);
    };

    // Every block parser below tokenizes its own generated HTML at the point
    // of creation, so no pass ever has to identify generated blocks by
    // regex-matching class names in the (user-controlled) text. Whatever
    // remains after these passes is guaranteed to be plain user text, so
    // parseInline escapes raw HTML — including tags that merely copy the
    // generated class names — instead of restoring it as live markup.
    // Code blocks run first; their rendered HTML is multiline, so it is
    // tokenized before the line-based parsers can scan inside the <code>.
    let html = parseCodeBlocks(content, protect);
    html = parseTables(html, protect);
    html = parseHeaders(html, protect);
    html = parseTaskLists(html, protect);
    html = parseLists(html, protect);
    html = parseHorizontalRules(html, protect);

    // Inline-parse the remaining plain text so formatting like **bold** keeps
    // working inside blockquotes.
    html = parseInline(html);
    return restoreBlockTokens(html, protectedBlocks);
  }

  /**
   * Parse blockquotes
   * @param {string} text - Text containing blockquotes
   * @param {Function} protect - Callback that replaces generated blockquote HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseBlockquotes(text, protect) {
    const lines = text.split('\n');
    let inBlockquote = false;
    let blockquoteContent = [];
    const result = [];

    // Each generated blockquote is protected with a placeholder token right
    // away, so the line-based parsers downstream (task lists, lists, rules,
    // paragraphs) treat the whole quote — including blank quoted lines and
    // nested block HTML — as opaque. Only quotes generated here are ever
    // protected: raw <blockquote> tags written by the user stay plain text
    // and are escaped by parseInline like any other user-authored HTML.
    const closeBlockquote = () => {
      result.push(protect(`<blockquote class="md-blockquote">${parseBlockquoteContent(blockquoteContent.join('\n'))}</blockquote>`));
      inBlockquote = false;
      blockquoteContent = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const blockquoteMatch = line.match(/^>\s?(.*)/);

      if (blockquoteMatch) {
        if (!inBlockquote) {
          inBlockquote = true;
          blockquoteContent = [];
        }
        blockquoteContent.push(blockquoteMatch[1]);
      } else {
        if (inBlockquote) {
          closeBlockquote();
        }
        result.push(line);
      }
    }

    if (inBlockquote) {
      closeBlockquote();
    }

    return result.join('\n');
  }

  /**
   * Parse task lists
   * @param {string} text - Text containing task lists
   * @param {Function} [protect] - Callback that replaces generated list HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseTaskLists(text, protect) {
    const lines = text.split('\n');
    const result = [];
    let inList = false;
    let listItems = [];

    // Close any open task list, then let the triggering line pass through
    // unchanged so parseLists can render it (plain list items and ordinary
    // text both take this path)
    const closeTaskList = () => {
      if (!inList) return;
      result.push(buildTaskList(listItems, protect));
      inList = false;
      listItems = [];
    };

    for (const line of lines) {
      const taskMatch = line.match(/^[\s]*[-*+]\s+\[([ xX])\]\s+(.*)/);
      if (taskMatch) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        const isChecked = taskMatch[1].toLowerCase() === 'x';
        listItems.push({
          type: 'task',
          checked: isChecked,
          content: taskMatch[2]
        });
      } else {
        closeTaskList();
        result.push(line);
      }
    }

    closeTaskList();

    return result.join('\n');
  }

  /**
   * Build task list HTML
   * @param {Array} items - Task list items
   * @param {Function} [protect] - Callback that replaces generated list HTML with a placeholder token
   * @returns {string} HTML string
   */
  function buildTaskList(items, protect) {
    const itemsHtml = items.map(item => {
      const checkedAttr = item.checked ? 'checked' : '';
      const checkedClass = item.checked ? 'md-task-checked' : '';
      return `<li class="md-task-item">
        <input type="checkbox" ${checkedAttr} disabled />
        <span class="${checkedClass}">${parseInline(item.content)}</span>
      </li>`;
    }).join('');
    const listHtml = `<ul class="md-list md-list-ul md-task-list">${itemsHtml}</ul>`;
    return protect ? protect(listHtml) : listHtml;
  }

  // List item line patterns: leading whitespace, a `-`/`*`/`+` or `1.`
  // marker, and the item content. Used by parseLists.
  const UNORDERED_LIST_ITEM_RE = /^\s*[-*+]\s+(.*)/;
  const ORDERED_LIST_ITEM_RE = /^\s*(\d+)\.\s+(.*)/;

  /**
   * Parse lists (ordered and unordered) with improved nesting
   * @param {string} text - Text containing lists
   * @param {Function} [protect] - Callback that replaces generated list HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseLists(text, protect) {
    const lines = text.split('\n');
    const result = [];
    const listStack = [];
    let currentIndent = -1;

    // Close the innermost open list: build its HTML, then attach it to the
    // parent's last item as a nested list, or push it as a top-level block
    const closeTopList = () => {
      const closedList = listStack.pop();
      const listHtml = buildList(closedList.type, closedList.items, protect);
      const parentList = listStack.at(-1);
      if (parentList && parentList.items.length > 0) {
        parentList.items[parentList.items.length - 1].nested = listHtml;
      } else {
        result.push(listHtml);
      }
    };

    // Close every open list nested deeper than the given indent
    const dedentTo = (indent) => {
      while (listStack.length > 0 && listStack.at(-1).indent > indent) {
        closeTopList();
      }
    };

    // Not a list item: close all open lists and let the line pass through
    const flushNonListLine = (line) => {
      while (listStack.length > 0) {
        closeTopList();
      }
      currentIndent = -1;
      result.push(line);
    };

    // Add one list-item line, opening or closing lists as the indent and
    // list type require
    const addItem = (line) => {
      const unorderedMatch = line.match(UNORDERED_LIST_ITEM_RE);
      const orderedMatch = line.match(ORDERED_LIST_ITEM_RE);
      if (!unorderedMatch && !orderedMatch) {
        flushNonListLine(line);
        return;
      }

      const indent = line.search(/\S/);
      const isOrdered = !!orderedMatch;
      const content = isOrdered ? orderedMatch[2] : unorderedMatch[1];
      const number = isOrdered ? Number.parseInt(orderedMatch[1], 10) : null;
      const listType = isOrdered ? 'ol' : 'ul';

      // Handle indentation changes
      if (indent > currentIndent) {
        // Start new nested list
        listStack.push({ type: listType, items: [], indent });
        currentIndent = indent;
      } else if (indent < currentIndent) {
        // Close lists until we reach the right level
        dedentTo(indent);
        currentIndent = indent;
      }

      // Add the item to the current list, closing a type-mismatched list first
      const topList = listStack.at(-1);
      if (topList) {
        if (topList.type !== listType) {
          // Different list type, close current and start new
          closeTopList();
          listStack.push({ type: listType, items: [], indent });
        }
        listStack.at(-1).items.push({ content, number, nested: null });
      }
    };

    for (const line of lines) {
      addItem(line);
    }

    // Close any remaining lists
    while (listStack.length > 0) {
      closeTopList();
    }

    return result.join('\n');
  }

  /**
   * Build list HTML with nested support
   * @param {string} type - 'ul' or 'ol'
   * @param {Array} items - List items
   * @param {Function} [protect] - Callback that replaces generated list HTML with a placeholder token
   * @returns {string} HTML string
   */
  function buildList(type, items, protect) {
    const itemsHtml = items.map((item, index) => {
      const nestedHtml = item.nested || '';
      const contentHtml = parseInline(item.content);
      return `<li class="md-list-item">${contentHtml}${nestedHtml}</li>`;
    }).join('');
    
    const startAttr = type === 'ol' && items[0]?.number ? ` start="${items[0].number}"` : '';
    const listHtml = `<${type} class="md-list md-list-${type}"${startAttr}>${itemsHtml}</${type}>`;
    return protect ? protect(listHtml) : listHtml;
  }

  function parseTableRow(rowLine) {
    let s = rowLine.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) {
      let cnt = 0;
      for (let k = s.length - 2; k >= 0 && s[k] === '\\'; k--) cnt++;
      if (cnt % 2 === 0) s = s.slice(0, -1);
    }
    const cells = [];
    let cur = '';
    for (let idx = 0; idx < s.length; idx++) {
      const ch = s[idx];
      if (ch === '|') {
        let cnt = 0;
        for (let p = cur.length - 1; p >= 0 && cur[p] === '\\'; p--) cnt++;
        if (cnt % 2 === 1) {
          cur = cur.slice(0, -1) + '|';
        } else {
          cells.push(cur.trim());
          cur = '';
        }
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  function normalizeTableRow(cells, targetLen) {
    if (cells.length >= targetLen) return cells.slice(0, targetLen);
    return cells.concat(new Array(targetLen - cells.length).fill(''));
  }

  /**
   * Parse tables
   * @param {string} text - Text containing tables
   * @param {Function} [protect] - Callback that replaces generated table HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseTables(text, protect) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // Check if this is a table (has | and next line has |---|)
      if (line.includes('|') && nextLine && /^\|?[\s-:|]+\|?$/.test(nextLine)) {
        let headerCells = parseTableRow(line);
        const rows = [];
        i += 2; // Skip header and separator

        while (i < lines.length && lines[i].includes('|')) {
          rows.push(parseTableRow(lines[i]));
          i++;
        }

        const maxCols = Math.max(headerCells.length, ...rows.map(r => r.length), 0);
        headerCells = normalizeTableRow(headerCells, maxCols);
        for (let r = 0; r < rows.length; r++) {
          rows[r] = normalizeTableRow(rows[r], maxCols);
        }

        const headerHtml = headerCells.map(cell => `<th class="md-table-header">${parseInline(cell)}</th>`).join('');
        const rowsHtml = rows.map(row => {
          const cellsHtml = row.map(cell => `<td class="md-table-cell">${parseInline(cell)}</td>`).join('');
          return `<tr class="md-table-row">${cellsHtml}</tr>`;
        }).join('');

        const blockHtml = `<div class="md-table-wrapper"><table class="md-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
        result.push(protect ? protect(blockHtml) : blockHtml);
      } else {
        result.push(line);
        i++;
      }
    }

    return result.join('\n');
  }

  /**
   * Parse headers
   * @param {string} text - Text containing headers
   * @param {Function} [protect] - Callback that replaces generated header HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseHeaders(text, protect) {
    const lines = text.split('\n');
    return lines.map(line => {
      const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const content = headerMatch[2];
        const blockHtml = `<h${level} class="md-header md-header-${level}">${parseInline(content)}</h${level}>`;
        return protect ? protect(blockHtml) : blockHtml;
      }
      return line;
    }).join('\n');
  }

  /**
   * Parse horizontal rules
   * @param {string} text - Text containing horizontal rules
   * @param {Function} [protect] - Callback that replaces generated rule HTML with a placeholder token
   * @returns {string} HTML string
   */
  function parseHorizontalRules(text, protect) {
    return text.replace(/^[-*_]{3,}$/gm, () => {
      const blockHtml = '<hr class="md-hr" />';
      return protect ? protect(blockHtml) : blockHtml;
    });
  }

  /**
   * Parse paragraphs
   * @param {string} text - Text to parse into paragraphs
   * @returns {string} HTML string
   */
  function parseParagraphs(text) {
    const blocks = text.split(/\n\n+/);
    return blocks.flatMap(block => {
      block = block.trim();
      if (!block) return [];

      // Split at standalone protected-block token lines (placeholders for
      // block-level HTML like code blocks and complete blockquotes) before
      // wrapping so a block that immediately follows a paragraph — with no
      // blank line between them — renders as a sibling block element instead
      // of having its HTML restored inside the <p>. Block-level HTML
      // generated inside a blockquote is protected along with the blockquote
      // itself, so no token line can be nested inside other block HTML here.
      // The regex is namespaced per parse so user text that merely looks
      // like a token is never mistaken for one.
      const tokenLineRe = new RegExp(`^\uE000${tokenNamespace}BLOCK\\d+\uE000$`);
      const tokenPrefix = `\uE000${tokenNamespace}`;
      const parts = [];
      let current = [];
      for (const line of block.split('\n')) {
        if (tokenLineRe.test(line.trim())) {
          if (current.length > 0) {
            parts.push(current.join('\n'));
            current = [];
          }
          parts.push(line);
          continue;
        }
        current.push(line);
      }
      if (current.length > 0) {
        parts.push(current.join('\n'));
      }

      return parts.map(part => {
        part = part.trim();
        if (!part) return '';

        // Don't wrap placeholder-token parts (single-line placeholders for
        // block-level HTML). Every block the parsers generate is tokenized at
        // the point of creation, so any markup reaching this point is raw
        // user-authored HTML and must be escaped by parseInline like the rest
        // of the text — even when it mimics a generated tag or class name.
        // Only parts carrying this parse's random namespace are tokens;
        // user text that merely starts with a PUA character is escaped.
        if (part.startsWith(tokenPrefix)) {
          return part;
        }

        // Handle single line breaks within paragraphs
        const lines = part.split('\n').filter(line => line.trim());
        if (lines.length === 1) {
          return `<p class="md-paragraph">${parseInline(lines[0])}</p>`;
        }

        return `<p class="md-paragraph">${lines.map(line => parseInline(line)).join('<br />')}</p>`;
      }).filter(Boolean);
    }).join('\n\n');
  }

  // ============== HTML Sanitizer ==============

  /**
   * Allowed HTML tags for markdown output.
   * Only these tags will pass through the sanitizer.
   */
  const ALLOWED_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'del', 's', 'u',
    'code', 'pre',
    'blockquote',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img',
    'div', 'span',
    'input'
  ]);

  /**
   * Allowed attributes per tag.
   * Tags not listed here allow only the global set.
   */
  const ALLOWED_ATTRS = {
    a: ['href', 'target', 'rel', 'class'],
    img: ['src', 'alt', 'class'],
    input: ['type', 'checked', 'disabled', 'class'],
    '*': ['class']
  };

  /**
   * Strict allowlist sanitizer using DOMParser.
   * Parses the HTML, walks the DOM tree, and removes any elements
   * or attributes not in the allowlist.
   *
   * Note: Designed for markdown-parsed output where raw HTML has already
   * been escaped by escapeHTML(). For standalone use on untrusted input,
   * escape HTML entities first to prevent tag injection.
   * @param {string} html - HTML string to sanitize
   * @returns {string} Sanitized HTML string
   */
  function sanitizeHTML(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Use DOMParser to parse the HTML safely
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstChild;

    if (!root) {
      return '';
    }

    // Walk the DOM tree and remove disallowed elements/attributes
    sanitizeNode(root);

    return root.innerHTML;
  }

  /**
   * Allowed URL protocols for href attributes.
   */
  const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

  /**
   * Allowed URL protocols for img src attributes (includes data: and blob: for inline images).
   */
  const ALLOWED_IMG_PROTOCOLS = ['http:', 'https:', 'data:', 'blob:'];

  /**
   * Recursively sanitize a DOM node and its children.
   * @param {Node} node - DOM node to sanitize
   */
  function sanitizeNode(node) {
    const childNodes = Array.from(node.childNodes);

    for (const child of childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();

        // Remove disallowed tags entirely (including their children)
        if (!ALLOWED_TAGS.has(tagName)) {
          node.removeChild(child);
          continue;
        }

        // Remove disallowed attributes and validate URLs
        const allowedForTag = [
          ...(ALLOWED_ATTRS[tagName] || []),
          ...(ALLOWED_ATTRS['*'] || [])
        ];
        const attrs = Array.from(child.attributes);
        for (const attr of attrs) {
          if (!allowedForTag.includes(attr.name)) {
            child.removeAttribute(attr.name);
          } else if (attr.name === 'href' && !isSafeUrl(attr.value, ALLOWED_URL_PROTOCOLS)) {
            child.removeAttribute(attr.name);
          } else if (attr.name === 'src' && !isSafeUrl(attr.value, tagName === 'img' ? ALLOWED_IMG_PROTOCOLS : ALLOWED_URL_PROTOCOLS)) {
            child.removeAttribute(attr.name);
          } else if (tagName === 'input' && attr.name === 'type' && attr.value !== 'checkbox') {
            child.removeAttribute(attr.name);
          }
        }

        // Ensure target="_blank" links have rel="noopener noreferrer"
        if (tagName === 'a' && child.getAttribute('target') === '_blank') {
          const rel = child.getAttribute('rel') || '';
          if (!rel.includes('noopener')) {
            child.setAttribute('rel', 'noopener noreferrer');
          }
        }

        // Recursively sanitize children
        sanitizeNode(child);
      }
    }
  }

  /**
   * Check if a URL uses a safe protocol.
   * @param {string} url - URL to validate
   * @param {string[]} allowedProtocols - List of allowed protocol strings (e.g. ['http:', 'https:'])
   * @returns {boolean} True if the URL is safe
   */
  function isSafeUrl(url, allowedProtocols) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      return false;
    }
    // Relative URLs and fragment-only URLs are safe
    // Block protocol-relative URLs (//host) which resolve using the page protocol
    if (trimmed.startsWith('//')) {
      return false;
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return true;
    }
    // Check protocol
    try {
      const parsed = new URL(trimmed);
      if (!allowedProtocols.includes(parsed.protocol)) {
        return false;
      }
      // For data: URLs, only allow safe raster image MIME types
      // (SVG can contain embedded scripts; other image types are safe in <img>)
      if (parsed.protocol === 'data:' && !/^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|tiff);base64,/i.test(trimmed)) {
        return false;
      }
      return true;
    } catch {
      // If URL parsing fails, check if it looks like a protocol-relative URL
      // URLs like "guide/intro.md" or "hello world" are relative and safe
      // URLs like "javascript:alert(1)" contain a colon before any slash
      const colonIndex = trimmed.indexOf(':');
      const slashIndex = trimmed.indexOf('/');
      // If there's no colon, or the colon comes after a slash, it's a relative URL
      if (colonIndex === -1 || (slashIndex !== -1 && colonIndex > slashIndex)) {
        return true;
      }
      // Has a colon before any slash — reject as potentially dangerous scheme
      return false;
    }
  }

  // ============== Main Parse Function ==============

  /**
   * Main parse function with caching
   * @param {string} markdown - Markdown text to parse
   * @returns {string} Safe HTML string
   */
  function parse(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }

    // Check cache first
    const cacheKey = getCacheKey(markdown);
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fresh unguessable token namespace for this parse so user content can
    // never forge a placeholder token (see blockToken / makeTokenNamespace)
    tokenNamespace = makeTokenNamespace();

    let html = markdown;
    const protectedBlocks = [];

    // Replace rendered code-block HTML with a placeholder token so the
    // line-based parsers below never scan inside the <code> content
    const protect = (match) => {
      protectedBlocks.push(match);
      return blockToken(protectedBlocks.length - 1);
    };

    // Parse in order of precedence. Every block parser below tokenizes its
    // own generated HTML at the point of creation via the protect callback,
    // so no pass ever identifies generated blocks by regex-matching class
    // names in the (user-controlled) input. Raw HTML written by the user —
    // including tags that copy generated class names — is never protected
    // and is escaped by parseInline.
    html = parseCodeBlocks(html, protect);      // Code blocks first to protect content
    html = parseTables(html, protect);          // Tables
    html = parseHeaders(html, protect);         // Headers
    // Blockquotes. parseBlockquotes protects each quote it generates with a
    // placeholder token: blank quoted lines and nested code/table HTML would
    // otherwise be cut up by the blank-line split in parseParagraphs, which
    // escaped the closing </blockquote> as literal text and left the quote
    // open, swallowing following content. Only generated quotes are ever
    // protected — raw <blockquote> tags in the input stay plain text and are
    // escaped by parseInline like any other user-authored HTML.
    html = parseBlockquotes(html, protect);     // Blockquotes
    html = parseTaskLists(html, protect);       // Task lists (before regular lists)
    html = parseLists(html, protect);           // Lists
    html = parseHorizontalRules(html, protect); // Horizontal rules
    html = parseParagraphs(html);               // Paragraphs last
    // Restore code blocks only after paragraph parsing: parseParagraphs
    // splits on blank lines, which would cut through multiline code content
    html = restoreBlockTokens(html, protectedBlocks); // Restore code blocks

    // Sanitize the final HTML through a strict allowlist
    html = sanitizeHTML(html);

    // Cache the result
    cache.set(cacheKey, html);

    return html;
  }

  /**
   * Clear the cache
   */
  function clearCache() {
    cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  function getCacheStats() {
    return {
      size: cache.size,
      maxSize: cache.maxSize
    };
  }

  // Public API
  return {
    parse: parse,
    clearCache: clearCache,
    getCacheStats: getCacheStats,
    escapeHTML: escapeHTML,
    sanitizeHTML: sanitizeHTML
  };
})();

// Export to global scope
window.MarkdownParser = MarkdownParser;