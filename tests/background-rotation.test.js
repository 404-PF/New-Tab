import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { injectScript } from './helpers/inject-script.js';
import { failStorageWritesFor, flushDeferredFailureSync } from './helpers/storage-write-failures.js';

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

  it('getSelection preserves an empty array as an explicit empty selection', () => {
    localStorage.setItem('bgRotationSelection', '[]');
    expect(BackgroundRotation.getSelection()).toEqual([]);
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
        false,
        false
      );
    } finally {
      BackgroundRotation.stop();
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });

  it('does not start a timer or advance when the stored selection is empty', () => {
    localStorage.setItem('bgRotationSelection', '[]');
    const OriginalVisibilityInterval = window.VisibilityInterval;
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    window.VisibilityInterval = VisibilityIntervalMock;
    window.applyBg = vi.fn();

    try {
      BackgroundRotation.start();
      expect(VisibilityIntervalMock).not.toHaveBeenCalled();

      BackgroundRotation.advance();
      expect(localStorage.getItem('homepageBg')).toBeNull();
      expect(window.applyBg).not.toHaveBeenCalled();
    } finally {
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });

  it('does not rotate on visibility resume, only after the configured interval', () => {
    vi.useFakeTimers();

    const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    window.applyBg = vi.fn();

    try {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      BackgroundRotation.start();

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(window.applyBg).not.toHaveBeenCalled();

      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // Returning to the tab must not advance the background immediately.
      expect(window.applyBg).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(window.applyBg).not.toHaveBeenCalled();

      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(window.applyBg).toHaveBeenCalledOnce();
    } finally {
      BackgroundRotation.stop();

      if (originalHiddenDescriptor) {
        Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
      } else {
        delete document.hidden;
      }
      vi.useRealTimers();
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

describe('Background rotation overlay', () => {
  it('reapplies overlay settings after applyBg', () => {
    window._backgrounds = [
      { id: 'Test BG 1', title: 'Test BG 1', thumb: 'thumb1.jpg', url: 'img1.jpg' },
      { id: 'Test BG 2', title: 'Test BG 2', thumb: 'thumb2.jpg', url: 'img2.jpg' },
    ];
    const order = [];
    window.applyBg = vi.fn(() => { order.push('applyBg'); });
    window.applyBgOverlaySettings = vi.fn(() => { order.push('overlay'); });

    try {
      BackgroundRotation.advance();
      expect(order).toEqual(['applyBg', 'overlay']);
    } finally {
      delete window.applyBgOverlaySettings;
    }
  });
});

describe('Background rotation save failures', () => {
  const SAVE_ERROR_MESSAGE = 'Failed to save background rotation settings. Your last action was not saved.';

  let toggle;
  let intervalSelect;
  let optionsEl;
  let pickerWrap;
  let pickerContainer;
  let showToast;

  let restoreStorageSet = null;

  function failWritesFor(key, mode = 'sync') {
    restoreStorageSet = failStorageWritesFor(key, mode);
  }

  beforeEach(() => {
    window._backgrounds = [
      { id: 'BG Alpha', title: 'BG Alpha', thumb: 'a.jpg', url: 'a-full.jpg' },
      { id: 'BG Beta', title: 'BG Beta', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    localStorage.setItem('bgRotationEnabled', 'false');
    localStorage.setItem('bgRotationInterval', '30min');
    localStorage.removeItem('bgRotationSelection');

    optionsEl = document.createElement('div');
    optionsEl.id = 'bg-rotation-options';
    pickerWrap = document.createElement('div');
    pickerWrap.id = 'bg-rotation-picker-wrap';
    toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'bg-rotation-toggle';
    intervalSelect = document.createElement('select');
    intervalSelect.id = 'bg-rotation-interval';
    ['5min', '15min', '30min', '1hour', 'hourly', 'daily'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      intervalSelect.appendChild(option);
    });
    pickerContainer = document.createElement('div');
    pickerContainer.id = 'bg-rotation-picker';
    document.body.append(optionsEl, pickerWrap, toggle, intervalSelect, pickerContainer);

    showToast = vi.fn();
    window.showToast = showToast;

    BackgroundRotation.initUI();
  });

  afterEach(async () => {
    // Let deferred failure handlers from this test run before teardown so
    // they cannot fire during the next test.
    await flushDeferredFailureSync();
    [optionsEl, pickerWrap, toggle, intervalSelect, pickerContainer].forEach((el) => {
      if (el) el.remove();
    });
    delete window.showToast;
    if (restoreStorageSet) {
      restoreStorageSet();
      restoreStorageSet = null;
    }
  });

  it('persists and applies a successful enable toggle without error feedback', () => {
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('bgRotationEnabled')).toBe('true');
    expect(BackgroundRotation.isEnabled()).toBe(true);
    expect(optionsEl.hidden).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('reverts the toggle and shows feedback when the enable write fails', () => {
    failWritesFor('bgRotationEnabled');

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(BackgroundRotation.isEnabled()).toBe(false);
    expect(toggle.checked).toBe(false);
    expect(optionsEl.hidden).toBe(true);
    expect(pickerWrap.hidden).toBe(true);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('shows exactly one toast and restarts once for a sync bridge failure', async () => {
    const OriginalVisibilityInterval = window.VisibilityInterval;
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    localStorage.setItem('bgRotationEnabled', 'true');
    toggle.checked = true;
    window.VisibilityInterval = VisibilityIntervalMock;
    failWritesFor('bgRotationInterval');

    try {
      intervalSelect.value = '5min';
      intervalSelect.dispatchEvent(new Event('change'));
      await flushDeferredFailureSync();

      expect(intervalSelect.value).toBe('30min');
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(VisibilityIntervalMock).toHaveBeenCalledTimes(1);
    } finally {
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });

  it('does not start the rotation timer when the enable write fails', () => {
    const OriginalVisibilityInterval = window.VisibilityInterval;
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    window.VisibilityInterval = VisibilityIntervalMock;
    failWritesFor('bgRotationEnabled');

    try {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(VisibilityIntervalMock).not.toHaveBeenCalled();
    } finally {
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });

  it('reverts the interval select and keeps persisted cadence when the interval write fails', () => {
    localStorage.setItem('bgRotationEnabled', 'true');
    intervalSelect.value = '30min';
    failWritesFor('bgRotationInterval');

    intervalSelect.value = '5min';
    intervalSelect.dispatchEvent(new Event('change'));

    expect(BackgroundRotation.getInterval()).toBe('30min');
    expect(intervalSelect.value).toBe('30min');
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('rolls the interval back with one toast after an async bridge failure', async () => {
    localStorage.setItem('bgRotationEnabled', 'true');
    toggle.checked = true;
    failWritesFor('bgRotationInterval', 'async');

    intervalSelect.value = '5min';
    intervalSelect.dispatchEvent(new Event('change'));
    expect(showToast).not.toHaveBeenCalled();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(BackgroundRotation.getInterval()).toBe('30min');
    expect(intervalSelect.value).toBe('30min');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('restores picker checkboxes when the selection write fails', () => {
    localStorage.setItem('bgRotationSelection', JSON.stringify(['BG Alpha']));
    BackgroundRotation.renderPicker();

    const checkboxes = pickerContainer.querySelectorAll('input[type="checkbox"]');
    const betaCheckbox = checkboxes[1];
    betaCheckbox.checked = true;
    failWritesFor('bgRotationSelection');

    betaCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(BackgroundRotation.getSelection()).toEqual(['BG Alpha']);
    const restored = pickerContainer.querySelectorAll('input[type="checkbox"]');
    expect(restored[0].checked).toBe(true);
    expect(restored[1].checked).toBe(false);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('restores the picker with one toast after an async selection failure', async () => {
    localStorage.setItem('bgRotationSelection', JSON.stringify(['BG Alpha']));
    BackgroundRotation.renderPicker();
    failWritesFor('bgRotationSelection', 'async');

    const betaCheckbox = pickerContainer.querySelectorAll('input[type="checkbox"]')[1];
    betaCheckbox.checked = true;
    betaCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(BackgroundRotation.getSelection()).toEqual(['BG Alpha']);
    const restored = pickerContainer.querySelectorAll('input[type="checkbox"]');
    expect(restored[0].checked).toBe(true);
    expect(restored[1].checked).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('stays silent when a bridge error arrives but nothing was rolled back', async () => {
    const OriginalVisibilityInterval = window.VisibilityInterval;
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    localStorage.setItem('bgRotationEnabled', 'true');
    toggle.checked = true;
    window.VisibilityInterval = VisibilityIntervalMock;

    try {
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
        detail: { key: 'bgRotationInterval', message: 'superseded' },
      }));
      await flushDeferredFailureSync();

      expect(showToast).not.toHaveBeenCalled();
      expect(VisibilityIntervalMock).not.toHaveBeenCalled();
    } finally {
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });

  it('rolls the toggle back to persisted state after an async bridge write error', async () => {
    localStorage.setItem('bgRotationEnabled', 'true');
    toggle.checked = false;

    window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
      detail: { key: 'bgRotationEnabled', message: 'Failed to persist' },
    }));
    await flushDeferredFailureSync();

    expect(BackgroundRotation.isEnabled()).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });

  it('treats a missing selection as "all backgrounds" when comparing the picker', async () => {
    localStorage.removeItem('bgRotationSelection');
    BackgroundRotation.renderPicker();
    const checkboxes = pickerContainer.querySelectorAll('input[type="checkbox"]');
    expect(Array.from(checkboxes).every((cb) => cb.checked)).toBe(true);

    const raiseSelectionError = async () => {
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
        detail: { key: 'bgRotationSelection', message: 'Failed to persist' },
      }));
      await flushDeferredFailureSync();
    };

    // Picker matches storage (everything selected): nothing to roll back.
    await raiseSelectionError();
    expect(showToast).not.toHaveBeenCalled();

    // Picker is ahead of storage: resync to all-checked and report once.
    checkboxes[1].checked = false;
    await raiseSelectionError();
    expect(showToast).toHaveBeenCalledTimes(1);
    const restored = pickerContainer.querySelectorAll('input[type="checkbox"]');
    expect(Array.from(restored).every((cb) => cb.checked)).toBe(true);
  });

  it('treats an empty saved selection as "none selected" when comparing the picker', async () => {
    localStorage.setItem('bgRotationSelection', '[]');
    BackgroundRotation.renderPicker();
    const checkboxes = pickerContainer.querySelectorAll('input[type="checkbox"]');
    expect(Array.from(checkboxes).every((cb) => !cb.checked)).toBe(true);

    const raiseSelectionError = async () => {
      window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
        detail: { key: 'bgRotationSelection', message: 'Failed to persist' },
      }));
      await flushDeferredFailureSync();
    };

    // Picker matches storage (everything unselected): nothing to roll back.
    await raiseSelectionError();
    expect(showToast).not.toHaveBeenCalled();

    // Picker is ahead of storage: resync to all-unchecked and report once.
    checkboxes[1].checked = true;
    await raiseSelectionError();
    expect(showToast).toHaveBeenCalledTimes(1);
    const restored = pickerContainer.querySelectorAll('input[type="checkbox"]');
    expect(Array.from(restored).every((cb) => !cb.checked)).toBe(true);
  });

  it('ignores bridge write errors for unrelated keys', async () => {
    window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
      detail: { key: 'theme' },
    }));
    window.dispatchEvent(new CustomEvent('storageBridgeWriteError'));
    await flushDeferredFailureSync();

    expect(showToast).not.toHaveBeenCalled();
  });

  it('rolls the pool back and toasts once when the homepageBg write fails synchronously', async () => {
    BackgroundRotation.advance();
    const first = localStorage.getItem('homepageBg');

    failWritesFor('homepageBg', 'sync');
    BackgroundRotation.advance();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('homepageBg')).toBe(first);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    expect(showToast).toHaveBeenCalledTimes(1);

    restoreStorageSet();
    restoreStorageSet = null;
    BackgroundRotation.advance();
    const second = localStorage.getItem('homepageBg');
    expect(second).not.toBe(first);
  });

  it('rolls the pool back and toasts once after an async homepageBg bridge failure', async () => {
    BackgroundRotation.advance();
    const first = localStorage.getItem('homepageBg');

    failWritesFor('homepageBg', 'async');
    BackgroundRotation.advance();
    restoreStorageSet();
    restoreStorageSet = null;

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('homepageBg')).toBe(first);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    expect(showToast).toHaveBeenCalledTimes(1);

    BackgroundRotation.advance();
    const second = localStorage.getItem('homepageBg');
    expect(second).not.toBe(first);
  });

  it('does not rewind the pool when a non-rotation homepageBg write fails', async () => {
    BackgroundRotation.advance();
    const first = localStorage.getItem('homepageBg');

    failWritesFor('homepageBg', 'async');
    // Simulate the settings page (or an import) writing a different
    // background: the failure must not rewind the rotation pool.
    localStorage.setItem('homepageBg', 'Some Other BG');
    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(showToast).not.toHaveBeenCalled();

    restoreStorageSet();
    restoreStorageSet = null;
    BackgroundRotation.advance();
    const second = localStorage.getItem('homepageBg');
    expect(second).not.toBe(first);
  });

  it('does not rewind the pool when a later write of the same background fails', async () => {
    BackgroundRotation.advance();
    const first = localStorage.getItem('homepageBg');

    failWritesFor('homepageBg', 'async');
    // The settings page (or an import) re-writes the background the advance
    // already persisted: its failure must not be misattributed to the still
    // armed pending advance, even though the value matches.
    localStorage.setItem('homepageBg', first);
    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(showToast).not.toHaveBeenCalled();

    restoreStorageSet();
    restoreStorageSet = null;
    BackgroundRotation.advance();
    const second = localStorage.getItem('homepageBg');
    expect(second).not.toBe(first);
  });

  it('still repaints and toasts when a pending homepageBg write fails after rotation stops', async () => {
    window.applyBg = vi.fn();
    BackgroundRotation.advance();
    const first = localStorage.getItem('homepageBg');

    failWritesFor('homepageBg', 'async');
    BackgroundRotation.advance();
    // Stopping the timer must not drop the in-flight write record: the
    // deferred failure still has to repaint the rolled-back background.
    BackgroundRotation.stop();
    restoreStorageSet();
    restoreStorageSet = null;
    window.applyBg.mockClear();
    showToast.mockClear();

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();

    expect(localStorage.getItem('homepageBg')).toBe(first);
    expect(window.applyBg).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe('Background rotation UI sync exposure (issue #1080)', () => {
  let toggle;
  let intervalSelect;
  let optionsEl;
  let pickerWrap;
  let picker;

  beforeEach(() => {
    window._backgrounds = [
      { id: 'BG Alpha', title: 'BG Alpha', thumb: 'a.jpg', url: 'a-full.jpg' },
      { id: 'BG Beta', title: 'BG Beta', thumb: 'b.jpg', url: 'b-full.jpg' },
    ];
    localStorage.setItem('bgRotationEnabled', 'true');
    localStorage.setItem('bgRotationInterval', '1hour');
    localStorage.setItem('bgRotationSelection', JSON.stringify(['BG Alpha']));

    optionsEl = document.createElement('div');
    optionsEl.id = 'bg-rotation-options';
    pickerWrap = document.createElement('div');
    pickerWrap.id = 'bg-rotation-picker-wrap';
    picker = document.createElement('div');
    picker.id = 'bg-rotation-picker';
    pickerWrap.appendChild(picker);
    toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'bg-rotation-toggle';
    intervalSelect = document.createElement('select');
    intervalSelect.id = 'bg-rotation-interval';
    ['5min', '15min', '30min', '1hour', 'hourly', 'daily'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      intervalSelect.appendChild(option);
    });
    document.body.append(optionsEl, pickerWrap, toggle, intervalSelect);

    // Controls start out of sync with storage, as after a settings import.
    toggle.checked = false;
    optionsEl.hidden = true;
    pickerWrap.hidden = true;
    intervalSelect.value = '30min';
    // Stale picker checkboxes: every background checked, while storage
    // selects only BG Alpha.
    ['BG Alpha', 'BG Beta'].forEach((id) => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = id;
      checkbox.checked = true;
      picker.appendChild(checkbox);
    });
  });

  afterEach(() => {
    [optionsEl, pickerWrap, toggle, intervalSelect].forEach((el) => el.remove());
  });

  it('refreshes the toggle, sections, interval select, and picker from storage', () => {
    expect(typeof BackgroundRotation.syncUI).toBe('function');

    BackgroundRotation.syncUI();

    expect(toggle.checked).toBe(true);
    expect(optionsEl.hidden).toBe(false);
    expect(pickerWrap.hidden).toBe(false);
    expect(intervalSelect.value).toBe('1hour');

    const checkedIds = Array.from(picker.querySelectorAll('input[type="checkbox"]'))
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    expect(checkedIds).toEqual(['BG Alpha']);
  });

  it('does not re-bind control listeners when called repeatedly', () => {
    const addListener = vi.spyOn(toggle, 'addEventListener');

    BackgroundRotation.syncUI();
    BackgroundRotation.syncUI();

    expect(addListener).not.toHaveBeenCalled();
  });
});

describe('Background rotation "Every new tab" cadence (issue #1173)', () => {
  // Each test re-injects the module so its IIFE and init() run again —
  // exactly what a fresh new-tab document load does. The instance from
  // the previous injection is stopped in afterEach so no timer from it
  // can outlive the test; its leftover window/document listeners stay
  // inert because these tests never dispatch the events they handle
  // beyond the rollback path asserted below (whose deferred handlers
  // find the UI already resynced and return silently).
  let previousRotation;
  let OriginalVisibilityInterval;
  let VisibilityIntervalMock;
  let applyBg;
  let intervalSelect;
  let restoreWrites = null;

  beforeEach(() => {
    localStorage.setItem('bgRotationEnabled', 'true');
    localStorage.setItem('bgRotationInterval', 'newtab');
    localStorage.removeItem('bgRotationSelection');
    window._backgrounds = [
      { id: 'Test BG 1', title: 'Test BG 1', thumb: 'thumb1.jpg', url: 'img1.jpg' },
      { id: 'Test BG 2', title: 'Test BG 2', thumb: 'thumb2.jpg', url: 'img2.jpg' },
    ];
    applyBg = vi.fn();
    window.applyBg = applyBg;
    OriginalVisibilityInterval = window.VisibilityInterval;
    VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    window.VisibilityInterval = VisibilityIntervalMock;
    previousRotation = window.BackgroundRotation;
    injectScript('src/features/background-rotation.js');
  });

  afterEach(async () => {
    // Settle deferred bridge-failure handlers while every instance is
    // still listening so they cannot fire during a later test.
    await flushDeferredFailureSync();
    BackgroundRotation.stop();
    if (previousRotation) previousRotation.stop();
    window.VisibilityInterval = OriginalVisibilityInterval;
    if (intervalSelect) {
      intervalSelect.remove();
      intervalSelect = null;
    }
    if (restoreWrites) {
      restoreWrites();
      restoreWrites = null;
    }
    delete window.showToast;
  });

  function createIntervalSelect() {
    intervalSelect = document.createElement('select');
    intervalSelect.id = 'bg-rotation-interval';
    ['5min', '15min', '30min', '1hour', 'hourly', 'daily', 'newtab'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      intervalSelect.appendChild(option);
    });
    document.body.appendChild(intervalSelect);
    return intervalSelect;
  }

  it('advances the pool exactly once on a fresh load and repaints', () => {
    expect(applyBg).toHaveBeenCalledTimes(1);
    expect(['Test BG 1', 'Test BG 2']).toContain(localStorage.getItem('homepageBg'));
  });

  it('advances past the background left on screen by the previous tab', () => {
    // Simulate the next fresh document: the pool's shuffled head may land
    // on the background already shown, which would not visibly advance.
    localStorage.setItem('homepageBg', 'Test BG 1');
    injectScript('src/features/background-rotation.js');

    expect(localStorage.getItem('homepageBg')).toBe('Test BG 2');
  });

  it('defers the load advance until an upload-only selection resolves', () => {
    const uploads = [];
    window._customBackgrounds = {
      isCustom: (id) => typeof id === 'string' && id.startsWith('custom_'),
      getCachedList: () => uploads,
      refresh: () => Promise.resolve(uploads),
    };
    localStorage.setItem('bgRotationSelection', JSON.stringify(['custom_image_1', 'custom_image_2']));
    const before = localStorage.getItem('homepageBg');
    injectScript('src/features/background-rotation.js');

    try {
      // The custom-background cache is still empty, so the load advance
      // must wait instead of consuming its one chance for this document.
      expect(localStorage.getItem('homepageBg')).toBe(before);

      uploads.push(
        { id: 'custom_image_1', title: 'Photo', type: 'image', thumb: 'c1.jpg' },
        { id: 'custom_image_2', title: 'Shot', type: 'image', thumb: 'c2.jpg' }
      );
      document.dispatchEvent(new CustomEvent('custombackgroundschanged'));

      expect(['custom_image_1', 'custom_image_2']).toContain(localStorage.getItem('homepageBg'));
    } finally {
      delete window._customBackgrounds;
    }
  });

  it('arms no timer for the newtab cadence', () => {
    // The load path itself must not have constructed one either.
    expect(VisibilityIntervalMock).not.toHaveBeenCalled();

    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    try {
      BackgroundRotation.start();

      expect(VisibilityIntervalMock).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });

  it('does not advance on settings changes or an import-style re-apply', () => {
    const before = localStorage.getItem('homepageBg');

    BackgroundRotation.start();
    BackgroundRotation.apply();
    BackgroundRotation.syncUI();

    expect(applyBg).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('homepageBg')).toBe(before);
  });

  it('does not advance when the interval is re-selected through the UI handler', () => {
    const select = createIntervalSelect();
    // Start from another cadence so the handler really transitions into
    // 'newtab' instead of re-saving the value already stored.
    localStorage.setItem('bgRotationInterval', '30min');
    select.value = '30min';
    BackgroundRotation.initUI();
    const before = localStorage.getItem('homepageBg');

    select.value = 'newtab';
    select.dispatchEvent(new Event('change'));

    expect(applyBg).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('homepageBg')).toBe(before);
    expect(VisibilityIntervalMock).not.toHaveBeenCalled();
  });

  it('never advances on focus, visibilitychange, or pageshow (#788)', () => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));

    expect(applyBg).toHaveBeenCalledTimes(1);
  });

  it('syncs the interval select to the stored newtab value', () => {
    const select = createIntervalSelect();
    select.value = '30min';

    BackgroundRotation.syncUI();

    expect(select.value).toBe('newtab');
  });

  it('rolls the interval select back to newtab when the write fails', () => {
    const select = createIntervalSelect();
    BackgroundRotation.initUI();
    window.showToast = vi.fn();
    restoreWrites = failStorageWritesFor('bgRotationInterval');

    select.value = '5min';
    select.dispatchEvent(new Event('change'));

    expect(BackgroundRotation.getInterval()).toBe('newtab');
    expect(select.value).toBe('newtab');
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(applyBg).toHaveBeenCalledTimes(1);
  });

  it('offers the newtab option in the interval select markup', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');

    expect(html).toMatch(
      /<option value="newtab" data-i18n="bgRotationNewtab">Every new tab<\/option>/
    );
  });
});

describe('Background rotation "Time of day" cadence (issue #1234)', () => {
  let applyBg;
  let OriginalVisibilityInterval;
  let VisibilityIntervalMock;

  beforeEach(() => {
    localStorage.setItem('bgRotationEnabled', 'true');
    localStorage.setItem('bgRotationInterval', 'tod');
    localStorage.setItem('bgRotationDayTime', '07:00');
    localStorage.setItem('bgRotationNightTime', '19:00');
    localStorage.setItem('bgRotationDaySelection', JSON.stringify(['Day BG 1', 'Day BG 2']));
    localStorage.setItem('bgRotationNightSelection', JSON.stringify(['Night BG 1', 'Night BG 2']));
    localStorage.removeItem('bgRotationSelection');
    localStorage.removeItem('homepageBg');
    window._backgrounds = [
      { id: 'Day BG 1', title: 'Day BG 1', thumb: 'd1.jpg', url: 'd1-full.jpg' },
      { id: 'Day BG 2', title: 'Day BG 2', thumb: 'd2.jpg', url: 'd2-full.jpg' },
      { id: 'Night BG 1', title: 'Night BG 1', thumb: 'n1.jpg', url: 'n1-full.jpg' },
      { id: 'Night BG 2', title: 'Night BG 2', thumb: 'n2.jpg', url: 'n2-full.jpg' },
    ];
    applyBg = vi.fn();
    window.applyBg = applyBg;
    OriginalVisibilityInterval = window.VisibilityInterval;
    VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    window.VisibilityInterval = VisibilityIntervalMock;
  });

  afterEach(() => {
    BackgroundRotation.stop();
    window.VisibilityInterval = OriginalVisibilityInterval;
    vi.useRealTimers();
  });

  function fakeTime(year, month, day, hours, minutes) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(year, month, day, hours, minutes, 0, 0));
  }

  it('defaults to a 07:00 day boundary and a 19:00 night boundary', () => {
    localStorage.removeItem('bgRotationDayTime');
    localStorage.removeItem('bgRotationNightTime');

    expect(BackgroundRotation.getDayTime()).toBe('07:00');
    expect(BackgroundRotation.getNightTime()).toBe('19:00');
  });

  it('reads custom boundaries and side selections from storage', () => {
    localStorage.setItem('bgRotationDayTime', '08:30');
    localStorage.setItem('bgRotationNightTime', '21:15');
    localStorage.setItem('bgRotationDaySelection', JSON.stringify(['Day BG 2']));
    localStorage.setItem('bgRotationNightSelection', JSON.stringify(['Night BG 2']));

    expect(BackgroundRotation.getDayTime()).toBe('08:30');
    expect(BackgroundRotation.getNightTime()).toBe('21:15');
    expect(BackgroundRotation.getDaySelection()).toEqual(['Day BG 2']);
    expect(BackgroundRotation.getNightSelection()).toEqual(['Night BG 2']);
  });

  it('keeps an explicit empty side selection distinct from an unconfigured one', () => {
    localStorage.setItem('bgRotationDaySelection', '[]');
    localStorage.setItem('bgRotationNightSelection', 'not-json');

    expect(BackgroundRotation.getDaySelection()).toEqual([]);
    expect(BackgroundRotation.getNightSelection()).toBeNull();
  });

  it('ships the tod option and schedule controls in New-Tab.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'New-Tab.html'), 'utf8');

    expect(html).toMatch(
      /<option value="tod" data-i18n="bgRotationTod">Time of day<\/option>/
    );
    expect(html).toMatch(/<div id="bg-rotation-tod" hidden>/);
    expect(html).toMatch(/<input type="time" id="bg-rotation-day-time" value="07:00" \/>/);
    expect(html).toMatch(/<input type="time" id="bg-rotation-night-time" value="19:00" \/>/);
    expect(html).toMatch(
      /<div class="bg-rotation-picker" id="bg-rotation-day-picker" role="group" aria-labelledby="bg-rotation-day-picker-label"><\/div>/
    );
    expect(html).toMatch(
      /<div class="bg-rotation-picker" id="bg-rotation-night-picker" role="group" aria-labelledby="bg-rotation-night-picker-label"><\/div>/
    );
  });

  it('applies the active side pool on start and repaints a wrong-side background', () => {
    fakeTime(2026, 0, 5, 12, 0); // noon: inside the 07:00-19:00 day window
    localStorage.setItem('homepageBg', 'Night BG 1');

    BackgroundRotation.start();

    expect(localStorage.getItem('homepageBg')).toMatch(/^Day BG/);
    expect(applyBg).toHaveBeenCalled();
    expect(VisibilityIntervalMock).toHaveBeenCalledWith(expect.any(Function), 30000);
  });

  it('leaves the background untouched when it already belongs to the active side pool', () => {
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Day BG 1');

    BackgroundRotation.start();

    expect(localStorage.getItem('homepageBg')).toBe('Day BG 1');
    expect(applyBg).not.toHaveBeenCalled();
  });

  it('swaps into the night pool exactly once when the schedule crosses night time', () => {
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Day BG 1');
    BackgroundRotation.start();
    const checkTodSide = VisibilityIntervalMock.mock.calls[0][0];
    expect(localStorage.getItem('homepageBg')).toBe('Day BG 1');

    vi.setSystemTime(new Date(2026, 0, 5, 19, 0, 0));
    applyBg.mockClear();
    checkTodSide();

    expect(localStorage.getItem('homepageBg')).toMatch(/^Night BG/);
    expect(applyBg).toHaveBeenCalled();

    // The boundary is consumed: another check at the same side is a no-op.
    applyBg.mockClear();
    checkTodSide();
    expect(localStorage.getItem('homepageBg')).toMatch(/^Night BG/);
    expect(applyBg).not.toHaveBeenCalled();
  });

  it('does not swap while the scheduled side is unchanged', () => {
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Day BG 1');
    BackgroundRotation.start();
    const checkTodSide = VisibilityIntervalMock.mock.calls[0][0];

    vi.setSystemTime(new Date(2026, 0, 5, 15, 0, 0));
    checkTodSide();

    expect(localStorage.getItem('homepageBg')).toBe('Day BG 1');
    expect(applyBg).not.toHaveBeenCalled();
  });

  it('forces the boundary swap off the displayed background when the pools overlap', () => {
    // Both sides rotate the same pool, so a naive boundary advance could
    // redraw the background already on screen.
    localStorage.setItem('bgRotationNightSelection', JSON.stringify(['Day BG 1', 'Day BG 2']));
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Day BG 1');
    BackgroundRotation.start();
    const checkTodSide = VisibilityIntervalMock.mock.calls[0][0];

    vi.setSystemTime(new Date(2026, 0, 5, 19, 0, 0));
    checkTodSide();

    expect(localStorage.getItem('homepageBg')).toBe('Day BG 2');
  });

  it('treats equal day and night boundaries as night', () => {
    localStorage.setItem('bgRotationDayTime', '12:00');
    localStorage.setItem('bgRotationNightTime', '12:00');
    localStorage.setItem('homepageBg', 'Day BG 1');

    BackgroundRotation.start();

    expect(localStorage.getItem('homepageBg')).toMatch(/^Night BG/);
  });

  it('arms the boundary timer when an empty side leaves one background on the other', () => {
    localStorage.setItem('bgRotationDaySelection', '[]');
    localStorage.setItem('bgRotationNightSelection', JSON.stringify(['Night BG 1']));
    localStorage.setItem('homepageBg', 'Some Other BG');

    fakeTime(2026, 0, 5, 12, 0);
    BackgroundRotation.start();
    const checkTodSide = VisibilityIntervalMock.mock.calls[0][0];
    expect(localStorage.getItem('homepageBg')).toBe('Some Other BG');

    vi.setSystemTime(new Date(2026, 0, 5, 19, 0, 0, 0));
    checkTodSide();

    expect(localStorage.getItem('homepageBg')).toBe('Night BG 1');
  });

  it('retries a boundary whose write was rejected instead of consuming it', async () => {
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Day BG 1');
    BackgroundRotation.start();
    const checkTodSide = VisibilityIntervalMock.mock.calls[0][0];

    const restoreWrites = failStorageWritesFor('homepageBg');
    try {
      vi.setSystemTime(new Date(2026, 0, 5, 19, 0, 0, 0));
      checkTodSide();
      expect(localStorage.getItem('homepageBg')).toBe('Day BG 1');
    } finally {
      restoreWrites();
    }
    await flushDeferredFailureSync();

    checkTodSide();
    expect(localStorage.getItem('homepageBg')).toMatch(/^Night BG/);
  });

  it('arms no boundary timer when the combined pools hold a single background', () => {
    localStorage.setItem('bgRotationDaySelection', JSON.stringify(['Day BG 1']));
    localStorage.setItem('bgRotationNightSelection', JSON.stringify(['Day BG 1']));
    localStorage.setItem('homepageBg', 'Day BG 1');

    BackgroundRotation.start();

    expect(VisibilityIntervalMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('homepageBg')).toBe('Day BG 1');
    expect(applyBg).not.toHaveBeenCalled();
  });

  it('does not arm or apply anything while rotation is disabled', () => {
    localStorage.setItem('bgRotationEnabled', 'false');
    localStorage.setItem('homepageBg', 'Night BG 1');

    BackgroundRotation.start();

    expect(VisibilityIntervalMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('homepageBg')).toBe('Night BG 1');
    expect(applyBg).not.toHaveBeenCalled();
  });

  it('corrects a wrong-side background once on a fresh load', () => {
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Night BG 1');
    const previous = window.BackgroundRotation;

    try {
      injectScript('src/features/background-rotation.js');

      expect(localStorage.getItem('homepageBg')).toMatch(/^Day BG/);
      expect(applyBg).toHaveBeenCalledOnce();
    } finally {
      BackgroundRotation.stop();
      previous.stop();
    }
  });

  it('does not churn homepageBg on a fresh load when the displayed background already matches the side', () => {
    fakeTime(2026, 0, 5, 12, 0);
    localStorage.setItem('homepageBg', 'Day BG 1');
    const previous = window.BackgroundRotation;

    try {
      injectScript('src/features/background-rotation.js');

      expect(localStorage.getItem('homepageBg')).toBe('Day BG 1');
      expect(applyBg).not.toHaveBeenCalled();
    } finally {
      BackgroundRotation.stop();
      previous.stop();
    }
  });
});

describe('Background rotation time-of-day controls (issue #1234)', () => {
  const SAVE_ERROR_MESSAGE = 'Failed to save background rotation settings. Your last action was not saved.';

  let toggle;
  let intervalSelect;
  let optionsEl;
  let pickerWrap;
  let todEl;
  let dayInput;
  let nightInput;
  let dayPicker;
  let nightPicker;
  let showToast;
  let restoreWrites = null;

  beforeEach(() => {
    window._backgrounds = [
      { id: 'Day BG 1', title: 'Day BG 1', thumb: 'd1.jpg', url: 'd1-full.jpg' },
      { id: 'Day BG 2', title: 'Day BG 2', thumb: 'd2.jpg', url: 'd2-full.jpg' },
      { id: 'Night BG 1', title: 'Night BG 1', thumb: 'n1.jpg', url: 'n1-full.jpg' },
      { id: 'Night BG 2', title: 'Night BG 2', thumb: 'n2.jpg', url: 'n2-full.jpg' },
    ];
    localStorage.setItem('bgRotationEnabled', 'true');
    localStorage.setItem('bgRotationInterval', 'tod');
    localStorage.setItem('bgRotationDayTime', '07:00');
    localStorage.setItem('bgRotationNightTime', '19:00');
    localStorage.setItem('bgRotationDaySelection', JSON.stringify(['Day BG 1', 'Day BG 2']));
    localStorage.setItem('bgRotationNightSelection', JSON.stringify(['Night BG 1', 'Night BG 2']));
    localStorage.removeItem('bgRotationSelection');
    localStorage.removeItem('homepageBg');

    optionsEl = document.createElement('div');
    optionsEl.id = 'bg-rotation-options';
    pickerWrap = document.createElement('div');
    pickerWrap.id = 'bg-rotation-picker-wrap';
    const picker = document.createElement('div');
    picker.id = 'bg-rotation-picker';
    pickerWrap.appendChild(picker);
    todEl = document.createElement('div');
    todEl.id = 'bg-rotation-tod';
    todEl.hidden = true;
    dayInput = document.createElement('input');
    dayInput.type = 'time';
    dayInput.id = 'bg-rotation-day-time';
    nightInput = document.createElement('input');
    nightInput.type = 'time';
    nightInput.id = 'bg-rotation-night-time';
    dayPicker = document.createElement('div');
    dayPicker.id = 'bg-rotation-day-picker';
    nightPicker = document.createElement('div');
    nightPicker.id = 'bg-rotation-night-picker';
    todEl.append(dayInput, nightInput, dayPicker, nightPicker);
    toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'bg-rotation-toggle';
    intervalSelect = document.createElement('select');
    intervalSelect.id = 'bg-rotation-interval';
    ['5min', '15min', '30min', '1hour', 'hourly', 'daily', 'newtab', 'tod'].forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      intervalSelect.appendChild(option);
    });
    document.body.append(optionsEl, pickerWrap, todEl, toggle, intervalSelect);

    showToast = vi.fn();
    window.showToast = showToast;

    BackgroundRotation.initUI();
  });

  afterEach(async () => {
    await flushDeferredFailureSync();
    BackgroundRotation.stop();
    [optionsEl, pickerWrap, todEl, toggle, intervalSelect].forEach((el) => {
      if (el) el.remove();
    });
    delete window.showToast;
    if (restoreWrites) {
      restoreWrites();
      restoreWrites = null;
    }
    vi.useRealTimers();
  });

  function checkedValues(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
  }

  it('seeds the schedule controls from storage on init', () => {
    expect(toggle.checked).toBe(true);
    expect(intervalSelect.value).toBe('tod');
    expect(dayInput.value).toBe('07:00');
    expect(nightInput.value).toBe('19:00');
    expect(optionsEl.hidden).toBe(false);
    expect(todEl.hidden).toBe(false);
    expect(pickerWrap.hidden).toBe(true);
  });

  it('shows only the interval controls when the cadence is not time of day', () => {
    localStorage.setItem('bgRotationInterval', '30min');

    BackgroundRotation.syncUI();

    expect(intervalSelect.value).toBe('30min');
    expect(todEl.hidden).toBe(true);
    expect(pickerWrap.hidden).toBe(false);
    expect(optionsEl.hidden).toBe(false);
  });

  it('hides every section while rotation is disabled', () => {
    localStorage.setItem('bgRotationEnabled', 'false');

    BackgroundRotation.syncUI();

    expect(toggle.checked).toBe(false);
    expect(optionsEl.hidden).toBe(true);
    expect(todEl.hidden).toBe(true);
    expect(pickerWrap.hidden).toBe(true);
  });

  it('flips to the schedule section when the interval changes to time of day', () => {
    localStorage.setItem('bgRotationInterval', '30min');
    BackgroundRotation.syncUI();
    expect(todEl.hidden).toBe(true);

    const OriginalVisibilityInterval = window.VisibilityInterval;
    const VisibilityIntervalMock = vi.fn(function () {
      return { destroy: vi.fn() };
    });
    window.VisibilityInterval = VisibilityIntervalMock;
    try {
      intervalSelect.value = 'tod';
      intervalSelect.dispatchEvent(new Event('change'));

      expect(BackgroundRotation.getInterval()).toBe('tod');
      expect(todEl.hidden).toBe(false);
      expect(pickerWrap.hidden).toBe(true);
      expect(VisibilityIntervalMock).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(showToast).not.toHaveBeenCalled();
    } finally {
      BackgroundRotation.stop();
      window.VisibilityInterval = OriginalVisibilityInterval;
    }
  });

  it('persists an edited day boundary and re-evaluates the schedule immediately', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));
    BackgroundRotation.start();
    expect(localStorage.getItem('homepageBg')).toMatch(/^Day BG/);

    // Noon sits inside the stored 07:00-19:00 day window; moving the day
    // boundary to 13:00 pushes the current minute into the night side, so
    // the edit must swap right away instead of waiting for a check tick.
    dayInput.value = '13:00';
    dayInput.dispatchEvent(new Event('change'));

    expect(BackgroundRotation.getDayTime()).toBe('13:00');
    expect(localStorage.getItem('bgRotationDayTime')).toBe('13:00');
    expect(localStorage.getItem('homepageBg')).toMatch(/^Night BG/);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('normalizes a cleared boundary input back to its default before saving', () => {
    localStorage.setItem('bgRotationDayTime', '13:00');
    BackgroundRotation.syncUI();
    expect(dayInput.value).toBe('13:00');

    dayInput.value = '';
    dayInput.dispatchEvent(new Event('change'));

    expect(dayInput.value).toBe('07:00');
    expect(BackgroundRotation.getDayTime()).toBe('07:00');
    expect(localStorage.getItem('bgRotationDayTime')).toBe('07:00');
  });

  it('rolls the day boundary input back and toasts when the write fails', async () => {
    restoreWrites = failStorageWritesFor('bgRotationDayTime');

    dayInput.value = '08:00';
    dayInput.dispatchEvent(new Event('change'));

    expect(BackgroundRotation.getDayTime()).toBe('07:00');
    expect(dayInput.value).toBe('07:00');
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');

    await flushDeferredFailureSync();
    await flushDeferredFailureSync();
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('stays silent when a bridge error reports a boundary that already matches storage', async () => {
    window.dispatchEvent(new CustomEvent('storageBridgeWriteError', {
      detail: { key: 'bgRotationDayTime', message: 'superseded' },
    }));
    await flushDeferredFailureSync();

    expect(showToast).not.toHaveBeenCalled();
  });

  it('renders the day and night pickers from their stored selections', () => {
    BackgroundRotation.renderPicker();

    expect(checkedValues(dayPicker)).toEqual(['Day BG 1', 'Day BG 2']);
    expect(checkedValues(nightPicker)).toEqual(['Night BG 1', 'Night BG 2']);
  });

  it('persists a day-picker edit to the day selection key', () => {
    BackgroundRotation.renderPicker();
    const checkbox = dayPicker.querySelector('input[value="Day BG 2"]');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(BackgroundRotation.getDaySelection()).toEqual(['Day BG 1']);
    expect(localStorage.getItem('bgRotationDaySelection')).toBe(JSON.stringify(['Day BG 1']));
    expect(localStorage.getItem('bgRotationNightSelection')).toBe(JSON.stringify(['Night BG 1', 'Night BG 2']));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('rolls a rejected night-picker edit back to the stored selection', () => {
    BackgroundRotation.renderPicker();
    restoreWrites = failStorageWritesFor('bgRotationNightSelection');
    const checkbox = nightPicker.querySelector('input[value="Night BG 2"]');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(BackgroundRotation.getNightSelection()).toEqual(['Night BG 1', 'Night BG 2']);
    expect(nightPicker.querySelector('input[value="Night BG 2"]').checked).toBe(true);
    expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
  });
});
