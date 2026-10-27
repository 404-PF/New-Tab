// tests/search-providers.test.js

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const SEARCH_BAR_HTML = `
  <div class="search-bar-wrapper" role="search">
    <div class="search-bar">
      <svg class="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <path d="m20 20-3.5-3.5"></path>
      </svg>
      <input type="text" placeholder="Search or enter URL" autofocus />
    </div>
    <div class="search-provider-bar" id="search-provider-bar">
      <button type="button" class="search-provider-btn active" data-provider="google" title="Google" aria-label="Search with Google"></button>
      <button type="button" class="search-provider-btn" data-provider="bing" title="Bing" aria-label="Search with Bing"></button>
      <button type="button" class="search-provider-btn" data-provider="duckduckgo" title="DuckDuckGo" aria-label="Search with DuckDuckGo"></button>
      <button type="button" class="search-provider-btn" data-provider="wikipedia" title="Wikipedia" aria-label="Search with Wikipedia"></button>
      <button type="button" class="search-provider-btn" data-provider="youtube" title="YouTube" aria-label="Search with YouTube"></button>
    </div>
  </div>
`;

const flushAsyncUI = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  window.VisibilityInterval = class {
    constructor() {}
    destroy() {}
  };
  document.body.insertAdjacentHTML('beforeend', SEARCH_BAR_HTML);
  injectScript('src/core/utils.js');
  injectScript('src/core/main.js');
});

beforeEach(() => {
  localStorage.removeItem('searchProvider');
  localStorage.removeItem('customSearchProviders');
  localStorage.removeItem('searchHistory');

  const input = document.querySelector('.search-bar input');
  if (input) {
    input.value = '';
  }
});

describe('Search providers - built-in providers', () => {
  it('BUILT_IN_PROVIDERS contains Google, Bing, DuckDuckGo, Wikipedia, YouTube', () => {
    expect(BUILT_IN_PROVIDERS.google).toBeDefined();
    expect(BUILT_IN_PROVIDERS.bing).toBeDefined();
    expect(BUILT_IN_PROVIDERS.duckduckgo).toBeDefined();
    expect(BUILT_IN_PROVIDERS.wikipedia).toBeDefined();
    expect(BUILT_IN_PROVIDERS.youtube).toBeDefined();
  });

  it('each built-in provider has name, url with {query}, and icon', () => {
    Object.values(BUILT_IN_PROVIDERS).forEach((provider) => {
      expect(provider.name).toBeTruthy();
      expect(provider.url).toContain('{query}');
      expect(provider.icon).toBeTruthy();
    });
  });
});

describe('Search providers - storage', () => {
  it('loadActiveProvider returns google by default', () => {
    expect(loadActiveProvider()).toBe('google');
  });

  it('loadActiveProvider returns stored value', () => {
    localStorage.setItem('searchProvider', 'bing');
    expect(loadActiveProvider()).toBe('bing');
  });

  it('loadActiveProvider returns google for invalid stored value', () => {
    localStorage.setItem('searchProvider', 'invalid');
    expect(loadActiveProvider()).toBe('google');
  });

  it('saveActiveProvider persists to localStorage', () => {
    saveActiveProvider('youtube');
    expect(localStorage.getItem('searchProvider')).toBe('youtube');
  });

  it('loadCustomProviders returns empty array when nothing stored', () => {
    expect(loadCustomProviders()).toEqual([]);
  });

  it('loadCustomProviders preserves legacy providers without bang codes', () => {
    const custom = [{ id: 'custom_1', name: 'Google', url: 'https://test.com/search?q={query}' }];
    localStorage.setItem('customSearchProviders', JSON.stringify(custom));
    localStorage.setItem('searchProvider', 'custom_1');

    expect(loadCustomProviders()).toEqual(custom);
    expect(loadActiveProvider()).toBe('custom_1');
  });

  it('loadCustomProviders returns empty array on invalid JSON', () => {
    localStorage.setItem('customSearchProviders', 'not-json');
    expect(loadCustomProviders()).toEqual([]);
  });
});

describe('Search providers - custom providers', () => {
  it('addCustomProvider adds a provider and returns its id', async () => {
    const id = await addCustomProvider('Test Search', 'https://test.com/search?q={query}');
    expect(id).toBeTruthy();
    expect(id.startsWith('custom_')).toBe(true);

    const custom = loadCustomProviders();
    expect(custom.length).toBe(1);
    expect(custom[0].name).toBe('Test Search');
    expect(custom[0].url).toBe('https://test.com/search?q={query}');
  });

  it('allocates a custom bang code that does not collide with built-ins', async () => {
    const id = await addCustomProvider('Google Search', 'https://google.example/search?q={query}');
    const provider = loadCustomProviders().find((item) => item.id === id);

    expect(provider).toBeDefined();
    expect(provider.code).toMatch(/^[a-z0-9]$/);
    expect(provider.code).not.toBe('g');
  });

  it('filters duplicate or built-in custom bang codes from persisted providers', () => {
    localStorage.setItem('customSearchProviders', JSON.stringify([
      { id: 'custom_1', name: 'Kagi', url: 'https://kagi.example/search?q={query}', code: 'k' },
      { id: 'custom_2', name: 'Kagi Pro', url: 'https://kagi-pro.example/search?q={query}', code: 'k' },
      { id: 'custom_3', name: 'Google Search', url: 'https://google.example/search?q={query}', code: 'g' }
    ]));

    expect(loadCustomProviders().map((provider) => provider.id)).toEqual(['custom_1']);
  });

  it('addCustomProvider resolves null for missing name', async () => {
    await expect(addCustomProvider('', 'https://test.com/search?q={query}')).resolves.toBeNull();
  });

  it('addCustomProvider always returns a Promise, even for invalid input', () => {
    const result = addCustomProvider('', 'https://test.com/search?q={query}');
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('addCustomProvider resolves null for missing {query} in url', async () => {
    await expect(addCustomProvider('Test', 'https://test.com/search')).resolves.toBeNull();
  });

  it('removeCustomProvider removes a custom provider', async () => {
    const id = await addCustomProvider('To Remove', 'https://remove.com/search?q={query}');
    expect(loadCustomProviders().length).toBe(1);

    await removeCustomProvider(id);
    expect(loadCustomProviders().length).toBe(0);
  });

  it('removeCustomProvider switches to google if removed provider was active', async () => {
    const id = await addCustomProvider('Active Custom', 'https://active.com/search?q={query}');
    saveActiveProvider(id);

    await removeCustomProvider(id);
    expect(loadActiveProvider()).toBe('google');
  });
});

describe('Search providers - persistence failures', () => {
  it('saveCustomProviders returns false when the bridge rejects the write', () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => false;
    try {
      expect(saveCustomProviders([])).toBe(false);
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  it('addCustomProvider resolves false and keeps the previous list when the storage write throws', async () => {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = () => { throw new Error('sync storage failure'); };
    try {
      const result = addCustomProvider('Sync Fail', 'https://sync-fail.com/search?q={query}');
      await expect(result).resolves.toBe(false);
      expect(loadCustomProviders()).toEqual([]);
    } finally {
      chrome.storage.local.set = originalSet;
    }
  });

  it('addCustomProvider resolves false and keeps the previous list when the async write fails', async () => {
    const originalSet = chrome.storage.local.set;
    let setCallback;
    chrome.storage.local.set = (items, callback) => { setCallback = callback; };
    try {
      const result = addCustomProvider('Async Fail', 'https://async-fail.com/search?q={query}');
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      setCallback();
      chrome.runtime.lastError = null;
      await expect(result).resolves.toBe(false);
      expect(loadCustomProviders()).toEqual([]);
    } finally {
      chrome.storage.local.set = originalSet;
      chrome.runtime.lastError = null;
    }
  });

  it('removeCustomProvider resolves false and keeps the provider when the storage write throws', async () => {
    const id = await addCustomProvider('Keep Me', 'https://keep.com/search?q={query}');
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = () => { throw new Error('sync storage failure'); };
    try {
      await expect(removeCustomProvider(id)).resolves.toBe(false);
      expect(loadCustomProviders().map((p) => p.id)).toEqual([id]);
    } finally {
      chrome.storage.local.set = originalSet;
    }
  });

  it('removeCustomProvider resolves false and keeps the provider when the async write fails', async () => {
    const id = await addCustomProvider('Keep Me Too', 'https://keep2.com/search?q={query}');
    const originalSet = chrome.storage.local.set;
    let setCallback;
    chrome.storage.local.set = (items, callback) => { setCallback = callback; };
    try {
      const result = removeCustomProvider(id);
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      setCallback();
      chrome.runtime.lastError = null;
      await expect(result).resolves.toBe(false);
      expect(loadCustomProviders().map((p) => p.id)).toEqual([id]);
    } finally {
      chrome.storage.local.set = originalSet;
      chrome.runtime.lastError = null;
    }
  });
});

describe('Search providers - URL generation', () => {
  it('getActiveProviderUrl returns provider URL with encoded query', () => {
    saveActiveProvider('bing');
    const url = getActiveProviderUrl('hello world');
    expect(url).toBe('https://www.bing.com/search?q=hello%20world');
  });

  it('getActiveProviderUrl encodes special characters', () => {
    saveActiveProvider('google');
    const url = getActiveProviderUrl('cats & dogs');
    expect(url).toBe('https://www.google.com/search?q=cats%20%26%20dogs');
  });

  it('getActiveProviderUrl works for custom providers', async () => {
    await addCustomProvider('Custom', 'https://custom.com/find?q={query}');
    const custom = loadCustomProviders();
    saveActiveProvider(custom[0].id);

    const url = getActiveProviderUrl('test query');
    expect(url).toBe('https://custom.com/find?q=test%20query');
  });

  it('getActiveProviderUrl returns null for invalid provider', () => {
    saveActiveProvider('nonexistent');
    expect(getActiveProviderUrl('query')).toBeNull();
  });
});

describe('Search providers - getAllProviders', () => {
  it('returns all built-in providers', () => {
    const all = getAllProviders();
    expect(all.google).toBeDefined();
    expect(all.bing).toBeDefined();
    expect(all.duckduckgo).toBeDefined();
    expect(all.wikipedia).toBeDefined();
    expect(all.youtube).toBeDefined();
  });

  it('includes custom providers', async () => {
    await addCustomProvider('MyCustom', 'https://my.com/search?q={query}');
    const all = getAllProviders();
    const custom = loadCustomProviders();
    expect(all[custom[0].id]).toBeDefined();
    expect(all[custom[0].id].name).toBe('MyCustom');
  });
});

describe('Search providers - remote suggestion parsing', () => {
  it('parses DuckDuckGo type=list payload [query, [strings]]', () => {
    const suggestions = parseRemoteSearchSuggestions('duckduckgo', ['query', ['suggestion one', 'suggestion two']], 'query');
    expect(suggestions).toEqual(['suggestion one', 'suggestion two']);
  });

  it('drops the echoed query from DuckDuckGo suggestions', () => {
    const suggestions = parseRemoteSearchSuggestions('duckduckgo', ['cats', ['cats', 'cats and dogs']], 'cats');
    expect(suggestions).toEqual(['cats and dogs']);
  });

  it('returns [] for DuckDuckGo payloads without a suggestions array', () => {
    expect(parseRemoteSearchSuggestions('duckduckgo', ['query'], 'query')).toEqual([]);
    expect(parseRemoteSearchSuggestions('duckduckgo', ['query', 'not-an-array'], 'query')).toEqual([]);
    expect(parseRemoteSearchSuggestions('duckduckgo', null, 'query')).toEqual([]);
  });
});

describe('Search providers - UI selection', () => {
  it('updateProviderSelection toggles active class on provider buttons', () => {
    saveActiveProvider('bing');
    updateProviderSelection();
    window.refreshProviderBar();
    Object.entries(BUILT_IN_PROVIDERS).forEach(([providerId, provider]) => {
      const button = document.querySelector('[data-provider="' + providerId + '"]');
      if (!button) {
        throw new Error('Provider button not found: ' + providerId);
      }
      const expectedIconContainer = document.createElement('div');
      expectedIconContainer.innerHTML = provider.icon;
      expect(button.innerHTML).toBe(expectedIconContainer.innerHTML);
      expect(button.dataset.providerIcon).toBe(providerId);
    });

    const googleBtn = document.querySelector('[data-provider="google"]');
    const bingBtn = document.querySelector('[data-provider="bing"]');
    expect(googleBtn.classList.contains('active')).toBe(false);
    expect(bingBtn.classList.contains('active')).toBe(true);
  });

  it('updateProviderSelection adds has-selection class when non-google is active', () => {
    saveActiveProvider('youtube');
    updateProviderSelection();

    const bar = document.getElementById('search-provider-bar');
    expect(bar.classList.contains('has-selection')).toBe(true);
  });

  it('updateProviderSelection removes has-selection class when google is active', () => {
    saveActiveProvider('google');
    updateProviderSelection();

    const bar = document.getElementById('search-provider-bar');
    expect(bar.classList.contains('has-selection')).toBe(false);
  });
});

describe('Search providers - backup integration', () => {
  beforeAll(() => {
    injectScript('src/features/data-manager.js');
  });

  it('includes search provider keys in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('searchProvider');
    expect(window.DataManager.EXPORT_KEYS).toContain('customSearchProviders');
  });

  it('accepts valid provider settings during import', () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      keyCount: 2,
      data: {
        searchProvider: 'bing',
        customSearchProviders: [
          { id: 'custom_1', name: 'Google', url: 'https://example.com/?q={query}' }
        ]
      }
    };
    expect(window.DataManager.validateImportData(payload).valid).toBe(true);
  });

  it('rejects duplicate or built-in custom bang codes during import', () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      keyCount: 1,
      data: {
        customSearchProviders: [
          { id: 'custom_1', name: 'Kagi', url: 'https://kagi.example/search?q={query}', code: 'k' },
          { id: 'custom_2', name: 'Kagi Pro', url: 'https://kagi-pro.example/search?q={query}', code: 'k' }
        ]
      }
    };
    expect(window.DataManager.validateImportData(payload).valid).toBe(false);

    payload.data.customSearchProviders[1].code = 'g';
    expect(window.DataManager.validateImportData(payload).valid).toBe(false);
  });

  it('rejects malformed custom provider settings during import', () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      keyCount: 1,
      data: {
        customSearchProviders: [
          { id: 'custom_1', name: 'Bad', url: 'javascript:alert(1)' }
        ]
      }
    };
    expect(window.DataManager.validateImportData(payload).valid).toBe(false);
  });
});

describe('Search providers - settings UI', () => {
  beforeAll(() => {
    injectScript('src/ui/settings.js');
    if (window.renderCustomSearchProvidersList) window.renderCustomSearchProvidersList();
  });

  beforeEach(() => {
    localStorage.removeItem('customSearchProviders');
    localStorage.removeItem('searchProvider');
    document.querySelectorAll('.search-provider-custom').forEach((el) => el.remove());
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const suggestionsInput = document.getElementById('custom-search-provider-suggestions-url');
    const feedback = document.getElementById('custom-search-provider-feedback');
    const list = document.getElementById('custom-search-providers-list');
    const empty = document.getElementById('custom-search-providers-empty');
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (suggestionsInput) suggestionsInput.value = '';
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'custom-search-provider-feedback';
    }
    if (list) list.innerHTML = '';
    if (empty) empty.style.display = '';
    if (window.renderCustomSearchProvidersList) window.renderCustomSearchProvidersList();
    if (window.refreshProviderBar) window.refreshProviderBar();
  });

  it('renders empty state when no custom providers', () => {
    const list = document.getElementById('custom-search-providers-list');
    const empty = document.getElementById('custom-search-providers-empty');
    expect(list.children.length).toBe(0);
    expect(empty.style.display).not.toBe('none');
  });

  it('adds a custom provider via the settings form and shows it in the list and bar', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const list = document.getElementById('custom-search-providers-list');
    const empty = document.getElementById('custom-search-providers-empty');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = 'Kagi';
    urlInput.value = 'https://kagi.com/search?q={query}';
    addBtn.click();
    await flushAsyncUI();

    expect(feedback.textContent).toBe('');
    expect(loadCustomProviders().length).toBe(1);
    expect(list.children.length).toBe(1);
    expect(empty.style.display).toBe('none');
    expect(list.textContent).toContain('Kagi');
    expect(list.textContent).toContain('https://kagi.com/search?q={query}');

    const barBtn = document.querySelector('.search-provider-custom');
    expect(barBtn).not.toBeNull();
    expect(barBtn.textContent).toContain('K');
    expect(barBtn.dataset.provider).toContain('custom_');
  });

  it('shows validation error for empty name', () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = '';
    urlInput.value = 'https://example.com/search?q={query}';
    addBtn.click();

    expect(feedback.textContent.length).toBeGreaterThan(0);
    expect(feedback.classList.contains('error')).toBe(true);
    expect(loadCustomProviders().length).toBe(0);
  });

  it('shows validation error for invalid URL', () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = 'Bad';
    urlInput.value = 'javascript:alert(1)';
    addBtn.click();

    expect(feedback.textContent.length).toBeGreaterThan(0);
    expect(feedback.classList.contains('error')).toBe(true);
    expect(loadCustomProviders().length).toBe(0);

    urlInput.value = 'https://example.com/search';
    addBtn.click();
    expect(feedback.classList.contains('error')).toBe(true);
    expect(loadCustomProviders().length).toBe(0);
  });

  it('removes a custom provider via the settings list and updates the bar', async () => {
    await addCustomProvider('ToRemove', 'https://remove.com/search?q={query}');
    window.renderCustomSearchProvidersList();
    window.refreshProviderBar();

    const list = document.getElementById('custom-search-providers-list');
    expect(list.children.length).toBe(1);

    const removeBtn = list.querySelector('.custom-search-provider-remove');
    expect(removeBtn).not.toBeNull();
    removeBtn.click();
    await flushAsyncUI();

    expect(loadCustomProviders().length).toBe(0);
    expect(list.children.length).toBe(0);
    expect(document.getElementById('custom-search-providers-empty').style.display).not.toBe('none');
    expect(document.querySelector('.search-provider-custom')).toBeNull();
  });

  it('clears validation feedback on input', () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = '';
    urlInput.value = 'https://example.com/search?q={query}';
    addBtn.click();
    expect(feedback.classList.contains('error')).toBe(true);

    nameInput.value = 'New';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(feedback.textContent).toBe('');
  });

  it('shows an error and keeps the previous list when the add write fails', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const list = document.getElementById('custom-search-providers-list');
    const feedback = document.getElementById('custom-search-provider-feedback');

    const originalSet = chrome.storage.local.set;
    let setCallback;
    chrome.storage.local.set = (items, callback) => { setCallback = callback; };
    try {
      nameInput.value = 'Kagi';
      urlInput.value = 'https://kagi.com/search?q={query}';
      addBtn.click();

      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      setCallback();
      chrome.runtime.lastError = null;
      await flushAsyncUI();

      expect(feedback.textContent).toBe('Failed to save search provider changes. Your last action was not saved.');
      expect(feedback.classList.contains('error')).toBe(true);
      expect(loadCustomProviders().length).toBe(0);
      expect(list.children.length).toBe(0);
      expect(document.querySelector('.search-provider-custom')).toBeNull();
    } finally {
      chrome.storage.local.set = originalSet;
      chrome.runtime.lastError = null;
    }
  });

  it('disables the Add button while the save is in flight', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');

    const originalSet = chrome.storage.local.set;
    let setCallback;
    chrome.storage.local.set = (items, callback) => { setCallback = callback; };
    try {
      nameInput.value = 'Kagi';
      urlInput.value = 'https://kagi.com/search?q={query}';
      addBtn.click();
      expect(addBtn.disabled).toBe(true);

      setCallback();
      await flushAsyncUI();

      expect(addBtn.disabled).toBe(false);
      expect(loadCustomProviders().length).toBe(1);
    } finally {
      chrome.storage.local.set = originalSet;
    }
  });

  it('re-enables the Add button when addCustomProvider throws synchronously', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');
    const original = window.addCustomProvider;
    window.addCustomProvider = () => { throw new Error('boom'); };
    try {
      nameInput.value = 'Kagi';
      urlInput.value = 'https://kagi.com/search?q={query}';
      addBtn.click();
      await flushAsyncUI();

      expect(addBtn.disabled).toBe(false);
      expect(feedback.textContent).toBe('Failed to save search provider changes. Your last action was not saved.');
    } finally {
      window.addCustomProvider = original;
    }
  });

  it('logs an exception from the add success handler and still re-enables the button', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const originalRefresh = window.refreshProviderBar;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.refreshProviderBar = () => { throw new Error('render failed'); };
    try {
      nameInput.value = 'Kagi';
      urlInput.value = 'https://kagi.com/search?q={query}';
      addBtn.click();
      await flushAsyncUI();

      expect(addBtn.disabled).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('custom search provider add'), expect.any(Error));
    } finally {
      window.refreshProviderBar = originalRefresh;
      errorSpy.mockRestore();
    }
  });

  it('logs an exception from the remove success handler and still re-enables the button', async () => {
    await addCustomProvider('Throws', 'https://throws.com/search?q={query}');
    window.renderCustomSearchProvidersList();
    const list = document.getElementById('custom-search-providers-list');
    const removeBtn = list.querySelector('.custom-search-provider-remove');
    const originalRefresh = window.refreshProviderBar;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.refreshProviderBar = () => { throw new Error('render failed'); };
    try {
      removeBtn.click();
      expect(removeBtn.disabled).toBe(true);
      await flushAsyncUI();

      expect(removeBtn.disabled).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('custom search provider removal'), expect.any(Error));
    } finally {
      window.refreshProviderBar = originalRefresh;
      errorSpy.mockRestore();
    }
  });

  it('disables the Remove button while its save is in flight', async () => {
    await addCustomProvider('Pending', 'https://pending.com/search?q={query}');
    window.renderCustomSearchProvidersList();
    const list = document.getElementById('custom-search-providers-list');
    const removeBtn = list.querySelector('.custom-search-provider-remove');

    const originalSet = chrome.storage.local.set;
    let setCallback;
    let setCalls = 0;
    chrome.storage.local.set = (items, callback) => { setCalls += 1; setCallback = callback; };
    try {
      removeBtn.click();
      expect(removeBtn.disabled).toBe(true);
      await flushAsyncUI();
      removeBtn.click();
      expect(setCalls).toBe(1);

      setCallback();
      await flushAsyncUI();

      expect(loadCustomProviders().length).toBe(0);
      expect(list.children.length).toBe(0);
    } finally {
      chrome.storage.local.set = originalSet;
    }
  });

  it('shows the invalid URL message when addCustomProvider rejects the URL', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = 'FTP';
    urlInput.value = 'ftp://example.com/search?q={query}';
    addBtn.click();
    await flushAsyncUI();

    expect(feedback.textContent).toBe('Enter a valid URL with {query} and http(s).');
    expect(feedback.classList.contains('error')).toBe(true);
    expect(addBtn.disabled).toBe(false);
    expect(loadCustomProviders().length).toBe(0);
  });

  it('shows an error and keeps the provider when the remove write fails', async () => {
    const id = await addCustomProvider('Stays Put', 'https://stays.com/search?q={query}');
    window.renderCustomSearchProvidersList();
    window.refreshProviderBar();

    const list = document.getElementById('custom-search-providers-list');
    const feedback = document.getElementById('custom-search-provider-feedback');
    expect(list.children.length).toBe(1);

    const originalSet = chrome.storage.local.set;
    let setCallback;
    chrome.storage.local.set = (items, callback) => { setCallback = callback; };
    try {
      list.querySelector('.custom-search-provider-remove').click();

      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      setCallback();
      chrome.runtime.lastError = null;
      await flushAsyncUI();

      expect(feedback.textContent).toBe('Failed to save search provider changes. Your last action was not saved.');
      expect(feedback.classList.contains('error')).toBe(true);
      expect(loadCustomProviders().map((p) => p.id)).toEqual([id]);
      expect(list.children.length).toBe(1);
    } finally {
      chrome.storage.local.set = originalSet;
      chrome.runtime.lastError = null;
    }
  });

  it('adds a custom provider with a suggestions URL and clears the inputs (issue #1012)', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const suggestionsInput = document.getElementById('custom-search-provider-suggestions-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = 'Kagi';
    urlInput.value = 'https://kagi.com/search?q={query}';
    suggestionsInput.value = 'https://kagi.com/suggest?q={query}';
    addBtn.click();
    await flushAsyncUI();

    expect(feedback.textContent).toBe('');
    expect(loadCustomProviders().length).toBe(1);
    expect(loadCustomProviders()[0].suggestionsUrl).toBe('https://kagi.com/suggest?q={query}');
    expect(suggestionsInput.value).toBe('');
    expect(addBtn.disabled).toBe(false);
  });

  it('shows a suggestions-specific validation error for an invalid suggestions URL (issue #1012)', async () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const suggestionsInput = document.getElementById('custom-search-provider-suggestions-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = 'Kagi';
    urlInput.value = 'https://kagi.com/search?q={query}';
    suggestionsInput.value = 'https://kagi.com/suggest';
    addBtn.click();
    await flushAsyncUI();

    expect(feedback.textContent).toBe('Enter a valid suggestions URL with {query} and http(s).');
    expect(feedback.classList.contains('error')).toBe(true);
    expect(loadCustomProviders().length).toBe(0);
    expect(addBtn.disabled).toBe(false);
  });
});

describe('Search providers - custom suggestions endpoint (issue #1012)', () => {
  it('addCustomProvider stores an optional suggestionsUrl', async () => {
    const id = await addCustomProvider(
      'Kagi',
      'https://kagi.example/search?q={query}',
      'https://kagi.example/suggest?q={query}'
    );
    const provider = loadCustomProviders().find((item) => item.id === id);
    expect(provider.suggestionsUrl).toBe('https://kagi.example/suggest?q={query}');
  });

  it('addCustomProvider omits suggestionsUrl when not provided', async () => {
    const id = await addCustomProvider('Plain', 'https://plain.example/search?q={query}');
    const provider = loadCustomProviders().find((item) => item.id === id);
    expect(Object.prototype.hasOwnProperty.call(provider, 'suggestionsUrl')).toBe(false);
  });

  it('addCustomProvider resolves null for an invalid suggestionsUrl', async () => {
    await expect(
      addCustomProvider('Bad', 'https://bad.example/search?q={query}', 'ftp://bad.example/suggest?q={query}')
    ).resolves.toBeNull();
    await expect(
      addCustomProvider('Bad', 'https://bad.example/search?q={query}', 'https://bad.example/suggest')
    ).resolves.toBeNull();
    expect(loadCustomProviders()).toEqual([]);
  });

  it('keeps providers with a valid suggestionsUrl and legacy providers without one', () => {
    localStorage.setItem('customSearchProviders', JSON.stringify([
      { id: 'custom_1', name: 'With', url: 'https://with.example/search?q={query}', suggestionsUrl: 'https://with.example/suggest?q={query}' },
      { id: 'custom_2', name: 'Legacy', url: 'https://legacy.example/search?q={query}' },
      { id: 'custom_3', name: 'Broken', url: 'https://broken.example/search?q={query}', suggestionsUrl: 'not-a-url' }
    ]));

    expect(loadCustomProviders().map((provider) => provider.id)).toEqual(['custom_1', 'custom_2']);
  });

  it('getProviderSuggestionEndpoint resolves the custom template with an encoded query', async () => {
    const id = await addCustomProvider(
      'Kagi',
      'https://kagi.example/search?q={query}',
      'https://kagi.example/suggest?q={query}'
    );
    expect(getProviderSuggestionEndpoint(id, 'hello world')).toBe('https://kagi.example/suggest?q=hello%20world');
  });

  it('getProviderSuggestionEndpoint returns null for custom providers without a suggestionsUrl', async () => {
    const id = await addCustomProvider('Plain', 'https://plain.example/search?q={query}');
    expect(getProviderSuggestionEndpoint(id, 'query')).toBeNull();
  });

  it('getProviderSuggestionEndpoint still resolves built-in providers', () => {
    expect(getProviderSuggestionEndpoint('google', 'cats')).toContain('suggestqueries.google.com');
    expect(getProviderSuggestionEndpoint('nonexistent', 'cats')).toBeNull();
  });
});

describe('Search providers - custom suggestions parsing (issue #1012)', () => {
  it('parses a flat JSON string array for custom providers', () => {
    const suggestions = parseRemoteSearchSuggestions('custom_123', ['kagi docs', 'kagi api'], 'kagi');
    expect(suggestions).toEqual(['kagi docs', 'kagi api']);
  });

  it('parses the [query, [strings]] shape for custom providers', () => {
    const suggestions = parseRemoteSearchSuggestions('custom_123', ['query', ['query one', 'query two']], 'query');
    expect(suggestions).toEqual(['query one', 'query two']);
  });

  it('drops the echoed query from custom suggestions', () => {
    const suggestions = parseRemoteSearchSuggestions('custom_123', ['cats', 'cats and dogs'], 'cats');
    expect(suggestions).toEqual(['cats and dogs']);
  });

  it('returns [] for non-array custom payloads', () => {
    expect(parseRemoteSearchSuggestions('custom_123', { suggestions: ['a'] }, 'query')).toEqual([]);
  });
});

describe('Search providers - custom suggestions permission (issue #1012)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    chrome.permissions._granted = {};
  });

  it('requests the suggestion origin when a provider with suggestionsUrl is added', async () => {
    const requestSpy = vi.spyOn(chrome.permissions, 'request');
    try {
      await addCustomProvider(
        'Kagi',
        'https://kagi.example/search?q={query}',
        'https://kagi.example/suggest?q={query}'
      );
      expect(requestSpy).toHaveBeenCalledWith({ origins: ['https://kagi.example/*'] });
    } finally {
      requestSpy.mockRestore();
    }
  });

  it('degrades to [] and skips fetch when the host permission is denied', async () => {
    const id = await addCustomProvider(
      'Kagi',
      'https://kagi.example/search?q={query}',
      'https://kagi.example/suggest?q={query}'
    );
    // Simulate the user denying (or dismissing) the optional permission prompt.
    chrome.permissions._granted = {};
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const result = await fetchRemoteSearchSuggestions(id, 'hello');

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and parses suggestions when the host permission is granted', async () => {
    const id = await addCustomProvider(
      'Kagi',
      'https://kagi.example/search?q={query}',
      'https://kagi.example/suggest?q={query}'
    );
    chrome.permissions._granted['https://kagi.example/*'] = true;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['hello world', 'hello kitty']
    });
    globalThis.fetch = fetchMock;

    const result = await fetchRemoteSearchSuggestions(id, 'hello');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://kagi.example/suggest?q=hello');
    expect(result).toEqual(['hello world', 'hello kitty']);
  });

  it('built-in providers do not require the optional permission', async () => {
    chrome.permissions._granted = {};
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['google', ['google suggest']]
    });
    globalThis.fetch = fetchMock;

    const result = await fetchRemoteSearchSuggestions('google', 'google');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['google suggest']);
  });
});

