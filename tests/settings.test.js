import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import vm from 'vm';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ui/color-picker.js');
  injectScript('src/ui/font-picker.js');
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

describe('Modern picker events', () => {
  it('emits one change event for font selection', () => {
    const events = [];
    const fontSelect = document.getElementById('clock-font-picker');

    fontSelect.addEventListener('change', () => {
      events.push('change');
    });

    initModernFontPickers();
    document.querySelector('.font-option').click();

    expect(events).toHaveLength(1);
  });

  it('emits one input event for color selection', () => {
    const events = [];
    const colorInput = document.getElementById('clock-color-picker');
    colorInput.type = 'color';
    colorInput.value = '#000000';

    colorInput.addEventListener('input', () => {
      events.push('input');
    });

    initModernColorPickers();
    document.querySelector('.color-chip').click();

    expect(events).toHaveLength(1);
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

describe('captureBackgroundSnapshot interactive canvas capture', () => {
  let canvasEl;

  beforeEach(() => {
    canvasEl = document.getElementById('bg-interactive');
    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      canvasEl.id = 'bg-interactive';
      canvasEl.className = 'background-interactive';
      canvasEl.hidden = false;
      document.body.appendChild(canvasEl);
    } else {
      canvasEl.hidden = false;
    }

    // Ensure overlay is fresh (use setAttribute to avoid jsdom URL resolution)
    const overlayEl = document.getElementById('bg-transition-overlay');
    overlayEl.removeAttribute('src');
    overlayEl.classList.remove('active');

    // Ensure fullEl won't match (no loaded class, naturalWidth 0 in jsdom)
    const fullEl = document.getElementById('bg-full');
    fullEl.classList.remove('loaded');

    // Ensure videoEl won't match (no active class)
    const videoEl = document.getElementById('bg-video');
    videoEl.classList.remove('active');

    // Setup interactive background mock with an active background
    window._interactiveBackground = {
      stop: vi.fn(),
      currentBackgroundId: () => 'particles',
    };
  });

  afterEach(() => {
    delete window._interactiveBackground;
  });

  it('captures from canvas when interactive background is active', () => {
    // jsdom does not implement toDataURL without the canvas package, so mock it
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,mocked';

    try {
      captureBackgroundSnapshot();
      const overlayEl = document.getElementById('bg-transition-overlay');
      expect(overlayEl.getAttribute('src')).toContain('data:image/jpeg');
      expect(overlayEl.classList.contains('active')).toBe(true);
    } finally {
      HTMLCanvasElement.prototype.toDataURL = origToDataURL;
    }
  });

  it('skips canvas capture when interactive background has no active ID', () => {
    window._interactiveBackground.currentBackgroundId = () => '';

    captureBackgroundSnapshot();
    const overlayEl = document.getElementById('bg-transition-overlay');
    expect(overlayEl.getAttribute('src')).toBeNull();
    expect(overlayEl.classList.contains('active')).toBe(false);
  });

  it('skips canvas capture when currentBackgroundId is missing', () => {
    delete window._interactiveBackground.currentBackgroundId;

    captureBackgroundSnapshot();
    const overlayEl = document.getElementById('bg-transition-overlay');
    expect(overlayEl.getAttribute('src')).toBeNull();
    expect(overlayEl.classList.contains('active')).toBe(false);
  });

  it('skips canvas capture when canvas is hidden', () => {
    canvasEl.hidden = true;

    captureBackgroundSnapshot();
    const overlayEl = document.getElementById('bg-transition-overlay');
    expect(overlayEl.getAttribute('src')).toBeNull();
    expect(overlayEl.classList.contains('active')).toBe(false);
  });

  it('skips canvas capture when _interactiveBackground is undefined', () => {
    delete window._interactiveBackground;

    captureBackgroundSnapshot();
    const overlayEl = document.getElementById('bg-transition-overlay');
    expect(overlayEl.getAttribute('src')).toBeNull();
    expect(overlayEl.classList.contains('active')).toBe(false);
  });
});

describe('initSettings background startup', () => {
  it('requests the background immediately even if idle never runs', () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div class="background-container" id="background-container">
        <video class="background-video" id="bg-video"><source src="" type="video/mp4"></video>
        <img class="background-thumbnail" id="bg-thumbnail" src="" alt="">
        <img class="background-full" id="bg-full" src="" alt="">
        <img class="background-transition-overlay" id="bg-transition-overlay" src="" alt="">
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

describe('hideBackgroundOverlay', () => {
  beforeEach(() => {
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.removeAttribute('src');
    overlay.classList.remove('active');
    clearBackgroundTransitionTimeout();
  });

  it('returns early when overlay is not active', () => {
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.setAttribute('src', 'some-src');
    hideBackgroundOverlay();
    expect(overlay.getAttribute('src')).toBe('some-src');
    expect(overlay.classList.contains('active')).toBe(false);
  });

  it('removes active class immediately', () => {
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.classList.add('active');
    hideBackgroundOverlay();
    expect(overlay.classList.contains('active')).toBe(false);
  });

  it('clears overlay src after transition duration', () => {
    vi.useFakeTimers();
    const overlay = document.getElementById('bg-transition-overlay');
    const originalSrc = 'some-src';
    overlay.setAttribute('src', originalSrc);
    overlay.classList.add('active');

    hideBackgroundOverlay();
    vi.advanceTimersByTime(400);

    expect(overlay.getAttribute('src')).toBe('');
    vi.useRealTimers();
  });

  it('preserves src if overlay becomes active again during fade', () => {
    vi.useFakeTimers();
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.setAttribute('src', 'some-src');
    overlay.classList.add('active');

    hideBackgroundOverlay();
    overlay.classList.add('active');
    vi.advanceTimersByTime(400);

    expect(overlay.getAttribute('src')).toBe('some-src');
    vi.useRealTimers();
  });
});

describe('captureBackgroundSnapshot non-interactive sources', () => {
  beforeEach(() => {
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.removeAttribute('src');
    overlay.classList.remove('active');

    const fullEl = document.getElementById('bg-full');
    fullEl.classList.remove('loaded');
    fullEl.removeAttribute('src');

    const videoEl = document.getElementById('bg-video');
    videoEl.classList.remove('active');

    const thumbnailEl = document.getElementById('bg-thumbnail');
    thumbnailEl.classList.add('hidden');
    thumbnailEl.removeAttribute('src');

    delete window._interactiveBackground;
  });

  it('captures from full image when loaded with naturalWidth > 0', () => {
    const fullEl = document.getElementById('bg-full');
    fullEl.classList.add('loaded');
    Object.defineProperty(fullEl, 'naturalWidth', { value: 100, configurable: true });
    fullEl.setAttribute('src', 'https://example.com/full.jpg');

    captureBackgroundSnapshot();
    const overlay = document.getElementById('bg-transition-overlay');
    expect(overlay.getAttribute('src')).toBe('https://example.com/full.jpg');
    expect(overlay.classList.contains('active')).toBe(true);
  });

  it('captures from video frame when active and ready', () => {
    const videoEl = document.getElementById('bg-video');
    videoEl.classList.add('active');
    Object.defineProperty(videoEl, 'currentSrc', { value: 'video.mp4', configurable: true });
    Object.defineProperty(videoEl, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true });

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => {} });
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,video-mock';

    try {
      captureBackgroundSnapshot();
      const overlay = document.getElementById('bg-transition-overlay');
      expect(overlay.getAttribute('src')).toContain('data:image/jpeg');
      expect(overlay.classList.contains('active')).toBe(true);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toDataURL = origToDataURL;
    }
  });

  it('captures from thumbnail when full and video sources unavailable', () => {
    const thumbnailEl = document.getElementById('bg-thumbnail');
    thumbnailEl.classList.remove('hidden');
    Object.defineProperty(thumbnailEl, 'naturalWidth', { value: 100, configurable: true });
    thumbnailEl.setAttribute('src', 'https://example.com/thumb.jpg');

    captureBackgroundSnapshot();
    const overlay = document.getElementById('bg-transition-overlay');
    expect(overlay.getAttribute('src')).toBe('https://example.com/thumb.jpg');
    expect(overlay.classList.contains('active')).toBe(true);
  });

  it('does nothing when no source is available', () => {
    captureBackgroundSnapshot();
    const overlay = document.getElementById('bg-transition-overlay');
    expect(overlay.getAttribute('src')).toBeNull();
    expect(overlay.classList.contains('active')).toBe(false);
  });
});

describe('clearBackgroundTransitionTimeout', () => {
  beforeEach(() => {
    clearBackgroundTransitionTimeout();
  });

  it('cancels overlay src clear timeout set by hideBackgroundOverlay', () => {
    vi.useFakeTimers();
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.setAttribute('src', 'some-src');
    overlay.classList.add('active');

    hideBackgroundOverlay();
    clearBackgroundTransitionTimeout();
    vi.advanceTimersByTime(400);

    expect(overlay.getAttribute('src')).toBe('some-src');
    vi.useRealTimers();
  });
});

describe('background image load failure recovery', () => {
  beforeEach(() => {
    const overlay = document.getElementById('bg-transition-overlay');
    overlay.removeAttribute('src');
    overlay.classList.remove('active');
    clearBackgroundTransitionTimeout();
  });

  it('calls hideBackgroundOverlay when applyBg static image onerror fires', () => {
    localStorage.setItem('homepageBg', 'Mountain View');
    window._backgrounds = [
      { id: 'Mountain View', type: 'image', thumb: 'thumb.jpg', url: 'bad-url.jpg' }
    ];
    window._interactiveBackground = { stop: vi.fn() };

    const overlay = document.getElementById('bg-transition-overlay');
    overlay.classList.add('active');
    overlay.setAttribute('src', 'old-snapshot');

    // Intercept Image constructor to trigger onerror on the full-resolution load
    const origImage = window.Image;
    window.Image = function() {
      const img = new origImage(0, 0);
      const origSrcDescriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(img), 'src'
      );
      Object.defineProperty(img, 'src', {
        set(value) {
          // Only trigger onerror for the full-resolution URL (not the thumbnail preload)
          if (value === 'bad-url.jpg' && typeof img.onerror === 'function') {
            img.onerror();
          }
          if (origSrcDescriptor && origSrcDescriptor.set) {
            origSrcDescriptor.set.call(img, value);
          }
        },
        configurable: true
      });
      img.onload = null;
      img.onerror = null;
      return img;
    };
    window.Image.prototype = origImage.prototype;

    try {
      applyBg();

      expect(overlay.classList.contains('active')).toBe(false);
    } finally {
      window.Image = origImage;
    }
  });
});
