import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/toast.js');
  injectScript('src/core/update-checker.js');
});

describe('UpdateChecker', () => {
  let checker;

  beforeEach(() => {
    checker = window.updateChecker;
    checker.currentVersion = '1.0.0';
    checker.hideUpdateNotification();
    checker.hideManualCheckNotification();
    document.querySelectorAll('.toast-notification, .manual-check-result')
      .forEach(el => el.remove());

    if (checker._manualCheckResultTimeoutId) clearTimeout(checker._manualCheckResultTimeoutId);
    if (checker._manualCheckResultUnsubscribe) checker._manualCheckResultUnsubscribe();
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

    it('writes the durable inline About result when the auto-check finds an update (#890)', async () => {
      let captured = null;
      window.onDomReady = (cb) => { captured = cb; };
      injectScript('src/core/update-checker.js');

      const instance = window.updateChecker;
      instance.currentVersion = '1.0.0';
      instance.setLastCheckTime(0);
      const release = { version: '2.0.0', url: 'https://example.com' };
      const checkSpy = vi.spyOn(instance, 'checkForUpdates').mockResolvedValue(release);
      const toastSpy = vi.spyOn(instance, 'showUpdateNotification').mockImplementation(() => {});
      const resultSpy = vi.spyOn(instance, 'showManualCheckResult').mockImplementation(() => {});

      await captured();

      expect(toastSpy).toHaveBeenCalledWith(release);
      expect(resultSpy).toHaveBeenCalledWith(
        instance.formatMessage('updateManualNewVersion', { version: '2.0.0' }),
        'updateManualNewVersion',
        { version: '2.0.0' },
        { autoHide: false }
      );

      checkSpy.mockRestore();
      toastSpy.mockRestore();
      resultSpy.mockRestore();
    });

    it('keeps the auto-check About result on screen past the five-second window (#890)', async () => {
      let captured = null;
      window.onDomReady = (cb) => { captured = cb; };
      injectScript('src/core/update-checker.js');

      const instance = window.updateChecker;
      instance.currentVersion = '1.0.0';
      instance.setLastCheckTime(0);

      const aboutSection = document.createElement('section');
      aboutSection.className = 'settings-section';
      aboutSection.setAttribute('data-section', 'about');
      document.body.appendChild(aboutSection);

      vi.useFakeTimers();
      const checkSpy = vi.spyOn(instance, 'checkForUpdates').mockResolvedValue({
        version: '2.0.0',
        url: 'https://example.com'
      });
      const toastSpy = vi.spyOn(instance, 'showUpdateNotification').mockImplementation(() => {});

      try {
        await captured();

        expect(document.querySelector('.manual-check-result')).not.toBeNull();

        vi.advanceTimersByTime(6000);
        expect(document.querySelector('.manual-check-result')).not.toBeNull();
      } finally {
        instance.hideManualCheckResult();
        checkSpy.mockRestore();
        toastSpy.mockRestore();
        vi.useRealTimers();
        aboutSection.remove();
      }
    });
  });

  describe('auto-hide timer isolation', () => {
    it('keeps the update toast on screen while a manual-check result is shown', () => {
      const aboutSection = document.createElement('section');
      aboutSection.className = 'settings-section';
      aboutSection.setAttribute('data-section', 'about');
      document.body.appendChild(aboutSection);

      try {
        const release = { version: '2.0.0', url: 'https://example.com' };
        checker.showUpdateNotification(release);
        const toast = document.querySelector('.toast-notification');
        expect(toast).not.toBeNull();

        checker.showManualCheckResult('New version 2.0.0 available');
        expect(document.querySelector('.toast-notification')).toBe(toast);
        expect(document.querySelector('.manual-check-result')).not.toBeNull();
        expect(checker._manualCheckResultTimeoutId).not.toBeNull();
      } finally {
        checker.hideUpdateNotification();
        checker.hideManualCheckResult();
        aboutSection.remove();
      }
    });
  });

  describe('update notification toast (#890)', () => {
    it('does not expire while the tab is hidden', () => {
      vi.useFakeTimers();
      const listeners = new Set();
      const originalVisibilityManager = window.visibilityManager;
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
        checker.showUpdateNotification({ version: '2.0.0', url: 'https://example.com' });
        vi.advanceTimersByTime(4000);

        // Background the tab for a minute; the countdown pauses.
        setVisible(false);
        vi.advanceTimersByTime(60_000);
        setVisible(true);

        // Only the remaining 6 s of visible time elapse, not a fresh 10 s.
        vi.advanceTimersByTime(5999);
        expect(document.querySelector('.toast-notification')).not.toBeNull();
        vi.advanceTimersByTime(1);
        vi.advanceTimersByTime(300); // fade-out completes
        expect(document.querySelector('.toast-notification')).toBeNull();
      } finally {
        checker.hideUpdateNotification();
        window.visibilityManager = originalVisibilityManager;
        vi.useRealTimers();
      }
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

    it('gives a second manual-check result a fresh five-second window', () => {
      vi.useFakeTimers();
      try {
        checker.showManualCheckResult('first');
        vi.advanceTimersByTime(4000);
        checker.showManualCheckResult('second');

        vi.advanceTimersByTime(4900);
        expect(document.querySelector('.manual-check-result')?.textContent).toBe('second');
        vi.advanceTimersByTime(100);
        expect(document.querySelector('.manual-check-result')).toBeNull();
      } finally {
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

  describe('parseVersion', () => {
    it('accepts 1-4 numeric core parts and pads missing parts with 0', () => {
      expect(checker.parseVersion('7').coreParts).toEqual([7, 0, 0]);
      expect(checker.parseVersion('0.6').coreParts).toEqual([0, 6, 0]);
      expect(checker.parseVersion('v0.6').coreParts).toEqual([0, 6, 0]);
      expect(checker.parseVersion('0.5.1').coreParts).toEqual([0, 5, 1]);
      expect(checker.parseVersion('1.2.3.4').coreParts).toEqual([1, 2, 3, 4]);
    });

    it('still handles prerelease and build suffixes', () => {
      const threePart = checker.parseVersion('1.2.3-rc.1+build.5');
      expect(threePart.coreParts).toEqual([1, 2, 3]);
      expect(threePart.prereleaseParts).toEqual(['rc', '1']);

      const fourPart = checker.parseVersion('1.2.3.4-beta');
      expect(fourPart.coreParts).toEqual([1, 2, 3, 4]);
      expect(fourPart.prereleaseParts).toEqual(['beta']);
    });

    it('rejects non-version strings and versions with more than 4 core parts', () => {
      expect(checker.parseVersion('1.2.3.4.5')).toBeNull();
      expect(checker.parseVersion('vX.Y')).toBeNull();
      expect(checker.parseVersion(null)).toBeNull();
    });

    it('compares mixed-length versions with missing parts treated as 0', () => {
      expect(checker.compareVersions('0.6', '0.5.1')).toBe(1);
      expect(checker.compareVersions('1.2.3.4', '1.2.3')).toBe(1);
      expect(checker.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(checker.compareVersions('0.6', '1.0.0')).toBe(-1);
    });
  });

  describe('checkForUpdates attempt recording', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('records the attempt when the fetch fails and throttles the next check', async () => {
      checker.setLastCheckTime(0);
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue(null);

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
      expect(checker.getLastCheckTime()).toBeGreaterThan(0);
      expect(checker.shouldCheck()).toBe(false);
    });

    it('does not fetch again on a subsequent load within the check interval', async () => {
      checker.setLastCheckTime(0);
      const fetchSpy = vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue(null);

      await checker.checkForUpdates();
      await checker.checkForUpdates();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      fetchSpy.mockRestore();
    });

    it('records the attempt when the release version cannot be compared', async () => {
      checker.setLastCheckTime(0);
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue({
        version: 'not-a-version',
        url: 'https://example.com'
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      expect(checker.getLastCheckTime()).toBeGreaterThan(0);
      expect(checker.shouldCheck()).toBe(false);
      warnSpy.mockRestore();
    });

    it('handles a 4-part release tag without warning and records the attempt', async () => {
      checker.setLastCheckTime(0);
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue({
        version: '0.6.7.8',
        url: 'https://example.com'
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(checker.getLastCheckTime()).toBeGreaterThan(0);
      expect(checker.shouldCheck()).toBe(false);
      warnSpy.mockRestore();
    });

    it('still returns the release when a shorter-tagged version is newer', async () => {
      checker.setLastCheckTime(0);
      const release = { version: '2.0', url: 'https://example.com' };
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue(release);

      const result = await checker.checkForUpdates();

      expect(result).toBe(release);
      expect(checker.getLastCheckTime()).toBeGreaterThan(0);
    });

    it('reports a last-checked status instead of neverChecked after a failed attempt', async () => {
      checker.setLastCheckTime(0);
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue(null);

      await checker.checkForUpdates();

      expect(checker.getUpdateStatus()).not.toBe('neverChecked');
      expect(checker.getUpdateStatus()).toBe('lastCheckedLessThanHour');
    });
  });

  describe('manualCheck attempt recording', () => {
    beforeEach(() => {
      vi.spyOn(checker, 'hasCurrentVersion').mockReturnValue(true);
      vi.spyOn(checker, 'showManualCheckNotification').mockImplementation(() => {});
      vi.spyOn(checker, 'showManualCheckResult').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('records the attempt when the manual fetch fails', async () => {
      checker.setLastCheckTime(0);
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue(null);

      await checker.manualCheck();

      expect(checker.getLastCheckTime()).toBeGreaterThan(0);
      expect(checker.shouldCheck()).toBe(false);
      expect(checker.getUpdateStatus()).not.toBe('neverChecked');
    });

    it('records the attempt when the manual check cannot compare versions', async () => {
      checker.setLastCheckTime(0);
      vi.spyOn(checker, 'fetchLatestRelease').mockResolvedValue({
        version: 'not-a-version',
        url: 'https://example.com'
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await checker.manualCheck();

      expect(checker.getLastCheckTime()).toBeGreaterThan(0);
      expect(checker.shouldCheck()).toBe(false);
    });
  });

  describe('notification content security', () => {
    it('renders untrusted content as text on the toast (#890)', () => {
      const payload = '<img src=x onerror=alert(1)>';
      vi.spyOn(checker, 'formatMessage').mockReturnValue(payload);
      checker.showUpdateNotification({ version: payload, url: 'https://example.com' });
      const updateToast = document.querySelector('.toast-notification');
      expect(updateToast.textContent).toContain(payload);
      expect(updateToast.querySelector('img')).toBeNull();

      checker.showManualCheckNotification(payload);
      const manualToast = document.querySelector('.toast-notification');
      expect(manualToast.textContent).toBe(payload);
      expect(manualToast.querySelector('img')).toBeNull();
      vi.restoreAllMocks();
    });
  });

});
