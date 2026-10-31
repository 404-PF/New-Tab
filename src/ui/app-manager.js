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
  { id: 'games-app', nameKey: 'games', url: '#', icon: 'images/icons/games.svg', className: 'default-app', isInternal: true },
  // Standalone Todo app temporarily disabled for this version (issue #1066):
  // removing the tile is the only launch path, so nothing can open the modal.
  // The on-page todo widget stays available via todoEnabled. Re-add this line
  // to restore the app.
  // { id: 'todo-app', nameKey: 'todoApp', url: '#', icon: 'images/icons/todo.svg', className: 'default-app', isInternal: true },
  { id: 'feedback-app', nameKey: 'feedback', url: 'https://github.com/404-PF/New-Tab/issues/new', icon: 'images/icons/feedback.svg', className: 'default-app' },
  { id: 'settings-app', nameKey: 'settings', url: '#', icon: 'images/icons/settings.svg', className: 'default-app' },
];
window.defaultApps = Object.freeze(defaultApps);

// Get all apps data
const getAllAppData = () => {
  const hiddenIds = new Set(window.AppGridState.getHiddenDefaultApps());
  const visibleDefaults = defaultApps.filter(app => !hiddenIds.has(app.id));
  const customApps = loadCustomApps().map(app => ({ ...app, className: 'custom-app' }));
  return [...visibleDefaults, ...customApps];
};

const HANDLED_APP_HANDLER_IDS = new Set(['settings-app', 'ai-app', 'weather-app', 'games-app', 'todo-app']);

function getGridElements() {
  return {
    appGrid: document.getElementById('app-grid'),
    addApp: document.getElementById('new-app')
  };
}

function isGridChild(element, appGrid) {
  return !!element && !!appGrid && element.parentNode === appGrid;
}

function invalidateDragIconCache() {
  if (window.DnD && window.DnD.invalidateIconCache) {
    window.DnD.invalidateIconCache();
  }
}

// Positional app shortcuts (Alt+1..9) own the on-tile badge; re-sync after
// in-place grid mutations so slots shift correctly (issue #1061).
function refreshShortcutBadges() {
  if (window.Shortcuts && typeof window.Shortcuts.refreshAppShortcutBadges === 'function') {
    window.Shortcuts.refreshAppShortcutBadges();
  }
}

// Storage records win so className / cachedIcon stay canonical.
function resolveAppRecord(appOrId) {
  const id = typeof appOrId === 'string' ? appOrId : appOrId && appOrId.id;
  if (!id) return null;
  const stored = getAllAppData().find(app => app.id === id);
  if (stored) return stored;
  if (typeof appOrId === 'object') {
    return { ...appOrId, className: appOrId.className || 'custom-app' };
  }
  return null;
}

function getInsertionReference(appGrid, addApp, id) {
  const order = getAppOrder();
  if (Array.isArray(order)) {
    const index = order.indexOf(id);
    if (index !== -1) {
      for (let i = index + 1; i < order.length; i++) {
        const next = document.getElementById(order[i]);
        if (isGridChild(next, appGrid)) return next;
      }
    }
  }
  return addApp;
}

/** Builds one validated app icon anchor (shared by rebuild and mutators). */
function createAppIconElement(app) {
  const a = document.createElement('a');
  const safeAppUrl = typeof window.getSafeCustomAppUrl === 'function'
    ? window.getSafeCustomAppUrl(app.url)
    : '#';
  a.href = safeAppUrl;
  a.className = 'app-icon ' + app.className;
  a.id = app.id;
  a.draggable = true;
  const openInNewTab = loadOpenNewTabSetting();
  if (openInNewTab && safeAppUrl !== '#') {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  }
  // Get translated name (shared resolver keeps sort order in lockstep)
  const displayName = window.AppGridState.getAppDisplayName(app);
  // Use cached icon if available, otherwise use original icon
  const iconUrl = app.cachedIcon || app.icon;
  const shortcutCombo = window.Shortcuts && typeof window.Shortcuts.getAppShortcutForId === 'function'
    ? window.Shortcuts.getAppShortcutForId(app.id)
    : null;
  const labeledTitle = shortcutCombo ? displayName + ' (' + shortcutCombo + ')' : displayName;
  a.title = labeledTitle;
  a.setAttribute('aria-label', labeledTitle);
  const safeIconUrl = window.validateIconUrl ? window.validateIconUrl(iconUrl) : iconUrl;
  const badgeHtml = shortcutCombo ? `<span class="app-shortcut-badge">${escapeHtml(shortcutCombo)}</span>` : '';
  const iconHtml = `<div class="icon"><img src="${window.escapeHtml(safeIconUrl || '')}" alt="${window.escapeHtml(displayName)}" data-app-icon>${badgeHtml}</div>`;
  a.innerHTML = iconHtml + `<span class="app-name">${escapeHtml(displayName)}</span>`;
  return a;
}

/** Adds one icon to the grid without touching siblings; takes a record or id. */
function addAppIcon(appOrId) {
  const { appGrid, addApp } = getGridElements();
  const record = resolveAppRecord(appOrId);
  if (!appGrid || !addApp || !record) return null;

  const existing = document.getElementById(record.id);
  if (existing) return isGridChild(existing, appGrid) ? existing : null;

  const folders = window.AppGridState.getFolders();
  const inFolder = Array.isArray(folders)
    && folders.some(folder => Array.isArray(folder.apps) && folder.apps.includes(record.id));
  if (inFolder) return null;

  const icon = createAppIconElement(record);
  appGrid.insertBefore(icon, getInsertionReference(appGrid, addApp, record.id));

  if (HANDLED_APP_HANDLER_IDS.has(record.id)) {
    attachSettingsAppHandler();
  }
  if (record.id === 'games-app' && typeof window.applyGamesEnabled === 'function') {
    window.applyGamesEnabled();
  }
  invalidateDragIconCache();
  refreshShortcutBadges();
  return icon;
}

/** Removes one icon from the grid. */
function removeAppIcon(id) {
  const { appGrid } = getGridElements();
  const element = document.getElementById(id);
  if (!appGrid || !isGridChild(element, appGrid)) return false;
  appGrid.removeChild(element);
  invalidateDragIconCache();
  refreshShortcutBadges();
  return true;
}

/** Updates one icon's visible name in place. */
function renameAppIcon(id, newName) {
  if (typeof newName !== 'string') return false;
  const element = document.getElementById(id);
  if (!element) return false;
  const nameElement = element.querySelector('.app-name');
  if (nameElement) nameElement.textContent = newName;
  element.title = newName;
  // Re-apply the positional shortcut suffix if this slot has one.
  refreshShortcutBadges();
  return true;
}

/** Swaps one icon's thumbnail in place. */
function updateAppIcon(id, iconUrl) {
  const element = document.getElementById(id);
  if (!element) return false;
  const image = element.querySelector('.icon img');
  if (!image) return false;
  const safeIconUrl = window.validateIconUrl ? window.validateIconUrl(iconUrl) : iconUrl;
  image.setAttribute('src', safeIconUrl || '');
  invalidateDragIconCache();
  return true;
}

/** Re-points one icon's link target in place (after a URL edit). */
function updateAppLink(id, url) {
  const element = document.getElementById(id);
  if (!element) return false;
  const safeAppUrl = typeof window.getSafeCustomAppUrl === 'function'
    ? window.getSafeCustomAppUrl(url)
    : '#';
  element.setAttribute('href', safeAppUrl);
  const openInNewTab = loadOpenNewTabSetting();
  if (openInNewTab && safeAppUrl !== '#') {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  } else {
    element.removeAttribute('target');
    element.removeAttribute('rel');
  }
  invalidateDragIconCache();
  return true;
}

/** Re-positions existing icons to match the persisted order; recreates none. */
function syncAppGridOrder() {
  const { appGrid, addApp } = getGridElements();
  const order = getAppOrder();
  if (!appGrid || !addApp || !Array.isArray(order)) return false;

  const nodes = order.map(id => {
    const element = document.getElementById(id);
    return isGridChild(element, appGrid) ? element : null;
  });

  let reference = addApp;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const element = nodes[i];
    if (!element) continue;
    if (element.nextSibling !== reference) {
      appGrid.insertBefore(element, reference);
    }
    reference = element;
  }
  invalidateDragIconCache();
  // Reordering shifts Alt+1..9 slots, so badges must follow the new order.
  refreshShortcutBadges();
  return true;
}

/**
 * Renders the app grid while validating every app URL at the DOM sink.
 * Invalid or bypassed app records fail closed to a harmless fragment URL.
 * @returns {void}
 */
function renderAllApps() {
  const { appGrid, addApp } = getGridElements();
  if (!appGrid || !addApp) {
    console.warn('renderAllApps: missing #app-grid or #new-app element');
    return;
  }
  // Remove all except New
  Array.from(appGrid.children).forEach(child => { if (child.id !== 'new-app') appGrid.removeChild(child); });
  const fragment = document.createDocumentFragment();
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
        if (window.__appGridState.phase === 'idle') {
          window.__appGridState.setPhase('deferred');
          document.addEventListener('appFoldersReady', function onReady() {
            document.removeEventListener('appFoldersReady', onReady);
            if (typeof window.renderAllApps === 'function') window.renderAllApps();
          }, { once: true });
        }
        return;
      }
      const folder = folderMap[appId];
      const folderEl = window.AppFolders.createFolderIconElement(folder);
      fragment.appendChild(folderEl);
      return;
    }
    const app = appMap[appId];
    if (!app) return;
    fragment.appendChild(createAppIconElement(app));
  });

  // Batch the rebuild into a single insertion (one relayout, not one per icon).
  appGrid.insertBefore(fragment, addApp);

  // Invalidate drag-drop icon cache after the grid is rebuilt
  invalidateDragIconCache();

  // Re-attach settings app click handler after render
  attachSettingsAppHandler();

  // Re-apply the open-in-new-tab preference after rebuilding links (also
  // re-syncs the Settings checkbox after an import changes the value).
  applyOpenNewTabSetting();

  // Re-apply the games-enabled preference after rebuilding the grid so a
  // disabled Games app stays hidden across re-renders (e.g. language change,
  // app/folder edits). settings.js loads after this module, so guard the call.
  if (typeof window.applyGamesEnabled === 'function') {
    window.applyGamesEnabled();
  }
  // Keep the Settings > Apps built-in visibility checkboxes in sync with
  // whatever hid or restored an app (context menu, import, etc.).
  renderDefaultAppVisibilityList();
  window.__appGridState.setPhase('rendered');
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
  if (window.__appGridState.phase !== 'rendered' && typeof window.renderAllApps === 'function') {
    window.renderAllApps();
  }
}

window.onDomReady(cacheIconsAndRenderFallback);

// Re-render function (export for other modules)
window.renderCustomApps = renderAllApps;
window.renderAllApps = renderAllApps;

// Item-scoped mutators (export for other modules, issue #934)
window.addAppIcon = addAppIcon;
window.removeAppIcon = removeAppIcon;
window.renameAppIcon = renameAppIcon;
window.updateAppIcon = updateAppIcon;
window.updateAppLink = updateAppLink;
window.syncAppGridOrder = syncAppGridOrder;
window.renderDefaultAppVisibilityList = renderDefaultAppVisibilityList;

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

function initIconSize() {
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
}

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

window.onDomReady(initIconSize);

// Built-in app visibility (Settings > Apps). The checkboxes are generated
// from the hideable default apps so the list stays in lockstep with the
// frozen defaultApps definitions and their translated names.
function renderDefaultAppVisibilityList() {
  const container = document.getElementById('default-app-visibility-list');
  if (!container) return;

  container.textContent = '';
  defaultApps.forEach(app => {
    if (!window.AppGridState.canHideDefaultApp(app.id)) return;

    const label = document.createElement('label');
    label.className = 'default-app-visibility-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.appId = app.id;
    checkbox.checked = !window.AppGridState.isDefaultHidden(app.id);

    const name = document.createElement('span');
    name.textContent = window.AppGridState.getAppDisplayName(app);

    label.appendChild(checkbox);
    label.appendChild(name);
    container.appendChild(label);
  });
}

function initDefaultAppVisibilitySettings() {
  renderDefaultAppVisibilityList();
}

// Delegated at document level so it works no matter when the container is
// created (it is populated dynamically on every grid render).
// The toggle patches only the one tile: the checkbox already reflects the new
// state, so rebuilding the list here would only discard the caller's node.
document.addEventListener('change', function (event) {
  const target = event.target;
  if (target?.type !== 'checkbox' || !target.dataset.appId) return;
  if (!target.closest?.('#default-app-visibility-list')) return;
  const appId = target.dataset.appId;
  const hidden = !target.checked;
  const saved = window.AppGridState.setDefaultAppHidden(appId, hidden);
  if (saved !== true) {
    // Persistence failed: put the checkbox back in line with stored state
    // and leave the visible grid untouched.
    target.checked = !window.AppGridState.isDefaultHidden(appId);
    return;
  }
  if (hidden) {
    removeAppIcon(appId);
  } else {
    addAppIcon(appId);
  }
  // Foldered apps are skipped by the tile mutators, so their stacked preview
  // must be refreshed from the folder itself.
  if (window.AppFolders && typeof window.AppFolders.refreshFolderUI === 'function') {
    const folder = window.AppGridState.getFolders()
      .find(f => Array.isArray(f.apps) && f.apps.includes(appId));
    if (folder) window.AppFolders.refreshFolderUI(folder.id);
  }
});

window.onDomReady(initDefaultAppVisibilitySettings);

// Launch a built-in internal app by id. Shared by the grid tiles and — via
// click delegation in app-folders.js — the folder popup tiles, whose
// popup- prefixed ids never match the grid bindings (issue #1010).
// Returns false for ids that are not internal apps so callers can fall
// through to normal link navigation.
function openInternalApp(appId, event) {
  if (!HANDLED_APP_HANDLER_IDS.has(appId)) return false;
  if (event && typeof event.preventDefault === 'function') event.preventDefault();

  if (appId === 'settings-app') {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
      settingsModal.classList.add('modal-open');
    }
    return true;
  }
  if (appId === 'ai-app') {
    if (window.AIService && window.AIService.open) {
      window.AIService.open();
    }
    return true;
  }
  if (appId === 'weather-app') {
    if (window.WeatherApp && window.WeatherApp.open) {
      window.WeatherApp.open();
    }
    return true;
  }
  if (appId === 'games-app') {
    if (window.GamesApp?.open) {
      window.GamesApp.open();
    }
    return true;
  }
  if (appId === 'todo-app') {
    if (window.TodoApp && window.TodoApp.open) {
      window.TodoApp.open();
    }
    return true;
  }
  return false;
}
window.openInternalApp = openInternalApp;

// Attach settings app click handler
function attachSettingsAppHandler() {
  HANDLED_APP_HANDLER_IDS.forEach((appId) => {
    const appEl = document.getElementById(appId);
    if (!appEl) return;
    // Remove existing listeners to avoid duplicates
    appEl.removeEventListener('click', appEl._clickHandler);
    appEl._clickHandler = function (e) {
      openInternalApp(appId, e);
    };
    appEl.addEventListener('click', appEl._clickHandler);
  });

  // Attach modal close handler (only once)
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal && !settingsModal._closeHandlerAttached) {
    settingsModal._closeHandlerAttached = true;
    settingsModal.addEventListener('click', function (e) {
      if (e.target === settingsModal) {
        settingsModal.classList.remove('modal-open');
        window.Shortcuts?.cancel?.();
        const opener = document.getElementById('settings-app');
        if (opener) opener.focus();
      }
    });
  }
}

// Initial attachment
attachSettingsAppHandler();

})();
