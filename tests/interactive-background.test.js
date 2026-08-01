import { injectScript } from './helpers/inject-script.js';

describe('interactive background', () => {
  it('uses crypto randomness when creating particles', () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() })
    };
    const getRandomValues = vi.fn(bytes => bytes.fill(0));
    vi.stubGlobal('crypto', { getRandomValues });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const container = document.createElement('div');
    container.id = 'background-container';
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({ width: 300, height: 180, left: 0, top: 0 });
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-interactive';
    document.body.appendChild(canvas);

    injectScript('src/features/interactive-background.js');
    window._interactiveBackground.apply('interactive-aurora');

    expect(getRandomValues).toHaveBeenCalledTimes(84);
    window._interactiveBackground.stop();
    canvas.remove();
    container.remove();
  });

  it('initializes a supported canvas effect and can stop it cleanly', () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() })
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const container = document.createElement('div');
    container.id = 'background-container';
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({ width: 300, height: 180, left: 0, top: 0 });
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-interactive';
    document.body.appendChild(canvas);

    injectScript('src/features/interactive-background.js');

    expect(window._interactiveBackground.isSupported()).toBe(true);
    expect(window._interactiveBackground.apply('interactive-aurora')).toBe(true);
    expect(canvas.hidden).toBe(true);
    expect(window._interactiveBackground.currentBackgroundId()).toBe('interactive-aurora');
    window._interactiveBackground.stop();
    expect(window._interactiveBackground.currentBackgroundId()).toBe('');
    canvas.remove();
    container.remove();
  });
});
