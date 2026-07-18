import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const createElement = (tag, id) => {
  const element = document.createElement(tag);
  element.id = id;
  document.body.appendChild(element);
  return element;
};

describe('AppGridState folder methods', () => {
  beforeAll(() => {
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/app-grid-state.js');
  });

  beforeEach(() => {
    localStorage.clear();
  });

  describe('createFolder', () => {
    it('creates a folder and adds it to storage', () => {
      const folder = AppGridState.createFolder('My Folder', []);
      expect(folder).not.toBeNull();
      expect(folder.name).toBe('My Folder');
      expect(folder.apps).toEqual([]);
      expect(folder.id).toMatch(/^folder-/);

      const folders = AppGridState.getFolders();
      expect(folders).toHaveLength(1);
      expect(folders[0].id).toBe(folder.id);
    });

    it('returns null for empty name', () => {
      expect(AppGridState.createFolder('', [])).toBeNull();
      expect(AppGridState.createFolder('   ', [])).toBeNull();
    });

    it('adds folder id to app order', () => {
      const folder = AppGridState.createFolder('Test', []);
      const order = AppGridState.getOrder();
      expect(order).toContain(folder.id);
    });

    it('rolls back folders when it cannot save the folder order', () => {
      const previousFolders = [{ id: 'existing', name: 'Existing', apps: [] }];
      AppGridStorage.saveFolders(previousFolders);
      const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);

      try {
        expect(AppGridState.createFolder('New', [])).toBeNull();
        expect(AppGridState.getFolders()).toEqual(previousFolders);
      } finally {
        saveOrderSpy.mockRestore();
      }
    });
  });

  describe('deleteFolder', () => {
    it('deletes a folder and moves apps to grid', () => {
      const folder = AppGridState.createFolder('ToDelete', ['app1', 'app2']);
      expect(AppGridState.deleteFolder(folder.id)).toBe(true);
      expect(AppGridState.getFolders()).toHaveLength(0);
      expect(AppGridState.getOrder()).not.toContain(folder.id);
    });

    it('returns false for missing folder', () => {
      expect(AppGridState.deleteFolder('nonexistent')).toBe(false);
    });

    it('rolls back folders when it cannot save the updated order', () => {
      const previousFolders = [{ id: 'existing', name: 'Existing', apps: ['app1'] }];
      AppGridStorage.saveFolders(previousFolders);
      AppGridStorage.saveOrder(['existing']);
      const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);

      try {
        expect(AppGridState.deleteFolder('existing')).toBe(false);
        expect(AppGridState.getFolders()).toEqual(previousFolders);
      } finally {
        saveOrderSpy.mockRestore();
      }
    });
  });

  describe('renameFolder', () => {
    it('renames an existing folder', () => {
      const folder = AppGridState.createFolder('Old', []);
      expect(AppGridState.renameFolder(folder.id, 'New')).toBe(true);
      expect(AppGridState.getFolders()[0].name).toBe('New');
    });

    it('returns false for empty name', () => {
      const folder = AppGridState.createFolder('Name', []);
      expect(AppGridState.renameFolder(folder.id, '')).toBe(false);
    });

    it('returns false for missing folder', () => {
      expect(AppGridState.renameFolder('nonexistent', 'Name')).toBe(false);
    });
  });

  describe('addAppToFolder', () => {
    it('adds an app to a folder', () => {
      const folder = AppGridState.createFolder('F', []);
      expect(AppGridState.addAppToFolder(folder.id, 'app1')).toBe(true);
      const updated = AppGridState.getFolders()[0];
      expect(updated.apps).toContain('app1');
    });

    it('does not duplicate an existing app', () => {
      const folder = AppGridState.createFolder('F', ['app1']);
      expect(AppGridState.addAppToFolder(folder.id, 'app1')).toBe(false);
      expect(AppGridState.getFolders()[0].apps.filter(a => a === 'app1')).toHaveLength(1);
    });

    it('removes the app id from the main order', () => {
      AppGridStorage.saveOrder(['app1']);
      const folder = AppGridState.createFolder('F', []);
      AppGridState.addAppToFolder(folder.id, 'app1');
      expect(AppGridState.getOrder()).not.toContain('app1');
    });

    it('returns false for missing folder', () => {
      expect(AppGridState.addAppToFolder('nonexistent', 'app1')).toBe(false);
    });

    it('rolls back folders when it cannot save the updated order', () => {
      const folder = { id: 'existing', name: 'Existing', apps: [] };
      AppGridStorage.saveFolders([folder]);
      AppGridStorage.saveOrder(['app1', 'existing']);
      const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);

      try {
        expect(AppGridState.addAppToFolder(folder.id, 'app1')).toBe(false);
        expect(AppGridState.getFolders()).toEqual([folder]);
      } finally {
        saveOrderSpy.mockRestore();
      }
    });
  });

  describe('removeAppFromFolder', () => {
    it('removes an app from a folder', () => {
      const folder = AppGridState.createFolder('F', ['app1']);
      expect(AppGridState.removeAppFromFolder(folder.id, 'app1')).toBe(true);
      expect(AppGridState.getFolders()[0].apps).not.toContain('app1');
    });

    it('inserts the app back into the main order after the folder', () => {
      const folder = AppGridState.createFolder('F', []);
      const folderId = folder.id;
      AppGridState.addAppToFolder(folderId, 'app1');
      const order = AppGridState.getOrder();
      expect(order).not.toContain('app1');
      AppGridState.removeAppFromFolder(folderId, 'app1');
      const updatedOrder = AppGridState.getOrder();
      const folderIdx = updatedOrder.indexOf(folderId);
      expect(updatedOrder.indexOf('app1')).toBe(folderIdx + 1);
    });

    it('returns false if app not in folder', () => {
      const folder = AppGridState.createFolder('F', []);
      expect(AppGridState.removeAppFromFolder(folder.id, 'missing')).toBe(false);
    });

    it('rolls back folders when it cannot save the updated order', () => {
      const folder = { id: 'existing', name: 'Existing', apps: ['app1'] };
      AppGridStorage.saveFolders([folder]);
      AppGridStorage.saveOrder(['existing']);
      const saveOrderSpy = vi.spyOn(AppGridStorage, 'saveOrder').mockReturnValue(false);

      try {
        expect(AppGridState.removeAppFromFolder(folder.id, 'app1')).toBe(false);
        expect(AppGridState.getFolders()).toEqual([folder]);
      } finally {
        saveOrderSpy.mockRestore();
      }
    });
  });

  describe('moveAppToFolder', () => {
    it('moves an app from one folder to another', () => {
      const folderA = AppGridState.createFolder('A', ['app1']);
      const folderB = AppGridState.createFolder('B', []);
      expect(AppGridState.moveAppToFolder(folderB.id, 'app1')).toBe(true);
      expect(AppGridState.getFolders().find(f => f.id === folderA.id).apps).not.toContain('app1');
      expect(AppGridState.getFolders().find(f => f.id === folderB.id).apps).toContain('app1');
    });

    it('handles app not in any folder', () => {
      const folder = AppGridState.createFolder('F', []);
      expect(AppGridState.moveAppToFolder(folder.id, 'unplaced-app')).toBe(true);
      expect(AppGridState.getFolders()[0].apps).toContain('unplaced-app');
    });
  });

  describe('reorderFolderApps', () => {
    it('reorders apps within a folder', () => {
      const folder = AppGridState.createFolder('F', ['a', 'b', 'c']);
      expect(AppGridState.reorderFolderApps(folder.id, 'c', 0)).toBe(true);
      expect(AppGridState.getFolders()[0].apps).toEqual(['c', 'a', 'b']);
    });

    it('returns false for missing source', () => {
      const folder = AppGridState.createFolder('F', ['a']);
      expect(AppGridState.reorderFolderApps(folder.id, 'missing', 0)).toBe(false);
    });

    it('appends with -1 index', () => {
      const folder = AppGridState.createFolder('F', ['a', 'b']);
      expect(AppGridState.reorderFolderApps(folder.id, 'a', -1)).toBe(true);
      expect(AppGridState.getFolders()[0].apps).toEqual(['b', 'a']);
    });
  });
});

describe('AppFolders UI', () => {
  beforeAll(() => {
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/app-grid-state.js');
    injectScript('src/core/utils.js');

    window.defaultApps = [
      { id: 'settings-app', name: 'Settings', url: '#', icon: 'settings.svg', className: 'default-app' }
    ];

    window.renderAllApps = vi.fn();

    createElement('div', 'folder-popup');
    createElement('h2', 'folder-popup-title');
    createElement('div', 'folder-popup-apps');
    createElement('button', 'folder-popup-close-btn');
    createElement('button', 'folder-popup-rename-btn');
    createElement('div', 'move-to-folder-selector');
    createElement('div', 'move-to-folder-list');

    injectScript('src/features/app-folders.js');
  });

  beforeEach(() => {
    localStorage.clear();
  });

  describe('createFolderIconElement', () => {
    it('creates a folder icon element with correct structure', () => {
      const folder = { id: 'folder-1', name: 'Test Folder', apps: [] };
      const el = window.AppFolders.createFolderIconElement(folder);
      expect(el.tagName).toBe('A');
      expect(el.className).toContain('folder-icon');
      expect(el.id).toBe('folder-1');
      expect(el.title).toBe('Test Folder');
      expect(el.draggable).toBe(false);
      expect(el.querySelector('.app-name').textContent).toBe('Test Folder');
    });
  });

  describe('buildStackedPreviewHtml', () => {
    it('returns empty folder icon when no apps', () => {
      const folder = { id: 'f1', name: 'Empty', apps: [] };
      const html = window.AppFolders.buildStackedPreviewHtml(folder);
      expect(html).toContain('folder-icon-empty');
      expect(html).not.toContain('folder-icon-preview');
    });
  });

  describe('getFolders / getFolder', () => {
    it('getFolders returns folders from state', () => {
      AppGridState.createFolder('F1', []);
      const folders = window.AppFolders.getFolders();
      expect(folders).toHaveLength(1);
      expect(folders[0].name).toBe('F1');
    });

    it('getFolder finds by id', () => {
      const f = AppGridState.createFolder('Target', []);
      expect(window.AppFolders.getFolder(f.id).name).toBe('Target');
      expect(window.AppFolders.getFolder('nonexistent')).toBeUndefined();
    });
  });

  describe('openFolderPopup / closeFolderPopup', () => {
    it('openFolderPopup sets display and currentFolderId', () => {
      const folder = AppGridState.createFolder('Popup', []);
      window.AppFolders.openFolderPopup(folder.id);
      const popup = document.getElementById('folder-popup');
      expect(popup.style.display).toBe('flex');
      expect(document.getElementById('folder-popup-title').textContent).toBe('Popup');
    });

    it('uses the bundled fallback when a folder app icon fails to load', () => {
      AppGridState.addApp({
        id: 'broken-folder-icon',
        url: 'https://example.com',
        name: 'Broken folder icon',
        icon: 'https://example.com/missing.png'
      });
      const folder = AppGridState.createFolder('Broken icons', ['broken-folder-icon']);

      window.AppFolders.openFolderPopup(folder.id);

      const image = document.querySelector('#popup-broken-folder-icon img');
      image.dispatchEvent(new Event('error'));

      expect(image.getAttribute('src')).toBe('images/icons/globe.svg');
      expect(image.hasAttribute('data-app-icon')).toBe(false);
    });

    it('closeFolderPopup hides popup and clears currentFolderId', () => {
      const folder = AppGridState.createFolder('Close', []);
      window.AppFolders.openFolderPopup(folder.id);
      window.AppFolders.closeFolderPopup();
      const popup = document.getElementById('folder-popup');
      expect(popup.style.display).toBe('none');
    });
  });

  describe('move-to-folder selector', () => {
    it('keeps the app icon in place when persistence fails', () => {
      const folder = AppGridState.createFolder('Target', []);
      const appGrid = createElement('div', 'app-grid');
      const appIcon = document.createElement('a');
      appIcon.id = 'app-to-move';
      appIcon.className = 'app-icon custom-app';
      appGrid.appendChild(appIcon);

      const addApp = document.createElement('button');
      addApp.id = 'new-app';
      appGrid.appendChild(addApp);

      const moveSpy = vi.spyOn(AppGridState, 'moveAppToFolder').mockReturnValue(false);

      try {
        window.AppFolders.showMoveToFolderSelector('app-to-move');
        document.querySelector('#move-to-folder-list .move-to-folder-option:not(.cancel)').click();

        expect(document.getElementById('app-to-move')).toBe(appIcon);
        expect(moveSpy).toHaveBeenCalledWith(folder.id, 'app-to-move');
      } finally {
        moveSpy.mockRestore();
        appGrid.remove();
      }
    });
  });
});
