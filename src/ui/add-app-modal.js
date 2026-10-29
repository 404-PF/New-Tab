// src/ui/add-app-modal.js - Add app modal helpers and behavior

(function () {
  'use strict';

window.defaultAppsList = [
  {
    name: 'Google',
    url: 'https://www.google.com',
    icon: 'https://www.google.com/s2/favicons?domain=google.com&sz=64',
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
  },
  {
    name: 'Gmail',
    url: 'https://mail.google.com',
    icon: 'https://www.google.com/s2/favicons?domain=mail.google.com&sz=64',
  },
  {
    name: 'GitHub',
    url: 'https://github.com',
    icon: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
  },
];
const DEFAULT_PREVIEW_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21,15 16,10 5,21"></polyline>
  </svg>
`;

const ADD_APP_PREVIEW_DEBOUNCE_MS = 150;
let addAppPreviewTimer = null;
// Last settled preview's duplicate verdict, keyed by effective URL: a
// revalidation pass reuses it so an unchanged URL keeps its answer.
let duplicatePreviewUrl = null;
// Non-null while the modal is editing an existing app's URL in place
// (issue #1082); null means create mode.
let editingAppId = null;

let addAppElementsCache = null;
let addAppModalInitialized = false;
let addAppAbortController = null;
let isQuickAddInProgress = false;

function resetAddAppModalState() {
  duplicatePreviewUrl = null;
  editingAppId = null;
  clearTimeout(addAppPreviewTimer);
  addAppPreviewTimer = null;
  addAppElementsCache = null;
  addAppModalInitialized = false;
  isQuickAddInProgress = false;
  if (addAppAbortController) {
    addAppAbortController.abort();
    addAppAbortController = null;
  }
}

function getAddAppElements() {
  if (addAppElementsCache) {
    return addAppElementsCache;
  }

  addAppElementsCache = {
    addAppBtn: document.getElementById('new-app'),
    addAppModal: document.getElementById('add-app-modal'),
    addAppUrlInput: document.getElementById('add-app-url'),
    addAppCancel: document.getElementById('add-app-cancel'),
    addAppConfirm: document.getElementById('add-app-confirm'),
    defaultAppsContainer: document.getElementById('default-apps-list'),
    addAppSection: document.getElementById('add-app-section'),
    previewSection: document.getElementById('add-app-preview'),
    previewIcon: document.getElementById('preview-icon'),
    previewName: document.getElementById('preview-name'),
    previewUrl: document.getElementById('preview-url'),
    validationIcon: document.querySelector('.add-app-url-validation'),
    validationMessage: document.querySelector('.add-app-validation-message'),
  };

  return addAppElementsCache;
}

// Mirrors the storage sanitizer so the confirm button is only enabled for
// URLs AppGridState.addApp will accept (unsafe schemes such as javascript:
// are rejected there).
function isStorableAppUrl(url) {
  if (typeof window.normalizeCustomAppUrl !== 'function') return true;
  return !!window.normalizeCustomAppUrl(url);
}

function normalizeAppUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed || trimmed.startsWith('/')) return trimmed ? trimmed : 'https://' + trimmed;
  if (typeof window.__normalizeAppUrlForCheck === 'function') {
    const checked = window.__normalizeAppUrlForCheck(trimmed);
    if (checked && checked !== trimmed) return checked;
    // Backslash-authority input (for example "\\\\host/path") must never be
    // promoted to an https URL; storage rejects it.
    if (trimmed.startsWith('\\')) return trimmed;
    if (typeof window.normalizeCustomAppUrl === 'function') {
      if (window.normalizeCustomAppUrl(trimmed)) return trimmed;
      const candidate = 'https://' + trimmed;
      if (window.normalizeCustomAppUrl(candidate)) return candidate;
    }
  }
  return trimmed;
}

function normalizeAppName(name) {
  return (name || '').trim().toLowerCase();
}

function getExistingAppUrls(excludeAppId) {
  const urlSet = new Set();
  const nameSet = new Set();

  if (window.AppGridState) {
    // Add programmatically saved custom apps
    try {
      const customApps = window.AppGridState.getCustomApps();
      customApps.forEach((app) => {
        // The app being edited must not count as its own duplicate.
        if (!app || app.id === excludeAppId) return;
        if (app.url) {
          urlSet.add(window.AppGridState.getCanonicalUrl(normalizeAppUrl(app.url)));
        }
        if (app.name) {
          const normalized = normalizeAppName(app.name);
          if (normalized) nameSet.add(normalized);
        }
      });
    } catch { void 0; }

    // Also inspect the DOM for apps inside .app-grid (match by visible name)
    try {
      const names = Array.from(document.querySelectorAll('.app-grid .app-name')).map(n => (n.textContent || '').trim());
      names.forEach(n => {
        const normalized = normalizeAppName(n);
        if (normalized) nameSet.add(normalized);
      });
    } catch { void 0; }
  }

  return { urls: urlSet, names: nameSet };
}

function resetPreviewIcon() {
  const { previewIcon } = getAddAppElements();
  if (previewIcon) {
    previewIcon.innerHTML = DEFAULT_PREVIEW_ICON;
  }
}

function setAddAppPreviewIcon(faviconUrl, appName) {
  const { previewIcon } = getAddAppElements();
  if (!previewIcon) {
    return;
  }

  if (!faviconUrl) {
    resetPreviewIcon();
    return;
  }

  previewIcon.innerHTML = '';
  const image = document.createElement('img');
  image.src = faviconUrl;
  image.alt = appName;
  image.addEventListener('error', () => {
    resetPreviewIcon();
  });
  previewIcon.appendChild(image);
}

function resetPreviewState() {
  duplicatePreviewUrl = null;
  clearTimeout(addAppPreviewTimer);
  addAppPreviewTimer = null;
  const {
    previewSection,
    validationIcon,
    validationMessage,
  } = getAddAppElements();

  resetPreviewIcon();

  if (previewSection) {
    previewSection.classList.remove('visible', 'valid', 'invalid');
  }
  if (validationIcon) {
    validationIcon.classList.remove('show', 'valid', 'invalid');
  }
  if (validationMessage) {
    validationMessage.textContent = '';
    validationMessage.classList.remove('show', 'malformed', 'undetectable', 'duplicate');
  }
}

function closeAddAppModal() {
  const { addAppModal, addAppUrlInput, addAppConfirm } = getAddAppElements();

  if (addAppModal) {
    addAppModal.classList.remove('modal-open');
  }
  if (addAppUrlInput) {
    addAppUrlInput.value = '';
  }
  if (addAppConfirm) {
    addAppConfirm.disabled = true;
  }

  editingAppId = null;
  applyAddAppModalMode(false);
  isQuickAddInProgress = false;
  resetPreviewState();
}

function extractAppName(url) {
  try {
    const urlObj = new URL(normalizeAppUrl(url));
    const name = urlObj.hostname.replace(/^www\./, '').split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'App Name';
  }
}

function getFaviconUrl(url) {
  try {
    const urlObj = new URL(normalizeAppUrl(url));
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return null;
  }
}

function createAppData(url, name, icon) {
  return {
    id: 'custom-app-' + crypto.randomUUID(),
    url: normalizeAppUrl(url),
    name,
    icon,
  };
}

async function cacheAppIcon(appData) {
  if (!appData.icon || !window.iconCache) {
    return appData;
  }

  try {
    const cachedIcon = await window.iconCache.getIconWithCache(appData.icon);
    return { ...appData, cachedIcon };
  } catch (error) {
    console.warn('Failed to cache icon:', error);
    return appData;
  }
}

function showAddAppSaveError() {
  const message = window.getAppGridSaveErrorMessage();
  if (typeof window.showToast === 'function') {
    window.showToast(message, 'error');
    return;
  }

  const { validationMessage, addAppUrlInput } = getAddAppElements();
  if (validationMessage) {
    validationMessage.textContent = message;
    validationMessage.classList.add('show', 'malformed');
    validationMessage.classList.remove('undetectable', 'duplicate');
    if (addAppUrlInput) {
      addAppUrlInput.focus();
    }
    return;
  }

  console.warn(message);
}

async function saveCustomApp(appData) {
  const appToSave = await cacheAppIcon(appData);
  if (window.AppGridState && window.AppGridState.hasAppWithUrl(appToSave.url)) {
    closeAddAppModal();
    return;
  }
  if (!window.AppGridState.addApp(appToSave)) {
    showAddAppSaveError();
    return;
  }
  if (typeof window.addAppIcon === 'function') {
    window.addAppIcon(appToSave);
  }
  closeAddAppModal();
}

async function addAppFromInput(url) {
  if (editingAppId) {
    await saveEditedAppUrl(editingAppId, url);
    return;
  }
  const appData = createAppData(url, extractAppName(url), getFaviconUrl(url));
  await saveCustomApp(appData);
}

// Resolves the custom-app record being edited. Accepts a full app record or
// an id; returns null when the id is unknown so callers fall back to create
// mode.
function resolveEditingApp(appOrId) {
  const id = typeof appOrId === 'string' ? appOrId : appOrId && appOrId.id;
  if (!id || !window.AppGridState) return null;
  return window.AppGridState.getCustomApps().find(app => app.id === id) || null;
}

// Persists an in-place URL edit: keeps the app's grid slot, folder
// membership, name, and (custom) thumbnail; only the URL and any
// auto-derived favicon change. The modal stays open on failure.
async function saveEditedAppUrl(id, url) {
  const previous = window.AppGridState.getCustomApps().find(app => app.id === id);
  const normalized = normalizeAppUrl(url);

  if (!window.AppGridState.updateAppUrl(id, normalized)) {
    showAddAppSaveError();
    return;
  }

  const updated = window.AppGridState.getCustomApps().find(app => app.id === id) || previous;

  // An auto-derived favicon follows the app's URL; a custom thumbnail is kept.
  let iconUrl = updated ? updated.icon : '';
  if (previous && previous.icon && previous.icon === getFaviconUrl(previous.url)) {
    const nextIcon = getFaviconUrl(normalized);
    if (nextIcon) {
      window.AppGridState.updateThumbnail(id, nextIcon);
      iconUrl = nextIcon;
    }
  }

  if (typeof window.updateAppLink === 'function') window.updateAppLink(id, normalized);
  if (typeof window.updateAppIcon === 'function' && iconUrl) window.updateAppIcon(id, iconUrl);

  // A foldered app has no grid tile; its stacked preview and popup tiles
  // must pick up the new URL/icon instead.
  if (window.AppFolders && typeof window.AppFolders.refreshFolderUI === 'function') {
    const folder = window.AppGridState.getFolders()
      .find(f => Array.isArray(f.apps) && f.apps.includes(id));
    if (folder) {
      window.AppFolders.refreshFolderUI(folder.id);
      if (typeof window.AppFolders.renderFolderAppsInPopup === 'function') {
        window.AppFolders.renderFolderAppsInPopup();
      }
    }
  }

  closeAddAppModal();
}

async function addDefaultApp(app) {
  const appData = createAppData(app.url, app.name, app.icon);
  await saveCustomApp(appData);
}

function renderDefaultAppsList() {
  const { defaultAppsContainer, addAppSection } = getAddAppElements();
  if (!defaultAppsContainer) {
    return;
  }

  const suggestedApps = Array.isArray(window.defaultAppsList) ? window.defaultAppsList : [];
  const { urls: existingUrls, names: existingNames } = getExistingAppUrls();

  defaultAppsContainer.innerHTML = '';
  if (addAppSection) {
    addAppSection.hidden = false; // default to visible, hide below if nothing to show
  }

  if (suggestedApps.length === 0) {
    if (addAppSection) addAppSection.hidden = true;
    return;
  }

  // Render only apps that are not present (by url or by name in the app grid)
  const toRender = suggestedApps.filter(app => {
    if (!app) return false;
    // Check by canonical URL when possible
    try {
      if (app.url && window.AppGridState && window.AppGridState.getCanonicalUrl) {
        const canonical = window.AppGridState.getCanonicalUrl(normalizeAppUrl(app.url));
        if (existingUrls.has(canonical)) return false;
      }
    } catch { void 0; }

    // Check by visible name inside the app grid
    if (existingNames.has(normalizeAppName(app.name))) return false;

    return true;
  });

  if (addAppSection) {
    addAppSection.hidden = toRender.length === 0;
  }

  for (let i = 0; i < toRender.length; i++) {
    const app = toRender[i];
    const button = document.createElement('button');
    button.className = 'quick-add-btn';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'quick-add-icon';
    if (app.icon) {
      const img = document.createElement('img');
      img.src = app.icon;
      img.alt = app.name || '';
      iconDiv.appendChild(img);
    } else {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21,15 16,10 5,21"></polyline>';
      iconDiv.appendChild(svg);
    }
    button.appendChild(iconDiv);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'quick-add-name';
    nameSpan.textContent = app.name || '';
    button.appendChild(nameSpan);
    // Mark duplicates defensively (shouldn't appear since we filtered),
    // but keep the attribute in case canonicalization differs.
    try {
      if (app.url && window.AppGridState && window.AppGridState.getCanonicalUrl) {
        const canonical = window.AppGridState.getCanonicalUrl(normalizeAppUrl(app.url));
        if (existingUrls.has(canonical) || existingNames.has(normalizeAppName(app.name))) {
          button.classList.add('duplicate');
          button.title = window.i18n ? window.i18n.t('appAlreadyAdded') : 'This URL is already in your apps';
        }
      }
    } catch { void 0; }
    button.addEventListener('click', async function () {
      if (isQuickAddInProgress) {
        return;
      }
      if (app.url && window.AppGridState && window.AppGridState.hasAppWithUrl(normalizeAppUrl(app.url))) {
        return;
      }
      isQuickAddInProgress = true;
      try {
        await addDefaultApp(app);
      } finally {
        isQuickAddInProgress = false;
      }
    });
    defaultAppsContainer.appendChild(button);
  }
}

function updatePreview(showPreview = true) {
  const {
    addAppUrlInput,
    addAppConfirm,
    validationIcon,
  } = getAddAppElements();

  if (!addAppUrlInput) {
    return;
  }

  const url = addAppUrlInput.value.trim();
  if (!url) {
    resetPreviewState();
    if (addAppConfirm) {
      addAppConfirm.disabled = true;
    }
    return;
  }

  const validation = validateUrl(url);
  const isValid = validation.status === 'valid';
  const fullUrl = validation.url ? validation.url.href : normalizeAppUrl(url);
  // Validate synchronously; defer the preview and duplicate scan while typing.
  const isCreatable = (isValid || validation.status === 'undetectable') &&
    isStorableAppUrl(normalizeAppUrl(url));

  if (showPreview) {
    renderAddAppPreviewFields(url, fullUrl, isValid);
  }

  if (validationIcon) {
    validationIcon.classList.add('show');
    validationIcon.classList.toggle('valid', isValid);
    validationIcon.classList.toggle('invalid', !isValid);
  }

  if (showPreview) {
    settleAddAppDuplicateVerdict(fullUrl, isCreatable);
  }
  const isDuplicate = duplicatePreviewUrl === fullUrl;

  renderAddAppValidationMessage(validation, isDuplicate);

  if (addAppConfirm) {
    addAppConfirm.disabled = !isCreatable || isDuplicate;
  }
  return true;
}

function scheduleAddAppPreview() {
  clearTimeout(addAppPreviewTimer);
  addAppPreviewTimer = null;
  if (updatePreview(false)) {
    addAppPreviewTimer = setTimeout(() => {
      addAppPreviewTimer = null;
      updatePreview();
    }, ADD_APP_PREVIEW_DEBOUNCE_MS);
  }
}

// Paints the preview card: name, URL, favicon and valid/invalid tint.
function renderAddAppPreviewFields(url, fullUrl, isValid) {
  const { previewName, previewUrl, previewSection } = getAddAppElements();
  const appName = extractAppName(url);

  if (previewName) {
    previewName.textContent = appName;
  }
  if (previewUrl) {
    previewUrl.textContent = fullUrl;
  }

  setAddAppPreviewIcon(getFaviconUrl(url), appName);

  if (previewSection) {
    previewSection.classList.add('visible');
    previewSection.classList.toggle('valid', isValid);
    previewSection.classList.toggle('invalid', !isValid);
  }
}

// Settles the duplicate verdict for the shown preview, cached by effective
// URL so an unchanged URL keeps its answer across passes. The app being
// edited is excluded so its own URL never reads as a duplicate of itself.
function settleAddAppDuplicateVerdict(fullUrl, isCreatable) {
  const conflicting = isCreatable && window.AppGridState
    ? (editingAppId
      ? window.AppGridState.hasAppWithUrl(fullUrl, editingAppId)
      : window.AppGridState.hasAppWithUrl(fullUrl))
    : false;
  duplicatePreviewUrl = conflicting ? fullUrl : null;
}

// Duplicate notice when the settled verdict says so, otherwise the raw
// validation verdict text.
function renderAddAppValidationMessage(validation, isDuplicate) {
  const { validationMessage } = getAddAppElements();
  if (!validationMessage) {
    return;
  }
  if (isDuplicate) {
    validationMessage.textContent = window.i18n ? window.i18n.t('appAlreadyAdded') : 'This URL is already in your apps';
    validationMessage.classList.add('show', 'duplicate');
    validationMessage.classList.remove('malformed', 'undetectable');
  } else {
    validationMessage.textContent = translateValidationMessage(validation.message);
    validationMessage.classList.add('show');
    validationMessage.classList.remove('duplicate');
    validationMessage.classList.toggle('malformed', validation.status === 'malformed');
    validationMessage.classList.toggle('undetectable', validation.status === 'undetectable');
  }
}

// A settled duplicate verdict can go stale while the modal stays open: when
// the conflicting app is deleted or its URL changed, Confirm stays disabled
// and Enter blocked until the input changes. A submit whose Confirm is
// disabled by the settled verdict re-checks it against the current apps and,
// when the conflict is gone, clears the verdict and re-derives the preview
// with one synchronous pass so submit can proceed.
function revalidateSettledDuplicateVerdict(fullUrl) {
  if (duplicatePreviewUrl !== fullUrl) {
    return;
  }
  const { urls } = getExistingAppUrls(editingAppId);
  if (window.AppGridState?.getCanonicalUrl && urls.has(window.AppGridState.getCanonicalUrl(fullUrl))) {
    return;
  }
  duplicatePreviewUrl = null;
  clearTimeout(addAppPreviewTimer);
  addAppPreviewTimer = null;
  updatePreview();
}

// Submitters settle an outstanding preview synchronously so a URL whose
// duplicate scan is still pending cannot reach the save path, which would
// dismiss the modal instead of showing the duplicate warning.
function settlePendingPreviewBeforeSubmit() {
  const { addAppConfirm, addAppUrlInput } = getAddAppElements();
  if (addAppConfirm?.disabled && addAppUrlInput?.value) {
    const url = addAppUrlInput.value.trim();
    const validation = validateUrl(url);
    const fullUrl = validation.url ? validation.url.href : normalizeAppUrl(url);
    revalidateSettledDuplicateVerdict(fullUrl);
    if (addAppConfirm.disabled) {
      return false;
    }
  }
  if (addAppPreviewTimer !== null) {
    clearTimeout(addAppPreviewTimer);
    addAppPreviewTimer = null;
    updatePreview();
  }
  return !addAppConfirm?.disabled;
}

// Swaps the modal chrome between create and edit copy. Updating the
// data-i18n attributes keeps later applyLanguage() sweeps in sync with the
// active mode. Missing elements are tolerated so test stubs and partial
// DOMs degrade gracefully.
function applyAddAppModalMode(editing) {
  const { addAppModal, addAppSection, addAppConfirm } = getAddAppElements();
  const title = addAppModal ? addAppModal.querySelector('h3') : null;
  const description = addAppModal ? addAppModal.querySelector('.add-app-header-text p') : null;
  const confirmLabel = addAppConfirm ? addAppConfirm.querySelector('span[data-i18n]') : null;
  const translate = (key, fallback) => (
    window.i18n && window.i18n.t ? window.i18n.t(key) : fallback
  );

  if (title) {
    const titleKey = editing ? 'editAppTitle' : 'newAppTitle';
    title.setAttribute('data-i18n', titleKey);
    title.textContent = translate(titleKey, editing ? 'Edit App' : 'Add New App');
  }
  if (description) {
    const descriptionKey = editing ? 'editAppDescription' : 'newAppDescription';
    description.setAttribute('data-i18n', descriptionKey);
    description.textContent = translate(
      descriptionKey,
      editing ? 'Enter a new URL for this app' : 'Enter a website URL to add it to your apps'
    );
  }
  if (confirmLabel) {
    const confirmKey = editing ? 'save' : 'create';
    confirmLabel.setAttribute('data-i18n', confirmKey);
    confirmLabel.textContent = translate(confirmKey, editing ? 'Save' : 'Create');
  }
  if (addAppSection) {
    addAppSection.hidden = editing;
  }
}

// Opens the modal for creating a new app, or — when appOrId resolves to an
// existing custom app — for editing that app's URL in place (issue #1082).
function openAddAppModal(appOrId) {
  const { addAppModal, addAppUrlInput, addAppConfirm } = getAddAppElements();
  const editingApp = resolveEditingApp(appOrId);
  editingAppId = editingApp ? editingApp.id : null;

  if (addAppModal) {
    addAppModal.classList.add('modal-open');
  }
  applyAddAppModalMode(!!editingAppId);
  resetPreviewState();
  if (addAppUrlInput) {
    addAppUrlInput.value = editingApp ? String(editingApp.url || '') : '';
    addAppUrlInput.focus();
  }
  if (addAppConfirm) {
    addAppConfirm.disabled = true;
  }

  if (editingAppId) {
    // Validate the prefilled URL immediately so its duplicate verdict
    // (excluding this app) settles before the user interacts.
    updatePreview();
  } else {
    renderDefaultAppsList();
  }
}

function bindAddAppModal() {
  if (addAppModalInitialized) {
    return;
  }

  addAppAbortController = new AbortController();
  const signal = addAppAbortController.signal;

  const {
    addAppBtn,
    addAppModal,
    addAppUrlInput,
    addAppCancel,
    addAppConfirm,
  } = getAddAppElements();

  if (!addAppBtn || !addAppModal || !addAppUrlInput) {
    return;
  }

  addAppBtn.addEventListener('click', function (event) {
    event.preventDefault();
    openAddAppModal();
  }, { signal });

  addAppModal.addEventListener('click', function (event) {
    if (event.target === addAppModal) {
      closeAddAppModal();
    }
  }, { signal });

  if (addAppCancel) {
    addAppCancel.addEventListener('click', function () {
      closeAddAppModal();
    }, { signal });
  }

  addAppUrlInput.addEventListener('input', scheduleAddAppPreview, { signal });
  addAppUrlInput.addEventListener('keypress', async function (event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const url = this.value.trim();
    if (!url) {
      return;
    }
    if (!settlePendingPreviewBeforeSubmit()) {
      return;
    }
    await addAppFromInput(url);
  }, { signal });

  if (addAppConfirm) {
    addAppConfirm.addEventListener('click', async function () {
      const url = addAppUrlInput.value.trim();
      if (!url) {
        return;
      }
      if (!settlePendingPreviewBeforeSubmit()) {
        return;
      }
      await addAppFromInput(url);
    }, { signal });
  }

  window.addEventListener('languageChanged', function () {
    const { addAppModal } = getAddAppElements();
    if (addAppModal && addAppModal.classList.contains('modal-open')) {
      scheduleAddAppPreview();
    }
  }, { signal });

  addAppModalInitialized = true;
}

function initAddAppModal() {
  bindAddAppModal();
}

window.initAddAppModal = initAddAppModal;
window.renderDefaultAppsList = renderDefaultAppsList;
window.closeAddAppModal = closeAddAppModal;
window.updateAddAppPreview = updatePreview;
window.openAddAppModal = openAddAppModal;
window.resetAddAppModalState = resetAddAppModalState;

})();
