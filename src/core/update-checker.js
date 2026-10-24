// src/core/update-checker.js - Automatic update checking from GitHub releases

class UpdateChecker {
  constructor() {
    this.repo = '404-PF/New-Tab';
    this.apiUrl = `https://api.github.com/repos/${this.repo}/releases/latest`;
    this.currentVersion = typeof window !== 'undefined' ? window.CURRENT_VERSION || null : null;
    this.checkInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this._manualCheckResultTimeoutId = null; // Track manual-check-result auto-hide timeout
    this._manualCheckResultUnsubscribe = null; // Track manual-check-result visibility unsubscribe
    this._manualCheckResultGetRemaining = null; // Visible time left on the manual-check-result timer
    this._manualCheckResultState = null; // Last inline About result: { message, key, replacements, remaining }
    this._updateToastHandle = null; // Handle for the active update toast (#890)
    this._manualCheckToastHandle = null; // Handle for the active manual-check toast (#890)
  }

  hasCurrentVersion() {
    return typeof this.currentVersion === 'string' && this.currentVersion.length > 0;
  }

  t(key) {
    return window.i18n ? window.i18n.t(key) : key;
  }

  formatMessage(key, replacements = {}) {
    let message = this.t(key);

    Object.entries(replacements).forEach(([placeholder, value]) => {
      message = message.replace(`{${placeholder}}`, value);
    });

    return message;
  }

  // Check if update checking is enabled
  isEnabled() {
    return localStorage.getItem('updateCheckEnabled') !== 'false';
  }

  // Enable/disable update checking
  setEnabled(enabled) {
    localStorage.setItem('updateCheckEnabled', enabled);
  }

  // Get last check time
  getLastCheckTime() {
    const time = localStorage.getItem('lastUpdateCheck');
    if (!time) {
      return 0;
    }

    const parsedTime = Number(time);
    if (!Number.isSafeInteger(parsedTime) || parsedTime < 0 || parsedTime > Date.now()) {
      localStorage.setItem('lastUpdateCheck', '0');
      return 0;
    }

    return parsedTime;
  }

  // Set last check time
  setLastCheckTime(time = Date.now()) {
    localStorage.setItem('lastUpdateCheck', time.toString());
  }

  // Check if we should perform an update check
  shouldCheck() {
    if (!this.hasCurrentVersion()) return false;
    if (!this.isEnabled()) return false;
    const lastCheck = this.getLastCheckTime();
    const now = Date.now();
    return (now - lastCheck) > this.checkInterval;
  }

  // Fetch latest release from GitHub API
  async fetchLatestRelease() {
    try {
      const response = await fetch(this.apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      const data = await response.json();
      return {
        version: data.tag_name.replace(/^v/, ''), // Remove 'v' prefix if present
        url: data.html_url,
        publishedAt: data.published_at,
        body: data.body
      };
    } catch (error) {
      console.error('Failed to fetch latest release:', error);
      return null;
    }
  }

  // Compare versions using semantic versioning
  parseVersion(version) {
    if (typeof version !== 'string') {
      return null;
    }

    const normalizedVersion = version.trim().replace(/^v/i, '');
    const match = normalizedVersion.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);

    if (!match) {
      return null;
    }

    const coreParts = [match[1], match[2], match[3], match[4]]
      .filter((part) => part !== undefined)
      .map(Number);
    while (coreParts.length < 3) {
      coreParts.push(0);
    }

    return {
      coreParts,
      prereleaseParts: match[5] ? match[5].split('.') : []
    };
  }

  compareVersions(version1, version2) {
    const parsedVersion1 = this.parseVersion(version1);
    const parsedVersion2 = this.parseVersion(version2);

    if (!parsedVersion1 || !parsedVersion2) {
      return null;
    }

    const maxCoreLength = Math.max(parsedVersion1.coreParts.length, parsedVersion2.coreParts.length);

    for (let i = 0; i < maxCoreLength; i++) {
      const v1Part = parsedVersion1.coreParts[i] || 0;
      const v2Part = parsedVersion2.coreParts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    const hasPrerelease1 = parsedVersion1.prereleaseParts.length > 0;
    const hasPrerelease2 = parsedVersion2.prereleaseParts.length > 0;

    if (!hasPrerelease1 && !hasPrerelease2) {
      return 0;
    }

    if (!hasPrerelease1) {
      return 1;
    }

    if (!hasPrerelease2) {
      return -1;
    }

    const maxPrereleaseLength = Math.max(parsedVersion1.prereleaseParts.length, parsedVersion2.prereleaseParts.length);

    for (let i = 0; i < maxPrereleaseLength; i++) {
      const identifier1 = parsedVersion1.prereleaseParts[i];
      const identifier2 = parsedVersion2.prereleaseParts[i];

      if (identifier1 === undefined) return -1;
      if (identifier2 === undefined) return 1;

      const identifier1IsNumber = /^\d+$/.test(identifier1);
      const identifier2IsNumber = /^\d+$/.test(identifier2);

      if (identifier1IsNumber && identifier2IsNumber) {
        const numeric1 = Number(identifier1);
        const numeric2 = Number(identifier2);

        if (numeric1 > numeric2) return 1;
        if (numeric1 < numeric2) return -1;
        continue;
      }

      if (identifier1IsNumber) return -1;
      if (identifier2IsNumber) return 1;

      if (identifier1 > identifier2) return 1;
      if (identifier1 < identifier2) return -1;
    }
    return 0;
  }

  // Check for updates
  async checkForUpdates() {
    if (!this.shouldCheck()) return null;

    const latestRelease = await this.fetchLatestRelease();
    this.setLastCheckTime();
    if (!latestRelease) return null;

    const comparison = this.compareVersions(latestRelease.version, this.currentVersion);
    if (comparison === null) {
      console.warn('Skipping update check because version strings could not be compared:', {
        latestReleaseVersion: latestRelease.version,
        currentVersion: this.currentVersion
      });
      return null;
    }

    if (comparison > 0) {
      // New version available
      return latestRelease;
    }

    return null; // No update available
  }

  // Shared clear helper matching _scheduleTimedAutoHide's key convention
  _clearTimedAutoHide(stateKey) {
    const timeoutKey = `_${stateKey}TimeoutId`;
    const unsubscribeKey = `_${stateKey}Unsubscribe`;
    this[`_${stateKey}GetRemaining`] = null;
    if (this[timeoutKey]) {
      clearTimeout(this[timeoutKey]);
      this[timeoutKey] = null;
    }
    if (this[unsubscribeKey]) {
      this[unsubscribeKey]();
      this[unsubscribeKey] = null;
    }
  }

  // Show update notification as a toast with a View Release action (#890).
  // Deliberately shorter-lived than the old 30 s banner: the toast is a
  // transient nudge and the inline About-section result written alongside it
  // (see manualCheck and the auto-check on load) is the durable record.
  showUpdateNotification(release) {
    if (typeof window.showToast !== 'function') {
      console.warn('[update-checker] showToast unavailable; update notification dropped');
      return;
    }

    const message = this.formatMessage('updateNotificationBody', { version: release.version });
    const viewReleaseLabel = this.t('updateNotificationViewRelease');

    this._updateToastHandle = window.showToast(message, 'info', {
      duration: 10000,
      action: {
        label: viewReleaseLabel,
        onClick: () => window.open(release.url, '_blank')
      }
    });
  }

  // Generic visibility-aware auto-hide scheduler, keyed by state name
  // e.g. stateKey 'manualCheckResult' -> uses _manualCheckResultTimeoutId /
  // _manualCheckResultUnsubscribe
  _scheduleTimedAutoHide(stateKey, callback, delay) {
    const timeoutKey = `_${stateKey}TimeoutId`;
    const unsubscribeKey = `_${stateKey}Unsubscribe`;

    const clear = () => {
      this._clearTimedAutoHide(stateKey);
    };

    clear();

    if (window.visibilityManager) {
      let remaining = delay;
      let startTime = Date.now();

      const hide = () => {
        clear();
        callback();
      };

      const onVisibilityChange = (visible) => {
        if (visible) {
          startTime = Date.now();
          this[timeoutKey] = setTimeout(hide, remaining);
        } else if (this[timeoutKey]) {
          remaining -= Date.now() - startTime;
          clearTimeout(this[timeoutKey]);
          this[timeoutKey] = null;
        }
      };

      this[unsubscribeKey] = window.visibilityManager.onChange(onVisibilityChange);
      // Remaining visible time; paused while the tab is hidden.
      this[`_${stateKey}GetRemaining`] = () =>
        this[timeoutKey] ? remaining - (Date.now() - startTime) : remaining;

      if (window.visibilityManager.isVisible) {
        this[timeoutKey] = setTimeout(hide, remaining);
      }
    } else {
      const startTime = Date.now();
      this[timeoutKey] = setTimeout(() => {
        clear();
        callback();
      }, delay);
      this[`_${stateKey}GetRemaining`] = () => delay - (Date.now() - startTime);
    }
  }

  // Dismiss the update toast this checker started. Dismisses only its own
  // toast handle, never an unrelated toast occupying the single slot (#890).
  hideUpdateNotification() {
    if (this._updateToastHandle) {
      this._updateToastHandle.dismiss();
      this._updateToastHandle = null;
    }
  }

  // Show manual check notification (for all manual check results) as a
  // semantic toast variant (#890): the old emoji icon and Dismiss button are
  // replaced by the toast's color coding and auto-hide.
  showManualCheckNotification(message, type = 'info') {
    if (typeof window.showToast !== 'function') {
      console.warn('[update-checker] showToast unavailable; manual check notification dropped:', message);
      return;
    }

    this._manualCheckToastHandle = window.showToast(message, type, { duration: 5000 });
  }

  // Dismiss the manual-check toast this checker started (own toast only).
  hideManualCheckNotification() {
    if (this._manualCheckToastHandle) {
      this._manualCheckToastHandle.dismiss();
      this._manualCheckToastHandle = null;
    }
  }

  // Manual check for updates (called from settings)
  async manualCheck() {
    if (!this.hasCurrentVersion()) {
      const message = this.t('updateChecksBrowserOnly');
      this.showManualCheckNotification(message, 'info');
      this.showManualCheckResult(message, 'updateChecksBrowserOnly');
      return;
    }

    const latestRelease = await this.fetchLatestRelease();
    // Record the attempt even when the fetch or version comparison fails (#825).
    this.setLastCheckTime();
    if (!latestRelease) {
      const errorMessage = this.t('updateCheckFailed');
      this.showManualCheckNotification(errorMessage, 'error');
      this.showManualCheckResult(errorMessage, 'updateCheckFailed');
      return;
    }

    const comparison = this.compareVersions(latestRelease.version, this.currentVersion);
    if (comparison === null) {
      const message = this.t('updateCheckUnsupportedVersion');
      console.warn('Skipping manual update check because version strings could not be compared:', {
        latestReleaseVersion: latestRelease.version,
        currentVersion: this.currentVersion
      });
      this.showManualCheckNotification(message, 'warning');
      this.showManualCheckResult(message, 'updateCheckUnsupportedVersion');
      return;
    }

    if (comparison > 0) {
      // New version available: show the update toast plus the inline About
      // result. Skip the separate manual-check toast — the single toast slot
      // means it would replace the update toast and its View Release action.
      this.showUpdateNotification(latestRelease);
      const message = this.formatMessage('updateManualNewVersion', { version: latestRelease.version });
      this.showManualCheckResult(message, 'updateManualNewVersion', { version: latestRelease.version });
    } else if (comparison < 0) {
      // Development version
      const replacements = {
        currentVersion: this.currentVersion,
        latestVersion: latestRelease.version
      };
      const message = this.formatMessage('updateManualDevelopmentVersion', replacements);
      this.showManualCheckNotification(message, 'warning');
      this.showManualCheckResult(message, 'updateManualDevelopmentVersion', replacements);
    } else {
      // Up to date
      const message = this.t('updateManualLatestVersion');
      this.showManualCheckNotification(message, 'success');
      this.showManualCheckResult(message, 'updateManualLatestVersion');
    }
  }

  // Show manual check result. When i18nKey is provided, rebuilds re-render the
  // text via formatMessage so a languageChanged refresh re-translates it.
  showManualCheckResult(message, i18nKey = null, replacements = {}) {
    // A new result gets a fresh window; drop the previous result's timer so
    // its remaining time is not carried over.
    this._clearTimedAutoHide('manualCheckResult');
    this._manualCheckResultState = {
      message,
      key: i18nKey || null,
      replacements: replacements || {},
      remaining: 5000
    };
    this.renderManualCheckResult();
  }

  // Re-append the stored manual check result after an About-section rebuild,
  // preserving the remaining auto-hide window instead of restarting it
  renderManualCheckResult() {
    const state = this._manualCheckResultState;
    if (!state) return;

    // Carry over the visible time left on the running timer, so time spent
    // in a background tab (when the timer is paused) does not count.
    const getRemaining = this._manualCheckResultGetRemaining;
    if (getRemaining) state.remaining = getRemaining();

    this._clearTimedAutoHide('manualCheckResult');
    const existing = document.querySelector('.manual-check-result');
    if (existing) existing.remove();

    if (state.remaining <= 0) {
      this._manualCheckResultState = null;
      return;
    }

    const aboutSection = document.querySelector('.settings-section[data-section="about"]');
    if (!aboutSection) return;

    const result = document.createElement('div');
    result.className = 'manual-check-result';
    result.textContent = state.key ? this.formatMessage(state.key, state.replacements) : state.message;
    aboutSection.appendChild(result);

    this._scheduleManualCheckResultAutoHide(() => this.hideManualCheckResult(), state.remaining);
  }

  // Hide manual check result and drop its stored state
  hideManualCheckResult() {
    this._clearTimedAutoHide('manualCheckResult');
    this._manualCheckResultState = null;
    const existing = document.querySelector('.manual-check-result');
    if (existing) existing.remove();
  }

  // Schedule auto-hide for manual check result (separate timer tracking)
  _scheduleManualCheckResultAutoHide(callback, delay) {
    this._scheduleTimedAutoHide('manualCheckResult', callback, delay);
  }

  // Get update status for about section
  getUpdateStatus() {
    if (!this.hasCurrentVersion()) {
      return this.t('updateChecksUnavailableOutsideRuntime');
    }

    if (!this.isEnabled()) {
      return this.t('updateChecksDisabled');
    }

    const lastCheck = this.getLastCheckTime();
    if (lastCheck === 0) {
      return this.t('neverChecked');
    }

    const now = Date.now();
    const hoursSince = Math.floor((now - lastCheck) / (1000 * 60 * 60));
    if (hoursSince < 1) {
      return this.t('lastCheckedLessThanHour');
    } else if (hoursSince < 24) {
      const key = hoursSince === 1 ? 'lastCheckedHoursAgo' : 'lastCheckedHoursAgoPlural';
      return this.formatMessage(key, { n: hoursSince });
    } else {
      const daysSince = Math.floor(hoursSince / 24);
      const key = daysSince === 1 ? 'lastCheckedDaysAgo' : 'lastCheckedDaysAgoPlural';
      return this.formatMessage(key, { n: daysSince });
    }
  }
}

// Global instance
const updateChecker = new UpdateChecker();
// Expose to window object for settings.js access
window.updateChecker = updateChecker;

// settings.js renders its About section before this module loads (it sits
// earlier in bootstrap's scriptSources), so its first paint shows the
// "update checker not loaded" fallback. Re-render the section now that
// window.updateChecker is available.
if (typeof window.initAboutSection === 'function') {
  window.initAboutSection();
}

// Auto-check on page load.
// bootstrap.js loads scripts after the DOM is already ready, so a
// DOMContentLoaded listener would never fire. Use onDomReady, which
// calls directly when the document is not loading.
window.onDomReady(async () => {
  if (updateChecker.shouldCheck()) {
    const update = await updateChecker.checkForUpdates();
    if (update) {
      updateChecker.showUpdateNotification(update);
      // The toast is a short-lived nudge; write the durable inline About
      // result too so an available update always leaves a record (#890).
      const message = updateChecker.formatMessage('updateManualNewVersion', { version: update.version });
      updateChecker.showManualCheckResult(message, 'updateManualNewVersion', { version: update.version });
    }
  }
});
