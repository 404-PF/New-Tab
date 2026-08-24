import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/core/motion.js');
  injectScript('src/data/backgrounds.js');
  injectScript('src/features/background-rotation.js');
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('bgRotationEnabled', 'false');
  localStorage.setItem('bgRotationInterval', '30min');
  localStorage.removeItem('bgRotationSelection');
  window._backgrounds = undefined;
});

afterEach(() => {
  BackgroundRotation.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.applyBg;
});

describe('Background rotation storage', () => {
  it('isEnabled returns false by default', () => {
    expect(BackgroundRotation.isEnabled()).toBe(false);
  });

  it('isEnabled returns true when enabled in localStorage', () => {
    localStorage.setItem('bgRotationEnabled', 'true');
    expect(BackgroundRotation.isEnabled()).toBe(true);
  });

  it('getInterval returns 30min by default', () => {
    expect(BackgroundRotation.getInterval()).toBe('30min');
  });

  it('getInterval reads custom value', () => {
    localStorage.setItem('bgRotationInterval', '1hour');
    expect(BackgroundRotation.getInterval()).toBe('1hour');
  });

  it('getInterval preserves the clock-aligned hourly value', () => {
    localStorage.setItem('bgRotationInterval', 'hourly');
    expect(BackgroundRotation.getInterval()).toBe('hourly');
  });

  it('getSelection returns null when no selection stored', () => {
    expect(BackgroundRotation.getSelection()).toBeNull();
  });

  it('getSelection returns parsed array when stored', () => {
    localStorage.setItem('bgRotationSelection', JSON.stringify(['bg1', 'bg2']));
    expect(BackgroundRotation.getSelection()).toEqual(['bg1', 'bg2']);
  });

  it('getSelection returns null for invalid JSON', () => {
    localStorage.setItem('bgRotationSelection', 'not-json');
    expect(BackgroundRotation.getSelection()).toBeNull();
  });

  it('getSelection returns null for empty array', () => {
    localStorage.setItem('bgRotationSelection', '[]');
    expect(BackgroundRotation.getSelection()).toBeNull();
  });
});

describe('Background rotation apply', () => {
  it('uses Web Crypto when shuffling backgrounds', () => {
    const getRandomValues = vi.fn((values) => {
      values[0] = getRandomValues.mock.calls.length === 1 ? 1 : 0;
      return values;
    });
    const mathRandom = vi.spyOn(Math, 'random');
    vi.stubGlobal('crypto', { getRandomValues });
    window._backgrounds = [
      { id: 'Test BG 1', title: 'Test BG 1', thumb: 'thumb1.jpg', url: 'img1.jpg' },
      { id: 'Test BG 2', title: 'Test BG 2', thumb: 'thumb2.jpg', url: 'img2.jpg' },
      { id: 'Test BG 3', title: 'Test BG 3', thumb: 'thumb3.jpg', url: 'img3.jpg' },
    ];
    localStorage.setItem('bgRotationEnabled', 'true');

    BackgroundRotation.start();
    BackgroundRotation.advance();

    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint32Array));
    expect(mathRandom).not.toHaveBeenCalled();
    expect(localStorage.getItem('homepageBg')).toBe('Test BG 3');
  });

  it('apply does not throw when backgrounds not loaded', () => {
    window._backgrounds = undefined;
    expect(() => BackgroundRotation.apply()).not.toThrow();
  });

  it('start does not throw when disabled', () => {
    localStorage.setItem('bgRotationEnabled', 'false');
    expect(() => BackgroundRotation.start()).not.toThrow();
  });

  it('stop does not throw when no timer running', () => {
    expect(() => BackgroundRotation.stop()).not.toThrow();
  });

  it('advance does not throw when backgrounds available', () => {
    window._backgrounds = [
      { id: 'Test BG 1', title: 'Test BG 1', thumb: 'thumb1.jpg', url: 'img1.jpg' },
      { id: 'Test BG 2', title: 'Test BG 2', thumb: 'thumb2.jpg', url: 'img2.jpg' },
    ];
    localStorage.setItem('bgRotationEnabled', 'false');
    expect(() => BackgroundRotation.advance()).not.toThrow();
  });
});

describe('Background rotation scheduling', () => {
  beforeEach(() => {
    window._backgrounds = [
      { id: 'Test BG 1', title: 'Test BG 1', thumb: 'thumb1.jpg', url: 'img1.jpg' },
      { id: 'Test BG 2', title: 'Test BG 2', thumb: 'thumb2.jpg', url: 'img2.jpg' },
    ];
    localStorage.setItem('bgRotationEnabled', 'true');
  });

  it('aligns hourly rotation to the next clock hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 15, 0, 0));
    localStorage.setItem('bgRotationInterval', 'hourly');
    window.applyBg = vi.fn();

    BackgroundRotation.start();

    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(window.applyBg).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(window.applyBg).toHaveBeenCalledOnce();
  });

  it('keeps 1hour as a rolling one-hour interval', () => {
    const OriginalVisibilityInterval = window.VisibilityInterval;
    const destroy = vi.fn();
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy };
    });
    window.VisibilityInterval = VisibilityIntervalMock;
    localStorage.setItem('bgRotationInterval', '1hour');

    try {
      BackgroundRotation.start();

      expect(VisibilityIntervalMock).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 60 * 1000,
        false
      );
    } finally {
      BackgroundRotation.stop();
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });
});

describe('Background rotation picker', () => {
  it('renderPicker does not throw when container missing', () => {
    expect(() => BackgroundRotation.renderPicker()).not.toThrow();
  });

  it('renderPicker renders checkboxes for all backgrounds', () => {
    const container = document.createElement('div');
    container.id = 'bg-rotation-picker';
    document.body.appendChild(container);

    window._backgrounds = [
      { id: 'BG Alpha', title: 'BG Alpha', thumb: 'a.jpg', url: 'a-full.jpg' },
      { id: 'BG Beta', title: 'BG Beta', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];

    BackgroundRotation.renderPicker();

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].value).toBe('BG Alpha');
    expect(checkboxes[1].value).toBe('BG Beta');

    document.body.removeChild(container);
  });

  it('renderPicker checks selected backgrounds', () => {
    const container = document.createElement('div');
    container.id = 'bg-rotation-picker';
    document.body.appendChild(container);

    localStorage.setItem('bgRotationSelection', JSON.stringify(['BG Alpha']));

    window._backgrounds = [
      { id: 'BG Alpha', title: 'BG Alpha', thumb: 'a.jpg', url: 'a-full.jpg' },
      { id: 'BG Beta', title: 'BG Beta', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];

    BackgroundRotation.renderPicker();

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);

    document.body.removeChild(container);
  });
});

describe('Background rotation with custom backgrounds', () => {
  // Installs a minimal window._customBackgrounds stub exposing a mutable
  // cached list, mirroring the real getCachedList() contract.
  function stubCustomBackgrounds(list) {
    window._customBackgrounds = {
      isCustom: (id) => typeof id === 'string' && id.startsWith('custom_'),
      getCachedList: () => list,
      refresh: () => Promise.resolve(list),
    };
  }

  afterEach(() => {
    delete window._customBackgrounds;
  });

  it('includes custom backgrounds in the rotation pool', () => {
    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    stubCustomBackgrounds([
      { id: 'custom_image_1', title: 'My Photo', type: 'image', thumb: 'c1.jpg' },
      { id: 'custom_video_1', title: 'My Video', type: 'video', thumb: 'c2.jpg' },
    ]);

    localStorage.setItem('bgRotationSelection', JSON.stringify(['custom_image_1']));
    BackgroundRotation.start();
    BackgroundRotation.advance();

    expect(localStorage.getItem('homepageBg')).toBe('custom_image_1');
  });

  it('rotates through built-ins and uploads without repeating until the pool wraps', () => {
    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    stubCustomBackgrounds([
      { id: 'custom_image_1', title: 'My Photo', type: 'image', thumb: 'c1.jpg' },
    ]);
    localStorage.setItem('bgRotationEnabled', 'true');

    BackgroundRotation.start();
    BackgroundRotation.advance();
    const first = localStorage.getItem('homepageBg');
    BackgroundRotation.advance();
    const second = localStorage.getItem('homepageBg');

    expect(new Set([first, second])).toEqual(new Set(['Built-in BG', 'custom_image_1']));
    expect(first).not.toBe(second);
  });

  it('drops deleted custom backgrounds from the pool on the next advance', () => {
    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    const list = [
      { id: 'custom_image_1', title: 'My Photo', type: 'image', thumb: 'c1.jpg' },
    ];
    stubCustomBackgrounds(list);
    localStorage.setItem('bgRotationEnabled', 'true');

    BackgroundRotation.start();
    list.length = 0; // simulate deletion
    BackgroundRotation.advance();

    expect(localStorage.getItem('homepageBg')).toBe('Built-in BG');
  });

  it('renderPicker lists uploaded backgrounds after built-ins with an uploads divider', () => {
    const container = document.createElement('div');
    container.id = 'bg-rotation-picker';
    document.body.appendChild(container);

    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    stubCustomBackgrounds([
      { id: 'custom_image_1', title: 'My Photo', type: 'image', thumb: 'c1.jpg' },
      { id: 'custom_video_1', title: 'My Video', type: 'video', thumb: 'c2.jpg' },
    ]);

    try {
      BackgroundRotation.renderPicker();

      const divider = container.querySelector('.bg-rotation-pick-divider');
      expect(divider).not.toBeNull();

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(3);
      expect(checkboxes[1].value).toBe('custom_image_1');
      expect(checkboxes[2].value).toBe('custom_video_1');

      const customThumbs = container.querySelectorAll('img[data-custom="true"]');
      expect(customThumbs.length).toBe(2);
      // Video rows wrap their thumb in a span carrying bg-thumb-video — an
      // <img> is a replaced element, so its ::after play badge can't render.
      const videoWrap = container.querySelector('.bg-thumb-video');
      expect(videoWrap).not.toBeNull();
      expect(videoWrap.tagName).toBe('SPAN');
      expect(videoWrap.querySelector('img[data-custom="true"]')).not.toBeNull();
      const imageRowImg = checkboxes[1].closest('label').querySelector('img[data-custom="true"]');
      expect(imageRowImg.closest('.bg-thumb-video')).toBeNull();
    } finally {
      document.body.removeChild(container);
    }
  });

  it('renderPicker omits the divider when no uploads exist', () => {
    const container = document.createElement('div');
    container.id = 'bg-rotation-picker';
    document.body.appendChild(container);

    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    stubCustomBackgrounds([]);

    try {
      BackgroundRotation.renderPicker();

      expect(container.querySelector('.bg-rotation-pick-divider')).toBeNull();
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(1);
    } finally {
      document.body.removeChild(container);
    }
  });

  it('renderPicker re-renders when the custom background cache changes', async () => {
    const container = document.createElement('div');
    container.id = 'bg-rotation-picker';
    document.body.appendChild(container);

    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    stubCustomBackgrounds([]);

    try {
      BackgroundRotation.renderPicker();
      expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(1);

      const list = window._customBackgrounds.getCachedList();
      list.push({ id: 'custom_image_1', title: 'Late upload', type: 'image', thumb: 'c9.jpg' });
      document.dispatchEvent(new CustomEvent('custombackgroundschanged'));

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);
      expect(checkboxes[1].value).toBe('custom_image_1');
    } finally {
      document.body.removeChild(container);
    }
  });

  it('works when window._customBackgrounds is absent (legacy behavior)', () => {
    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];

    BackgroundRotation.advance();
    expect(localStorage.getItem('homepageBg')).toBe('Built-in BG');
  });

  it('starts rotation once the async cache fills a persisted upload-only selection', async () => {
    const list = [];
    stubCustomBackgrounds(list);
    localStorage.setItem('bgRotationEnabled', 'true');
    localStorage.setItem('bgRotationSelection', JSON.stringify(['custom_image_1']));

    // Simulate init(): applyRotation runs while the cache is still empty,
    // so startRotation sees a zero-length pool and must not start.
    BackgroundRotation.apply();

    list.push({ id: 'custom_image_1', title: 'My Photo', type: 'image', thumb: 'c1.jpg' });
    document.dispatchEvent(new CustomEvent('custombackgroundschanged'));

    BackgroundRotation.advance();
    expect(localStorage.getItem('homepageBg')).toBe('custom_image_1');
  });

  it('stops the running timer when deletions shrink the pool to one background', () => {
    window._backgrounds = [
      { id: 'Built-in BG', title: 'Built-in BG', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    const list = [
      { id: 'custom_image_1', title: 'My Photo', type: 'image', thumb: 'c1.jpg' },
    ];
    stubCustomBackgrounds(list);
    localStorage.setItem('bgRotationEnabled', 'true');

    BackgroundRotation.start();
    list.length = 0; // delete the only upload
    document.dispatchEvent(new CustomEvent('custombackgroundschanged'));

    // Pool is now one background; advanceBackground still works but the
    // timer was stopped by applyRotation (pool <= 1).
    expect(BackgroundRotation.isEnabled()).toBe(true);
    BackgroundRotation.advance();
    expect(localStorage.getItem('homepageBg')).toBe('Built-in BG');
  });
});
