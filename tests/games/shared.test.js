import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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

describe('gamesHelpers.suppressGameKeyScroll (#887)', () => {
  function keydown(init) {
    return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  }

  it('prevents the default for direction keys and Space', () => {
    const arrow = keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    window.gamesHelpers.suppressGameKeyScroll(arrow);
    expect(arrow.defaultPrevented).toBe(true);

    const space = keydown({ key: ' ', code: 'Space' });
    window.gamesHelpers.suppressGameKeyScroll(space);
    expect(space.defaultPrevented).toBe(true);
  });

  it('leaves modified shortcuts and unrelated keys alone', () => {
    const modified = keydown({ key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true });
    window.gamesHelpers.suppressGameKeyScroll(modified);
    expect(modified.defaultPrevented).toBe(false);

    const other = keydown({ key: 'q', code: 'KeyQ' });
    window.gamesHelpers.suppressGameKeyScroll(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('leaves Space alone while a button, link, or role=button is focused', () => {
    const button = document.createElement('button');
    const link = document.createElement('a');
    const roleButton = document.createElement('div');
    roleButton.setAttribute('role', 'button');
    document.body.append(button, link, roleButton);

    const onButton = keydown({ key: ' ', code: 'Space' });
    button.dispatchEvent(onButton);
    expect(onButton.defaultPrevented).toBe(false);

    const onLink = keydown({ key: ' ', code: 'Space' });
    link.dispatchEvent(onLink);
    expect(onLink.defaultPrevented).toBe(false);

    const onRoleButton = keydown({ key: ' ', code: 'Space' });
    roleButton.dispatchEvent(onRoleButton);
    expect(onRoleButton.defaultPrevented).toBe(false);

    button.remove();
    link.remove();
    roleButton.remove();
  });

  it('ignores missing events', () => {
    expect(() => window.gamesHelpers.suppressGameKeyScroll(null)).not.toThrow();
    expect(() => window.gamesHelpers.suppressGameKeyScroll(undefined)).not.toThrow();
  });
});

describe('gamesHelpers.beginGameKeydown (#876/#887)', () => {
  function keydown(init) {
    return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  }

  it('lets a fresh direction key through and swallows its page scroll', () => {
    const e = keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(window.gamesHelpers.beginGameKeydown(e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
  });

  it('drops auto-repeats and modified shortcuts', () => {
    const repeat = keydown({ key: 'ArrowLeft', code: 'ArrowLeft', repeat: true });
    expect(window.gamesHelpers.beginGameKeydown(repeat)).toBe(false);
    // The held key still cannot scroll the page behind the game.
    expect(repeat.defaultPrevented).toBe(true);

    const modified = keydown({ key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true });
    expect(window.gamesHelpers.beginGameKeydown(modified)).toBe(false);
    expect(modified.defaultPrevented).toBe(false);
  });

  it('drops keys typed into editable targets without swallowing their default', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = keydown({ key: 'a', code: 'KeyA' });
    input.dispatchEvent(e);
    expect(window.gamesHelpers.beginGameKeydown(e)).toBe(false);
    input.remove();
  });

  it('leaves Space alone while a button is focused so it stays activatable (#887)', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const e = keydown({ key: ' ', code: 'Space' });
    button.dispatchEvent(e);
    expect(window.gamesHelpers.beginGameKeydown(e)).toBe(true);
    expect(e.defaultPrevented).toBe(false);
    button.remove();
  });
});

describe('gamesHelpers.togglePauseOnSpace (#876)', () => {
  function keydown(init) {
    return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  }

  it('pauses a live run, swallows Space, and reports the key consumed', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const e = keydown({ key: ' ', code: 'Space' });

    expect(window.gamesHelpers.togglePauseOnSpace(e, false, onPause, onResume)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('resumes a manually paused run', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const e = keydown({ key: ' ', code: 'Space' });

    expect(window.gamesHelpers.togglePauseOnSpace(e, true, onPause, onResume)).toBe(true);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onPause).not.toHaveBeenCalled();
  });

  it('leaves non-Space keys to the caller without preventing their default', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const e = keydown({ key: 'w', code: 'KeyW' });

    expect(window.gamesHelpers.togglePauseOnSpace(e, false, onPause, onResume)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });
});
