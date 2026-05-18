import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import vm from 'vm';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ui/settings.js');
});

describe('Background settings', () => {
  it('loadBg returns default', () => {
    expect(loadBg()).toBe('Water Beside Forest');
  });

  it('loadBg reads localStorage', () => {
    localStorage.setItem('homepageBg', 'My Background');
    expect(loadBg()).toBe('My Background');
  });
});

describe('Clock style settings', () => {
  it('loadClockStyle returns defaults', () => {
    const style = loadClockStyle();
    expect(style.color).toBe('#ffffff');
    expect(style.font).toBe('\'Times New Roman\', serif');
    expect(style.size).toBe(80);
  });

  it('loadClockStyle reads custom values', () => {
    localStorage.setItem('clockColor', '#ff0000');
    localStorage.setItem('clockFont', 'Arial');
    localStorage.setItem('clockSize', '100');
    const style = loadClockStyle();
    expect(style.color).toBe('#ff0000');
    expect(style.font).toBe('Arial');
    expect(style.size).toBe(100);
  });

  it('loadClockStyle normalizes invalid size to closest option', () => {
    localStorage.setItem('clockSize', '85');
    const style = loadClockStyle();
    expect([60, 80, 100]).toContain(style.size);
  });
});

describe('Date style settings', () => {
  it('loadDateStyle returns defaults', () => {
    const style = loadDateStyle();
    expect(style.color).toBe('#ffffff');
    expect(style.font).toBe('\'Times New Roman\', serif');
    expect(style.size).toBe(24);
  });

  it('loadDateStyle reads custom values', () => {
    localStorage.setItem('dateColor', '#00ff00');
    localStorage.setItem('dateFont', 'Verdana');
    localStorage.setItem('dateSize', '30');
    const style = loadDateStyle();
    expect(style.color).toBe('#00ff00');
    expect(style.font).toBe('Verdana');
    expect(style.size).toBe(30);
  });
});

describe('Theme settings', () => {
  it('loadTheme returns dark by default', () => {
    expect(loadTheme()).toBe('dark');
  });

  it('loadTheme reads localStorage', () => {
    localStorage.setItem('theme', 'light');
    expect(loadTheme()).toBe('light');
  });
});

describe('Todo enabled settings', () => {
  it('loadTodoEnabled returns true by default', () => {
    expect(loadTodoEnabled()).toBe(true);
  });

  it('loadTodoEnabled reads localStorage', () => {
    localStorage.setItem('todoEnabled', 'false');
    expect(loadTodoEnabled()).toBe(false);
  });
});

describe('Clock format settings', () => {
  it('loadClockFormatSetting returns auto by default', () => {
    expect(loadClockFormatSetting()).toBe('auto');
  });

  it('loadClockFormatSetting sanitizes invalid values', () => {
    localStorage.setItem('clockFormat', 'invalid');
    expect(loadClockFormatSetting()).toBe('auto');
  });

  it('loadClockFormatSetting preserves valid values', () => {
    localStorage.setItem('clockFormat', '24h');
    expect(loadClockFormatSetting()).toBe('24h');
  });
});

describe('Date format settings', () => {
  it('loadDateFormatSetting returns auto by default', () => {
    expect(loadDateFormatSetting()).toBe('auto');
  });

  it('loadDateFormatSetting sanitizes invalid values', () => {
    localStorage.setItem('dateFormat', 'bogus');
    expect(loadDateFormatSetting()).toBe('auto');
  });

  it('loadDateFormatSetting preserves valid values', () => {
    localStorage.setItem('dateFormat', 'compact');
    expect(loadDateFormatSetting()).toBe('compact');
  });
});

describe('Utility functions', () => {
  it('getClosestSize picks nearest option', () => {
    expect(getClosestSize(85, [60, 80, 100])).toBe(80);
    expect(getClosestSize(95, [60, 80, 100])).toBe(100);
    expect(getClosestSize(50, [60, 80, 100])).toBe(60);
  });
});

describe('applyBg stale background regression', () => {
  beforeEach(() => {
    localStorage.setItem('homepageBg', 'stale-bg-id');
    window._backgrounds = [
      { id: 'Mountain View', type: 'image', thumb: 'thumb.jpg', url: 'full.jpg' }
    ];
    window._interactiveBackground = { stop: vi.fn() };
  });

  it('calls stopBackground when bgData lookup returns null', () => {
    applyBg();
    expect(window._interactiveBackground.stop).toHaveBeenCalled();
  });

  it('calls stopBackground when _backgrounds is undefined', () => {
    delete window._backgrounds;
    applyBg();
    expect(window._interactiveBackground.stop).toHaveBeenCalled();
  });
});

describe('initSettings background startup', () => {
  it('requests the background immediately even if idle never runs', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div class="background-container" id="background-container">
        <video class="background-video" id="bg-video"><source src="" type="video/mp4"></video>
        <img class="background-thumbnail" id="bg-thumbnail" src="" alt="">
        <img class="background-full" id="bg-full" src="" alt="">
        <canvas class="background-interactive" id="bg-interactive"></canvas>
      </div>
      <div class="settings-menu"></div>
      <section class="settings-section" data-section="about"></section>
    </body></html>`, {
      url: 'https://example.com',
      runScripts: 'dangerously'
    });

    try {
      const { window: isolatedWindow } = dom;
      const requestedSources = [];

      isolatedWindow.localStorage.setItem('homepageBg', 'Mountain View');
      isolatedWindow._backgrounds = [
        { id: 'Mountain View', type: 'image', thumb: 'thumb.jpg', url: 'full.jpg' }
      ];
      isolatedWindow._interactiveBackground = { stop() {} };
      isolatedWindow._customBackgrounds = undefined;
      isolatedWindow.i18n = {
        currentLanguage() { return 'en'; },
        getSupportedLanguages() { return []; },
        t(key) { return key; }
      };
      isolatedWindow.updateChecker = {
        getUpdateStatus() { return ''; },
        isEnabled() { return true; }
      };
      isolatedWindow.requestIdleCallback = vi.fn();
      isolatedWindow.requestAnimationFrame = (callback) => callback();
      isolatedWindow.cancelAnimationFrame = () => {};

      class MockImage {
        set src(value) {
          requestedSources.push(value);
          if (typeof this.onload === 'function') {
            this.onload();
          }
        }

        get src() {
          return requestedSources[requestedSources.length - 1] || '';
        }
      }

      isolatedWindow.Image = MockImage;

      const code = readFileSync(resolve(process.cwd(), 'src/ui/settings.js'), 'utf-8');
      const script = new vm.Script(code);
      script.runInContext(dom.getInternalVMContext());

      isolatedWindow.document.dispatchEvent(new isolatedWindow.Event('DOMContentLoaded'));

      expect(isolatedWindow.requestIdleCallback).not.toHaveBeenCalled();
      expect(requestedSources).toContain('full.jpg');
      expect(isolatedWindow.document.body.getAttribute('data-bg')).toBe('Mountain View');
    } finally {
      dom.window.close();
    }
  });
});

describe('Language settings', () => {
  it('loadLanguageSetting returns en by default', () => {
    expect(loadLanguageSetting()).toBe('en');
  });

  it('loadLanguageSetting reads localStorage', () => {
    localStorage.setItem('language', 'zh');
    expect(loadLanguageSetting()).toBe('zh');
  });

  it('getSupportedLanguages returns all 9 languages', () => {
    const languages = window.i18n.getSupportedLanguages();
    expect(languages).toHaveLength(9);
    const codes = languages.map(l => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('zh');
    expect(codes).toContain('ja');
    expect(codes).toContain('ko');
    expect(codes).toContain('es');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('pt');
    expect(codes).toContain('ru');
  });

  it('renderLanguageOptions creates radio buttons in container', () => {
    const container = document.createElement('div');
    container.id = 'language-options-container';
    container.className = 'language-options';
    document.body.appendChild(container);
    renderLanguageOptions();
    const radios = container.querySelectorAll('input[type="radio"][name="language"]');
    expect(radios).toHaveLength(9);
    expect(radios[0].value).toBe('en');
    expect(radios[0].checked).toBe(true);
    document.body.removeChild(container);
  });

  it('returns key as fallback for missing translation', () => {
    localStorage.setItem('language', 'ja');
    const result = window.i18n.t('nonexistentKey');
    expect(result).toBe('nonexistentKey');
  });
});
