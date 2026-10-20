import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/games/shared.js');
});

beforeEach(() => {
  localStorage.clear();
  document.querySelectorAll('.games-ready-overlay').forEach(el => el.remove());
});

describe('gamesHelpers.createReadyScreen', () => {
  function makeParent() {
    const parent = document.createElement('div');
    parent.style.position = 'relative';
    document.body.appendChild(parent);
    return parent;
  }

  it('returns null when there is no parent element', () => {
    expect(window.gamesHelpers.createReadyScreen(null, {})).toBeNull();
  });

  it('renders an accessible ready overlay with text, instruction, and a Start button', () => {
    const parent = makeParent();
    const screen = window.gamesHelpers.createReadyScreen(parent, {
      text: 'Ready?',
      sub: 'Press Space or tap to start',
      buttonText: 'Start',
      onStart: () => {}
    });

    const overlay = parent.querySelector('.games-ready-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.querySelector('.games-ready-text').textContent).toBe('Ready?');
    expect(overlay.querySelector('.games-ready-sub').textContent).toBe('Press Space or tap to start');
    expect(overlay.querySelector('.games-ready-start').textContent).toBe('Start');

    screen.remove();
    parent.remove();
  });

  it('starts when the player presses Space', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    window.gamesHelpers.createReadyScreen(parent, { onStart });

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(parent.querySelector('.games-ready-overlay')).toBeNull();
    parent.remove();
  });

  it('does not start on unrelated keys', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    const screen = window.gamesHelpers.createReadyScreen(parent, { onStart });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));

    expect(onStart).not.toHaveBeenCalled();
    expect(parent.querySelector('.games-ready-overlay')).not.toBeNull();
    screen.remove();
    parent.remove();
  });

  it('starts when the Start button is clicked', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    window.gamesHelpers.createReadyScreen(parent, { onStart });

    parent.querySelector('.games-ready-start').click();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(parent.querySelector('.games-ready-overlay')).toBeNull();
    parent.remove();
  });

  it('ignores Space typed into an input or textarea', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    const screen = window.gamesHelpers.createReadyScreen(parent, { onStart });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));

    expect(onStart).not.toHaveBeenCalled();
    expect(parent.querySelector('.games-ready-overlay')).not.toBeNull();
    input.remove();
    screen.remove();
    parent.remove();
  });

  it('remove() tears down without starting', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    const screen = window.gamesHelpers.createReadyScreen(parent, { onStart });

    screen.remove();

    expect(parent.querySelector('.games-ready-overlay')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(onStart).not.toHaveBeenCalled();
    parent.remove();
  });

  it('start() is idempotent', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    const screen = window.gamesHelpers.createReadyScreen(parent, { onStart });

    screen.start();
    screen.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(parent.querySelector('.games-ready-overlay')).toBeNull();
    parent.remove();
  });

  it('traps Tab focus inside the overlay', () => {
    const parent = makeParent();
    const onStart = vi.fn();
    const screen = window.gamesHelpers.createReadyScreen(parent, { onStart });

    const button = parent.querySelector('.games-ready-start');
    button.focus();

    // Tab away from the only focusable element cycles back to it instead of
    // escaping into the board behind the overlay.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(button);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(button);

    screen.remove();
    parent.remove();
  });

  it('restores focus to the previously focused element on remove()', () => {
    const parent = makeParent();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();

    const onStart = vi.fn();
    const screen = window.gamesHelpers.createReadyScreen(parent, { onStart });
    expect(document.activeElement).not.toBe(other);

    screen.remove();
    expect(document.activeElement).toBe(other);

    other.remove();
    parent.remove();
  });
});

describe('gamesHelpers.parseDirection (#876)', () => {
  it('resolves arrows and WASD via e.code so steering is layout-independent', () => {
    const parse = window.gamesHelpers.parseDirection;
    expect(parse({ code: 'ArrowUp', key: 'ArrowUp' })).toBe('up');
    expect(parse({ code: 'ArrowDown', key: 'ArrowDown' })).toBe('down');
    expect(parse({ code: 'ArrowLeft', key: 'ArrowLeft' })).toBe('left');
    expect(parse({ code: 'ArrowRight', key: 'ArrowRight' })).toBe('right');
    expect(parse({ code: 'KeyW' })).toBe('up');
    expect(parse({ code: 'KeyS' })).toBe('down');
    expect(parse({ code: 'KeyA' })).toBe('left');
    expect(parse({ code: 'KeyD' })).toBe('right');
    // The physical code wins over a layout-specific key label (e.g. KeyW is
    // the "Z" key on AZERTY but must still steer up).
    expect(parse({ code: 'KeyW', key: 'z' })).toBe('up');
    expect(parse({ code: 'ArrowUp', key: 'NoBody' })).toBe('up');
  });

  it('falls back to e.key when e.code is missing (synthetic events)', () => {
    const parse = window.gamesHelpers.parseDirection;
    expect(parse({ key: 'ArrowLeft', code: '' })).toBe('left');
    expect(parse({ key: 'w' })).toBe('up');
    expect(parse({ key: 'D' })).toBe('right');
    expect(parse({ key: 's' })).toBe('down');
  });

  it('returns null for non-direction keys and missing events', () => {
    const parse = window.gamesHelpers.parseDirection;
    expect(parse({ code: 'Space', key: ' ' })).toBeNull();
    expect(parse({ code: 'Enter', key: 'Enter' })).toBeNull();
    expect(parse({ code: 'KeyQ', key: 'q' })).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse(undefined)).toBeNull();
  });
});

describe('gamesHelpers.shouldIgnoreKey (#876)', () => {
  it('filters OS key auto-repeat', () => {
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: true, target: document.body })).toBe(true);
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, target: document.body })).toBe(false);
  });

  it('filters modified shortcuts so Ctrl/Cmd/Alt combos stay with the browser', () => {
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, ctrlKey: true, target: document.body })).toBe(true);
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, metaKey: true, target: document.body })).toBe(true);
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, altKey: true, target: document.body })).toBe(true);
  });

  it('filters keys typed into editable targets', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');
    div.isContentEditable = true;
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, target: input })).toBe(true);
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, target: textarea })).toBe(true);
    expect(window.gamesHelpers.shouldIgnoreKey({ repeat: false, target: div })).toBe(true);
  });

  it('treats a missing event as ignorable', () => {
    expect(window.gamesHelpers.shouldIgnoreKey(null)).toBe(true);
    expect(window.gamesHelpers.shouldIgnoreKey(undefined)).toBe(true);
  });
});
