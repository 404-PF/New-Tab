// src/features/migrate-legacy.js
//
// One-time "this extension has moved" takeover shown to users of the OLD
// Chrome Web Store listing, redirecting them to the current (new) listing.
//
// This module is inert in a normal build (MIGRATION_ENABLED === false). To
// publish the OLD listing's final update, flip the flag to true and package
// that copy as the old item. We deliberately do NOT hardcode the old extension
// ID here: the repo-wide store-links test (#1040) forbids referencing it, and
// gating on an explicit flag keeps the canonical listing's build clean.
//
// Runtime hooks used (all optional / guarded):
//   - chrome.runtime.setUninstallURL   (no extra permission) points uninstalls
//     of the old item at the new listing.
//   - chrome.management.uninstallSelf  (requires the "management" permission on
//     the old item's final manifest) lets the user remove the old item after
//     installing the new one. The button is hidden when the permission is absent.

const MIGRATION_ENABLED = false;

// Canonical (current) listing. Already referenced elsewhere in the repo
// (tests/store-links.test.js CANONICAL_URL), so this is not a new secret.
const NEW_LISTING_URL =
  'https://chromewebstore.google.com/detail/new-tab/maifjidpfffffeapgephnpdhomkocncd';

// Canonical listing ID. Used only to detect a misconfigured release (this code
// shipped under a non-canonical ID with migration still disabled), never to
// hardcode the old ID — the store-links test (#1040) forbids the old ID, not
// this one.
const CANONICAL_ITEM_ID = 'maifjidpfffffeapgephnpdhomkocncd';

// localStorage key controlling the "remind me later" dismissal for the session.
const REMIND_LATER_KEY = 'legacyMigrationRemindLater';

function t(key, fallback) {
  if (window.i18n && typeof window.i18n.t === 'function') {
    const result = window.i18n.t(key);
    if (result && result !== key) {
      return result;
    }
  }
  return fallback;
}

function isLegacyMigrationEnabled() {
  return MIGRATION_ENABLED === true;
}

// Release-process safety net. If this package is published under a listing other
// than the canonical one but MIGRATION_ENABLED is still false, the old listing's
// users get no redirect. Surface that loudly instead of failing silently. (This
// also fires during local unpacked dev, where it is harmless.)
function warnIfMisconfigured() {
  if (MIGRATION_ENABLED || !chrome || !chrome.runtime) {
    return;
  }
  const id = chrome.runtime.id;
  if (id && id !== CANONICAL_ITEM_ID) {
    console.warn(
      '[migrate-legacy] MIGRATION_ENABLED is false but this package is running ' +
      'under a non-canonical extension ID (' + id + '). If this is the legacy ' +
      'listing, set MIGRATION_ENABLED = true before publishing so its users are ' +
      'redirected to the current listing.'
    );
  }
}

function openNewListing() {
  if (chrome && chrome.tabs && typeof chrome.tabs.create === 'function') {
    chrome.tabs.create({ url: NEW_LISTING_URL });
  } else {
    window.open(NEW_LISTING_URL, '_blank');
  }
}

function buildMigrationOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'legacy-migration-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'legacy-migration-title');
  overlay.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483646;pointer-events:all;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:rgba(10,10,20,0.92);color:#f2f2f2;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'padding:1.5rem;box-sizing:border-box;'
  );

  const card = document.createElement('div');
  card.setAttribute(
    'style',
    'max-width:440px;width:100%;background:#17172a;border:1px solid #2c2c44;' +
      'border-radius:14px;padding:1.75rem 1.75rem 1.5rem;text-align:center;' +
      'box-shadow:0 18px 50px rgba(0,0,0,0.45);'
  );

  const title = document.createElement('h2');
  title.id = 'legacy-migration-title';
  title.textContent = t('migrateLegacyTitle', 'New Tab has moved');
  title.setAttribute(
    'style',
    'margin:0 0 0.75rem;font-size:1.4rem;font-weight:600;color:#ffffff;'
  );

  const message = document.createElement('p');
  message.textContent = t(
    'migrateLegacyMessage',
    'This version is no longer updated. Install the new version to keep getting updates and features.'
  );
  message.setAttribute(
    'style',
    'margin:0 0 0.5rem;font-size:0.98rem;line-height:1.5;opacity:0.9;'
  );

  const note = document.createElement('p');
  note.textContent = t(
    'migrateLegacyNote',
    'Your settings stay in this version, so reconfigure them once in the new one.'
  );
  note.setAttribute(
    'style',
    'margin:0 0 1.5rem;font-size:0.82rem;line-height:1.45;opacity:0.55;'
  );

  const actions = document.createElement('div');
  actions.setAttribute('style', 'display:flex;flex-direction:column;gap:0.6rem;');

  const primaryBtn = document.createElement('button');
  primaryBtn.type = 'button';
  primaryBtn.textContent = t('migrateLegacyInstall', 'Install the new version');
  primaryBtn.setAttribute(
    'style',
    'padding:0.7rem 1rem;border:none;border-radius:9px;cursor:pointer;' +
      'background:#5b8cff;color:#fff;font-size:1rem;font-weight:600;'
  );
  primaryBtn.addEventListener('click', openNewListing);
  primaryBtn.addEventListener('mouseover', function () {
    primaryBtn.style.background = '#4a7bf0';
  });
  primaryBtn.addEventListener('mouseout', function () {
    primaryBtn.style.background = '#5b8cff';
  });

  const remindBtn = document.createElement('button');
  remindBtn.type = 'button';
  remindBtn.textContent = t('migrateLegacyLater', 'Remind me later');
  remindBtn.setAttribute(
    'style',
    'padding:0.55rem 1rem;border:1px solid #3a3a55;border-radius:9px;' +
      'cursor:pointer;background:transparent;color:#cfcfe6;font-size:0.92rem;'
  );
  remindBtn.addEventListener('click', function () {
    try {
      sessionStorage.setItem(REMIND_LATER_KEY, '1');
    } catch {
      /* sessionStorage may be unavailable; ignore. */
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  });
  remindBtn.addEventListener('mouseover', function () {
    remindBtn.style.borderColor = '#55557a';
  });
  remindBtn.addEventListener('mouseout', function () {
    remindBtn.style.borderColor = '#3a3a55';
  });

  actions.appendChild(primaryBtn);
  actions.appendChild(remindBtn);

  // Optional: remove the old item once the user has moved. This needs the
  // "management" permission on the old listing's manifest; hide it otherwise.
  if (chrome && chrome.management && typeof chrome.management.uninstallSelf === 'function') {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = t('migrateLegacyRemove', 'Remove this old version');
    removeBtn.setAttribute(
      'style',
      'padding:0.5rem 1rem;border:none;border-radius:9px;cursor:pointer;' +
        'background:transparent;color:#8a8aa8;font-size:0.82rem;text-decoration:underline;'
    );
    removeBtn.addEventListener('click', function () {
      chrome.management.uninstallSelf({ showConfirmDialog: true });
    });
    actions.appendChild(removeBtn);
  }

  card.appendChild(title);
  card.appendChild(message);
  card.appendChild(note);
  card.appendChild(actions);
  overlay.appendChild(card);

  overlay.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      try {
        sessionStorage.setItem(REMIND_LATER_KEY, '1');
      } catch {
        /* ignore */
      }
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  });

  return { overlay, primaryBtn };
}

function initLegacyMigration() {
  warnIfMisconfigured();

  if (!isLegacyMigrationEnabled()) {
    return;
  }

  // Point any uninstalls of the old item at the new listing so users who
  // remove it still land on the replacement. No extra permission required.
  if (chrome && chrome.runtime && typeof chrome.runtime.setUninstallURL === 'function') {
    try {
      chrome.runtime.setUninstallURL(NEW_LISTING_URL);
    } catch {
      /* setUninstallURL is best-effort. */
    }
  }

  let remindLater = false;
  try {
    remindLater = sessionStorage.getItem(REMIND_LATER_KEY) === '1';
  } catch {
    /* sessionStorage may be unavailable. */
  }
  if (remindLater) {
    return;
  }

  const { overlay, primaryBtn } = buildMigrationOverlay();
  const container = document.body || document.documentElement;
  if (!container) {
    return;
  }
  container.appendChild(overlay);

  // Move focus to the primary action for keyboard users.
  if (typeof primaryBtn.focus === 'function') {
    try {
      primaryBtn.focus();
    } catch {
      /* ignore */
    }
  }
}

window.onDomReady(initLegacyMigration);
