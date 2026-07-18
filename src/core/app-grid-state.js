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

    const canonicalInput = this.getCanonicalUrl(url);
    const apps = this.getCustomApps();
    const defaults = window.defaultApps || [];

    return [...apps, ...defaults].some(app => {
      if (!app.url) return false;
      const storedUrl = app.url.startsWith('http') ? app.url : 'https://' + app.url;
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

    const id = 'folder-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
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

  addAppToFolder(folderId, appId, rollbackFolders) {
    let appAdded = false;
    const previousFolders = rollbackFolders || this.getFolders();

    const updatedFolders = this.updateFolders((folders) => {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return null;
      if (!folder.apps.includes(appId)) {
        folder.apps.push(appId);
        appAdded = true;
      }
      return folders;
    });

    if (!updatedFolders || !appAdded) return false;

    const savedOrder = this.updateOrder((latestOrder) => {
      const filtered = latestOrder.filter(oid => oid !== appId);
      if (filtered.length === latestOrder.length) return latestOrder;
      return filtered;
    });

    if (!savedOrder) {
      this.saveFolders(previousFolders);
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
      const removed = this.removeAppFromFolder(currentFolder.id, appId);
      if (!removed) return false;
      return this.addAppToFolder(targetFolderId, appId, originalFolders);
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
