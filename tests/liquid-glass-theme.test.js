import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

const themeRadio = (value) => document.querySelector(`input[name="theme"][value="${value}"]`);
const THEMES = ['dark', 'light', 'system', 'liquid-glass'];
const SAVE_ERROR_MESSAGE = 'Failed to save this setting. Your last action was not saved.';
const restorers = [];

const settle = async () => {
  await flushDeferredFailureSync();
  await flushDeferredFailureSync();
};

function select(value) {
  const radio = themeRadio(value);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/core/toast.js');
  injectScript('src/ui/settings.js');
});

beforeEach(() => {
  document.body.classList.remove('light-theme', 'glass-liquid');
  localStorage.removeItem('glassStyle');
  if (!document.querySelector('input[name="theme"]')) {
    document.body.insertAdjacentHTML('beforeend', THEMES.map((value) => (
      `<input type="radio" name="theme" value="${value}">`
    )).join(''));
  }
  THEMES.forEach((value) => {
    themeRadio(value).checked = false;
  });
  window.LiquidGlass = { init: vi.fn() };
  window.showToast = vi.fn();
});

afterEach(async () => {
  await settle();
  while (restorers.length > 0) restorers.pop()();
  delete window.LiquidGlass;
  delete window.showToast;
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
      select('liquid-glass');
      expect(localStorage.getItem('theme')).toBe('liquid-glass');
      expect(onThemeChanged.mock.calls[0][0].detail.theme).toBe('liquid-glass');
      expect(window.showToast).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });
});

describe('rejected theme writes', () => {
  it('restores the radio, reports the restored theme, and toasts on a synchronous rejection', () => {
    localStorage.setItem('theme', 'dark');
    restorers.push(failStorageWritesFor('theme'));
    const onThemeChanged = vi.fn();
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      select('liquid-glass');

      expect(localStorage.getItem('theme')).toBe('dark');
      expect(themeRadio('liquid-glass').checked).toBe(false);
      expect(themeRadio('dark').checked).toBe(true);
      expect(onThemeChanged).toHaveBeenCalledTimes(1);
      expect(onThemeChanged.mock.calls[0][0].detail.theme).toBe('dark');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });

  it('re-applies the theme, reports it, and toasts once after an async rollback', async () => {
    localStorage.setItem('theme', 'dark');
    restorers.push(failStorageWritesFor('theme', 'async'));
    const onThemeChanged = vi.fn();
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      select('liquid-glass');

      // The bridge accepted the optimistic write; the UI follows it until the
      // failure rolls storage back.
      expect(localStorage.getItem('theme')).toBe('liquid-glass');
      expect(themeRadio('liquid-glass').checked).toBe(true);
      expect(window.showToast).not.toHaveBeenCalled();
      window.LiquidGlass.init.mockClear();

      await settle();

      expect(localStorage.getItem('theme')).toBe('dark');
      expect(themeRadio('dark').checked).toBe(true);
      expect(themeRadio('liquid-glass').checked).toBe(false);
      expect(window.LiquidGlass.init).toHaveBeenCalled();
      expect(onThemeChanged.mock.calls.at(-1)[0].detail.theme).toBe('dark');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });
});

describe('glassStyle migration', () => {
  it('moves a legacy liquid choice to the theme once the write settled', async () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'liquid');
    window.migrateGlassStyle();
    await settle();
    expect(localStorage.getItem('theme')).toBe('liquid-glass');
    expect(localStorage.getItem('glassStyle')).toBeNull();
  });

  it('keeps the legacy key when the theme write is rejected synchronously', async () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'liquid');
    restorers.push(failStorageWritesFor('theme'));
    window.migrateGlassStyle();
    await settle();
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('glassStyle')).toBe('liquid');
  });

  it('keeps the legacy key when the theme write rolls back asynchronously', async () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'liquid');
    restorers.push(failStorageWritesFor('theme', 'async'));
    window.migrateGlassStyle();
    await settle();
    await settle();
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('glassStyle')).toBe('liquid');
  });

  it('drops a legacy classic value without touching the theme', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'classic');
    window.migrateGlassStyle();
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('glassStyle')).toBeNull();
  });

  it('does not run from applyTheme, so a leftover legacy key cannot override later picks', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('glassStyle', 'liquid');
    window.applyTheme();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('glassStyle')).toBe('liquid');
  });
});

describe('theme switching with the real LiquidGlass module', () => {
  beforeEach(() => {
    document.getElementById('liquid-glass-defs')?.remove();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {}
    }));
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    globalThis.CSS = { supports: () => true };
    globalThis.SVGFilterElement = function SVGFilterElement() {};
    window.prefersReducedMotion = () => false;
    window.onReducedMotionChange = () => () => {};
    localStorage.setItem('theme', 'dark');
    injectScript('src/data/liquid-glass-maps.js');
    injectScript('src/ui/liquid-glass.js');
  });

  afterEach(() => {
    window.LiquidGlass?.release();
    vi.restoreAllMocks();
    delete globalThis.CSS;
    delete globalThis.SVGFilterElement;
  });

  it('adds the effect for liquid-glass and removes it when another theme is picked', () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-liquid-glass', 'panel');
    document.body.appendChild(panel);
    expect(document.body.classList.contains('glass-liquid')).toBe(false);
    expect(panel.querySelector('.glass__warp')).toBeNull();

    select('liquid-glass');
    expect(document.body.classList.contains('glass-liquid')).toBe(true);
    expect(panel.querySelector('.glass__warp')).not.toBeNull();

    select('light');
    expect(document.body.classList.contains('glass-liquid')).toBe(false);
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(panel.querySelector('.glass__warp')).toBeNull();
    expect(panel.classList.contains('glass--liquid')).toBe(false);

    select('liquid-glass');
    expect(panel.querySelector('.glass__warp')).not.toBeNull();
    select('system');
    expect(document.body.classList.contains('glass-liquid')).toBe(false);
    expect(panel.querySelector('.glass__warp')).toBeNull();

    panel.remove();
  });
});
