import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { injectScript } from '../helpers/inject-script.js';
import {
  installGamepadStub,
  removeGamepadStub,
  makeGamepad,
  pressButton,
  releaseButton,
  setStick,
  installFramePump
} from '../helpers/gamepad.js';

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
    expect(e.defaultPrevented).toBe(false);
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

describe('gamesHelpers.beginRealTimeKeydown (#1016)', () => {
  function keydown(init) {
    return new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  }

  it('lets a fresh direction key through and swallows its page scroll', () => {
    const e = keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(window.gamesHelpers.beginRealTimeKeydown(e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
  });

  it('lets an auto-repeated direction key through so a held key keeps steering', () => {
    const e = keydown({ key: 'ArrowLeft', code: 'ArrowLeft', repeat: true });
    expect(window.gamesHelpers.beginRealTimeKeydown(e)).toBe(true);
    // The held key still cannot scroll the page behind the game.
    expect(e.defaultPrevented).toBe(true);
  });

  it('drops an auto-repeated Space so a held Space cannot flicker pause', () => {
    const repeat = keydown({ key: ' ', code: 'Space', repeat: true });
    expect(window.gamesHelpers.beginRealTimeKeydown(repeat)).toBe(false);
    // Even the dropped repeat cannot scroll the page behind the game.
    expect(repeat.defaultPrevented).toBe(true);

    const fresh = keydown({ key: ' ', code: 'Space' });
    expect(window.gamesHelpers.beginRealTimeKeydown(fresh)).toBe(true);
  });

  it('drops auto-repeats of non-direction keys', () => {
    const repeat = keydown({ key: 'Enter', code: 'Enter', repeat: true });
    expect(window.gamesHelpers.beginRealTimeKeydown(repeat)).toBe(false);
  });

  it('drops modified shortcuts without swallowing their default', () => {
    const modified = keydown({ key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true });
    expect(window.gamesHelpers.beginRealTimeKeydown(modified)).toBe(false);
    expect(modified.defaultPrevented).toBe(false);
  });

  it('drops keys typed into editable targets without swallowing their default', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = keydown({ key: 'a', code: 'KeyA' });
    input.dispatchEvent(e);
    expect(window.gamesHelpers.beginRealTimeKeydown(e)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    input.remove();
  });

  it('leaves Space alone while a button is focused so it stays activatable (#887)', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const e = keydown({ key: ' ', code: 'Space' });
    button.dispatchEvent(e);
    expect(window.gamesHelpers.beginRealTimeKeydown(e)).toBe(true);
    expect(e.defaultPrevented).toBe(false);
    button.remove();
  });

  it('treats a missing event as ignorable', () => {
    expect(window.gamesHelpers.beginRealTimeKeydown(null)).toBe(false);
    expect(window.gamesHelpers.beginRealTimeKeydown(undefined)).toBe(false);
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

  it('leaves Space alone while a button is focused so it stays activatable (#887)', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const onPause = vi.fn();
    const onResume = vi.fn();
    const e = keydown({ key: ' ', code: 'Space' });
    button.dispatchEvent(e);

    expect(window.gamesHelpers.togglePauseOnSpace(e, false, onPause, onResume)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
    button.remove();
  });
});

// jsdom has no PointerEvent constructor or setPointerCapture, so the tests
// dispatch MouseEvent with pointer event types (listeners match on type only)
// and the helper's capture calls are guarded in source. MouseEvent also lacks
// the pointerType/pointerId fields, so those are defined directly on the
// event when a test needs them.
function makeCanvas() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return canvas;
}

function pointer(type, x, y, extra) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    ...extra
  });
  if (extra && extra.pointerType !== undefined) {
    Object.defineProperty(e, 'pointerType', { value: extra.pointerType });
  }
  if (extra && extra.pointerId !== undefined) {
    Object.defineProperty(e, 'pointerId', { value: extra.pointerId });
  }
  return e;
}

describe('gamesHelpers.createSwipeSteering (#1019)', () => {
  it('fires a direction as soon as the swipe crosses the threshold, before pointerup', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 110, 100));
    expect(onDirection).not.toHaveBeenCalled();

    canvas.dispatchEvent(pointer('pointermove', 130, 100));
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenCalledWith('right');

    steering.destroy();
    canvas.remove();
  });

  it('re-anchors after each resolved turn so one drag steers through several turns', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 140, 100)); // right, re-anchors at 140
    canvas.dispatchEvent(pointer('pointermove', 140, 150)); // down from the new anchor
    expect(onDirection.mock.calls).toEqual([['right'], ['down']]);

    steering.destroy();
    canvas.remove();
  });

  it('resolves the dominant axis', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    canvas.dispatchEvent(pointer('pointerdown', 50, 50));
    canvas.dispatchEvent(pointer('pointermove', 55, 90));
    expect(onDirection).toHaveBeenLastCalledWith('down');

    canvas.dispatchEvent(pointer('pointerup', 55, 90));
    canvas.dispatchEvent(pointer('pointerdown', 50, 50));
    canvas.dispatchEvent(pointer('pointermove', 10, 55));
    expect(onDirection).toHaveBeenLastCalledWith('left');

    steering.destroy();
    canvas.remove();
  });

  it('keeps a distance floor so a tap fires onTap, not a direction', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const onTap = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection, { onTap });

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 110, 110)); // under the 20px default
    canvas.dispatchEvent(pointer('pointerup', 110, 110));

    expect(onDirection).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);

    steering.destroy();
    canvas.remove();
  });

  it('does not fire onTap once the gesture resolved a direction', () => {
    const canvas = makeCanvas();
    const onTap = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, vi.fn(), { onTap });

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 140, 100));
    canvas.dispatchEvent(pointer('pointerup', 140, 100));

    expect(onTap).not.toHaveBeenCalled();

    steering.destroy();
    canvas.remove();
  });

  it('ends tracking on pointercancel, stops steering, and never fires onTap', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const onTap = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection, { onTap });

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointercancel', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 200, 100));
    expect(onDirection).not.toHaveBeenCalled();
    // A cancelled gesture is not a deliberate tap: it must never reach the
    // game-over restart path through onTap.
    expect(onTap).not.toHaveBeenCalled();

    steering.destroy();
    canvas.remove();
  });

  it('ignores non-primary mouse buttons', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerType: 'mouse', button: 2 }));
    canvas.dispatchEvent(pointer('pointermove', 140, 100));
    expect(onDirection).not.toHaveBeenCalled();

    steering.destroy();
    canvas.remove();
  });

  it('captures the pointer when the platform supports it', () => {
    const canvas = makeCanvas();
    const captured = [];
    canvas.setPointerCapture = (id) => { captured.push(id); };
    canvas.releasePointerCapture = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, vi.fn());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerId: 7 }));
    expect(captured).toEqual([7]);
    canvas.dispatchEvent(pointer('pointerup', 100, 100, { pointerId: 7 }));
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);

    steering.destroy();
    canvas.remove();
  });

  it('steers normally when the platform lacks the pointer capture APIs', () => {
    // jsdom canvases ship without both methods; the helper must skip the
    // capture calls quietly instead of throwing.
    const canvas = makeCanvas();
    expect(typeof canvas.setPointerCapture).not.toBe('function');
    expect(typeof canvas.releasePointerCapture).not.toBe('function');
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    expect(() => {
      canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerId: 5 }));
      canvas.dispatchEvent(pointer('pointermove', 140, 100));
      canvas.dispatchEvent(pointer('pointerup', 140, 100, { pointerId: 5 }));
    }).not.toThrow();
    expect(onDirection).toHaveBeenCalledWith('right');

    steering.destroy();
    canvas.remove();
  });

  it('keeps steering when the pointer capture APIs throw', () => {
    const canvas = makeCanvas();
    canvas.setPointerCapture = () => { throw new Error('capture unavailable'); };
    canvas.releasePointerCapture = () => { throw new Error('release unavailable'); };
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    expect(() => {
      canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerId: 9 }));
      canvas.dispatchEvent(pointer('pointermove', 140, 100));
      canvas.dispatchEvent(pointer('pointerup', 140, 100, { pointerId: 9 }));
    }).not.toThrow();
    expect(onDirection).toHaveBeenCalledWith('right');

    steering.destroy();
    canvas.remove();
  });

  it('ignores secondary pointers so multi-touch cannot corrupt the anchor', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerId: 1 }));
    // A second finger must not reset the shared anchor.
    canvas.dispatchEvent(pointer('pointerdown', 300, 300, { pointerId: 2 }));
    // Moves from the first finger still measure from its own anchor.
    canvas.dispatchEvent(pointer('pointermove', 140, 100, { pointerId: 1 }));
    expect(onDirection.mock.calls).toEqual([['right']]);
    // Lifting the second finger must not end the first finger's gesture.
    canvas.dispatchEvent(pointer('pointerup', 300, 300, { pointerId: 2 }));
    canvas.dispatchEvent(pointer('pointermove', 140, 150, { pointerId: 1 }));
    expect(onDirection.mock.calls).toEqual([['right'], ['down']]);
    // The tracked finger's release ends the gesture.
    canvas.dispatchEvent(pointer('pointerup', 140, 150, { pointerId: 1 }));
    canvas.dispatchEvent(pointer('pointermove', 140, 200, { pointerId: 1 }));
    expect(onDirection).toHaveBeenCalledTimes(2);

    steering.destroy();
    canvas.remove();
  });

  it('stops firing after destroy()', () => {
    const canvas = makeCanvas();
    const onDirection = vi.fn();
    const steering = window.gamesHelpers.createSwipeSteering(canvas, onDirection);
    steering.destroy();

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointermove', 140, 100));
    expect(onDirection).not.toHaveBeenCalled();

    canvas.remove();
  });

  it('returns null without a canvas or direction callback', () => {
    const canvas = makeCanvas();
    expect(window.gamesHelpers.createSwipeSteering(null, vi.fn())).toBeNull();
    expect(window.gamesHelpers.createSwipeSteering(canvas, null)).toBeNull();
    canvas.remove();
  });
});

describe('gamesHelpers.createDPad (#1019)', () => {
  function makeStage() {
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    return stage;
  }

  it('appends an accessible four-button pad to the stage', () => {
    const stage = makeStage();
    const pad = window.gamesHelpers.createDPad(stage, vi.fn());

    const element = stage.querySelector('.games-dpad');
    expect(element).not.toBeNull();
    expect(element.getAttribute('role')).toBe('group');
    expect(element.getAttribute('aria-label')).toBe('Direction pad');
    const buttons = element.querySelectorAll('.games-dpad-btn');
    expect(buttons).toHaveLength(4);
    expect(element.querySelector('.games-dpad-up').getAttribute('aria-label')).toBe('Up');
    expect(element.querySelector('.games-dpad-down').getAttribute('aria-label')).toBe('Down');
    expect(element.querySelector('.games-dpad-left').getAttribute('aria-label')).toBe('Left');
    expect(element.querySelector('.games-dpad-right').getAttribute('aria-label')).toBe('Right');

    pad.destroy();
    stage.remove();
  });

  it('queues the matching direction on pointerdown', () => {
    const stage = makeStage();
    const onDirection = vi.fn();
    const pad = window.gamesHelpers.createDPad(stage, onDirection);

    pad.element.querySelector('.games-dpad-up').dispatchEvent(pointer('pointerdown', 0, 0));
    pad.element.querySelector('.games-dpad-left').dispatchEvent(pointer('pointerdown', 0, 0));
    expect(onDirection.mock.calls).toEqual([['up'], ['left']]);

    pad.destroy();
    stage.remove();
  });

  it('ignores non-primary mouse buttons on the pad', () => {
    const stage = makeStage();
    const onDirection = vi.fn();
    const pad = window.gamesHelpers.createDPad(stage, onDirection);

    pad.element.querySelector('.games-dpad-up').dispatchEvent(
      pointer('pointerdown', 0, 0, { pointerType: 'mouse', button: 2 })
    );
    expect(onDirection).not.toHaveBeenCalled();

    pad.destroy();
    stage.remove();
  });

  it('accepts keyboard activation (click detail 0) without double-firing pointer taps', () => {
    const stage = makeStage();
    const onDirection = vi.fn();
    const pad = window.gamesHelpers.createDPad(stage, onDirection);
    const up = pad.element.querySelector('.games-dpad-up');

    // A real tap fires pointerdown (already counted) then a compatibility
    // click with detail > 0, which must not queue a second turn.
    up.dispatchEvent(pointer('pointerdown', 0, 0));
    up.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(onDirection).toHaveBeenCalledTimes(1);

    // Keyboard/assistive-tech activation arrives as click with detail 0.
    up.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onDirection).toHaveBeenLastCalledWith('up');

    pad.destroy();
    stage.remove();
  });

  it('removes the pad and its listeners on destroy()', () => {
    const stage = makeStage();
    const onDirection = vi.fn();
    const pad = window.gamesHelpers.createDPad(stage, onDirection);
    const up = pad.element.querySelector('.games-dpad-up');
    pad.destroy();

    expect(stage.querySelector('.games-dpad')).toBeNull();
    up.dispatchEvent(pointer('pointerdown', 0, 0));
    expect(onDirection).not.toHaveBeenCalled();

    stage.remove();
  });

  it('returns null without a stage or direction callback', () => {
    const stage = makeStage();
    expect(window.gamesHelpers.createDPad(null, vi.fn())).toBeNull();
    expect(window.gamesHelpers.createDPad(stage, null)).toBeNull();
    stage.remove();
  });
});

describe('gamesHelpers.createGamepadSteering (#1022)', () => {
  let stub = null;
  let pump = null;
  let steer = null;

  beforeEach(() => {
    stub = installGamepadStub();
    pump = installFramePump();
  });

  afterEach(() => {
    if (steer) steer.destroy();
    steer = null;
    pump.restore();
    removeGamepadStub();
  });

  function create(options) {
    steer = window.gamesHelpers.createGamepadSteering(options);
    return steer;
  }

  it('returns null without the Gamepad API and never arms a frame', () => {
    removeGamepadStub();
    expect(window.gamesHelpers.createGamepadSteering({})).toBeNull();
    expect(pump.pendingCount()).toBe(0);
  });

  it('returns null without requestAnimationFrame', () => {
    const savedRaf = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    delete window.requestAnimationFrame;
    try {
      expect(window.gamesHelpers.createGamepadSteering({})).toBeNull();
      expect(stub.calls).toBe(0);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', savedRaf);
    }
  });

  it('emits a direction only on the edge into it, latched until neutral', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onDirection = vi.fn();
    create({ onDirection });
    pump.step();

    pressButton(pad, 13); // D-pad down
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenLastCalledWith('down');

    // Held: no auto-repeat flood (the gamepad equivalent of #1016).
    pump.step(5);
    expect(onDirection).toHaveBeenCalledTimes(1);

    // Neutral unlatches, so the next press of the same direction re-fires.
    releaseButton(pad, 13);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    pressButton(pad, 13);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onDirection).toHaveBeenLastCalledWith('down');
  });

  it('treats a direct direction change as a fresh edge', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onDirection = vi.fn();
    create({ onDirection });
    pump.step();

    pressButton(pad, 12); // D-pad up
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenLastCalledWith('up');

    // Switch to right without a neutral frame in between.
    releaseButton(pad, 12);
    pressButton(pad, 15);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onDirection).toHaveBeenLastCalledWith('right');
  });

  it('ignores stick drift inside the deadzone and unlatches on return', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onDirection = vi.fn();
    create({ onDirection, deadzone: 0.4 });
    pump.step();

    setStick(pad, 0.3, 0.1); // inside the deadzone
    pump.step(3);
    expect(onDirection).not.toHaveBeenCalled();

    setStick(pad, -0.9, 0); // beyond the deadzone
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenLastCalledWith('left');

    // Drifting back inside the deadzone unlatches without emitting.
    setStick(pad, -0.2, 0);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);

    // Re-crossing the deadzone is a fresh edge.
    setStick(pad, -0.9, 0);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onDirection).toHaveBeenLastCalledWith('left');
  });

  it('prefers the D-pad over the stick and cancels opposing D-pad presses', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onDirection = vi.fn();
    create({ onDirection });
    pump.step();

    setStick(pad, 0.9, 0); // stick right
    pressButton(pad, 12); // D-pad up wins over the stick
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenLastCalledWith('up');

    releaseButton(pad, 12);
    setStick(pad, 0, 0);
    pump.step();

    // Opposing D-pad presses cancel to neutral instead of picking a winner.
    pressButton(pad, 14);
    pressButton(pad, 15);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);

    // Releasing one side of the pair is a fresh edge.
    releaseButton(pad, 15);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onDirection).toHaveBeenLastCalledWith('left');
  });

  it('fires Start and A edges once per press', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onPause = vi.fn();
    const onRestart = vi.fn();
    create({ onPause, onRestart });
    pump.step();

    pressButton(pad, 9); // Start
    pump.step();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();
    pump.step(3); // held Start keeps pausing exactly once
    expect(onPause).toHaveBeenCalledTimes(1);

    releaseButton(pad, 9);
    pump.step();
    pressButton(pad, 9);
    pump.step();
    expect(onPause).toHaveBeenCalledTimes(2);

    pressButton(pad, 0); // A/Cross
    pump.step();
    expect(onRestart).toHaveBeenCalledTimes(1);
    pump.step();
    expect(onRestart).toHaveBeenCalledTimes(1);

    releaseButton(pad, 0);
    pump.step();
    pressButton(pad, 0);
    pump.step();
    expect(onRestart).toHaveBeenCalledTimes(2);
  });

  it('resets every latch while no pad is connected so a reconnect re-fires', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onDirection = vi.fn();
    const onPause = vi.fn();
    create({ onDirection, onPause });
    pump.step();

    pressButton(pad, 13);
    pressButton(pad, 9);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);

    stub.pads = []; // disconnect mid-hold
    pump.step();
    stub.pads = [pad]; // reconnect with every input still held
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('resets the latches when the selected pad identity changes', () => {
    const first = makeGamepad();
    const second = makeGamepad();
    stub.pads = [first];
    const onDirection = vi.fn();
    const onPause = vi.fn();
    create({ onDirection, onPause });
    pump.step();

    pressButton(first, 13);
    pressButton(first, 9);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);

    // Swap to a different pad whose inputs are already held: its first
    // direction and Start press must fire instead of being swallowed.
    stub.pads = [second];
    pressButton(second, 13);
    pressButton(second, 9);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(2);
    expect(onDirection).toHaveBeenLastCalledWith('down');
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('uses the first connected pad and ignores disconnected slots', () => {
    const dead = makeGamepad({ connected: false });
    const alive = makeGamepad();
    const later = makeGamepad();
    stub.pads = [dead, alive, later];
    const onDirection = vi.fn();
    create({ onDirection });
    pump.step();

    pressButton(dead, 13); // the dead slot must not steer
    pump.step();
    expect(onDirection).not.toHaveBeenCalled();

    pressButton(later, 13); // a later connected pad must not steer
    pump.step();
    expect(onDirection).not.toHaveBeenCalled();

    pressButton(alive, 13);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenLastCalledWith('down');
  });

  it('skips connected controllers without the standard mapping', () => {
    const unmapped = makeGamepad({ mapping: '' });
    stub.pads = [unmapped];
    const onDirection = vi.fn();
    create({ onDirection });
    pump.step();

    pressButton(unmapped, 13); // fixed indices are meaningless here
    pump.step();
    expect(onDirection).not.toHaveBeenCalled();

    const standard = makeGamepad();
    stub.pads = [unmapped, standard];
    pressButton(standard, 13);
    pump.step();
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(onDirection).toHaveBeenLastCalledWith('down');
  });

  it('tolerates missing options and only wires provided callbacks', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const handle = create();

    pressButton(pad, 9);
    pressButton(pad, 0);
    pressButton(pad, 13);
    expect(() => pump.step()).not.toThrow();

    handle.destroy();
  });

  it('destroy() stops polling and is idempotent', () => {
    const pad = makeGamepad();
    stub.pads = [pad];
    const onDirection = vi.fn();
    const handle = create({ onDirection });
    pump.step();
    expect(stub.calls).toBeGreaterThan(0);

    handle.destroy();
    const callsAfterDestroy = stub.calls;
    expect(pump.pendingCount()).toBe(0);
    pump.step(3);
    expect(stub.calls).toBe(callsAfterDestroy);
    expect(handle.destroy()).toBeUndefined();

    // A late press after teardown must not sneak through.
    pressButton(pad, 13);
    pump.step();
    expect(onDirection).not.toHaveBeenCalled();
  });
});
