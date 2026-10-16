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
