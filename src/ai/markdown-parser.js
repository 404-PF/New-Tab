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

      if (isImage && protocol === 'data' && !/^data:image\//i.test(trimmed)) {
        return null;
      }

      try {
        return new URL(trimmed).href;
      } catch (error) {
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

  /**
   * Parse code blocks with syntax highlighting
   * @param {string} text - Text containing code blocks
   * @returns {string} HTML string
   */
  function parseCodeBlocks(text) {
    // Fenced code blocks with language
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang ? lang.toLowerCase() : '';
      const languageLabel = lang ? `<span class="md-code-lang">${escapeHTML(lang)}</span>` : '';
      const highlightedCode = highlightCode(code.trim(), language);
      return `<div class="md-code-block">${languageLabel}<pre><code>${highlightedCode}</code></pre></div>`;
    });
    
    // Fenced code blocks without language
    text = text.replace(/```\n?([\s\S]*?)```/g, (match, code) => {
      return `<div class="md-code-block"><pre><code>${escapeHTML(code.trim())}</code></pre></div>`;
    });
    
    return text;
  }

  /**
   * Parse blockquotes
   * @param {string} text - Text containing blockquotes
   * @returns {string} HTML string
   */
  function parseBlockquotes(text) {
    const lines = text.split('\n');
    let inBlockquote = false;
    let blockquoteContent = [];
    let result = [];

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
          result.push(`<blockquote class="md-blockquote">${parseInline(blockquoteContent.join('\n'))}</blockquote>`);
          inBlockquote = false;
          blockquoteContent = [];
        }
        result.push(line);
      }
    }

    if (inBlockquote) {
      result.push(`<blockquote class="md-blockquote">${parseInline(blockquoteContent.join('\n'))}</blockquote>`);
    }

    return result.join('\n');
  }

  /**
   * Parse task lists
   * @param {string} text - Text containing task lists
   * @returns {string} HTML string
   */
  function parseTaskLists(text) {
    const lines = text.split('\n');
    let result = [];
    let inList = false;
    let listItems = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const taskMatch = line.match(/^[\s]*[-*+]\s+\[([ xX])\]\s+(.*)/);
      const unorderedMatch = line.match(/^[\s]*[-*+]\s+(.*)/);
      const orderedMatch = line.match(/^[\s]*\d+\.\s+(.*)/);

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
      } else if (unorderedMatch && !taskMatch) {
        // Non-task unordered list item - close any open task list and let parseLists handle it
        if (inList) {
          result.push(buildTaskList(listItems));
          inList = false;
          listItems = [];
        }
        // Don't push the line - let parseLists handle it
      } else if (orderedMatch) {
        // Ordered list item - close any open task list and let parseLists handle it
        if (inList) {
          result.push(buildTaskList(listItems));
          inList = false;
          listItems = [];
        }
        // Don't push the line - let parseLists handle it
      } else {
        // Not a list item - close any open task list and push the line
        if (inList) {
          result.push(buildTaskList(listItems));
          inList = false;
          listItems = [];
        }
        result.push(line);
      }
    }

    if (inList) {
      result.push(buildTaskList(listItems));
    }

    return result.join('\n');
  }

  /**
   * Build task list HTML
   * @param {Array} items - Task list items
   * @returns {string} HTML string
   */
  function buildTaskList(items) {
    const itemsHtml = items.map(item => {
      const checkedAttr = item.checked ? 'checked' : '';
      const checkedClass = item.checked ? 'md-task-checked' : '';
      return `<li class="md-task-item">
        <input type="checkbox" ${checkedAttr} disabled />
        <span class="${checkedClass}">${parseInline(item.content)}</span>
      </li>`;
    }).join('');
    return `<ul class="md-list md-list-ul md-task-list">${itemsHtml}</ul>`;
  }

  /**
   * Parse lists (ordered and unordered) with improved nesting
   * @param {string} text - Text containing lists
   * @returns {string} HTML string
   */
  function parseLists(text) {
    const lines = text.split('\n');
    let result = [];
    let listStack = [];
    let currentIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.search(/\S/);
      const unorderedMatch = line.match(/^[\s]*[-*+]\s+(.*)/);
      const orderedMatch = line.match(/^[\s]*(\d+)\.\s+(.*)/);

      if (unorderedMatch || orderedMatch) {
        const isOrdered = !!orderedMatch;
        const content = isOrdered ? orderedMatch[2] : unorderedMatch[1];
        const number = isOrdered ? parseInt(orderedMatch[1]) : null;

        // Determine list type
        const listType = isOrdered ? 'ol' : 'ul';

        // Handle indentation changes
        if (indent > currentIndent) {
          // Start new nested list
          listStack.push({ type: listType, items: [], indent: indent });
          currentIndent = indent;
        } else if (indent < currentIndent) {
          // Close lists until we reach the right level
          while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
            const closedList = listStack.pop();
            const listHtml = buildList(closedList.type, closedList.items);
            if (listStack.length > 0) {
              // Add as nested list to parent
              const parentList = listStack[listStack.length - 1];
              if (parentList.items.length > 0) {
                parentList.items[parentList.items.length - 1].nested = listHtml;
              }
            } else {
              result.push(listHtml);
            }
          }
          currentIndent = indent;
        }

        // Add item to current list
        if (listStack.length > 0) {
          const currentList = listStack[listStack.length - 1];
          if (currentList.type !== listType) {
            // Different list type, close current and start new
            const closedList = listStack.pop();
            const listHtml = buildList(closedList.type, closedList.items);
            if (listStack.length > 0) {
              const parentList = listStack[listStack.length - 1];
              if (parentList.items.length > 0) {
                parentList.items[parentList.items.length - 1].nested = listHtml;
              }
            } else {
              result.push(listHtml);
            }
            listStack.push({ type: listType, items: [], indent: indent });
          }
          listStack[listStack.length - 1].items.push({ content, number, nested: null });
        }
      } else {
        // Not a list item, close all open lists
        while (listStack.length > 0) {
          const closedList = listStack.pop();
          const listHtml = buildList(closedList.type, closedList.items);
          if (listStack.length > 0) {
            const parentList = listStack[listStack.length - 1];
            if (parentList.items.length > 0) {
              parentList.items[parentList.items.length - 1].nested = listHtml;
            }
          } else {
            result.push(listHtml);
          }
        }
        currentIndent = -1;
        result.push(line);
      }
    }

    // Close any remaining lists
    while (listStack.length > 0) {
      const closedList = listStack.pop();
      const listHtml = buildList(closedList.type, closedList.items);
      if (listStack.length > 0) {
        const parentList = listStack[listStack.length - 1];
        if (parentList.items.length > 0) {
          parentList.items[parentList.items.length - 1].nested = listHtml;
        }
      } else {
        result.push(listHtml);
      }
    }

    return result.join('\n');
  }

  /**
   * Build list HTML with nested support
   * @param {string} type - 'ul' or 'ol'
   * @param {Array} items - List items
   * @returns {string} HTML string
   */
  function buildList(type, items) {
    const itemsHtml = items.map((item, index) => {
      const nestedHtml = item.nested || '';
      const contentHtml = parseInline(item.content);
      const startAttr = type === 'ol' && item.number ? ` start="${item.number}"` : '';
      return `<li class="md-list-item">${contentHtml}${nestedHtml}</li>`;
    }).join('');
    
    const startAttr = type === 'ol' && items[0]?.number ? ` start="${items[0].number}"` : '';
    return `<${type} class="md-list md-list-${type}"${startAttr}>${itemsHtml}</${type}>`;
  }

  /**
   * Parse tables
   * @param {string} text - Text containing tables
   * @returns {string} HTML string
   */
  function parseTables(text) {
    const lines = text.split('\n');
    let result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // Check if this is a table (has | and next line has |---|)
      if (line.includes('|') && nextLine && /^\|?[\s-:|]+\|?$/.test(nextLine)) {
        const headerCells = line.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
        const rows = [];
        i += 2; // Skip header and separator

        while (i < lines.length && lines[i].includes('|')) {
          const cells = lines[i].split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
          rows.push(cells);
          i++;
        }

        const headerHtml = headerCells.map(cell => `<th class="md-table-header">${parseInline(cell)}</th>`).join('');
        const rowsHtml = rows.map(row => {
          const cellsHtml = row.map(cell => `<td class="md-table-cell">${parseInline(cell)}</td>`).join('');
          return `<tr class="md-table-row">${cellsHtml}</tr>`;
        }).join('');

        result.push(`<div class="md-table-wrapper"><table class="md-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`);
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
   * @returns {string} HTML string
   */
  function parseHeaders(text) {
    const lines = text.split('\n');
    return lines.map(line => {
      const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const content = headerMatch[2];
        return `<h${level} class="md-header md-header-${level}">${parseInline(content)}</h${level}>`;
      }
      return line;
    }).join('\n');
  }

  /**
   * Parse horizontal rules
   * @param {string} text - Text containing horizontal rules
   * @returns {string} HTML string
   */
  function parseHorizontalRules(text) {
    return text.replace(/^[-*_]{3,}$/gm, '<hr class="md-hr" />');
  }

  /**
   * Parse paragraphs
   * @param {string} text - Text to parse into paragraphs
   * @returns {string} HTML string
   */
  function parseParagraphs(text) {
    const blocks = text.split(/\n\n+/);
    return blocks.map(block => {
      block = block.trim();
      if (!block) return '';
      
      // Don't wrap if already wrapped in block elements
      if (block.startsWith('<h') || 
          block.startsWith('<ul') || 
          block.startsWith('<ol') || 
          block.startsWith('<blockquote') || 
          block.startsWith('<pre') || 
          block.startsWith('<div') ||
          block.startsWith('<hr') ||
          block.startsWith('<table')) {
        return block;
      }
      
      // Handle single line breaks within paragraphs
      const lines = block.split('\n').filter(line => line.trim());
      if (lines.length === 1) {
        return `<p class="md-paragraph">${parseInline(lines[0])}</p>`;
      }
      
      return `<p class="md-paragraph">${lines.map(line => parseInline(line)).join('<br />')}</p>`;
    }).join('\n\n');
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

    let html = markdown;

    // Parse in order of precedence
    html = parseCodeBlocks(html);      // Code blocks first to protect content
    html = parseTables(html);          // Tables
    html = parseHeaders(html);         // Headers
    html = parseBlockquotes(html);     // Blockquotes
    html = parseTaskLists(html);       // Task lists (before regular lists)
    html = parseLists(html);           // Lists
    html = parseHorizontalRules(html); // Horizontal rules
    html = parseParagraphs(html);      // Paragraphs last

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
    escapeHTML: escapeHTML
  };
})();

// Export to global scope
window.MarkdownParser = MarkdownParser;