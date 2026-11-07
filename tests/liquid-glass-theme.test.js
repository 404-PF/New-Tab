import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { itWhenLiquidEnabled } from './helpers/liquid-glass-flag.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

const themeRadio = (value) => document.querySelector(`input[name="theme"][value="${value}"]`);
const THEMES = ['dark', 'light', 'system'];
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

function liquidToggle() {
  return document.getElementById('liquid-glass-setting');
}

function toggleLiquid(checked) {
  const checkbox = liquidToggle();
  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeAll(() => {
  injectScript('src/core/motion.js');
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
  injectScript('src/core/toast.js');
  document.body.insertAdjacentHTML('beforeend', '<input type="checkbox" id="liquid-glass-setting">');
  injectScript('src/ui/settings.js');
});

beforeEach(() => {
  document.body.classList.remove('light-theme', 'glass-liquid');
  localStorage.removeItem('glassStyle');
  localStorage.removeItem('liquidGlassEnabled');
  liquidToggle().checked = true;
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

describe('Liquid Glass setting', () => {
  it('ships the toggle in New-Tab.html and drops the standalone theme radio and Glass style select', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');
    expect(html).toMatch(/<input type="checkbox" id="liquid-glass-setting" checked \/>/);
    expect(html).toMatch(/data-i18n="liquidGlass">Liquid Glass</);
    expect(html).not.toContain('value="liquid-glass"');
    expect(html).not.toContain('preview-icon liquid');
    expect(html).not.toContain('glass-style-setting');
  });

  it('defaults to on', () => {
    expect(window.loadLiquidGlassEnabled()).toBe(true);
    window.applyLiquidGlassEnabled();
    expect(liquidToggle().checked).toBe(true);
    expect(window.LiquidGlass.init).toHaveBeenCalled();
  });

  it('turning the toggle off stores false and re-inits LiquidGlass', () => {
    toggleLiquid(false);
    expect(localStorage.getItem('liquidGlassEnabled')).toBe('false');
    expect(window.loadLiquidGlassEnabled()).toBe(false);
    expect(window.LiquidGlass.init).toHaveBeenCalled();
    expect(window.showToast).not.toHaveBeenCalled();

    toggleLiquid(true);
    expect(localStorage.getItem('liquidGlassEnabled')).toBe('true');
    expect(window.loadLiquidGlassEnabled()).toBe(true);
  });

  it('restores the checkbox and toasts when the write is rejected', () => {
    restorers.push(failStorageWritesFor('liquidGlassEnabled'));
    toggleLiquid(false);
    expect(window.loadLiquidGlassEnabled()).toBe(true);
    expect(liquidToggle().checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('applyTheme keeps the dark base and re-inits LiquidGlass', () => {
    localStorage.setItem('theme', 'dark');
    window.applyTheme();
    expect(themeRadio('dark').checked).toBe(true);
    expect(document.body.classList.contains('light-theme')).toBe(false);
    expect(window.LiquidGlass.init).toHaveBeenCalled();
  });

  it('treats a stored legacy liquid-glass theme as dark', () => {
    localStorage.setItem('theme', 'liquid-glass');
    expect(window.loadTheme()).toBe('dark');
    window.applyTheme();
    expect(themeRadio('dark').checked).toBe(true);
    expect(document.body.classList.contains('light-theme')).toBe(false);
  });

  it('selecting a theme radio does not touch the Liquid Glass setting', () => {
    toggleLiquid(false);
    select('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('liquidGlassEnabled')).toBe('false');
    expect(document.body.classList.contains('light-theme')).toBe(true);
  });
});

describe('rejected theme writes', () => {
  it('restores the radio, reports the restored theme, and toasts on a synchronous rejection', () => {
    localStorage.setItem('theme', 'dark');
    restorers.push(failStorageWritesFor('theme'));
    const onThemeChanged = vi.fn();
    window.addEventListener('themeChanged', onThemeChanged);
    try {
      select('light');

      expect(localStorage.getItem('theme')).toBe('dark');
      expect(themeRadio('light').checked).toBe(false);
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
      select('light');

      // The bridge accepted the optimistic write; the UI follows it until the
      // failure rolls storage back.
      expect(localStorage.getItem('theme')).toBe('light');
      expect(themeRadio('light').checked).toBe(true);
      expect(window.showToast).not.toHaveBeenCalled();
      window.LiquidGlass.init.mockClear();

      await settle();

      expect(localStorage.getItem('theme')).toBe('dark');
      expect(themeRadio('dark').checked).toBe(true);
      expect(themeRadio('light').checked).toBe(false);
      expect(window.LiquidGlass.init).toHaveBeenCalled();
      expect(onThemeChanged.mock.calls.at(-1)[0].detail.theme).toBe('dark');
      expect(window.showToast).toHaveBeenCalledTimes(1);
      expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      window.removeEventListener('themeChanged', onThemeChanged);
    }
  });

  it('resyncs the Liquid Glass checkbox and toasts once after an async rollback', async () => {
    restorers.push(failStorageWritesFor('liquidGlassEnabled', 'async'));
    toggleLiquid(false);
    expect(localStorage.getItem('liquidGlassEnabled')).toBe('false');
    expect(window.showToast).not.toHaveBeenCalled();

    await settle();

    expect(localStorage.getItem('liquidGlassEnabled')).not.toBe('false');
    expect(liquidToggle().checked).toBe(true);
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});

describe('legacy Liquid Glass migration', () => {
  it('moves the standalone liquid-glass theme to dark', () => {
    localStorage.setItem('theme', 'liquid-glass');
    window.migrateGlassStyle();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('leaves dark, light and system themes alone', () => {
    ['dark', 'light', 'system'].forEach((theme) => {
      localStorage.setItem('theme', theme);
      window.migrateGlassStyle();
      expect(localStorage.getItem('theme')).toBe(theme);
    });
  });

  it('drops the obsolete glassStyle key without changing the theme', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('glassStyle', 'liquid');
    window.migrateGlassStyle();
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('glassStyle')).toBeNull();
  });

  it('keeps reading the legacy theme as dark when the rewrite is rejected', () => {
    localStorage.setItem('theme', 'liquid-glass');
    restorers.push(failStorageWritesFor('theme'));
    window.migrateGlassStyle();
    expect(window.loadTheme()).toBe('dark');
  });

  it('keeps reading the legacy theme as dark when the rewrite is rejected asynchronously', async () => {
    localStorage.setItem('theme', 'liquid-glass');
    restorers.push(failStorageWritesFor('theme', 'async'));
    window.migrateGlassStyle();
    await settle();
    expect(window.loadTheme()).toBe('dark');
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

  itWhenLiquidEnabled('enhances both dark and light themes and removes the effect when the setting is turned off', () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-liquid-glass', 'panel');
    document.body.appendChild(panel);
    window.LiquidGlass.init();
    expect(document.body.classList.contains('glass-liquid')).toBe(true);
    expect(panel.querySelector('.glass__warp')).not.toBeNull();

    select('light');
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(document.body.classList.contains('glass-liquid')).toBe(true);
    expect(panel.querySelector('.glass__warp')).not.toBeNull();

    select('system');
    expect(document.body.classList.contains('glass-liquid')).toBe(true);

    toggleLiquid(false);
    expect(document.body.classList.contains('glass-liquid')).toBe(false);
    expect(panel.querySelector('.glass__warp')).toBeNull();
    expect(panel.classList.contains('glass--liquid')).toBe(false);

    select('dark');
    expect(document.body.classList.contains('glass-liquid')).toBe(false);

    toggleLiquid(true);
    expect(document.body.classList.contains('glass-liquid')).toBe(true);
    expect(panel.querySelector('.glass__warp')).not.toBeNull();

    panel.remove();
  });
});
