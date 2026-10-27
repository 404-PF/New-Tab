import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

// jsdom has no matchMedia, so install a controllable stand-in before
// settings.js loads: its system-theme change listener attaches at injection
// time and must see this object, not a missing API.
function installMatchMedia(initialDark) {
  const listeners = new Set();
  const mql = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener(type, fn) {
      if (type === 'change') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
    },
    addListener(fn) {
      listeners.add(fn);
    },
    removeListener(fn) {
      listeners.delete(fn);
    },
    listenerCount() {
      return listeners.size;
    },
    flip() {
      mql.matches = !mql.matches;
      Array.from(listeners).forEach((fn) => fn({ matches: mql.matches }));
    }
  };
  window.matchMedia = (query) => {
    if (query === '(prefers-color-scheme: dark)') return mql;
    return {
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    };
  };
  return mql;
}

let mql;

const themeRadio = (value) => document.querySelector(`input[name="theme"][value="${value}"]`);

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  mql = installMatchMedia(true);
  injectScript('src/ui/settings.js');
});

beforeEach(() => {
  document.body.classList.remove('light-theme');
  if (!document.querySelector('input[name="theme"]')) {
    document.body.insertAdjacentHTML('beforeend', `
      <input type="radio" name="theme" value="dark">
      <input type="radio" name="theme" value="light">
      <input type="radio" name="theme" value="system">
    `);
  }
  themeRadio('dark').checked = false;
  themeRadio('light').checked = false;
  themeRadio('system').checked = false;
  mql.matches = true;
});

describe('System theme option (issue #1011)', () => {
  it('resolves the stored value through the OS preference', () => {
    expect(window.resolveTheme('dark')).toBe('dark');
    expect(window.resolveTheme('light')).toBe('light');

    localStorage.setItem('theme', 'system');
    mql.matches = true;
    expect(window.resolveTheme('system')).toBe('dark');
    mql.matches = false;
    expect(window.resolveTheme('system')).toBe('light');
  });

  it('falls back to dark when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    try {
      delete window.matchMedia;
      expect(window.resolveTheme('system')).toBe('dark');
    } finally {
      window.matchMedia = original;
    }
  });

  it('applyTheme drives the body and all three radios from the stored value', () => {
    localStorage.setItem('theme', 'system');
    mql.matches = true;
    window.applyTheme();
    expect(document.body.classList.contains('light-theme')).toBe(false);
    expect(themeRadio('system').checked).toBe(true);
    expect(themeRadio('dark').checked).toBe(false);
    expect(themeRadio('light').checked).toBe(false);

    // The OS flips to light while the stored choice stays "system".
    mql.matches = false;
    window.applyTheme();
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(themeRadio('system').checked).toBe(true);
  });

  it('keeps an explicit dark/light choice painted even when the OS disagrees', () => {
    localStorage.setItem('theme', 'light');
    mql.matches = true; // OS prefers dark
    window.applyTheme();
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(themeRadio('light').checked).toBe(true);
    expect(themeRadio('system').checked).toBe(false);

    localStorage.setItem('theme', 'dark');
    window.applyTheme();
    expect(document.body.classList.contains('light-theme')).toBe(false);
    expect(themeRadio('dark').checked).toBe(true);
  });

  it('live-updates on an OS preference change only while the stored theme is system', () => {
    const events = [];
    const onThemeChanged = (e) => events.push(e.detail.theme);
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      localStorage.setItem('theme', 'system');
      mql.matches = true;
      window.applyTheme();

      mql.flip(); // OS switches to light — no reload, listener repaints
      expect(document.body.classList.contains('light-theme')).toBe(true);
      expect(events).toEqual(['light']);

      // An explicit theme must ignore subsequent OS flips entirely.
      localStorage.setItem('theme', 'dark');
      window.applyTheme();
      expect(document.body.classList.contains('light-theme')).toBe(false);

      mql.flip(); // OS back to dark
      expect(document.body.classList.contains('light-theme')).toBe(false);
      expect(events).toEqual(['light']);
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });

  it('stores system and dispatches the resolved theme when the radio is picked', () => {
    const events = [];
    const onThemeChanged = (e) => events.push(e.detail.theme);
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      mql.matches = false; // OS prefers light
      const radio = themeRadio('system');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));

      expect(localStorage.getItem('theme')).toBe('system');
      expect(document.body.classList.contains('light-theme')).toBe(true);
      expect(themeRadio('system').checked).toBe(true);
      expect(events).toEqual(['light']);
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });

  it('registers exactly one matchMedia change listener, even after re-injection', () => {
    expect(mql.listenerCount()).toBe(1);
    injectScript('src/ui/settings.js');
    expect(mql.listenerCount()).toBe(1);
  });

  it('ships the third System radio in New-Tab.html wired to i18n', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
    expect(html).toMatch(/<input type="radio" name="theme" value="system" \/>/);
    expect(html).toMatch(/<div class="preview-icon system"><\/div>/);
    expect(html).toMatch(/data-i18n="system">System</);
  });

  it('styles the system preview icon and drops the legacy CSS-only system blocks', () => {
    const coreCss = readFileSync(resolve(process.cwd(), 'css/core.css'), 'utf8');
    const featuresCss = readFileSync(resolve(process.cwd(), 'css/features.css'), 'utf8');
    expect(coreCss).toMatch(/\.preview-icon\.system\s*\{/);
    expect(featuresCss).not.toMatch(/@media \(prefers-color-scheme:/);
  });
});
