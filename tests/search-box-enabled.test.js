import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor } from './helpers/storage-write-failures.js';

// Settings > General search-box toggle (issue #1243): the checkbox hides
// .search-bar-wrapper when off, defaults to on, skips the focusSearch
// shortcut while hidden, and round-trips through backup.

const HTML = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');

beforeAll(() => {
  document.body.insertAdjacentHTML('beforeend',
    '<div class="search-bar-wrapper"><div class="search-bar"><input type="text"></div></div>');
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
  injectScript('src/ui/settings.js');
  injectScript('src/features/data-manager.js');
  injectScript('src/features/shortcuts.js');
});

beforeEach(() => {
  localStorage.removeItem('searchBoxEnabled');
  document.querySelector('.search-bar-wrapper').style.display = '';
  document.getElementById('search-box-enabled-setting').checked = false;
  window.applySearchBoxEnabled();
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
});

afterEach(() => {
  localStorage.removeItem('searchBoxEnabled');
  document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
});

describe('Search box toggle markup (issue #1243)', () => {
  it('ships the checkbox inside the General settings section', () => {
    const parsed = document.implementation.createHTMLDocument('New Tab');
    parsed.documentElement.innerHTML = HTML;

    const checkbox = parsed.getElementById('search-box-enabled-setting');
    expect(checkbox).not.toBeNull();
    expect(checkbox.getAttribute('type')).toBe('checkbox');

    const general = parsed.querySelector('.settings-section[data-section="general"]');
    expect(general).not.toBeNull();
    expect(general.contains(checkbox)).toBe(true);

    const label = general.querySelector('label[for="search-box-enabled-setting"]');
    expect(label).not.toBeNull();
    expect(label.getAttribute('data-i18n')).toBe('enableSearchBox');
    expect(label.textContent).toBe('Show search box');
  });
});

describe('applySearchBoxEnabled (issue #1243)', () => {
  it('shows the search box and checks the control by default', () => {
    const wrapper = document.querySelector('.search-bar-wrapper');
    const checkbox = document.getElementById('search-box-enabled-setting');

    window.applySearchBoxEnabled();

    expect(wrapper.style.display).toBe('');
    expect(checkbox.checked).toBe(true);
  });

  it('hides the wrapper when the stored value is false', () => {
    localStorage.setItem('searchBoxEnabled', 'false');

    window.applySearchBoxEnabled();

    expect(document.querySelector('.search-bar-wrapper').style.display).toBe('none');
    expect(document.getElementById('search-box-enabled-setting').checked).toBe(false);
  });

  it('applies the checkbox change immediately and keeps it after a reload', () => {
    const checkbox = document.getElementById('search-box-enabled-setting');
    const wrapper = document.querySelector('.search-bar-wrapper');

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('searchBoxEnabled')).toBe('false');
    expect(wrapper.style.display).toBe('none');

    window.applySearchBoxEnabled();
    expect(wrapper.style.display).toBe('none');

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('searchBoxEnabled')).toBe('true');
    expect(wrapper.style.display).toBe('');
    expect(checkbox.checked).toBe(true);
  });

  it('resyncs the wrapper and control after an async write rollback', async () => {
    localStorage.setItem('searchBoxEnabled', 'true');
    window.applySearchBoxEnabled();
    const restore = failStorageWritesFor('searchBoxEnabled', 'async');
    const checkbox = document.getElementById('search-box-enabled-setting');

    try {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      expect(localStorage.getItem('searchBoxEnabled')).toBe('false');

      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(localStorage.getItem('searchBoxEnabled')).toBe('true');
      expect(checkbox.checked).toBe(true);
      expect(document.querySelector('.search-bar-wrapper').style.display).toBe('');
    } finally {
      restore();
    }
  });
});

describe('focusSearch shortcut while hidden (issue #1243)', () => {
  it('does not focus the search input when the box is hidden', () => {
    localStorage.setItem('searchBoxEnabled', 'false');
    window.applySearchBoxEnabled();

    window.Shortcuts.executeAction('focusSearch');

    expect(document.activeElement).not.toBe(document.querySelector('.search-bar input'));
  });

  it('focuses the search input again when the box is shown', () => {
    const input = document.querySelector('.search-bar input');
    localStorage.setItem('searchBoxEnabled', 'true');
    window.applySearchBoxEnabled();

    window.Shortcuts.executeAction('focusSearch');

    expect(document.activeElement).toBe(input);
  });
});

describe('searchBoxEnabled backup round-trip (issue #1243)', () => {
  it('is listed in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('searchBoxEnabled');
  });

  it('validates a boolean and rejects anything else', () => {
    expect(window.DataManager.EXPECTED_SHAPES.searchBoxEnabled(false)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.searchBoxEnabled(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.searchBoxEnabled('false')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.searchBoxEnabled(1)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.searchBoxEnabled(null)).toBe(false);
  });

  it('accepts a backup carrying the toggle and rejects a malformed one', () => {
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { searchBoxEnabled: false }
    })).toEqual({ valid: true });

    expect(window.DataManager.validateImportData({
      version: 1,
      data: { searchBoxEnabled: 'false' }
    }).valid).toBe(false);
  });
});
