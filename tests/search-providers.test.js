// tests/search-providers.test.js

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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

  it('loadCustomProviders returns parsed array', () => {
    const custom = [{ id: 'custom_1', name: 'Test', url: 'https://test.com/search?q={query}' }];
    localStorage.setItem('customSearchProviders', JSON.stringify(custom));
    expect(loadCustomProviders()).toEqual(custom);
  });

  it('loadCustomProviders returns empty array on invalid JSON', () => {
    localStorage.setItem('customSearchProviders', 'not-json');
    expect(loadCustomProviders()).toEqual([]);
  });
});

describe('Search providers - custom providers', () => {
  it('addCustomProvider adds a provider and returns its id', () => {
    const id = addCustomProvider('Test Search', 'https://test.com/search?q={query}');
    expect(id).toBeTruthy();
    expect(id.startsWith('custom_')).toBe(true);

    const custom = loadCustomProviders();
    expect(custom.length).toBe(1);
    expect(custom[0].name).toBe('Test Search');
    expect(custom[0].url).toBe('https://test.com/search?q={query}');
  });

  it('addCustomProvider returns false for missing name', () => {
    expect(addCustomProvider('', 'https://test.com/search?q={query}')).toBe(false);
  });

  it('addCustomProvider returns false for missing {query} in url', () => {
    expect(addCustomProvider('Test', 'https://test.com/search')).toBe(false);
  });

  it('removeCustomProvider removes a custom provider', () => {
    const id = addCustomProvider('To Remove', 'https://remove.com/search?q={query}');
    expect(loadCustomProviders().length).toBe(1);

    removeCustomProvider(id);
    expect(loadCustomProviders().length).toBe(0);
  });

  it('removeCustomProvider switches to google if removed provider was active', () => {
    const id = addCustomProvider('Active Custom', 'https://active.com/search?q={query}');
    saveActiveProvider(id);

    removeCustomProvider(id);
    expect(loadActiveProvider()).toBe('google');
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

  it('getActiveProviderUrl works for custom providers', () => {
    addCustomProvider('Custom', 'https://custom.com/find?q={query}');
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

  it('includes custom providers', () => {
    addCustomProvider('MyCustom', 'https://my.com/search?q={query}');
    const all = getAllProviders();
    const custom = loadCustomProviders();
    expect(all[custom[0].id]).toBeDefined();
    expect(all[custom[0].id].name).toBe('MyCustom');
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
          { id: 'custom_1', name: 'MyCustom', url: 'https://example.com/?q={query}' }
        ]
      }
    };
    expect(window.DataManager.validateImportData(payload).valid).toBe(true);
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
    const feedback = document.getElementById('custom-search-provider-feedback');
    const list = document.getElementById('custom-search-providers-list');
    const empty = document.getElementById('custom-search-providers-empty');
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
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

  it('adds a custom provider via the settings form and shows it in the list and bar', () => {
    const nameInput = document.getElementById('custom-search-provider-name');
    const urlInput = document.getElementById('custom-search-provider-url');
    const addBtn = document.getElementById('custom-search-provider-add-btn');
    const list = document.getElementById('custom-search-providers-list');
    const empty = document.getElementById('custom-search-providers-empty');
    const feedback = document.getElementById('custom-search-provider-feedback');

    nameInput.value = 'Kagi';
    urlInput.value = 'https://kagi.com/search?q={query}';
    addBtn.click();

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

  it('removes a custom provider via the settings list and updates the bar', () => {
    addCustomProvider('ToRemove', 'https://remove.com/search?q={query}');
    window.renderCustomSearchProvidersList();
    window.refreshProviderBar();

    const list = document.getElementById('custom-search-providers-list');
    expect(list.children.length).toBe(1);

    const removeBtn = list.querySelector('.custom-search-provider-remove');
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

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
});

