// src/core/app-grid-state.js
// Single source of truth for app-grid state.
// All modules that read or write appOrder / customApps must go through this
// object so that the rules for id/order translation live in one place.

const AppGridState = {
  // --- Raw storage access ---

  getOrder() {
    return window.AppGridStorage ? window.AppGridStorage.loadOrder() : null;
  },

  saveOrder(order) {
    return window.AppGridStorage ? window.AppGridStorage.saveOrder(order) : false;
  },

  getCustomApps() {
    return window.AppGridStorage ? window.AppGridStorage.loadCustomApps() : [];
  },

  saveCustomApps(apps) {
    return window.AppGridStorage ? window.AppGridStorage.saveCustomApps(apps) : false;
  },

  cloneAppRecord(app) {
    if (typeof structuredClone === 'function') {
      return structuredClone(app);
    }

    return JSON.parse(JSON.stringify(app));
  },

  updateCustomApps(updater) {
    if (!window.AppGridStorage || typeof updater !== 'function') {
      return null;
    }

    const latestApps = this.getCustomApps().map(app => this.cloneAppRecord(app));
    const nextApps = updater(latestApps);

    if (!Array.isArray(nextApps)) {
      return null;
    }

    if (!this.saveCustomApps(nextApps)) {
      return null;
    }
    return nextApps;
  },

  // allowMissing is only for first-write flows, where appOrder has not been
  // created yet and the caller needs to append a new id safely.
  updateOrder(updater, { allowMissing = false } = {}) {
    if (!window.AppGridStorage || typeof updater !== 'function') {
      return null;
    }

    const currentOrder = this.getOrder();
    if (!Array.isArray(currentOrder) && !allowMissing) {
      return null;
    }

    const nextOrder = updater(Array.isArray(currentOrder) ? currentOrder.slice() : []);
    if (!Array.isArray(nextOrder)) {
      return null;
    }

    if (!this.saveOrder(nextOrder)) {
      return null;
    }
    return nextOrder;
  },

  // Returns a canonical form of the given URL for duplicate comparison:
  // strips www., lowercases the hostname, removes trailing slash.
  getCanonicalUrl(url) {
    try {
      const urlObj = new URL(url);
      urlObj.hostname = urlObj.hostname.replace(/^www\./, '');
      if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
      }
      if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
          (urlObj.protocol === 'https:' && urlObj.port === '443')) {
        urlObj.port = '';
      }
      return urlObj.href;
    } catch {
      return url;
    }
  },

  // Returns true if an existing app (custom or default) has the same canonical URL.
  hasAppWithUrl(url) {
    if (!url || typeof url !== 'string') return false;

    const trimmedInput = String(url).trim();
    let normalizedInput;
    if (!trimmedInput || trimmedInput.startsWith('/')) {
      normalizedInput = trimmedInput;
    } else {
      const hasHttpInput = typeof window.hasHttpSchemeSafe === 'function'
        ? window.hasHttpSchemeSafe(trimmedInput)
        : typeof window.hasHttpScheme === 'function'
          ? window.hasHttpScheme(trimmedInput)
          : /^https?:\/\//i.test(trimmedInput);
      if (hasHttpInput) {
        normalizedInput = trimmedInput;
      } else {
        const isCustomInput = typeof window.isCustomScheme === 'function'
          ? window.isCustomScheme(trimmedInput)
          : (() => {
              if (trimmedInput === '#' || trimmedInput.startsWith('data:') || trimmedInput.startsWith('blob:')) return true;
              if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedInput)) return false;
              const ci = trimmedInput.indexOf(':');
              const b = trimmedInput.slice(0, ci);
              const a = trimmedInput.slice(ci + 1);
              const lb = b.toLowerCase();
              const isKnown = ['tel', 'sms', 'mailto', 'sip', 'callto', 'facetime', 'geo', 'magnet', 'urn', 'bitcoin'].includes(lb);
              const looks = (b.includes('.') || /^localhost$/i.test(b) || /^(\d{1,3}\.){3}\d{1,3}$/.test(b) || (/^[a-zA-Z0-9-]+$/.test(b) && !isKnown)) && /^\d+(\/|$|\?|#)/.test(a);
              return !looks;
            })();
        normalizedInput = isCustomInput ? trimmedInput : 'https://' + trimmedInput;
      }
    }
    const canonicalInput = this.getCanonicalUrl(normalizedInput);
    const apps = this.getCustomApps();
    const defaults = window.defaultApps || [];

    return [...apps, ...defaults].some(app => {
      if (!app.url) return false;
      const trimmed = String(app.url).trim();
      if (!trimmed || trimmed.startsWith('/')) return this.getCanonicalUrl(trimmed) === canonicalInput;
      const hasHttp = typeof window.hasHttpSchemeSafe === 'function'
        ? window.hasHttpSchemeSafe(trimmed)
        : typeof window.hasHttpScheme === 'function'
          ? window.hasHttpScheme(trimmed)
          : /^https?:\/\//i.test(trimmed);
      if (hasHttp) return this.getCanonicalUrl(trimmed) === canonicalInput;
      const isCustom = typeof window.isCustomScheme === 'function'
        ? window.isCustomScheme(trimmed)
        : (() => {
            if (trimmed === '#' || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) return true;
            if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
            const ci = trimmed.indexOf(':');
            const b = trimmed.slice(0, ci);
            const a = trimmed.slice(ci + 1);
            const lb = b.toLowerCase();
            const isKnown = ['tel', 'sms', 'mailto', 'sip', 'callto', 'facetime', 'geo', 'magnet', 'urn', 'bitcoin'].includes(lb);
            const looks = (b.includes('.') || /^localhost$/i.test(b) || /^(\d{1,3}\.){3}\d{1,3}$/.test(b) || (/^[a-zA-Z0-9-]+$/.test(b) && !isKnown)) && /^\d+(\/|$|\?|#)/.test(a);
            return !looks;
          })();
      const storedUrl = isCustom ? trimmed : 'https://' + trimmed;
      return this.getCanonicalUrl(storedUrl) === canonicalInput;
    });
  },

  // --- Id helpers ---

  // --- Higher-level operations ---

  isValidAppData(appData) {
    return !!appData &&
      typeof appData === 'object' &&
      typeof appData.id === 'string' &&
      appData.id.trim() !== '' &&
      typeof appData.url === 'string' &&
      appData.url.trim() !== '' &&
      typeof appData.name === 'string' &&
      appData.name.trim() !== '';
  },

  // Add a new custom app. appData must include valid id, url, and name fields.
  // Returns false if a duplicate URL already exists.
  addApp(appData) {
    if (!this.isValidAppData(appData)) return false;
    if (this.hasAppWithUrl(appData.url)) return false;

    const previousCustomApps = this.getCustomApps();
    const savedApps = this.updateCustomApps((apps) => {
      apps.push(this.cloneAppRecord(appData));
      return apps;
    });
    if (!savedApps) return false;

    const savedOrder = this.updateOrder((order) => {
      order.push(appData.id);
      return order;
    }, { allowMissing: true });
    if (!savedOrder) {
      this.saveCustomApps(previousCustomApps);
      return false;
    }

    return true;
  },

  // Rename a custom app identified by id.
  renameApp(id, newName) {
    const updatedApps = this.updateCustomApps((apps) => {
      const idx = apps.findIndex(app => app.id === id);
      if (idx === -1) return null;
      apps[idx].name = newName;
      return apps;
    });
    return !!updatedApps;
  },

  // Update the thumbnail of a custom app identified by id.
  // Clears any previously cached icon so the new one is fetched.
  updateThumbnail(id, newIcon) {
    const updatedApps = this.updateCustomApps((apps) => {
      const idx = apps.findIndex(app => app.id === id);
      if (idx === -1) return null;
      apps[idx].icon = newIcon;
      delete apps[idx].cachedIcon;
      return apps;
    });
    return !!updatedApps;
  },

  // Delete a custom app identified by id and remove it from appOrder.
  deleteApp(id) {
    const previousCustomApps = this.getCustomApps();
    const updatedApps = this.updateCustomApps((apps) => {
      const idx = apps.findIndex(app => app.id === id);
      if (idx === -1) return null;
      apps.splice(idx, 1);
      return apps;
    });
    if (!updatedApps) return false;

    const savedOrder = this.updateOrder((latestOrder) => latestOrder.filter(oid => oid !== id));
    if (!savedOrder) {
      this.saveCustomApps(previousCustomApps);
      return false;
    }

    return true;
  },

  // --- Folder operations ---

  generateFolderId() {
    if (typeof crypto.randomUUID === 'function') {
      return 'folder-' + crypto.randomUUID();
    }

    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
    randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;
    const hex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return 'folder-' + `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  },

  getFolders() {
    return window.AppGridStorage ? window.AppGridStorage.loadFolders() : [];
  },

  saveFolders(folders) {
    return window.AppGridStorage ? window.AppGridStorage.saveFolders(folders) : false;
  },

  updateFolders(updater) {
    if (!window.AppGridStorage || typeof updater !== 'function') {
      return null;
    }

    const latestFolders = this.getFolders().map(f => this.cloneAppRecord(f));
    const nextFolders = updater(latestFolders);

    if (!Array.isArray(nextFolders)) {
      return null;
    }

    if (!this.saveFolders(nextFolders)) {
      return null;
    }
    return nextFolders;
  },

  createFolder(name, appIds) {
    if (!name || typeof name !== 'string' || name.trim() === '') return null;

    const id = this.generateFolderId();
    const folder = { id, name: name.trim(), apps: Array.isArray(appIds) ? appIds : [] };

    const previousFolders = this.getFolders();
    const savedFolders = this.updateFolders((folders) => {
      folders.push(this.cloneAppRecord(folder));
      return folders;
    });
    if (!savedFolders) return null;

    const savedOrder = this.updateOrder((order) => {
      order.push(folder.id);
      return order;
    }, { allowMissing: true });
    if (!savedOrder) {
      this.saveFolders(previousFolders);
      return null;
    }

    return folder;
  },

  deleteFolder(id) {
    let removedFolder = null;
    const previousFolders = this.getFolders();

    const updatedFolders = this.updateFolders((folders) => {
      const idx = folders.findIndex(f => f.id === id);
      if (idx === -1) return null;
      removedFolder = folders[idx];
      folders.splice(idx, 1);
      return folders;
    });

    if (!updatedFolders || !removedFolder) return false;

    const savedOrder = this.updateOrder((latestOrder) => {
      const folderIdx = latestOrder.indexOf(id);
      const filtered = latestOrder.filter(oid => oid !== id);
      const appIds = removedFolder.apps.filter(aid => !filtered.includes(aid));
      let insertAt = folderIdx;
      if (insertAt > filtered.length) insertAt = filtered.length;
      if (insertAt < 0) insertAt = filtered.length;
      filtered.splice(insertAt, 0, ...appIds);
      return filtered;
    });

    if (!savedOrder) {
      this.saveFolders(previousFolders);
      return false;
    }

    return true;
  },

  renameFolder(id, newName) {
    if (!newName || typeof newName !== 'string' || newName.trim() === '') return false;

    const updatedFolders = this.updateFolders((folders) => {
      const idx = folders.findIndex(f => f.id === id);
      if (idx === -1) return null;
      folders[idx].name = newName.trim();
      return folders;
    });

    return !!updatedFolders;
  },

  addAppToFolder(folderId, appId, rollbackFolders, rollbackOrder) {
    let appAdded = false;
    const previousFolders = rollbackFolders || this.getFolders();
    const previousOrder = rollbackOrder || this.getOrder();

    const updatedFolders = this.updateFolders((folders) => {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return null;
      if (!folder.apps.includes(appId)) {
        folder.apps.push(appId);
        appAdded = true;
      }
      return folders;
    });

    if (!updatedFolders || !appAdded) {
      if (rollbackFolders || rollbackOrder) {
        this.saveFolders(previousFolders);
        if (Array.isArray(previousOrder)) this.saveOrder(previousOrder);
      }
      return false;
    }

    const savedOrder = this.updateOrder((latestOrder) => {
      const filtered = latestOrder.filter(oid => oid !== appId);
      if (filtered.length === latestOrder.length) return latestOrder;
      return filtered;
    });

    if (!savedOrder) {
      this.saveFolders(previousFolders);
      if (Array.isArray(previousOrder)) this.saveOrder(previousOrder);
      return false;
    }

    return true;
  },

  // Move app to a folder, removing it from any other folder first
  moveAppToFolder(targetFolderId, appId) {
    const folders = this.getFolders();
    const currentFolder = folders.find(f => f.apps.includes(appId));
    if (currentFolder) {
      if (currentFolder.id === targetFolderId) return true;
      const originalFolders = this.getFolders();
      const originalOrder = this.getOrder();
      const removed = this.removeAppFromFolder(currentFolder.id, appId);
      if (!removed) return false;
      return this.addAppToFolder(targetFolderId, appId, originalFolders, originalOrder);
    }
    return this.addAppToFolder(targetFolderId, appId);
  },

  removeAppFromFolder(folderId, appId) {
    let appRemoved = false;
    const previousFolders = this.getFolders();

    const updatedFolders = this.updateFolders((folders) => {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return null;
      const idx = folder.apps.indexOf(appId);
      if (idx === -1) return null;
      folder.apps.splice(idx, 1);
      appRemoved = true;
      return folders;
    });

    if (!updatedFolders || !appRemoved) return false;

    const savedOrder = this.updateOrder((latestOrder) => {
      const folderIdx = latestOrder.indexOf(folderId);
      if (folderIdx !== -1) {
        latestOrder.splice(folderIdx + 1, 0, appId);
      } else {
        latestOrder.push(appId);
      }
      return latestOrder;
    });

    if (!savedOrder) {
      this.saveFolders(previousFolders);
      return false;
    }

    return true;
  },

  reorderFolderApps(folderId, sourceId, toIdx) {
    const updatedFolders = this.updateFolders((folders) => {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return null;

      const fromIdx = folder.apps.indexOf(sourceId);
      if (fromIdx === -1) return null;

      let targetIdx = toIdx;
      if (targetIdx === -1 || targetIdx > folder.apps.length) {
        targetIdx = folder.apps.length;
      }

      let adjustedToIdx = targetIdx;
      if (fromIdx < targetIdx) {
        adjustedToIdx = targetIdx - 1;
      }

      const newApps = folder.apps.slice();
      const [movedItem] = newApps.splice(fromIdx, 1);
      newApps.splice(adjustedToIdx, 0, movedItem);
      folder.apps = newApps;
      return folders;
    });

    return !!updatedFolders;
  },

  // Convert an insertion index in the app-only sequence (the grid's app
  // icons, folders excluded) into the equivalent insertion index in the full
  // appOrder array (apps and folders interleaved).  Drag-and-drop computes
  // drop positions against the app icons only, so folder slots that precede
  // the drop point must be added back in or the app lands in the wrong slot
  // (issue #599).  -1 is returned unchanged as a "no position" sentinel.
  // Lower indices are not produced by callers (drop indices are clamped to
  // >= 0) and resolve to the same no-position result.
  appIndexToOrderIndex(appOnlyIndex) {
    const order = this.getOrder();
    if (!Array.isArray(order)) return appOnlyIndex;

    if (appOnlyIndex === -1) return -1;

    const folderIds = new Set(this.getFolders().map(folder => folder.id));
    const appsInOrder = order.filter(id => !folderIds.has(id));

    if (appOnlyIndex >= appsInOrder.length) return order.length;
    return order.indexOf(appsInOrder[appOnlyIndex]);
  },

  // Move sourceId to the given placeholder drop index within appOrder.
  // toIdx is the desired insertion position in the current order array;
  // pass -1 or a value beyond the array length to append at the end.
  reorder(sourceId, toIdx) {
    const updatedOrder = this.updateOrder((order) => {
      const fromIdx = order.indexOf(sourceId);
      if (fromIdx === -1) return null;

      let targetIdx = toIdx;
      if (targetIdx === -1 || targetIdx > order.length) {
        targetIdx = order.length;
      }

      // When moving forward the removal shifts indices left; compensate so the
      // item ends up after the intended drop position.
      let adjustedToIdx = targetIdx;
      if (fromIdx < targetIdx) {
        adjustedToIdx = targetIdx - 1;
      }

      const newOrder = order.slice();
      const [movedItem] = newOrder.splice(fromIdx, 1);
      newOrder.splice(adjustedToIdx, 0, movedItem);
      return newOrder;
    });
    if (!updatedOrder) return false;

    return true;
  },

  // Resolve an app's display name exactly as the grid renders it. This is
  // the single source of truth: app-manager.js and app-folders.js delegate
  // here so sort order can never drift from the displayed names.
  getAppDisplayName(app) {
    if (app.nameKey && window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(app.nameKey);
    }
    return app.name || app.nameKey || '';
  },

  // Collation follows the selected UI language so translated names sort by
  // that language's rules rather than the browser locale. Falls back to the
  // runtime default when no valid locale tag is available (Intl rejects
  // malformed tags, including the legacy underscore forms like zh_CN).
  createNameCollator() {
    const options = { sensitivity: 'base', numeric: true };
    if (window.i18n && typeof window.i18n.currentLanguage === 'function') {
      const tag = String(window.i18n.currentLanguage() || '').trim().replaceAll('_', '-');
      try {
        return new Intl.Collator(tag, options);
      } catch {
        // Invalid tag; fall through to the runtime default locale.
      }
    }
    return new Intl.Collator(undefined, options);
  },

  // Sort the app icons in appOrder alphabetically by display name while
  // keeping every folder anchored at its current index. Ids that are neither
  // apps nor folders (stale entries awaiting repair) keep their slots too.
  // Returns false when there is nothing persisted to sort; rendering is left
  // to the caller.
  sortAlphabetically() {
    return !!this.updateOrder((order) => {
      const folderIds = new Set(this.getFolders().map(folder => folder.id));

      // Same precedence as renderAllApps' dedupe: defaults win over a
      // custom app that reuses their id.
      const nameById = new Map();
      (window.defaultApps || []).forEach(app => { nameById.set(app.id, app); });
      this.getCustomApps().forEach(app => {
        if (!nameById.has(app.id)) nameById.set(app.id, app);
      });

      const collator = this.createNameCollator();
      const sortedAppIds = order
        .filter(id => !folderIds.has(id))
        .filter(id => nameById.has(id))
        .sort((a, b) => {
          const result = collator.compare(
            this.getAppDisplayName(nameById.get(a)),
            this.getAppDisplayName(nameById.get(b))
          );
          // Equal names have no intrinsic order; fall back to id for a
          // stable, deterministic arrangement.
          if (result !== 0) return result;
          if (a < b) return -1;
          if (a > b) return 1;
          return 0;
        });

      let appIdx = 0;
      return order.map(id => folderIds.has(id) || !nameById.has(id) ? id : sortedAppIds[appIdx++]);
    });
  }
};

window.AppGridState = AppGridState;

// Consolidated app-grid coordination state machine.
// Replaces the ad-hoc _appFoldersDeferred, _appFoldersRendered, _gridRendered,
// and appGridReady flags with a single phase-based object.
window.__appGridState = (() => {
  let _phase = 'idle'; // 'idle' | 'deferred' | 'rendered'
  let _forced = false;
  const valid = new Set(['idle', 'deferred', 'rendered']);
  const api = {
    get phase() { return _phase; },
    setPhase(next) {
      if (!valid.has(next)) return;
      const prev = _phase;
      if (prev === next) return;
      if (!_forced) {
        if (prev === 'rendered') return;
        if (prev === 'deferred' && next === 'idle') return;
      }
      _phase = next;
      if (next === 'rendered') {
        window.dispatchEvent(new CustomEvent('appGridReady'));
      }
    },
    // reset() is intended for test teardown only. Calling it in production
    // code would break the state machine invariant (e.g., allow appGridReady
    // to fire twice on the next render cycle).
    reset() { _forced = true; try { api.setPhase('idle'); } finally { _forced = false; } }
  };
  return api;
})();

Object.defineProperty(window, 'appGridReady', {
  get() { return window.__appGridState.phase === 'rendered'; },
  configurable: true
});
