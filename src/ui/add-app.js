// src/ui/add-app.js - Add app modal and functionality

// Default apps list
const defaultAppsList = [];

// Render default apps list in modal - modern grid layout
function renderDefaultAppsList() {
  const container = document.getElementById("default-apps-list");
  if (!container) return;
  container.innerHTML = "";
  // Cache existing app names
  const existingNames = new Set(Array.from(document.querySelectorAll(".app-icon .app-name")).map(e => e.textContent));
  for (let i = 0; i < defaultAppsList.length; i++) {
    const app = defaultAppsList[i];
    const btn = document.createElement("button");
    btn.className = 'quick-add-btn';
    btn.innerHTML = `
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
    btn.addEventListener("click", async function () {
      if (existingNames.has(app.name)) return;
      const id = 'custom-app-' + Date.now() + '-' + Math.floor(Math.random()*100000);
      const appData = { id, url: app.url, name: app.name, icon: app.icon };

      // Cache the icon if available
      if (app.icon && window.iconCache) {
        try {
          const cachedIcon = await window.iconCache.getIconWithCache(app.icon);
          appData.cachedIcon = cachedIcon;
        } catch (error) {
          console.warn('Failed to cache icon:', error);
        }
      }

      AppGridState.addApp(appData);
      if (window.renderCustomApps) window.renderCustomApps();
      const modal = document.getElementById("add-app-modal");
      if (modal) modal.style.display = "none";
    });
    container.appendChild(btn);
  }
}

// Add App Modal
const addAppBtn = document.getElementById("new-app");
const addAppModal = document.getElementById("add-app-modal");
const addAppUrlInput = document.getElementById("add-app-url");
const addAppCancel = document.getElementById("add-app-cancel");
const addAppConfirm = document.getElementById("add-app-confirm");
const DEFAULT_PREVIEW_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21,15 16,10 5,21"></polyline>
  </svg>
`;

function resetPreviewIcon() {
  const previewIcon = document.getElementById('preview-icon');
  if (previewIcon) {
    previewIcon.innerHTML = DEFAULT_PREVIEW_ICON;
  }
}

function resetPreviewState() {
  const previewSection = document.getElementById('add-app-preview');
  const validationIcon = document.querySelector('.add-app-url-validation');
  const validationMessage = document.querySelector('.add-app-validation-message');

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
  if (addAppModal) {
    addAppModal.style.display = 'none';
  }
  if (addAppUrlInput) {
    addAppUrlInput.value = '';
  }

  resetPreviewState();

  if (addAppConfirm) {
    addAppConfirm.disabled = true;
  }
}

// Extract app name from URL
function extractAppName(url) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    let name = urlObj.hostname.replace(/^www\./, '').split('.')[0];
    // Capitalize first letter
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return name;
  } catch (_) {
    return 'App Name';
  }
}

// Get favicon URL
function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch (_) {
    return null;
  }
}

// Translate validation message
function translateValidationMessage(message) {
  if (!message) return '';
  
  // Use window.i18n.t if available, otherwise use original message
  const translateFn = (window.i18n && window.i18n.t) ? window.i18n.t : (key => key);
  
  // Map English validation messages to translation keys
  const messageMap = {
    'Please enter a URL or search query': 'validationPleaseEnter',
    'This URL appears to be invalid. Press Enter to Create': 'validationInvalidAppears',
    'Invalid URL: missing hostname': 'validationMissingHostname',
    'Invalid URL: hostname contains invalid characters': 'validationInvalidChars',
    'Invalid URL: top-level domain too short': 'validationTldTooShort',
    'Invalid URL: incomplete domain name': 'validationIncompleteDomain',
    'Invalid URL: IP address out of range': 'validationIpOutOfRange',
    'Valid URL': 'validationValid'
  };
  
  // Check if message starts with 'Malformed URL:'
  if (message.startsWith('Malformed URL:')) {
    return translateFn('validationMalformed');
  }
  
  const key = messageMap[message];
  return key ? translateFn(key) : message;
}

// Update preview based on input
function updatePreview() {
  const url = addAppUrlInput.value.trim();
  const previewSection = document.getElementById('add-app-preview');
  const previewIcon = document.getElementById('preview-icon');
  const previewName = document.getElementById('preview-name');
  const previewUrl = document.getElementById('preview-url');
  const validationIcon = document.querySelector('.add-app-url-validation');
  const validationMessage = document.querySelector('.add-app-validation-message');
  
  if (!url) {
    resetPreviewState();
    addAppConfirm.disabled = true;
    return;
  }
  
  // Use the comprehensive validateUrl function
  const validation = validateUrl(url);
  const isValid = validation.status === 'valid';
  const fullUrl = validation.url ? validation.url.href : (url.startsWith('http') ? url : 'https://' + url);
  const appName = extractAppName(url);
  
  // Update preview
  previewName.textContent = appName;
  previewUrl.textContent = fullUrl;
  
  // Try to load favicon
  const faviconUrl = getFaviconUrl(url);
  if (faviconUrl) {
    previewIcon.innerHTML = `<img src="${faviconUrl}" alt="${appName}" onerror="this.parentElement.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><polyline points=\\'21,15 16,10 5,21\\'></polyline></svg>'" />`;
  } else {
    resetPreviewIcon();
  }
  
  // Show validation state
  previewSection.classList.add('visible');
  previewSection.classList.toggle('valid', isValid);
  previewSection.classList.toggle('invalid', !isValid);
  
  validationIcon.classList.add('show');
  validationIcon.classList.toggle('valid', isValid);
  validationIcon.classList.toggle('invalid', !isValid);
  
  // Show detailed validation message
  if (validationMessage) {
    validationMessage.textContent = translateValidationMessage(validation.message);
    validationMessage.classList.toggle('show', true);
    validationMessage.classList.toggle('malformed', validation.status === 'malformed');
    validationMessage.classList.toggle('undetectable', validation.status === 'undetectable');
  }
  
  // Enable confirm button when there's text input (allow even invalid URLs)
  addAppConfirm.disabled = !url;
}

// Open modal
if (addAppBtn && addAppModal && addAppUrlInput) {
  addAppBtn.addEventListener("click", function (e) {
    e.preventDefault();
    addAppModal.style.display = "flex";
    addAppUrlInput.value = "";
    addAppUrlInput.focus();
    renderDefaultAppsList();

    resetPreviewState();
    addAppConfirm.disabled = true;
  });

  // Close on outside click
  addAppModal.addEventListener("click", function (e) {
    if (e.target === addAppModal) closeAddAppModal();
  });

  // Cancel button
  if (addAppCancel) {
    addAppCancel.addEventListener("click", function () {
      closeAddAppModal();
    });
  }

  // Add app from input
  const addAppFromInput = async (url) => {
    let name = extractAppName(url);
    const icon = getFaviconUrl(url);
    const id = 'custom-app-' + Date.now() + '-' + Math.floor(Math.random()*100000);
    const appData = {
      id,
      url: url.startsWith("http") ? url : "https://" + url,
      name,
      icon,
    };

    // Cache the icon if available
    if (icon && window.iconCache) {
      try {
        const cachedIcon = await window.iconCache.getIconWithCache(icon);
        appData.cachedIcon = cachedIcon;
      } catch (error) {
        console.warn('Failed to cache icon:', error);
      }
    }

    AppGridState.addApp(appData);
    if (window.renderCustomApps) window.renderCustomApps();
    addAppModal.style.display = "none";
  };

  // Input event for real-time preview
  addAppUrlInput.addEventListener("input", function() {
    updatePreview();
  });

  // Enter key in input
  addAppUrlInput.addEventListener("keypress", async function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const url = this.value.trim();
      if (!url) return;
      await addAppFromInput(url);
    }
  });

  // Confirm button
  if (addAppConfirm) {
    addAppConfirm.addEventListener("click", async function () {
      const url = addAppUrlInput.value.trim();
      if (!url) return;
      await addAppFromInput(url);
    });
  }
}

// Refresh preview when language changes while modal is open
window.addEventListener('languageChanged', () => {
  const addAppModal = document.getElementById('add-app-modal');
  if (addAppModal && addAppModal.style.display !== 'none') {
    updatePreview();
  }
});
