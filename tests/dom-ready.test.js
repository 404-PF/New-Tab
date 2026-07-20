import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
});

describe('onDomReady', () => {
  it('runs callbacks immediately once the document is ready', () => {
    const callback = vi.fn();
    window.onDomReady(callback);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('queues callbacks while the document is loading', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
    const callback = vi.fn();
    window.onDomReady(callback);
    expect(callback).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(callback).toHaveBeenCalledOnce();
    delete document.readyState;
    if (descriptor) Object.defineProperty(Document.prototype, 'readyState', descriptor);
  });
});
