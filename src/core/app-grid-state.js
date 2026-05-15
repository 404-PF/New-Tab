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

    this.saveCustomApps(nextApps);
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

    this.saveOrder(nextOrder);
    return nextOrder;
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

    const savedApps = this.updateCustomApps((apps) => {
      apps.push(this.cloneAppRecord(appData));
      return apps;
    });
    if (!savedApps) return false;

    this.updateOrder((order) => {
      order.push(appData.id);
      return order;
    }, { allowMissing: true });

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
    const updatedApps = this.updateCustomApps((apps) => {
      const idx = apps.findIndex(app => app.id === id);
      if (idx === -1) return null;
      apps.splice(idx, 1);
      return apps;
    });
    if (!updatedApps) return false;

    this.updateOrder((latestOrder) => latestOrder.filter(oid => oid !== id));
    return true;
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
