import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

// Settings > General daily-motto toggle (issue #1174): the checkbox hides
// #motto-container when off, defaults to on, and round-trips through backup.

const HTML = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');

beforeAll(() => {
  injectScript('src/core/toast.js');
  injectScript('src/ui/settings.js');
  injectScript('src/features/data-manager.js');
});

beforeEach(() => {
  localStorage.removeItem('mottoEnabled');
  document.getElementById('motto-container').style.display = '';
  document.getElementById('motto-enabled-setting').checked = false;
  window.applyMottoEnabled();
});

afterEach(() => {
  localStorage.removeItem('mottoEnabled');
  document.getElementById('motto-container').style.display = '';
  document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
});

describe('Motto toggle markup (issue #1174)', () => {
  it('ships the checkbox inside the General settings section', () => {
    const parsed = document.implementation.createHTMLDocument('New Tab');
    parsed.documentElement.innerHTML = HTML;

    const checkbox = parsed.getElementById('motto-enabled-setting');
    expect(checkbox).not.toBeNull();
    expect(checkbox.getAttribute('type')).toBe('checkbox');

    const general = parsed.querySelector('.settings-section[data-section="general"]');
    expect(general).not.toBeNull();
    expect(general.contains(checkbox)).toBe(true);

    const label = general.querySelector('label[for="motto-enabled-setting"]');
    expect(label).not.toBeNull();
    expect(label.getAttribute('data-i18n')).toBe('enableMotto');
  });

  it('keeps the daily motto container in the page', () => {
    expect(HTML).toContain('id="motto-container"');
  });
});

describe('applyMottoEnabled (issue #1174)', () => {
  it('shows the motto and checks the control by default', () => {
    const motto = document.getElementById('motto-container');
    const checkbox = document.getElementById('motto-enabled-setting');

    window.applyMottoEnabled();

    expect(motto.style.display).toBe('');
    expect(checkbox.checked).toBe(true);
  });

  it('hides the motto when the stored value is false', () => {
    localStorage.setItem('mottoEnabled', 'false');

    window.applyMottoEnabled();

    expect(document.getElementById('motto-container').style.display).toBe('none');
    expect(document.getElementById('motto-enabled-setting').checked).toBe(false);
  });

  it('toggles the motto from the checkbox change handler', () => {
    const checkbox = document.getElementById('motto-enabled-setting');
    const motto = document.getElementById('motto-container');

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('mottoEnabled')).toBe('false');
    expect(motto.style.display).toBe('none');

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('mottoEnabled')).toBe('true');
    expect(motto.style.display).toBe('');
    expect(checkbox.checked).toBe(true);
  });
});

describe('mottoEnabled backup round-trip (issue #1174)', () => {
  it('is listed in the export allowlist', () => {
    expect(window.DataManager.EXPORT_KEYS).toContain('mottoEnabled');
  });

  it('validates a boolean and rejects anything else', () => {
    expect(window.DataManager.EXPECTED_SHAPES.mottoEnabled(false)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.mottoEnabled(true)).toBe(true);
    expect(window.DataManager.EXPECTED_SHAPES.mottoEnabled('true')).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.mottoEnabled(1)).toBe(false);
    expect(window.DataManager.EXPECTED_SHAPES.mottoEnabled(null)).toBe(false);
  });

  it('accepts a backup carrying the toggle and rejects a malformed one', () => {
    expect(window.DataManager.validateImportData({
      version: 1,
      data: { mottoEnabled: false }
    })).toEqual({ valid: true });

    expect(window.DataManager.validateImportData({
      version: 1,
      data: { mottoEnabled: 'false' }
    }).valid).toBe(false);
  });
});
