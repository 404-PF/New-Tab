import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

// Regression guard for #326 — search history panel (z-index: 60) must be
// scoped within .search-bar so it cannot intercept app-grid clicks.
const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');

const SEARCH_BAR_HTML = `
  <div class="search-bar">
    <svg class="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7"></circle>
      <path d="m20 20-3.5-3.5"></path>
    </svg>
    <input type="text" placeholder="Search or enter website" autofocus />
  </div>
`;

const APP_GRID_HTML = `
  <div class="app-grid">
    <a id="test-app-link" class="app-icon custom-app" href="https://example.com">Example app</a>
  </div>
`;

beforeAll(() => {
  vi.useFakeTimers();
  window.VisibilityInterval = class {
    constructor() {}
    destroy() {}
  };
  document.body.insertAdjacentHTML('beforeend', SEARCH_BAR_HTML);
  document.body.insertAdjacentHTML('beforeend', APP_GRID_HTML);
  injectScript('src/core/utils.js');
  injectScript('src/core/main.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.removeItem('searchHistory');

  const input = document.querySelector('.search-bar input');
  if (input) {
    input.value = '';
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
  }

  const panel = document.querySelector('.search-history-panel');
  if (panel) {
    panel.hidden = true;
  }
});

function focusSearchInput() {
  const input = document.querySelector('.search-bar input');
  input.dispatchEvent(new Event('focus'));
  return input;
}

// ------------------------------------------------------------------
// Regression: #326 — stacking context isolation guard
// ------------------------------------------------------------------
describe('search bar stacking context (#326)', () => {
  it('declares isolation: isolate in core.css for .search-bar', () => {
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');
    // Check that isolation: isolate appears within a .search-bar rule block.
    // Using [^}]* (instead of [^}]+) tolerates empty blocks, and the overall
    // pattern avoids assuming the rule is a single contiguous block (e.g. if
    // responsive overrides or nested at-rules are added later).
    expect(css).toMatch(/\.search-bar[^{]*\{[^}]*isolation:\s*isolate/);
  });

  it('scopes search-history-panel z-index within .search-bar via computed isolation', () => {
    // Inject the real .search-bar CSS rule from core.css into the test DOM
    // so getComputedStyle reflects the actual production styles.
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');
    const ruleBlock = css.match(/\.search-bar[^{]*\{[^}]*isolation:\s*isolate[^}]*\}/);
    expect(ruleBlock).not.toBeNull();

    const style = document.createElement('style');
    style.textContent = ruleBlock[0];
    document.head.appendChild(style);

    const searchBar = document.querySelector('.search-bar');
    expect(getComputedStyle(searchBar).isolation).toBe('isolate');

    document.head.removeChild(style);
  });
});

describe('search history', () => {
  it('stores recent searches newest-first without duplicates', () => {
    recordSearchHistory('alpha');
    recordSearchHistory('beta');
    recordSearchHistory('alpha');

    expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['alpha', 'beta']);
  });

  it('filters suggestions by partial input', () => {
    recordSearchHistory('alpha');
    recordSearchHistory('beta');
    recordSearchHistory('gamma');

    const input = focusSearchInput();
    input.value = 'al';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const suggestions = Array.from(document.querySelectorAll('.search-history-item'));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].textContent).toBe('alpha');
  });

  it('hides suggestions when escape is pressed', () => {
    recordSearchHistory('alpha');

    const input = focusSearchInput();
    expect(document.querySelector('.search-history-panel').hidden).toBe(false);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.search-history-panel').hidden).toBe(true);
  });

  it('keeps app grid links clickable while suggestions are open', () => {
    const appLink = document.getElementById('test-app-link');
    const clickSpy = vi.fn();

    appLink.addEventListener('click', clickSpy);

    recordSearchHistory('alpha');
    const input = focusSearchInput();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    appLink.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('does not record whitespace or malformed url input', () => {
    runSearch('   ');
    runSearch('http://example.c');

    expect(localStorage.getItem('searchHistory')).toBeNull();
  });

  it('clicking a suggestion reuses the search without writing history again', () => {
    const searchQuerySpy = vi.spyOn(chrome.search, 'query');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    recordSearchHistory('alpha');
    recordSearchHistory('beta');
    setItemSpy.mockClear();
    searchQuerySpy.mockClear();

    const input = focusSearchInput();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('.search-history-item').click();

    expect(searchQuerySpy).toHaveBeenCalledTimes(1);
    expect(searchQuerySpy).toHaveBeenCalledWith({
      text: 'beta',
      disposition: 'CURRENT_TAB'
    });
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['beta', 'alpha']);
  });

  it('clears search history and keeps focus on the input', () => {
    recordSearchHistory('alpha');

    const input = focusSearchInput();
    expect(document.querySelector('.search-history-panel').hidden).toBe(false);

    document.querySelector('.search-history-clear-btn').click();

    expect(localStorage.getItem('searchHistory')).toBeNull();
    expect(document.querySelector('.search-history-panel').hidden).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('keeps only the most recent eight entries', () => {
    Array.from({ length: 9 }, (_, index) => `query-${index + 1}`).forEach((query) => {
      recordSearchHistory(query);
    });

    expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual([
      'query-9',
      'query-8',
      'query-7',
      'query-6',
      'query-5',
      'query-4',
      'query-3',
      'query-2'
    ]);
  });
});
