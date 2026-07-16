import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/update-checker.js');
});

describe('UpdateChecker', () => {
  let checker;

  beforeEach(() => {
    document.querySelectorAll('.update-notification, .manual-check-result')
      .forEach(el => el.remove());

    checker = window.updateChecker;
    checker.currentVersion = '1.0.0';
    [checker._autoHideTimeoutId, checker._manualCheckTimeoutId, checker._manualCheckResultTimeoutId]
      .forEach(id => { if (id) clearTimeout(id); });
    if (checker._autoHideUnsubscribe) checker._autoHideUnsubscribe();
    if (checker._manualCheckUnsubscribe) checker._manualCheckUnsubscribe();
    if (checker._manualCheckResultUnsubscribe) checker._manualCheckResultUnsubscribe();
    checker._autoHideTimeoutId = null;
    checker._autoHideUnsubscribe = null;
    checker._manualCheckTimeoutId = null;
    checker._manualCheckUnsubscribe = null;
    checker._manualCheckResultTimeoutId = null;
    checker._manualCheckResultUnsubscribe = null;
  });

  describe('automatic check on load', () => {
    it('invokes checkForUpdates when the update interval has elapsed', async () => {
      let captured = null;
      window.onDomReady = (cb) => { captured = cb; };

      // Re-inject the checker so its onDomReady auto-check registration runs
      // with the stub above in place. dom-ready.js is already loaded.
      injectScript('src/core/update-checker.js');

      const instance = window.updateChecker;
      instance.currentVersion = '1.0.0';
      instance.setLastCheckTime(0); // force interval elapsed
      const spy = vi.spyOn(instance, 'checkForUpdates');

      await captured();

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('auto-hide timer isolation', () => {
    it('does not overwrite update notification auto-hide when showing manual check result', () => {
      const aboutSection = document.createElement('section');
      aboutSection.className = 'settings-section';
      aboutSection.setAttribute('data-section', 'about');
      document.body.appendChild(aboutSection);

      const release = { version: '2.0.0', url: 'https://example.com' };
      checker.showUpdateNotification(release);
      const bannerTimerId = checker._autoHideTimeoutId;
      expect(bannerTimerId).not.toBeNull();

      checker.showManualCheckResult('New version 2.0.0 available');
      expect(checker._autoHideTimeoutId).toBe(bannerTimerId);
      expect(checker._manualCheckResultTimeoutId).not.toBeNull();
      expect(checker._manualCheckResultTimeoutId).not.toBe(bannerTimerId);
    });
  });
});
