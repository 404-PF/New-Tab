// tests/simple-mode.test.js
// Verifies that simple mode toggles correctly and emits a shared event.

/* global applySimpleMode, loadSimpleMode */

import { injectScript } from './helpers/inject-script.js';

let origCanPlayType;

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/simple-mode.js');
});

beforeEach(() => {
  localStorage.removeItem('simpleMode');

  // Ensure simple-mode checkbox and search-bar stubs exist in the DOM
  let checkbox = document.getElementById('simple-mode-checkbox');
  if (!checkbox) {
    checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'simple-mode-checkbox';
    document.body.appendChild(checkbox);
  }
  let searchBar = document.querySelector('.search-bar');
  if (!searchBar) {
    searchBar = document.createElement('div');
    searchBar.classList.add('search-bar');
    document.body.appendChild(searchBar);
  }

  // Set up video stub like prefers-reduced-motion.test.js
  const videoEl = document.getElementById('bg-video');
  if (videoEl) {
    if (!videoEl.querySelector('source')) {
      const source = document.createElement('source');
      source.setAttribute('src', '');
      source.setAttribute('type', 'video/mp4');
      videoEl.appendChild(source);
    }
    origCanPlayType = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = () => 'maybe';
  }
});

afterEach(() => {
  if (origCanPlayType) {
    HTMLVideoElement.prototype.canPlayType = origCanPlayType;
    origCanPlayType = null;
  }
  const videoEl = document.getElementById('bg-video');
  if (videoEl) {
    delete videoEl.currentSrc;
    delete videoEl.readyState;
    delete videoEl.dataset.simpleModePaused;
    videoEl.classList.remove('active', 'ready');
  }
});

describe('simple-mode', () => {
  it('loadSimpleMode reads localStorage', () => {
    expect(loadSimpleMode()).toBe(false);
    localStorage.setItem('simpleMode', 'true');
    expect(loadSimpleMode()).toBe(true);
    localStorage.setItem('simpleMode', 'false');
    expect(loadSimpleMode()).toBe(false);
  });

  it('applySimpleMode toggles body class', () => {
    localStorage.setItem('simpleMode', 'true');
    applySimpleMode();
    expect(document.body.classList.contains('simple-mode')).toBe(true);

    localStorage.setItem('simpleMode', 'false');
    applySimpleMode();
    expect(document.body.classList.contains('simple-mode')).toBe(false);
  });

  it('applySimpleMode checks the checkbox', () => {
    const checkbox = document.getElementById('simple-mode-checkbox');

    localStorage.setItem('simpleMode', 'true');
    applySimpleMode();
    expect(checkbox.checked).toBe(true);

    localStorage.setItem('simpleMode', 'false');
    applySimpleMode();
    expect(checkbox.checked).toBe(false);
  });

  it('applySimpleMode toggles search bar visibility', () => {
    const searchBar = document.querySelector('.search-bar');

    localStorage.setItem('simpleMode', 'true');
    applySimpleMode();
    expect(searchBar.classList.contains('visible')).toBe(true);

    localStorage.setItem('simpleMode', 'false');
    applySimpleMode();
    expect(searchBar.classList.contains('visible')).toBe(false);
  });

  it('applySimpleMode emits simpleModeChanged event', () => {
    const spy = vi.fn();
    window.addEventListener('simpleModeChanged', spy);

    localStorage.setItem('simpleMode', 'true');
    applySimpleMode();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].detail).toEqual({ enabled: true });

    spy.mockClear();
    localStorage.setItem('simpleMode', 'false');
    applySimpleMode();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].detail).toEqual({ enabled: false });

    window.removeEventListener('simpleModeChanged', spy);
  });

  it('simpleModeChanged event is a CustomEvent', () => {
    let receivedEvent = null;
    const handler = (e) => { receivedEvent = e; };
    window.addEventListener('simpleModeChanged', handler);

    localStorage.setItem('simpleMode', 'true');
    applySimpleMode();
    expect(receivedEvent).toBeInstanceOf(CustomEvent);
    expect(receivedEvent.type).toBe('simpleModeChanged');

    window.removeEventListener('simpleModeChanged', handler);
  });

  it('pauses video when simple mode is enabled', () => {
    const videoEl = document.getElementById('bg-video');
    Object.defineProperty(videoEl, 'currentSrc', { value: 'https://example.com/video.mp4', configurable: true });
    Object.defineProperty(videoEl, 'readyState', { value: 4, configurable: true });
    const origPaused = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'paused');
    Object.defineProperty(videoEl, 'paused', { value: false, configurable: true });

    const safePauseSpy = vi.fn();
    window.safePause = safePauseSpy;

    localStorage.setItem('simpleMode', 'true');
    applySimpleMode();
    expect(videoEl.dataset.simpleModePaused).toBe('true');
    expect(safePauseSpy).toHaveBeenCalledWith(videoEl);

    if (origPaused) Object.defineProperty(videoEl, 'paused', origPaused);
  });

  it('resumes video when simple mode is disabled and autoplay is on', () => {
    const videoEl = document.getElementById('bg-video');
    Object.defineProperty(videoEl, 'currentSrc', { value: 'https://example.com/video.mp4', configurable: true });
    Object.defineProperty(videoEl, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(videoEl, 'paused', { value: true, configurable: true });
    videoEl.dataset.simpleModePaused = 'true';
    const playSpy = vi.fn().mockResolvedValue(undefined);
    videoEl.play = playSpy;
    window.loadVideoAutoplay = () => true;

    localStorage.setItem('simpleMode', 'false');
    applySimpleMode();
    expect(videoEl.dataset.simpleModePaused).toBe('false');
    expect(playSpy).toHaveBeenCalled();
  });
});
