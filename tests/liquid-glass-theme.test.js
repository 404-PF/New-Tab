import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';

const themeRadio = (value) => document.querySelector(`input[name="theme"][value="${value}"]`);

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/ui/settings.js');
});

beforeEach(() => {
  document.body.classList.remove('light-theme');
  localStorage.removeItem('glassStyle');
  if (!document.querySelector('input[name="theme"]')) {
    document.body.insertAdjacentHTML('beforeend', `
      <input type="radio" name="theme" value="dark">
      <input type="radio" name="theme" value="light">
      <input type="radio" name="theme" value="system">
      <input type="radio" name="theme" value="liquid-glass">
    `);
  }
  ['dark', 'light', 'system', 'liquid-glass'].forEach((value) => {
    themeRadio(value).checked = false;
  });
  window.LiquidGlass = { init: vi.fn() };
});

afterEach(() => {
  delete window.LiquidGlass;
});

describe('Liquid Glass standalone theme', () => {
  it('ships the radio and preview in New-Tab.html and drops the Glass style select', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
    expect(html).toMatch(/<input type="radio" name="theme" value="liquid-glass" \/>/);
    expect(html).toMatch(/<div class="preview-icon liquid"><\/div>/);
    expect(html).toMatch(/data-i18n="liquidGlass">Liquid Glass</);
    expect(html).not.toContain('glass-style-setting');
  });

  it('styles the liquid preview icon', () => {
    const coreCss = readFileSync(resolve(process.cwd(), 'css/core.css'), 'utf8');
    expect(coreCss).toMatch(/\.preview-icon\.liquid\s*\{/);
  });

  it('applyTheme checks the liquid-glass radio, keeps the dark base, and re-inits LiquidGlass', () => {
    localStorage.setItem('theme', 'liquid-glass');
    window.applyTheme();
    expect(themeRadio('liquid-glass').checked).toBe(true);
    expect(themeRadio('dark').checked).toBe(false);
    expect(document.body.classList.contains('light-theme')).toBe(false);
    expect(window.LiquidGlass.init).toHaveBeenCalled();
  });

  it('resolveTheme passes liquid-glass through unchanged', () => {
    expect(window.resolveTheme('liquid-glass')).toBe('liquid-glass');
  });

  it('selecting the radio stores the theme and dispatches themeChanged', () => {
    const onThemeChanged = vi.fn();
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      const radio = themeRadio('liquid-glass');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      expect(localStorage.getItem('theme')).toBe('liquid-glass');
      expect(onThemeChanged.mock.calls[0][0].detail.theme).toBe('liquid-glass');
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });

  it('migrates a legacy glassStyle of liquid to the theme once', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'liquid');
    window.applyTheme();
    expect(localStorage.getItem('theme')).toBe('liquid-glass');
    expect(localStorage.getItem('glassStyle')).toBeNull();
    expect(document.body.classList.contains('light-theme')).toBe(false);
  });

  it('drops a legacy glassStyle of classic without touching the theme', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'classic');
    window.applyTheme();
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('glassStyle')).toBeNull();
    expect(document.body.classList.contains('light-theme')).toBe(true);
  });
});
