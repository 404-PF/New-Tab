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
