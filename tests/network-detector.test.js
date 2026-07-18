import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    get: () => true
  });

  injectScript('src/ai/network-detector.js');
});

describe('NetworkDetector initialization (#462)', () => {
  it('tracks offline and online browser events after module load', () => {
    expect(NetworkDetector.getStatus().isOnline).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(NetworkDetector.getStatus()).toMatchObject({
      isOnline: false,
      isOffline: true
    });

    window.dispatchEvent(new Event('online'));
    expect(NetworkDetector.getStatus()).toMatchObject({
      isOnline: true,
      isOffline: false
    });
  });

  it('does not register duplicate event listeners when init is called again', () => {
    const listener = vi.fn();
    NetworkDetector.addListener(listener);

    NetworkDetector.init();
    window.dispatchEvent(new Event('offline'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isOffline: true }));

    NetworkDetector.removeListener(listener);
  });
});
