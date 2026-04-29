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
    if (window.AppGridStorage) {
      window.AppGridStorage.saveOrder(order);
    }
  },

  getCustomApps() {
    return window.AppGridStorage ? window.AppGridStorage.loadCustomApps() : [];
  },

  saveCustomApps(apps) {
    if (window.AppGridStorage) {
      window.AppGridStorage.saveCustomApps(apps);
    }
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
  addApp(appData) {
    if (!this.isValidAppData(appData)) return false;

    const apps = this.getCustomApps();
    apps.push(appData);
    this.saveCustomApps(apps);
    const order = this.getOrder() || [];
    order.push(appData.id);
    this.saveOrder(order);
    return true;
  },

  // Rename a custom app identified by id.
  renameApp(id, newName) {
    const apps = this.getCustomApps();
    const idx = apps.findIndex(app => app.id === id);
    if (idx === -1) return false;
    apps[idx].name = newName;
    this.saveCustomApps(apps);
    return true;
  },

  // Update the thumbnail of a custom app identified by id.
  // Clears any previously cached icon so the new one is fetched.
  updateThumbnail(id, newIcon) {
    const apps = this.getCustomApps();
    const idx = apps.findIndex(app => app.id === id);
    if (idx === -1) return false;
    apps[idx].icon = newIcon;
    delete apps[idx].cachedIcon;
    this.saveCustomApps(apps);
    return true;
  },

  // Delete a custom app identified by id and remove it from appOrder.
  deleteApp(id) {
    const apps = this.getCustomApps();
    const idx = apps.findIndex(app => app.id === id);
    if (idx === -1) return false;
    apps.splice(idx, 1);
    this.saveCustomApps(apps);
    const order = this.getOrder();
    if (order) {
      this.saveOrder(order.filter(oid => oid !== id));
    }
    return true;
  },

  // Move sourceId to the given placeholder drop index within appOrder.
  // toIdx is the desired insertion position in the current order array;
  // pass -1 or a value beyond the array length to append at the end.
  reorder(sourceId, toIdx) {
    const order = this.getOrder();
    if (!order) return false;
    const fromIdx = order.indexOf(sourceId);
    if (fromIdx === -1) return false;

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
    this.saveOrder(newOrder);
    return true;
  }
};

window.AppGridState = AppGridState;
