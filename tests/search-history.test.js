import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

// Regression guard for #326 — search history panel (z-index: 60) must be
// scoped within .search-bar-wrapper so it cannot intercept app-grid clicks.
const CORE_CSS_PATH = resolve(process.cwd(), 'css/core.css');
const NEW_TAB_PATH = resolve(process.cwd(), 'New-Tab.html');

const SEARCH_BAR_HTML = `
  <div class="search-bar-wrapper">
    <div class="search-bar">
      <svg class="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <path d="m20 20-3.5-3.5"></path>
      </svg>
      <input type="text" placeholder="Search or enter website" />
    </div>
    <div class="search-provider-bar"></div>
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
  localStorage.removeItem('searchHistoryEnabled');
  localStorage.removeItem('searchProvider');
  localStorage.removeItem('customSearchProviders');
  window.saveActiveProvider(null);

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
    expect(css).toMatch(/\.search-bar\s*\{[^}]*isolation:\s*isolate/);
  });

  it('preserves the search-bar stacking context', () => {
    // Inject the real .search-bar CSS rule from core.css into the test DOM
    // so getComputedStyle reflects the actual production styles.
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');
    const ruleBlock = css.match(/\.search-bar\s*\{[^}]*isolation:\s*isolate[^}]*\}/);
    expect(ruleBlock).not.toBeNull();

    const style = document.createElement('style');
    style.textContent = ruleBlock[0];
    document.head.appendChild(style);

    const searchBar = document.querySelector('.search-bar');
    expect(getComputedStyle(searchBar).isolation).toBe('isolate');

    document.head.removeChild(style);
  });

  it('raises the focused search wrapper above the app grid', () => {
    const css = readFileSync(CORE_CSS_PATH, 'utf-8');
    const selector = '.search-bar-wrapper:focus-within {';
    const ruleStart = css.indexOf(selector);
    const ruleEnd = css.indexOf('}', ruleStart);
    expect(css.slice(ruleStart, ruleEnd)).toContain('z-index: 1;');
  });
});

describe('search history', () => {
  it('does not autofocus the search input during startup (#513)', () => {
    const html = readFileSync(NEW_TAB_PATH, 'utf-8');
    const searchInput = html.match(/<input[^>]*data-i18n="searchPlaceholder"[^>]*>/);

    expect(searchInput).not.toBeNull();
    expect(searchInput[0]).not.toMatch(/\sautofocus(?:\s|=|>)/);
  });

  it('keeps history hidden when an app-grid item is clicked without search focus (#513)', () => {
    const input = document.querySelector('.search-bar input');
    input.focus();
    recordSearchHistory('alpha');

    const panel = document.querySelector('.search-history-panel');
    expect(panel).not.toBeNull();
    expect(panel.hidden).toBe(false);

    const appLink = document.getElementById('test-app-link');
    input.blur();

    appLink.click();

    expect(document.activeElement).not.toBe(input);
    expect(panel.hidden).toBe(true);
  });
  it('does not store or show history when disabled', () => {
    localStorage.setItem('searchHistory', JSON.stringify(['existing query']));
    localStorage.setItem('searchHistoryEnabled', 'false');

    recordSearchHistory('new query');
    focusSearchInput();

    expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['existing query']);
    const panel = document.querySelector('.search-history-panel');
    expect(panel === null || panel.hidden).toBe(true);
  });

  it('places suggestions outside the search bar below the provider row', () => {
    recordSearchHistory('alpha');
    const input = focusSearchInput();

    const wrapper = document.querySelector('.search-bar-wrapper');
    const panel = document.querySelector('.search-history-panel');
    const list = document.getElementById('search-suggestions-list');

    expect(panel.parentElement).toBe(wrapper);
    expect(wrapper.lastElementChild).toBe(panel);
    expect(input.getAttribute('aria-controls')).toBe('search-suggestions-list');
    expect(list.getAttribute('data-i18n-aria-label')).toBe('searchSuggestionsAriaLabel');
  });

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

    const arrowDown = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    });
    input.dispatchEvent(arrowDown);

    expect(arrowDown.defaultPrevented).toBe(false);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
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
      disposition: 'NEW_TAB'
    });
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['beta', 'alpha']);
  });

  it('routes google provider through its URL instead of chrome.search.query', () => {
    window.saveActiveProvider('google');
    const searchQuerySpy = vi.spyOn(chrome.search, 'query');
    const openSpy = vi.spyOn(window, 'open');

    runSearch('hello world');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('google.com/search?q=');
    expect(openSpy.mock.calls[0][0]).toContain(encodeURIComponent('hello world'));
    expect(searchQuerySpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('records history only after chrome.search.query resolves (#280)', async () => {
    let resolveQuery;
    const queryPromise = new Promise((resolve) => { resolveQuery = resolve; });
    vi.spyOn(chrome.search, 'query').mockReturnValue(queryPromise);

    runSearch('new query');

    expect(localStorage.getItem('searchHistory')).toBeNull();

    resolveQuery({});
    await vi.advanceTimersByTimeAsync(1);

    expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['new query']);
  });

  it('does not record history when chrome.search.query rejects (#280)', async () => {
    const searchQuerySpy = vi.spyOn(chrome.search, 'query').mockRejectedValue(new Error('fail'));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    runSearch('failed query');

    await vi.advanceTimersByTimeAsync(1);

    expect(searchQuerySpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('searchHistory')).toBeNull();
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

  it('debounces remote suggestions and merges them after local history', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ['al', ['alpha remote', 'alpha', 'alphabet remote', 'another remote']],
    });

    window.saveActiveProvider('google');
    recordSearchHistory('alpha');

    const input = focusSearchInput();
    input.value = 'al';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(149);
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const suggestions = Array.from(document.querySelectorAll('.search-history-item')).map((item) => item.textContent);
    expect(suggestions).toEqual(['alpha', 'alpha remote', 'alphabet remote', 'another remote']);

    fetchSpy.mockRestore();
  });

  it('falls back to local suggestions when the remote endpoint fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    window.saveActiveProvider('google');
    recordSearchHistory('alpha');
    const input = focusSearchInput();
    input.value = 'al';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(151);
    await vi.advanceTimersByTimeAsync(1);

    const suggestions = Array.from(document.querySelectorAll('.search-history-item')).map((item) => item.textContent);
    expect(suggestions).toEqual(['alpha']);

    fetchSpy.mockRestore();
  });

  it('navigates suggestions with arrows and Enter', () => {
    const searchQuerySpy = vi.spyOn(chrome.search, 'query').mockResolvedValue({});
    window.saveActiveProvider(null);

    recordSearchHistory('alpha');
    recordSearchHistory('beta');

    const input = focusSearchInput();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('search-suggestion-item-0');
    expect(document.querySelector('#search-suggestion-item-0').getAttribute('aria-selected')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('search-suggestion-item-1');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(searchQuerySpy).toHaveBeenCalledWith({
      text: 'alpha',
      disposition: 'NEW_TAB'
    });
  });

  it('routes bang searches to the requested built-in provider without changing selection', () => {
    const openSpy = vi.spyOn(window, 'open');
    window.saveActiveProvider('google');

    runSearch('!w einstein');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('wikipedia.org');
    expect(openSpy.mock.calls[0][0]).toContain(encodeURIComponent('einstein'));
    expect(window.loadActiveProvider()).toBe('google');

    openSpy.mockRestore();
  });

  it('preserves the resolved provider when selecting a bang suggestion by click', () => {
    const openSpy = vi.spyOn(window, 'open');
    window.saveActiveProvider('google');
    recordSearchHistory('einstein');

    const input = focusSearchInput();
    input.value = '!w ein';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const suggestion = document.querySelector('.search-history-item');
    expect(suggestion).not.toBeNull();
    suggestion.click();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('w/index.php?search=');
    expect(openSpy.mock.calls[0][0]).toContain(encodeURIComponent('einstein'));
    expect(window.loadActiveProvider()).toBe('google');

    openSpy.mockRestore();
  });

  it('preserves the resolved provider when selecting a bang suggestion by keyboard', () => {
    const openSpy = vi.spyOn(window, 'open');
    window.saveActiveProvider('google');
    recordSearchHistory('einstein');

    const input = focusSearchInput();
    input.value = '!w ein';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('w/index.php?search=');
    expect(openSpy.mock.calls[0][0]).toContain(encodeURIComponent('einstein'));
    expect(window.loadActiveProvider()).toBe('google');

    openSpy.mockRestore();
  });

  it('supports custom single-letter bang codes', () => {
    const openSpy = vi.spyOn(window, 'open');
    window.addCustomProvider('Kagi', 'https://kagi.com/search?q={query}');
    window.saveActiveProvider('google');

    runSearch('!k hello');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toContain('kagi.com/search?q=');
    expect(openSpy.mock.calls[0][0]).toContain(encodeURIComponent('hello'));
    expect(openSpy.mock.calls[0][0]).not.toContain(encodeURIComponent('!k hello'));
    expect(window.loadActiveProvider()).toBe('google');

    openSpy.mockRestore();
  });

  it('ignores unknown bangs without throwing or rewriting the query', () => {
    const openSpy = vi.spyOn(window, 'open');
    const searchQuerySpy = vi.spyOn(chrome.search, 'query').mockResolvedValue({});
    window.saveActiveProvider(null);

    runSearch('!unknown hello');

    expect(openSpy).not.toHaveBeenCalled();
    expect(searchQuerySpy).toHaveBeenCalledWith({
      text: '!unknown hello',
      disposition: 'NEW_TAB'
    });
  });

  it('cycles providers with Ctrl+K and updates aria-pressed', () => {
    window.saveActiveProvider('google');
    const input = focusSearchInput();

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true
    }));

    expect(window.loadActiveProvider()).toBe('bing');
    expect(document.querySelector('[data-provider="bing"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-provider="google"]').getAttribute('aria-pressed')).toBe('false');
  });
});

// ------------------------------------------------------------------
// Regression: #249 — stale validation feedback cleared on re-submit
// ------------------------------------------------------------------
describe('search validation feedback clearing (#249)', () => {
  it('clears stale feedback when runSearch is called', () => {
    showSearchValidationFeedback('stale error');
    const feedbackEl = document.querySelector('.search-validation-feedback');
    expect(feedbackEl).not.toBeNull();
    expect(feedbackEl.classList.contains('show')).toBe(true);

    runSearch('hello world');

    expect(feedbackEl.classList.contains('show')).toBe(false);
  });

  it('clears stale feedback when selectSearchHistorySuggestion is called', () => {
    showSearchValidationFeedback('stale error');
    const feedbackEl = document.querySelector('.search-validation-feedback');
    expect(feedbackEl).not.toBeNull();
    expect(feedbackEl.classList.contains('show')).toBe(true);

    selectSearchHistorySuggestion('hello world');

    expect(feedbackEl.classList.contains('show')).toBe(false);
  });
});

// ------------------------------------------------------------------
// Regression: open-in-current-tab setting must be honored by the search bar
// ------------------------------------------------------------------
describe('search bar honors open in current tab setting', () => {
  it('opens in a new tab by default (openAppsInNewTab not false)', () => {
    localStorage.removeItem('openAppsInNewTab');
    window.saveActiveProvider('google');
    const openSpy = vi.spyOn(window, 'open');

    runSearch('hello world');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][1]).toBe('_blank');
    openSpy.mockRestore();
  });

  it('navigates in the current tab when openAppsInNewTab is false', () => {
    localStorage.setItem('openAppsInNewTab', 'false');
    window.saveActiveProvider('google');
    const openSpy = vi.spyOn(window, 'open');
    let assigned = null;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { set href(value) { assigned = value; }, get href() { return ''; } },
    });

    runSearch('hello world');

    expect(openSpy).not.toHaveBeenCalled();
    expect(assigned).toContain('google.com/search?q=');
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    openSpy.mockRestore();
  });

  it('uses CURRENT_TAB disposition when openAppsInNewTab is false', async () => {
    localStorage.setItem('openAppsInNewTab', 'false');
    window.saveActiveProvider(null);
    const querySpy = vi.spyOn(chrome.search, 'query').mockResolvedValue({});

    runSearch('hello world');
    await vi.advanceTimersByTimeAsync(1);

    expect(querySpy).toHaveBeenCalledWith({
      text: 'hello world',
      disposition: 'CURRENT_TAB',
    });
  });
});
