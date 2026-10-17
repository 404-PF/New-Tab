import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/update-checker.js');
});

describe('UpdateChecker', () => {
  let checker;

  beforeEach(() => {
    document.querySelectorAll('.update-notification, .manual-check-notification, .manual-check-result')
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
    checker._manualCheckResultState = null;
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
      const spy = vi.spyOn(instance, 'checkForUpdates').mockResolvedValue();

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

  describe('manual check result across About-section rebuilds', () => {
    let aboutSection;

    beforeEach(() => {
      document.querySelectorAll('.settings-section[data-section="about"]').forEach(el => el.remove());
      aboutSection = document.createElement('section');
      aboutSection.className = 'settings-section';
      aboutSection.setAttribute('data-section', 'about');
      document.body.appendChild(aboutSection);
    });

    afterEach(() => {
      aboutSection.remove();
    });

    it('keeps the inline result attached through the 100 ms settings refresh, then hides it', () => {
      vi.useFakeTimers();
      try {
        checker.showManualCheckResult('You\'re up to date');

        const initial = document.querySelector('.manual-check-result');
        expect(initial).not.toBeNull();
        expect(initial.parentElement).toBe(aboutSection);

        // Simulate initAboutSection() rebuilding the section 100 ms later
        aboutSection.innerHTML = '<div class="about-cards"></div>';
        expect(document.querySelector('.manual-check-result')).toBeNull();

        vi.advanceTimersByTime(100);
        checker.renderManualCheckResult();

        const restored = document.querySelector('.manual-check-result');
        expect(restored).not.toBeNull();
        expect(restored.parentElement).toBe(aboutSection);
        expect(restored.textContent).toBe('You\'re up to date');

        vi.advanceTimersByTime(4800);
        expect(document.querySelector('.manual-check-result')).not.toBeNull();

        vi.advanceTimersByTime(200);
        expect(document.querySelector('.manual-check-result')).toBeNull();
        expect(checker._manualCheckResultState).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('preserves the remaining auto-hide window across rebuilds', () => {
      vi.useFakeTimers();
      try {
        checker.showManualCheckResult('done');

        // Rebuild 3 s into the 5 s window
        vi.advanceTimersByTime(3000);
        aboutSection.innerHTML = '';
        checker.renderManualCheckResult();
        expect(document.querySelector('.manual-check-result')).not.toBeNull();

        // Only the remaining 2 s should be left, not a fresh 5 s window
        vi.advanceTimersByTime(1900);
        expect(document.querySelector('.manual-check-result')).not.toBeNull();
        vi.advanceTimersByTime(100);
        expect(document.querySelector('.manual-check-result')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not count hidden-tab time against the result window on rebuild', () => {
      vi.useFakeTimers();
      const originalVisibilityManager = window.visibilityManager;
      const listeners = new Set();
      window.visibilityManager = {
        isVisible: true,
        onChange(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        }
      };
      const setVisible = (visible) => {
        window.visibilityManager.isVisible = visible;
        [...listeners].forEach(fn => fn(visible));
      };
      try {
        checker.showManualCheckResult('done');
        vi.advanceTimersByTime(1000);

        // Background the tab for 10 s; the auto-hide timer pauses
        setVisible(false);
        vi.advanceTimersByTime(10000);
        setVisible(true);

        aboutSection.innerHTML = '';
        checker.renderManualCheckResult();
        expect(document.querySelector('.manual-check-result')).not.toBeNull();

        // 4 s of visible time remain
        vi.advanceTimersByTime(3900);
        expect(document.querySelector('.manual-check-result')).not.toBeNull();
        vi.advanceTimersByTime(100);
        expect(document.querySelector('.manual-check-result')).toBeNull();
      } finally {
        checker.hideManualCheckResult();
        window.visibilityManager = originalVisibilityManager;
        vi.useRealTimers();
      }
    });

    it('does not resurrect a result once its auto-hide window has expired', () => {
      vi.useFakeTimers();
      try {
        checker.showManualCheckResult('done');

        vi.advanceTimersByTime(5000);
        expect(document.querySelector('.manual-check-result')).toBeNull();

        aboutSection.innerHTML = '';
        checker.renderManualCheckResult();
        expect(document.querySelector('.manual-check-result')).toBeNull();
        expect(checker._manualCheckResultState).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('re-renders a keyed result with fresh translations after a rebuild', () => {
      const originalT = window.i18n.t;
      window.i18n.t = (key) => (key === 'updateManualLatestVersion' ? 'EN: up to date' : originalT(key));

      try {
        checker.showManualCheckResult('EN: up to date', 'updateManualLatestVersion');
        expect(document.querySelector('.manual-check-result').textContent).toBe('EN: up to date');

        window.i18n.t = (key) => (key === 'updateManualLatestVersion' ? 'ZH: 最新版本' : originalT(key));
        aboutSection.innerHTML = '';
        checker.renderManualCheckResult();

        expect(document.querySelector('.manual-check-result').textContent).toBe('ZH: 最新版本');
      } finally {
        window.i18n.t = originalT;
        checker.hideManualCheckResult();
      }
    });

    it('keeps the result visible after a manualCheck followed by the settings refresh', async () => {
      vi.useFakeTimers();
      const originalFetch = window.fetch;
      window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v1.0.0',
          html_url: 'https://example.com/release',
          published_at: '2026-01-01T00:00:00Z',
          body: ''
        })
      });

      try {
        await checker.manualCheck();

        const shown = document.querySelector('.manual-check-result');
        expect(shown).not.toBeNull();
        expect(shown.parentElement).toBe(aboutSection);

        // Simulate settings.js: setTimeout(() => initAboutSection(), 100)
        aboutSection.innerHTML = '<div class="about-cards"></div>';
        vi.advanceTimersByTime(100);
        checker.renderManualCheckResult();

        expect(document.querySelector('.manual-check-result')).not.toBeNull();

        vi.advanceTimersByTime(5000);
        expect(document.querySelector('.manual-check-result')).toBeNull();
      } finally {
        window.fetch = originalFetch;
        vi.useRealTimers();
        checker.hideManualCheckResult();
        checker.hideManualCheckNotification();
      }
    });
  });
  describe('notification content security', () => {
    it('escapes untrusted content', () => {
      const payload = '<img src=x onerror=alert(1)>';
      vi.spyOn(checker, 'formatMessage').mockReturnValue(payload);
      checker.showUpdateNotification({ version: payload, url: 'https://example.com' });
      expect(document.querySelector('.update-notification-text').textContent).toContain(payload);
      expect(document.querySelector('.update-notification-text img')).toBeNull();
      checker.showManualCheckNotification(payload);
      expect(document.querySelector('.manual-check-notification-text').textContent.trim()).toBe(payload);
      expect(document.querySelector('.manual-check-notification-text img')).toBeNull();
    });
  });

});
