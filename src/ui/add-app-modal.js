// src/ui/add-app-modal.js - Add app modal helpers and behavior

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

let addAppElementsCache = null;
let addAppModalInitialized = false;
let addAppAbortController = null;
let isQuickAddInProgress = false;

function resetAddAppModalState() {
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

function normalizeAppUrl(url) {
  return url.startsWith('http') ? url : 'https://' + url;
}

function getExistingAppUrls() {
  const urlSet = new Set();
  const nameSet = new Set();

  if (window.AppGridState) {
    // Add programmatically saved custom apps
    try {
      const customApps = window.AppGridState.getCustomApps();
      customApps.forEach((app) => {
        if (app && app.url) {
          urlSet.add(window.AppGridState.getCanonicalUrl(normalizeAppUrl(app.url)));
        }
      });
    } catch (e) { void 0; }

    // Also inspect the DOM for apps inside .app-grid (match by visible name)
    try {
      const names = Array.from(document.querySelectorAll('.app-grid .app-name')).map(n => (n.textContent || '').trim());
      names.forEach(n => {
        if (n) nameSet.add(n.toLowerCase());
      });
    } catch (e) { void 0; }
  }

  return { urls: urlSet, names: nameSet };
}

function resetPreviewIcon() {
  const { previewIcon } = getAddAppElements();
  if (previewIcon) {
    previewIcon.innerHTML = DEFAULT_PREVIEW_ICON;
  }
}

function setPreviewIcon(faviconUrl, appName) {
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
    id: 'custom-app-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
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

async function saveCustomApp(appData) {
  const appToSave = await cacheAppIcon(appData);
  if (window.AppGridState && window.AppGridState.hasAppWithUrl(appToSave.url)) {
    closeAddAppModal();
    return;
  }
  if (!AppGridState.addApp(appToSave)) {
    return;
  }
  if (window.renderCustomApps) {
    window.renderCustomApps();
  }
  closeAddAppModal();
}

async function addAppFromInput(url) {
  const appData = createAppData(url, extractAppName(url), getFaviconUrl(url));
  await saveCustomApp(appData);
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
    } catch (e) { void 0; }

    // Check by visible name inside the app grid
    if (existingNames.has((app.name || '').toLowerCase())) return false;

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
        if (existingUrls.has(canonical) || existingNames.has((app.name || '').toLowerCase())) {
          button.classList.add('duplicate');
          button.title = window.i18n ? window.i18n.t('appAlreadyAdded') : 'This URL is already in your apps';
        }
      }
    } catch (e) { void 0; }
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

function updatePreview() {
  const {
    addAppUrlInput,
    addAppConfirm,
    previewSection,
    previewName,
    previewUrl,
    validationIcon,
    validationMessage,
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
  const appName = extractAppName(url);

  if (previewName) {
    previewName.textContent = appName;
  }
  if (previewUrl) {
    previewUrl.textContent = fullUrl;
  }

  setPreviewIcon(getFaviconUrl(url), appName);

  if (previewSection) {
    previewSection.classList.add('visible');
    previewSection.classList.toggle('valid', isValid);
    previewSection.classList.toggle('invalid', !isValid);
  }

  if (validationIcon) {
    validationIcon.classList.add('show');
    validationIcon.classList.toggle('valid', isValid);
    validationIcon.classList.toggle('invalid', !isValid);
  }

  const isDuplicate = isValid && window.AppGridState && window.AppGridState.hasAppWithUrl(fullUrl);

  if (validationMessage) {
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

  if (addAppConfirm) {
    addAppConfirm.disabled = !isValid || isDuplicate;
  }
}

function openAddAppModal() {
  const { addAppModal, addAppUrlInput, addAppConfirm } = getAddAppElements();

  if (addAppModal) {
    addAppModal.classList.add('modal-open');
  }
  if (addAppUrlInput) {
    addAppUrlInput.value = '';
    addAppUrlInput.focus();
  }
  if (addAppConfirm) {
    addAppConfirm.disabled = true;
  }

  renderDefaultAppsList();
  resetPreviewState();
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

  addAppUrlInput.addEventListener('input', updatePreview, { signal });
  addAppUrlInput.addEventListener('keypress', async function (event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const url = this.value.trim();
    if (!url) {
      return;
    }
    if (addAppConfirm && addAppConfirm.disabled) {
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
      await addAppFromInput(url);
    }, { signal });
  }

  window.addEventListener('languageChanged', function () {
    const { addAppModal } = getAddAppElements();
    if (addAppModal && addAppModal.classList.contains('modal-open')) {
      updatePreview();
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
