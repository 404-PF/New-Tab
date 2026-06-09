import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
