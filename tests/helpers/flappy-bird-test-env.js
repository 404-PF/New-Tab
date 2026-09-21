import { injectScript } from './inject-script.js';

const canvasContext = {
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  drawImage() {},
  fillRect() {},
  strokeRect() {},
  clearRect() {},
  beginPath() {},
  closePath() {},
  arc() {},
  ellipse() {},
  moveTo() {},
  lineTo() {},
  fill() {},
  stroke() {},
  save() {},
  restore() {},
  translate() {},
  fillText() {}
};

export function installFlappyBirdTestEnvironment(vi) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  injectScript('src/features/games/shared.js');
  injectScript('src/features/games/game-registry.js');
  injectScript('src/features/games/flappy-bird.js');
}
