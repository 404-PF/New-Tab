// Shared harness for the per-game "does not stack keydown listeners" tests
// (#876): wraps document.addEventListener/removeEventListener while the given
// game cycles init/destroy, so every game asserts document listener balance
// through one fixture instead of copying the tally block per test file (#887).

import { expect } from 'vitest';

function captureFlag(options) {
  return typeof options === 'boolean' ? options : !!(options && options.capture);
}

export function expectNoStackedKeydownListeners(game, container, cycles = 3) {
  // Track live (type, listener, capture) registrations instead of counting
  // add/remove calls: removing a listener that was never added (or removing
  // one twice) must not decrement the tally and mask a real leak. Only
  // 'keydown' registrations are tracked, which is what these tests assert on.
  const liveKeydownListeners = [];
  let needsTeardown = false;
  const origAdd = document.addEventListener;
  const origRemove = document.removeEventListener;
  document.addEventListener = function (type, listener, options) {
    if (type === 'keydown') {
      const capture = captureFlag(options);
      const registered = liveKeydownListeners.some(r => r.listener === listener && r.capture === capture);
      if (!registered) liveKeydownListeners.push({ listener: listener, capture: capture });
    }
    return origAdd.call(document, type, listener, options);
  };
  document.removeEventListener = function (type, listener, options) {
    if (type === 'keydown') {
      const capture = captureFlag(options);
      const index = liveKeydownListeners.findIndex(r => r.listener === listener && r.capture === capture);
      if (index !== -1) liveKeydownListeners.splice(index, 1);
    }
    return origRemove.call(document, type, listener, options);
  };
  try {
    for (let i = 0; i < cycles; i++) {
      game.init(container);
      needsTeardown = true;
      game.destroy();
      needsTeardown = false;
      expect(liveKeydownListeners).toEqual([]);
    }
  } finally {
    document.addEventListener = origAdd;
    document.removeEventListener = origRemove;
    // Tear down a cycle whose init threw before its destroy ran, after the
    // spies are restored so this cleanup is not counted by the tally.
    if (needsTeardown) game.destroy();
    container.remove();
  }
}
