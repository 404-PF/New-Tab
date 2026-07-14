import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
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
