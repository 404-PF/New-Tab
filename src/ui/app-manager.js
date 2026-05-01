// src/ui/app-manager.js - App grid management, drag and drop

// Helper functions
const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
};
const getDraggableAppIcons = () => Array.from(document.querySelectorAll('.app-grid .app-icon')).filter(icon => icon.id !== 'new-app');
const getAppOrder = () => AppGridState.getOrder();
const saveAppOrder = order => AppGridState.saveOrder(order);

// Load custom apps from localStorage
function loadCustomApps() {
  return AppGridState.getCustomApps();
}

// Default apps
const defaultApps = [
  { id: 'ai-app', nameKey: 'ai', url: '#', icon: 'images/icons/ai.svg', className: 'default-app', isInternal: true },
  { id: 'feedback-app', nameKey: 'feedback', url: 'https://github.com/404-PF/New-Tab/issues/new', icon: 'images/icons/feedback.svg', className: 'default-app' },
  { id: 'settings-app', nameKey: 'settings', url: '#', icon: 'images/icons/settings.svg', className: 'default-app' },
];

// Get all apps data
const getAllAppData = () => {
  const customApps = loadCustomApps().map(app => ({ ...app, className: 'custom-app' }));
  return [...defaultApps, ...customApps];
};

// Render the app grid
function renderAllApps() {
  const appGrid = document.getElementById('app-grid');
const addApp = document.getElementById('new-app');
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
  const validIds = new Set(dedupedApps.map(app => app.id));
  const isValidOrder = Array.isArray(order)
    && order.length === dedupedApps.length
    && order.every(id => validIds.has(id))
    && new Set(order).size === order.length;
  if (!isValidOrder) {
    order = dedupedApps.map(app => app.id);
    saveAppOrder(order);
  }
  const appMap = Object.fromEntries(dedupedApps.map(app => [app.id, app]));
  order.forEach(appId => {
    const app = appMap[appId];
    if (!app) return;
    const a = document.createElement('a');
    a.href = app.url;
    a.className = 'app-icon ' + app.className;
    a.id = app.id;
    a.draggable = true;
    const openInNewTab = loadOpenNewTabSetting();
    if (openInNewTab) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
    // Get translated name
    const displayName = app.nameKey && window.i18n ? window.i18n.t(app.nameKey) : (app.name || app.nameKey);
    // Use cached icon if available, otherwise use original icon
    const iconUrl = app.cachedIcon || app.icon;
    a.title = displayName;
    // Load icon from external file (use images/icons/feedback.svg) rather than embedding inline SVG in JS.
    // The SVG file (`images/icons/feedback.svg`) uses `currentColor` where appropriate.
    let iconHtml = `<div class="icon"><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/edent/SuperTinyIcons/images/svg/globe.svg';"></div>`;
    a.innerHTML = iconHtml + `<span class="app-name">${escapeHtml(displayName)}</span>`;
    appGrid.insertBefore(a, addApp);
  });

  // Re-attach settings app click handler after render
  attachSettingsAppHandler();

  // Re-apply the open-in-new-tab preference after rebuilding links.
  applyOpenNewTabSetting();
}

// Initial render after caching
document.addEventListener('DOMContentLoaded', async () => {
  if (window.iconCache && window.iconCache.cacheExistingAppIcons) {
    try {
      await window.iconCache.cacheExistingAppIcons();
    } catch (error) {
      console.warn('Failed to cache existing app icons:', error);
    }
  }
  renderAllApps();
});

// Re-render function (export for other modules)
window.renderCustomApps = renderAllApps;
window.renderAllApps = renderAllApps;

// Re-render when language changes
window.addEventListener('languageChanged', renderAllApps);

// Load and apply open in new tab setting
function loadOpenNewTabSetting() {
  return localStorage.getItem("openAppsInNewTab") !== "false";
}
function applyOpenNewTabSetting() {
  const openInNewTab = loadOpenNewTabSetting();
  const appLinks = document.querySelectorAll(".app-grid .app-icon");
  appLinks.forEach((link) => {
    if (link.id === "settings-app") return;
    if (openInNewTab) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    } else {
      link.removeAttribute("target");
      link.removeAttribute("rel");
    }
  });
  const openNewTabSetting = document.getElementById("open-new-tab-setting");
  if (openNewTabSetting) openNewTabSetting.checked = openInNewTab;
}
const openNewTabSetting = document.getElementById("open-new-tab-setting");
if (openNewTabSetting) {
  openNewTabSetting.addEventListener("change", function () {
    localStorage.setItem("openAppsInNewTab", this.checked);
    applyOpenNewTabSetting();
  });
}

// Apply on load
applyOpenNewTabSetting();

window.addEventListener("themeChanged", applyOpenNewTabSetting);

// Load and apply icon size
const ICON_SIZE_OPTIONS = [48, 60, 72];

function getClosestSize(size, options) {
  return options.reduce((closest, option) => {
    return Math.abs(option - size) < Math.abs(closest - size) ? option : closest;
  }, options[0]);
}

function syncSizeButtons(groupName, size, options) {
  const activeSize = getClosestSize(size, options);
  const buttons = document.querySelectorAll(`[data-size-group="${groupName}"] .size-choice-button`);
  buttons.forEach((button) => {
    const buttonSize = parseInt(button.dataset.size, 10);
    const isActive = buttonSize === activeSize;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function loadIconSize() {
  const size = parseInt(localStorage.getItem("iconSize") || "60", 10);
  const normalizedSize = Number.isFinite(size) ? getClosestSize(size, ICON_SIZE_OPTIONS) : 60;
  if (normalizedSize !== size) {
    localStorage.setItem("iconSize", normalizedSize);
  }
  return normalizedSize;
}
function applyIconSize() {
  const size = loadIconSize();
  document.documentElement.style.setProperty('--app-icon-size', size + 'px');
  applyCurvature();
  syncSizeButtons("icon", size, ICON_SIZE_OPTIONS);
}

document.addEventListener("DOMContentLoaded", function() {
  const iconSizeGroup = document.querySelector('[data-size-group="icon"]');
  if (iconSizeGroup) {
    iconSizeGroup.addEventListener("click", function (event) {
      const button = event.target.closest(".size-choice-button");
      if (!button) return;
      const size = parseInt(button.dataset.size, 10);
      if (!Number.isFinite(size)) return;
      localStorage.setItem("iconSize", size);
      applyIconSize();
    });
  }

  const iconSizeReset = document.getElementById("icon-size-reset");
  if (iconSizeReset) {
    iconSizeReset.addEventListener("click", function() {
      localStorage.removeItem("iconSize");
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
  return localStorage.getItem("appsButtonCurvature") || "20";
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
  radio.addEventListener("change", function () {
    if (this.checked) {
      localStorage.setItem("appsButtonCurvature", this.value);
      applyCurvature();
    }
  });
});
applyCurvature();





// Attach settings app click handler
function attachSettingsAppHandler() {
  const settingsApp = document.getElementById("settings-app");
  if (settingsApp) {
    // Remove existing listeners to avoid duplicates
    settingsApp.removeEventListener("click", settingsApp._clickHandler);
    // Create and attach new handler
    settingsApp._clickHandler = function (e) {
      e.preventDefault();
      const settingsModal = document.getElementById("settings-modal");
      if (settingsModal) {
        settingsModal.style.display = "flex";
      }
    };
    settingsApp.addEventListener("click", settingsApp._clickHandler);
  }

  // Attach AI app click handler
  const aiApp = document.getElementById("ai-app");
  if (aiApp) {
    // Remove existing listeners to avoid duplicates
    aiApp.removeEventListener("click", aiApp._clickHandler);
    // Create and attach new handler
    aiApp._clickHandler = function (e) {
      e.preventDefault();
      if (window.AIService && window.AIService.open) {
        window.AIService.open();
      }
    };
    aiApp.addEventListener("click", aiApp._clickHandler);
  }

  // Attach modal close handler (only once)
  const settingsModal = document.getElementById("settings-modal");
  if (settingsModal && !settingsModal._closeHandlerAttached) {
    settingsModal._closeHandlerAttached = true;
    settingsModal.addEventListener("click", function (e) {
      if (e.target === settingsModal) settingsModal.style.display = "none";
    });
  }
}

// Initial attachment
attachSettingsAppHandler();
