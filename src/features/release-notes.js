// src/features/release-notes.js - Show release notes after an extension update/upgrade

(function () {
  'use strict';

  // Storage key tracking the last version the user has seen release notes for.
  const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';
  const RELEASE_NOTES_BASE_URL = 'https://github.com/404-PF/New-Tab/releases/tag/v';

  // Bundled changelog summaries, keyed by version (extracted from CHANGELOG.md).
  // Kept intentionally short so the modal stays readable. Keys MUST match the
  // runtime `manifest.json` version string exactly (semver, no leading 'v').
  //
  // MAINTENANCE: whenever version.js / manifest.json is bumped for a release,
  // add a new entry here (or the modal falls back to RELEASE_NOTES_FALLBACK).
  const RELEASE_NOTES = {
    '0.4.7': [
      'Redesigned the Background tab with a card-based layout',
      'Added subtasks and checklists to todo items',
      'Added automatic theme scheduling by time of day',
      'Added a markdown preview toggle for notes',
      'Added full settings import and export support',
      'Added a multi-day weather forecast',
      'Added customizable keyboard shortcuts',
      'Added background rotation and scheduling',
      'Added configurable todo priority levels'
    ]
  };

  // Shown when a version has no bundled summary yet (e.g. a future release
  // where this map was not updated). Keeps the modal useful instead of empty.
  const RELEASE_NOTES_FALLBACK = [
    'Check the full changelog for everything included in this update.'
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

  function setLastSeenVersion(version) {
    try {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
    } catch (error) {
      console.warn('Failed to persist last seen version:', error);
    }
  }

  // Translate + interpolate. Reuses UpdateChecker.formatMessage so behavior
  // (including the missing-key fallback) stays consistent with the rest of the
  // update/notification UI.
  function t(key, replacements) {
    if (window.updateChecker && typeof window.updateChecker.formatMessage === 'function') {
      return window.updateChecker.formatMessage(key, replacements || {});
    }
    let message = window.i18n ? window.i18n.t(key) : key;
    if (typeof message !== 'string') {
      message = key;
    }
    if (replacements) {
      Object.entries(replacements).forEach(function (entry) {
        message = message.replace('{' + entry[0] + '}', String(entry[1]));
      });
    }
    return message;
  }

  // Resolve the bundled summary for a version, falling back so the modal is
  // never empty even when this map was not updated for a new release.
  function getNotesForVersion(version) {
    if (RELEASE_NOTES[version]) {
      return RELEASE_NOTES[version];
    }
    return RELEASE_NOTES_FALLBACK;
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

  function showReleaseNotesModal(version) {
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

    const close = function () {
      overlay.remove();
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

    document.addEventListener('keydown', function onEscape(event) {
      if (event.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onEscape);
      }
    });
  }

  function escapeHtml(text) {
    return window.escapeHtml ? window.escapeHtml(text) : String(text);
  }

  // Detect whether the extension was just updated and show release notes if so.
  // Returns 'shown' | 'up-to-date' | 'skipped' for testing/telemetry.
  function detectAndShow() {
    const currentVersion = getCurrentVersion();
    if (!currentVersion) {
      // Not running inside the extension runtime (e.g. dev server).
      return 'skipped';
    }

    const lastSeen = getLastSeenVersion();

    if (!lastSeen) {
      // No stored version. Prior releases (before this feature existed) never
      // wrote this key, so an absent value means an existing install just
      // upgraded to a version with release-notes support. Show the notes once
      // instead of treating it as a clean fresh install.
      showReleaseNotesModal(currentVersion);
      setLastSeenVersion(currentVersion);
      return 'shown';
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
    RELEASE_NOTES: RELEASE_NOTES
  };

  maybeShowReleaseNotes();
})();
