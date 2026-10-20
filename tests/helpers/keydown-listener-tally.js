// Shared harness for the per-game "does not stack keydown listeners" tests
// (#876): wraps document.addEventListener/removeEventListener while the given
// game cycles init/destroy, so every game asserts document listener balance
// through one fixture instead of copying the tally block per test file (#887).

import { expect } from 'vitest';

export function expectNoStackedKeydownListeners(game, container, cycles = 3) {
  let keydownListeners = 0;
  const origAdd = document.addEventListener;
  const origRemove = document.removeEventListener;
  document.addEventListener = function (type, listener, options) {
    if (type === 'keydown') keydownListeners++;
    return origAdd.call(document, type, listener, options);
  };
  document.removeEventListener = function (type, listener, options) {
    if (type === 'keydown') keydownListeners--;
    return origRemove.call(document, type, listener, options);
  };
  try {
    for (let i = 0; i < cycles; i++) {
      game.init(container);
      game.destroy();
      expect(keydownListeners).toBe(0);
    }
  } finally {
    document.addEventListener = origAdd;
    document.removeEventListener = origRemove;
    container.remove();
  }
}
