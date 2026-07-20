import { injectScript } from './helpers/inject-script.js';

describe('version module', () => {
  it('reads the manifest version, exposes it, and renders it after DOM ready', () => {
    window.chrome.runtime.getManifest = () => ({ version: '9.8.7' });
    const display = document.createElement('span');
    display.id = 'version-display';
    document.body.appendChild(display);

    injectScript('src/core/version.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(window.CURRENT_VERSION).toBe('9.8.7');
    expect(window.VERSION_DISPLAY_UNAVAILABLE_TEXT).toBe('extension only');
    expect(display.textContent).toBe('v9.8.7');
    display.remove();
    delete window.chrome.runtime.getManifest;
  });
});
