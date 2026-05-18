// src/ui/add-app-modal.js - Add app modal helpers and behavior

window.defaultAppsList = [
  {
    name: "Google",
    url: "https://www.google.com",
    icon: "https://www.google.com/s2/favicons?domain=google.com&sz=64",
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com",
    icon: "https://www.google.com/s2/favicons?domain=youtube.com&sz=64",
  },
  {
    name: "Gmail",
    url: "https://mail.google.com",
    icon: "https://www.google.com/s2/favicons?domain=mail.google.com&sz=64",
  },
  {
    name: "GitHub",
    url: "https://github.com",
    icon: "https://www.google.com/s2/favicons?domain=github.com&sz=64",
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

function resetAddAppModalState() {
  addAppElementsCache = null;
  addAppModalInitialized = false;
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

function getExistingAppNames() {
  const existingNames = new Set();

  if (window.AppGridState && typeof window.AppGridState.getCustomApps === 'function') {
    const customApps = window.AppGridState.getCustomApps();
    if (Array.isArray(customApps)) {
      customApps.forEach((app) => {
        if (app && typeof app.name === 'string' && app.name.trim() !== '') {
          existingNames.add(app.name);
        }
      });
    }
  }

  Array.from(document.querySelectorAll('.app-grid .app-icon .app-name')).forEach((element) => {
    if (element && element.textContent) {
      existingNames.add(element.textContent);
    }
  });

  return existingNames;
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
    validationMessage.classList.remove('show', 'malformed', 'undetectable');
  }
}

function closeAddAppModal() {
  const { addAppModal, addAppUrlInput, addAppConfirm } = getAddAppElements();

  if (addAppModal) {
    addAppModal.style.display = 'none';
  }
  if (addAppUrlInput) {
    addAppUrlInput.value = '';
  }
  if (addAppConfirm) {
    addAppConfirm.disabled = true;
  }

  resetPreviewState();
}

function extractAppName(url) {
  try {
    const urlObj = new URL(normalizeAppUrl(url));
    const name = urlObj.hostname.replace(/^www\./, '').split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (_) {
    return 'App Name';
  }
}

function getFaviconUrl(url) {
  try {
    const urlObj = new URL(normalizeAppUrl(url));
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch (_) {
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
  AppGridState.addApp(appToSave);
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
  const { defaultAppsContainer } = getAddAppElements();
  if (!defaultAppsContainer) {
    return;
  }

  const defaultAppsSection = defaultAppsContainer.closest('.add-app-section');
  const defaultAppsList = Array.isArray(window.defaultAppsList) ? window.defaultAppsList : [];
  const existingNames = getExistingAppNames();
  const availableApps = defaultAppsList.filter((app) => !existingNames.has(app.name));

  defaultAppsContainer.innerHTML = '';
  if (defaultAppsSection) {
    defaultAppsSection.hidden = availableApps.length === 0;
  }

  if (availableApps.length === 0) {
    return;
  }

  for (let i = 0; i < availableApps.length; i++) {
    const app = availableApps[i];
    const button = document.createElement('button');
    button.className = 'quick-add-btn';
    button.innerHTML = `
      <div class="quick-add-icon">
        ${app.icon
          ? `<img src="${app.icon}" alt="${app.name}" />`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21,15 16,10 5,21"></polyline>
            </svg>`
        }
      </div>
      <span class="quick-add-name">${app.name}</span>
    `;
    button.addEventListener('click', async function () {
      if (getExistingAppNames().has(app.name)) {
        return;
      }
      await addDefaultApp(app);
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

  if (validationMessage) {
    validationMessage.textContent = translateValidationMessage(validation.message);
    validationMessage.classList.add('show');
    validationMessage.classList.toggle('malformed', validation.status === 'malformed');
    validationMessage.classList.toggle('undetectable', validation.status === 'undetectable');
  }

  if (addAppConfirm) {
    addAppConfirm.disabled = false;
  }
}

function openAddAppModal() {
  const { addAppModal, addAppUrlInput, addAppConfirm } = getAddAppElements();

  if (addAppModal) {
    addAppModal.style.display = 'flex';
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
  });

  addAppModal.addEventListener('click', function (event) {
    if (event.target === addAppModal) {
      closeAddAppModal();
    }
  });

  if (addAppCancel) {
    addAppCancel.addEventListener('click', function () {
      closeAddAppModal();
    });
  }

  addAppUrlInput.addEventListener('input', updatePreview);
  addAppUrlInput.addEventListener('keypress', async function (event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const url = this.value.trim();
    if (!url) {
      return;
    }
    await addAppFromInput(url);
  });

  if (addAppConfirm) {
    addAppConfirm.addEventListener('click', async function () {
      const url = addAppUrlInput.value.trim();
      if (!url) {
        return;
      }
      await addAppFromInput(url);
    });
  }

  window.addEventListener('languageChanged', function () {
    const { addAppModal } = getAddAppElements();
    if (addAppModal && addAppModal.style.display !== 'none') {
      updatePreview();
    }
  });

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
