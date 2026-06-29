// src/ui/app-manager.js - App grid management, drag and drop

(function () {
  'use strict';

// Helper functions
const escapeHtml = window.escapeHtml;
const getAppOrder = () => window.AppGridState.getOrder();
const saveAppOrder = order => window.AppGridState.saveOrder(order);

// Load custom apps from localStorage
function loadCustomApps() {
  return window.AppGridState.getCustomApps();
}

// Default apps
const defaultApps = [
  { id: 'ai-app', nameKey: 'ai', url: '#', icon: 'images/icons/ai.svg', className: 'default-app', isInternal: true },
  { id: 'weather-app', nameKey: 'weather', url: '#', icon: 'images/icons/weather.svg', className: 'default-app', isInternal: true },
  { id: 'feedback-app', nameKey: 'feedback', url: 'https://github.com/404-PF/New-Tab/issues/new', icon: 'images/icons/feedback.svg', className: 'default-app' },
  { id: 'settings-app', nameKey: 'settings', url: '#', icon: 'images/icons/settings.svg', className: 'default-app' },
];
window.defaultApps = Object.freeze(defaultApps);

// Get all apps data
const getAllAppData = () => {
  const customApps = loadCustomApps().map(app => ({ ...app, className: 'custom-app' }));
  return [...defaultApps, ...customApps];
};

window.appGridReady = false;

// Render the app grid
function renderAllApps() {
  const appGrid = document.getElementById('app-grid');
const addApp = document.getElementById('new-app');
  if (!appGrid || !addApp) {
    window.appGridReady = false;
    return;
  }
  // Remove all except New
  Array.from(appGrid.children).forEach(child => { if (child.id !== 'new-app') appGrid.removeChild(child); });
  let order = getAppOrder();
  const allApps = getAllAppData();
  // Deduplicate by id so corrupted storage can't permanently invalidate the order
  const seenIds = new Set();
  const dedupedApps = allApps.filter(app => {
    if (seenIds.has(app.id)) return false;
    seenIds.add(app.id);
    return true;
  });
  const folders = window.AppGridState.getFolders();
  const folderIds = new Set(folders.map(f => f.id));
  const folderAppIds = new Set(folders.flatMap(f => f.apps || []));
  const expectedOrderIds = new Set();
  dedupedApps.forEach(app => { if (!folderAppIds.has(app.id)) expectedOrderIds.add(app.id); });
  folderIds.forEach(id => expectedOrderIds.add(id));
  const isValidOrder = Array.isArray(order)
    && order.length === expectedOrderIds.size
    && new Set(order).size === order.length
    && order.every(id => expectedOrderIds.has(id));
  if (!isValidOrder) {
    // Repair the order instead of rebuilding from scratch:
    //   1. Keep the user's valid existing entries in their original order
    //      (preserves user reorders, including interleaved app/folder
    //      positions, and drops foreign/duplicate IDs).
    //   2. Prepend any default IDs that are entirely missing from the user's
    //      order, in canonical order. Defaults already present in the user's
    //      order are left in place, so the previous repair that swapped
    //      the user's order for canonical defaults no longer happens.
    //   3. Append any custom apps that are missing from the user's order, in
    //      customApps insertion order.
    //   4. Append any folders that are missing from the user's order, in
    //      folders insertion order.
    const seen = new Set();
    const repaired = [];
    (Array.isArray(order) ? order : []).forEach(id => {
      if (expectedOrderIds.has(id) && !seen.has(id)) {
        repaired.push(id);
        seen.add(id);
      }
    });
    const missingDefaults = defaultApps
      .filter(app => expectedOrderIds.has(app.id) && !seen.has(app.id))
      .map(app => app.id);
    if (missingDefaults.length) {
      repaired.unshift(...missingDefaults);
      missingDefaults.forEach(id => seen.add(id));
    }
    dedupedApps.forEach(app => {
      if (expectedOrderIds.has(app.id) && !seen.has(app.id)) {
        repaired.push(app.id);
        seen.add(app.id);
      }
    });
    folders.forEach(f => {
      if (expectedOrderIds.has(f.id) && !seen.has(f.id)) {
        repaired.push(f.id);
        seen.add(f.id);
      }
    });
    order = repaired;
    saveAppOrder(order);
  }
  const folderMap = Object.fromEntries(folders.map(f => [f.id, f]));
  const appMap = Object.fromEntries(dedupedApps.map(app => [app.id, app]));
  order.forEach(appId => {
    if (folderMap[appId]) {
      if (!window.AppFolders) {
        console.warn('AppFolders not initialized, deferring folder render for:', appId);
        if (!window._appFoldersDeferred) {
          window._appFoldersDeferred = true;
          document.addEventListener('appFoldersReady', function onReady() {
            document.removeEventListener('appFoldersReady', onReady);
            if (typeof window.renderAllApps === 'function') window.renderAllApps();
            window._appFoldersRendered = true;
          }, { once: true });
        }
        return;
      }
      const folder = folderMap[appId];
      const folderEl = window.AppFolders.createFolderIconElement(folder);
      appGrid.insertBefore(folderEl, addApp);
      return;
    }
    const app = appMap[appId];
    if (!app) return;
    const a = document.createElement('a');
    a.href = app.url;
    a.className = 'app-icon ' + app.className;
    a.id = app.id;
    a.draggable = true;
    const openInNewTab = loadOpenNewTabSetting();
    if (openInNewTab && app.url && app.url !== '#') {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
    // Get translated name
    const displayName = app.nameKey && window.i18n ? window.i18n.t(app.nameKey) : (app.name || app.nameKey);
    // Use cached icon if available, otherwise use original icon
    const iconUrl = app.cachedIcon || app.icon;
    a.title = displayName;
    const safeIconUrl = window.validateIconUrl ? window.validateIconUrl(iconUrl) : iconUrl;
    const iconHtml = `<div class="icon"><img src="${escapeHtml(safeIconUrl || '')}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/edent/SuperTinyIcons/images/svg/globe.svg';"></div>`;
    a.innerHTML = iconHtml + `<span class="app-name">${escapeHtml(displayName)}</span>`;
    appGrid.insertBefore(a, addApp);
  });

  // Invalidate drag-drop icon cache after the grid is rebuilt
  if (window.DnD && window.DnD.invalidateIconCache) {
    window.DnD.invalidateIconCache();
  }

  // Re-attach settings app click handler after render
  attachSettingsAppHandler();

  // Re-apply the open-in-new-tab preference after rebuilding links.
  applyOpenNewTabSetting();
  window._gridRendered = true;
  window.appGridReady = true;
  window.dispatchEvent(new CustomEvent('appGridReady'));
}

// Initial icon caching; render is deferred to app-folders init
async function cacheIconsAndRenderFallback() {
  if (window.iconCache && window.iconCache.cacheExistingAppIcons) {
    try {
      await window.iconCache.cacheExistingAppIcons();
    } catch (error) {
      console.warn('Failed to cache existing app icons:', error);
    }
  }
  // Fallback: render grid even if app-folders.js fails to load (network error,
  // CSP issue, uncaught exception). If AppFolders is absent, folders are
  // skipped and can be picked up later when app-folders.js dispatches
  // 'appFoldersReady'. Guard against double-render when app-folders.js
  // already called renderAllApps before DOMContentLoaded fires.
  if (!window._gridRendered && typeof window.renderAllApps === 'function') {
    window.renderAllApps();
  }
}

window.onDomReady(cacheIconsAndRenderFallback);

// Re-render function (export for other modules)
window.renderCustomApps = renderAllApps;
window.renderAllApps = renderAllApps;

// Re-render when language changes
window.addEventListener('languageChanged', renderAllApps);

// Load and apply open in new tab setting
function loadOpenNewTabSetting() {
  return localStorage.getItem('openAppsInNewTab') !== 'false';
}
function applyOpenNewTabSetting() {
  const openInNewTab = loadOpenNewTabSetting();
  const appLinks = document.querySelectorAll('.app-grid .app-icon');
  appLinks.forEach((link) => {
    if (link.getAttribute('href') === '#') return;
    if (openInNewTab) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
  });
  const openNewTabSetting = document.getElementById('open-new-tab-setting');
  if (openNewTabSetting) openNewTabSetting.checked = openInNewTab;
}
const openNewTabSetting = document.getElementById('open-new-tab-setting');
if (openNewTabSetting) {
  openNewTabSetting.addEventListener('change', function () {
    localStorage.setItem('openAppsInNewTab', this.checked);
    applyOpenNewTabSetting();
  });
}

// Apply on load
applyOpenNewTabSetting();

window.addEventListener('themeChanged', applyOpenNewTabSetting);

// Load and apply icon size
const ICON_SIZE_OPTIONS = [48, 60, 72];

function getClosestIconSize(size, options) {
  return options.reduce((closest, option) => {
    return Math.abs(option - size) < Math.abs(closest - size) ? option : closest;
  }, options[0]);
}

function syncIconSizeButtons(groupName, size, options) {
  const activeSize = getClosestIconSize(size, options);
  const buttons = document.querySelectorAll(`[data-size-group="${groupName}"] .size-choice-button`);
  buttons.forEach((button) => {
    const buttonSize = parseInt(button.dataset.size, 10);
    const isActive = buttonSize === activeSize;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function loadIconSize() {
  const size = parseInt(localStorage.getItem('iconSize') || '60', 10);
  const normalizedSize = Number.isFinite(size) ? getClosestIconSize(size, ICON_SIZE_OPTIONS) : 60;
  if (normalizedSize !== size) {
    localStorage.setItem('iconSize', normalizedSize);
  }
  return normalizedSize;
}
function applyIconSize() {
  const size = loadIconSize();
  document.documentElement.style.setProperty('--app-icon-size', size + 'px');
  applyCurvature();
  syncIconSizeButtons('icon', size, ICON_SIZE_OPTIONS);
}

document.addEventListener('DOMContentLoaded', function() {
  const iconSizeGroup = document.querySelector('[data-size-group="icon"]');
  if (iconSizeGroup) {
    iconSizeGroup.addEventListener('click', function (event) {
      const button = event.target.closest('.size-choice-button');
      if (!button) return;
      const size = parseInt(button.dataset.size, 10);
      if (!Number.isFinite(size)) return;
      localStorage.setItem('iconSize', size);
      applyIconSize();
    });
  }

  const iconSizeReset = document.getElementById('icon-size-reset');
  if (iconSizeReset) {
    iconSizeReset.addEventListener('click', function() {
      localStorage.removeItem('iconSize');
      applyIconSize();
    });
  }

  applyIconSize();
});

// Map curvature values to percentage border-radius
const curvatureToPercentage = {
  '8': '25%',   // Minimal
  '15': '30%',  // Square
  '20': '35%',  // Rounded
  '50': '50%'   // Circle
};

// Load and apply app button curvature (now using percentage values)
function loadCurvature() {
  return localStorage.getItem('appsButtonCurvature') || '20';
}
function applyCurvature() {
  const baseRadius = loadCurvature();
  // Use the percentage value directly from the mapping
  const percentageRadius = curvatureToPercentage[baseRadius] || '35%';
  document.documentElement.style.setProperty('--icon-radius', percentageRadius);

  // Update radio button selection
  const curvatureRadios = document.querySelectorAll('input[name="curvature"]');
  curvatureRadios.forEach((radio) => {
    radio.checked = radio.value === baseRadius;
  });
}
const curvatureRadios = document.querySelectorAll('input[name="curvature"]');
curvatureRadios.forEach((radio) => {
  radio.addEventListener('change', function () {
    if (this.checked) {
      localStorage.setItem('appsButtonCurvature', this.value);
      applyCurvature();
    }
  });
});
applyCurvature();

// Export public helpers so other modules can call them via window.*.
// Currently only used internally, but exposed defensively in case
// future code references them cross-module.
window.loadOpenNewTabSetting = loadOpenNewTabSetting;
window.applyOpenNewTabSetting = applyOpenNewTabSetting;
window.loadCurvature = loadCurvature;
window.applyCurvature = applyCurvature;
window.loadIconSize = loadIconSize;
window.applyIconSize = applyIconSize;

// Attach settings app click handler
function attachSettingsAppHandler() {
  const settingsApp = document.getElementById('settings-app');
  if (settingsApp) {
    // Remove existing listeners to avoid duplicates
    settingsApp.removeEventListener('click', settingsApp._clickHandler);
    // Create and attach new handler
    settingsApp._clickHandler = function (e) {
      e.preventDefault();
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal) {
        settingsModal.classList.add('modal-open');
      }
    };
    settingsApp.addEventListener('click', settingsApp._clickHandler);
  }

  // Attach AI app click handler
  const aiApp = document.getElementById('ai-app');
  if (aiApp) {
    // Remove existing listeners to avoid duplicates
    aiApp.removeEventListener('click', aiApp._clickHandler);
    // Create and attach new handler
    aiApp._clickHandler = function (e) {
      e.preventDefault();
      if (window.AIService && window.AIService.open) {
        window.AIService.open();
      }
    };
    aiApp.addEventListener('click', aiApp._clickHandler);
  }

  // Attach Weather app click handler
  const weatherApp = document.getElementById('weather-app');
  if (weatherApp) {
    weatherApp.removeEventListener('click', weatherApp._clickHandler);
    weatherApp._clickHandler = function (e) {
      e.preventDefault();
      if (window.WeatherApp && window.WeatherApp.open) {
        window.WeatherApp.open();
      }
    };
    weatherApp.addEventListener('click', weatherApp._clickHandler);
  }

  // Attach modal close handler (only once)
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal && !settingsModal._closeHandlerAttached) {
    settingsModal._closeHandlerAttached = true;
    settingsModal.addEventListener('click', function (e) {
      if (e.target === settingsModal) {
        settingsModal.classList.remove('modal-open');
        const opener = document.getElementById('settings-app');
        if (opener) opener.focus();
      }
    });
  }
}

// Initial attachment
attachSettingsAppHandler();

})();
