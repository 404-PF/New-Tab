// src/features/release-notes.js - Show release notes after an extension update/upgrade

(function () {
  'use strict';

  // Storage key tracking the last version the user has seen release notes for.
  const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';
  // Persisted by the service worker on chrome.runtime.onInstalled so the page
  // can tell a fresh install ('install') apart from an upgrade ('update').
  // Prior to this feature existing, no release ever wrote lastSeenVersion, so
  // an absent key alone is ambiguous between "brand new user" and "existing
  // user who just upgraded into release-notes support". The install reason
  // resolves that ambiguity.
  const INSTALL_REASON_KEY = 'releaseNotesInstallReason';
  const RELEASE_NOTES_BASE_URL = 'https://github.com/404-PF/New-Tab/releases/tag/v';
  let installReasonChangeListener = null;

  // Bundled changelog summaries, keyed by version (extracted from CHANGELOG.md).
  // Kept intentionally short so the modal stays readable. Keys MUST match the
  // runtime `manifest.json` version string exactly (semver, no leading 'v').
  //
  // Every bullet — and the fallback below — is an i18n key, never a raw
  // sentence. English strings live in the inline en table in
  // src/core/languages.js; the eight non-English locales carry their copies in
  // src/core/locales/<code>.js, next to the 0.5.4 bullets. getNotesForVersion
  // renders each key through t(), so a locale whose table has not caught up
  // falls back to English rather than showing the key name.
  //
  // MAINTENANCE: whenever version.js / manifest.json is bumped for a release,
  // add a new entry here plus its i18n keys — one English line in the languages.js
  // en table and one line per non-English locale in src/core/locales/<code>.js —
  // or the modal falls back to RELEASE_NOTES_FALLBACK.
  const RELEASE_NOTES = {
    '0.5.4': [
      'releaseNotes054TodoMultiSelect',
      'releaseNotes054ToolbarIcon',
      'releaseNotes054GamesAppGrid',
      'releaseNotes054FasterStartup',
      'releaseNotes054AiChatHistory',
      'releaseNotes054ShortcutLabels',
      'releaseNotes054OnboardingFreeze',
      'releaseNotes054WeatherSpinner'
    ],
    '0.5.3': [
      'releaseNotes053FasterAnimations',
      'releaseNotes053UnifiedToasts',
      'releaseNotes053WeatherStandalone',
      'releaseNotes053OfflineChatFixes',
      'releaseNotes053OpenRouterTimeouts',
      'releaseNotes053DuckDuckGoSuggestions',
      'releaseNotes053UntranslatedLabels',
      'releaseNotes053ExportKeepsScheduling'
    ],
    '0.5.2': [
      'releaseNotes052PacmanGame',
      'releaseNotes052BackgroundOverlays',
      'releaseNotes052Glassmorphism',
      'releaseNotes052DeleteFromRow',
      'releaseNotes052SaveFailureFeedback'
    ],
    '0.5.1': [
      'releaseNotes051SearchSuggestions',
      'releaseNotes051WebGroundedAi',
      'releaseNotes051TodoDueTimes',
      'releaseNotes051CrossTabSync',
      'releaseNotes051UnsafeUrlSchemes'
    ],
    '0.5.0': [
      'releaseNotes050GamesHub',
      'releaseNotes050PomodoroTimer',
      'releaseNotes050FocusStats',
      'releaseNotes050MultiTimezoneClocks',
      'releaseNotes050HourlyForecast'
    ],
    '0.4.8': [
      'releaseNotes048FocusModeLayout',
      'releaseNotes048EyeCareReminders',
      'releaseNotes048FocusStatsDashboard',
      'releaseNotes048SearchQuickLaunch',
      'releaseNotes048SearchHistoryToggle',
      'releaseNotes048WhatsNewSummary'
    ],
    '0.4.7': [
      'releaseNotes047BackgroundTabCards',
      'releaseNotes047TodoSubtasks',
      'releaseNotes047ThemeScheduling',
      'releaseNotes047MarkdownPreview',
      'releaseNotes047SettingsImportExport',
      'releaseNotes047MultiDayForecast',
      'releaseNotes047CustomShortcuts',
      'releaseNotes047BackgroundRotation',
      'releaseNotes047TodoPriority'
    ]
  };

  // Shown when a version has no bundled summary yet (e.g. a future release
  // where this map was not updated). Keeps the modal useful instead of empty.
  // Keyed like every bullet above so it renders in the active language.
  const RELEASE_NOTES_FALLBACK = [
    'releaseNotesFallback'
  ];

  function getCurrentVersion() {
    return typeof window !== 'undefined' ? window.CURRENT_VERSION || null : null;
  }

  function getLastSeenVersion() {
    try {
      return localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch (error) {
      console.warn('Failed to read last seen version:', error);
      return null;
    }
  }

  function getInstallReason() {
    try {
      return localStorage.getItem(INSTALL_REASON_KEY) || null;
    } catch (error) {
      console.warn('Failed to read install reason:', error);
      return null;
    }
  }

  function setLastSeenVersion(version) {
    try {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
    } catch (error) {
      console.warn('Failed to persist last seen version:', error);
    }
  }

  function stopWaitingForInstallReason() {
    if (
      installReasonChangeListener &&
      window.chrome &&
      window.chrome.storage &&
      window.chrome.storage.onChanged &&
      typeof window.chrome.storage.onChanged.removeListener === 'function'
    ) {
      window.chrome.storage.onChanged.removeListener(installReasonChangeListener);
    }
    installReasonChangeListener = null;
  }

  function waitForInstallReason() {
    if (
      installReasonChangeListener ||
      !window.chrome ||
      !window.chrome.storage ||
      !window.chrome.storage.onChanged ||
      typeof window.chrome.storage.onChanged.addListener !== 'function'
    ) {
      return;
    }

    installReasonChangeListener = function (changes, areaName) {
      if (
        areaName !== 'local' ||
        !changes ||
        !changes[INSTALL_REASON_KEY] ||
        !changes[INSTALL_REASON_KEY].newValue
      ) {
        return;
      }

      stopWaitingForInstallReason();
      detectAndShow();
    };
    window.chrome.storage.onChanged.addListener(installReasonChangeListener);
  }

  // Translate + interpolate. Reuses UpdateChecker.formatMessage when present
  // so behavior stays consistent with the rest of the update/notification UI.
  // If the lookup echoes the key back (i18n unavailable or the key is missing
  // everywhere), fall back to the English table so keyed bullets never render
  // as raw identifiers.
  function t(key, replacements) {
    let message;
    if (window.updateChecker && typeof window.updateChecker.formatMessage === 'function') {
      message = window.updateChecker.formatMessage(key, replacements || {});
    } else {
      message = window.i18n ? window.i18n.t(key) : key;
      if (typeof message !== 'string') {
        message = key;
      }
      if (replacements) {
        Object.entries(replacements).forEach(function (entry) {
          message = message.replace('{' + entry[0] + '}', String(entry[1]));
        });
      }
    }
    if (message === key && window.i18n && typeof window.i18n.getTranslations === 'function') {
      const english = window.i18n.getTranslations('en') || {};
      if (typeof english[key] === 'string' && english[key] !== key) {
        message = english[key];
      }
    }
    return message;
  }

  // Resolve the bundled summary for a version, falling back so the modal is
  // never empty even when this map was not updated for a new release. Every
  // bullet is an i18n key rendered through t(), which resolves to the active
  // language and falls back to English (never the raw key name) when that
  // locale table has no entry for it yet.
  function getNotesForVersion(version) {
    const notes = RELEASE_NOTES[version] || RELEASE_NOTES_FALLBACK;
    return notes.map(function (note) {
      return t(note);
    });
  }

  // Compare two semver strings; uses UpdateChecker when available, else a
  // simple comparison so this module works even if update-checker fails to load.
  function compareVersions(version1, version2) {
    if (window.updateChecker && typeof window.updateChecker.compareVersions === 'function') {
      const result = window.updateChecker.compareVersions(version1, version2);
      if (result !== null) {
        return result;
      }
    }

    const parse = function (v) {
      const match = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
      return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
    };
    const a = parse(version1);
    const b = parse(version2);
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }

  function removeExistingModal() {
    const existing = document.querySelector('.release-notes-modal');
    if (existing) {
      existing.remove();
    }
  }

  // Non-English locale tables are lazy-loaded by languages.js, so building the
  // modal before the active locale registers would show the keyed bullets in
  // English. Wait for ensureLocale() to settle first so translated bullets are
  // used, on both the upgrade path and the delayed install-reason retry. When
  // i18n is unavailable (dev server, unit tests) the modal renders
  // synchronously, keeping detectAndShow() reporting its result with the modal
  // already in the DOM.
  function showReleaseNotesModal(version) {
    const i18n = window.i18n;
    if (
      i18n &&
      typeof i18n.ensureLocale === 'function' &&
      typeof i18n.currentLanguage === 'function'
    ) {
      const pending = i18n.ensureLocale(i18n.currentLanguage());
      if (pending && typeof pending.then === 'function') {
        pending.then(function () {
          renderReleaseNotesModal(version);
        });
        return;
      }
    }
    renderReleaseNotesModal(version);
  }

  function renderReleaseNotesModal(version) {
    removeExistingModal();

    const title = t('releaseNotesTitle');
    const body = t('releaseNotesBody', { version: version });
    const viewFullLabel = t('viewFullChangelog');
    const closeLabel = t('dismiss');

    const notes = getNotesForVersion(version);

    const overlay = document.createElement('div');
    overlay.className = 'release-notes-modal';

    const notesHtml = notes.length
      ? '<ul class="release-notes-list">' +
          notes.map(function (note) {
            return '<li>' + escapeHtml(note) + '</li>';
          }).join('') +
        '</ul>'
      : '';

    overlay.innerHTML = `
      <div class="release-notes-dialog" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
        <div class="release-notes-header">
          <div class="release-notes-icon">🎉</div>
          <h2 class="release-notes-title" id="release-notes-title">${escapeHtml(title)}</h2>
          <button class="release-notes-close" id="release-notes-close" title="${escapeHtml(closeLabel)}" aria-label="${escapeHtml(closeLabel)}">×</button>
        </div>
        <p class="release-notes-version">v${escapeHtml(version)}</p>
        <p class="release-notes-body">${escapeHtml(body)}</p>
        ${notesHtml}
        <div class="release-notes-actions">
          <button class="release-notes-btn release-notes-btn-primary" id="release-notes-view">
            ${escapeHtml(viewFullLabel)}
          </button>
          <button class="release-notes-btn release-notes-btn-secondary" id="release-notes-dismiss">
            ${escapeHtml(closeLabel)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const previouslyFocused = document.activeElement;

    const close = function () {
      if (!overlay.isConnected) {
        return;
      }
      overlay.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };

    const viewBtn = overlay.querySelector('#release-notes-view');
    const dismissBtn = overlay.querySelector('#release-notes-dismiss');
    const closeBtn = overlay.querySelector('#release-notes-close');

    if (viewBtn) {
      viewBtn.addEventListener('click', function () {
        window.open(RELEASE_NOTES_BASE_URL + encodeURIComponent(version), '_blank');
      });
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', close);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        close();
      }
    });

    const getFocusable = function () {
      return Array.prototype.filter.call(
        overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (el) {
          return el.offsetParent !== null || el === document.activeElement;
        }
      );
    };

    document.addEventListener('keydown', function onKeydown(event) {
      if (!overlay.isConnected) {
        document.removeEventListener('keydown', onKeydown);
        return;
      }
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = getFocusable();
        if (!focusable.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    const focusable = getFocusable();
    if (focusable.length) {
      focusable[0].focus();
    }
  }

  function escapeHtml(text) {
    return window.escapeHtml ? window.escapeHtml(text) : String(text);
  }

  // Detect whether the extension was just updated and show release notes if so.
  // Returns 'shown' | 'fresh-install' | 'pending' | 'up-to-date' | 'skipped'
  // for testing/telemetry.
  function detectAndShow() {
    const currentVersion = getCurrentVersion();
    if (!currentVersion) {
      // Not running inside the extension runtime (e.g. dev server).
      return 'skipped';
    }

    const lastSeen = getLastSeenVersion();

    if (!lastSeen) {
      // No stored version. This is ambiguous: it could be a brand-new user
      // (fresh install) or an existing user whose prior release never wrote
      // this key and who just upgraded into release-notes support. The
      // install reason, persisted by the service worker on onInstalled,
      // disambiguates. Only an explicit 'update' reason means we should show
      // the notes — a fresh install, or any build where the reason is missing
      // (e.g. dev server, context invalidation), must stay a silent no-op so
      // we never overlay the first-run / onboarding experience.
      const reason = getInstallReason();
      if (!reason) {
        // The service worker and page start independently after an update.
        // Avoid permanently marking this release as seen until the install
        // reason arrives through chrome.storage.
        waitForInstallReason();
        return 'pending';
      }

      stopWaitingForInstallReason();
      if (reason === 'update') {
        showReleaseNotesModal(currentVersion);
        setLastSeenVersion(currentVersion);
        return 'shown';
      }
      // Fresh install (or an explicit non-update reason): record the version
      // without showing.
      setLastSeenVersion(currentVersion);
      return 'fresh-install';
    }

    if (compareVersions(currentVersion, lastSeen) > 0) {
      // Upgrade detected: show notes, then record the new version.
      showReleaseNotesModal(currentVersion);
      setLastSeenVersion(currentVersion);
      return 'shown';
    }

    // Same or lower version already seen: nothing to do.
    return 'up-to-date';
  }

  function maybeShowReleaseNotes() {
    const skipIfHidden = function () {
      if (window.visibilityManager && !window.visibilityManager.isVisible) {
        const unsubscribe = window.visibilityManager.onChange(function (visible) {
          if (visible) {
            unsubscribe();
            detectAndShow();
          }
        });
        return;
      }
      detectAndShow();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', skipIfHidden);
    } else {
      skipIfHidden();
    }
  }

  // Expose for testing and settings integration.
  window.releaseNotes = {
    detectAndShow: detectAndShow,
    showReleaseNotesModal: showReleaseNotesModal,
    LAST_SEEN_VERSION_KEY: LAST_SEEN_VERSION_KEY,
    INSTALL_REASON_KEY: INSTALL_REASON_KEY,
    RELEASE_NOTES: RELEASE_NOTES
  };

  maybeShowReleaseNotes();
})();
