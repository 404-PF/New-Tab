import { injectScript } from './inject-script.js';

// Every 2D-context method the Pac-Man renderer calls, stubbed as a no-op.
const CONTEXT_METHODS = [
  'drawImage', 'fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath',
  'arc', 'ellipse', 'moveTo', 'lineTo', 'fill', 'stroke', 'save', 'restore',
  'translate', 'fillText'
];

function createStubContext() {
  const gradient = () => ({ addColorStop() {} });
  const context = { createLinearGradient: gradient, createRadialGradient: gradient };
  for (const name of CONTEXT_METHODS) context[name] = () => {};
  return context;
}

export function installPacmanTestEnvironment(vi) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createStubContext());
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  ['shared.js', 'game-registry.js', 'pacman.js'].forEach((file) => {
    injectScript(`src/features/games/${file}`);
  });
}

let mountedGame = null;

// Mount Pac-Man into a fresh container attached to the document. Direct
// init() bypasses the registry, so remember the game for resetGamesHub().
export function mountPacman() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountedGame = window.GameRegistry.get('pacman');
  mountedGame.init(container);
  return container;
}

// Dispatch a keydown with matching code and key on the target (default document).
export function dispatchKey(code, target = document) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
}

// Tear down whatever game is mounted and reset storage and the DOM.
export function resetGamesHub() {
  // destroy() is idempotent, so this is safe after a test destroyed it itself.
  mountedGame?.destroy();
  mountedGame = null;
  window.GameRegistry?.destroyCurrent?.();
  localStorage.clear();
  document.body.innerHTML = '';
}
