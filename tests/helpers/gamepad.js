// Test doubles for the Gamepad API (#1022). jsdom implements neither
// navigator.getGamepads nor a drivable requestAnimationFrame, so steering
// specs install a stub pad list and either advance the fake clock (which
// drives jsdom's rAF interval in suites that already use fake timers) or
// swap in an explicit frame pump for suites that must not fake timers.

// Replace navigator.getGamepads with a counter over a mutable pad list.
// Returns { pads, calls }; mutate pads between steps to simulate
// connect/disconnect and button changes.
export function installGamepadStub() {
  const stub = { pads: [], calls: 0 };
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    writable: true,
    value: function () {
      stub.calls += 1;
      return stub.pads;
    }
  });
  return stub;
}

export function removeGamepadStub() {
  try {
    delete navigator.getGamepads;
  } catch (_err) {
    /* already gone */
  }
}

// A standard-mapping gamepad with every input neutral.
export function makeGamepad(overrides = {}) {
  const buttons = [];
  for (let i = 0; i < 16; i++) {
    buttons.push({ pressed: false, value: 0 });
  }
  return {
    id: 'test-gamepad',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons,
    axes: [0, 0],
    ...overrides
  };
}

export function pressButton(pad, index) {
  pad.buttons[index] = { pressed: true, value: 1 };
}

export function releaseButton(pad, index) {
  pad.buttons[index] = { pressed: false, value: 0 };
}

export function setStick(pad, x, y) {
  pad.axes[0] = x;
  pad.axes[1] = y;
}

// Synchronous requestAnimationFrame queue with a monotonic timestamp.
// Replaces window.requestAnimationFrame/cancelAnimationFrame and restores
// the previous descriptors (including a spy installed by a test env) on
// restore(). Callbacks armed while a frame runs wait for the next frame;
// callbacks cancelled before their turn inside the same frame are skipped,
// matching jsdom's runAnimationFrameCallbacks semantics.
export function installFramePump() {
  const savedRaf = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
  const savedCancel = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
  let nextId = 1;
  let now = 0;
  const pending = new Map();

  function requestPump(callback) {
    const id = nextId;
    nextId += 1;
    pending.set(id, callback);
    return id;
  }

  function cancelPump(id) {
    pending.delete(id);
  }

  Object.defineProperty(window, 'requestAnimationFrame', {
    value: requestPump,
    configurable: true,
    writable: true,
    enumerable: true
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    value: cancelPump,
    configurable: true,
    writable: true,
    enumerable: true
  });

  return {
    pendingCount() {
      return pending.size;
    },
    step(frames = 1) {
      for (let i = 0; i < frames; i++) {
        now += 16;
        const ids = Array.from(pending.keys());
        for (const id of ids) {
          const callback = pending.get(id);
          if (!callback) continue;
          pending.delete(id);
          callback(now);
        }
      }
    },
    restore() {
      if (savedRaf) Object.defineProperty(window, 'requestAnimationFrame', savedRaf);
      else delete window.requestAnimationFrame;
      if (savedCancel) Object.defineProperty(window, 'cancelAnimationFrame', savedCancel);
      else delete window.cancelAnimationFrame;
    }
  };
}
