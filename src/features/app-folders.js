(function () {
  'use strict';

  let currentFolderId = null;
  let moveToFolderAppId = null;
  const escapeHtml = window.escapeHtml;

  function getFolders() {
    return AppGridState.getFolders();
  }

  function getFolder(id) {
    return getFolders().find(f => f.id === id);
  }

  function getFolderAppData(folder) {
    if (!folder || !folder.apps) return [];
    const customApps = AppGridState.getCustomApps();
    const defaultApps = window.defaultApps || [];
    const allApps = [...defaultApps, ...customApps];
    const appMap = Object.fromEntries(allApps.map(a => [a.id, a]));
    return folder.apps.map(id => appMap[id]).filter(Boolean);
  }

  function buildStackedPreviewHtml(folder) {
    const apps = getFolderAppData(folder);
    const count = apps.length;

    if (count === 0) {
      return '<div class="icon folder-icon-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>';
    }

    const previews = apps.slice(0, 3).map((app, i) => {
      const iconUrl = app.cachedIcon || app.icon || '';
      const safeIconUrl = window.validateIconUrl ? window.validateIconUrl(iconUrl) : iconUrl;
      const offsetX = i * 3;
      const offsetY = i * 3;
      const size = count === 1 ? '100%' : '70%';
      const zIndex = 3 - i;
      return `<img src="${escapeHtml(safeIconUrl || '')}" alt="" class="folder-preview-icon" style="position:absolute;top:${offsetY}px;left:${offsetX}px;width:${size};height:${size};object-fit:contain;border-radius:4px;z-index:${zIndex}" onerror="this.style.display='none'">`;
    }).join('');

    const badge = count > 3 ? `<span class="folder-count-badge">+${count - 3}</span>` : '';

    return `<div class="icon folder-icon-preview" style="position:relative;overflow:hidden">${previews}${badge}</div>`;
  }

  function createFolderIconElement(folder) {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'app-icon folder-icon';
    a.id = folder.id;
    a.draggable = false;
    a.title = folder.name;

    a.innerHTML = buildStackedPreviewHtml(folder) + `<span class="app-name">${escapeHtml(folder.name)}</span>`;

    a.addEventListener('click', function (e) {
      e.preventDefault();
      openFolderPopup(folder.id);
    });

    a.addEventListener('dblclick', function (e) {
      e.preventDefault();
      promptRenameFolder(folder.id);
    });

    return a;
  }

  function openFolderPopup(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;

    currentFolderId = folderId;
    const popup = document.getElementById('folder-popup');
    const title = document.getElementById('folder-popup-title');
    const grid = document.getElementById('folder-popup-apps');

    if (!popup || !title || !grid) return;

    title.textContent = folder.name;
    renderFolderContents(folder, grid);
    popup.style.display = 'flex';
    document.body.classList.add('folder-popup-open');
  }

  function closeFolderPopup() {
    const popup = document.getElementById('folder-popup');
    if (popup) popup.style.display = 'none';
    document.body.classList.remove('folder-popup-open');
    currentFolderId = null;
  }

  function renderFolderAppsInPopup() {
    if (!currentFolderId) return;
    const folder = getFolder(currentFolderId);
    if (!folder) return;
    const grid = document.getElementById('folder-popup-apps');
    if (!grid) return;
    renderFolderContents(folder, grid);
  }

  function renderFolderContents(folder, grid) {
    grid.innerHTML = '';
    const apps = getFolderAppData(folder);
    const appMap = Object.fromEntries(apps.map(a => [a.id, a]));

    if (apps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'folder-popup-empty';
      empty.setAttribute('data-i18n', 'folderEmpty');
      empty.textContent = window.i18n ? window.i18n.t('folderEmpty') : 'This folder is empty';
      grid.appendChild(empty);
      return;
    }

    const openInNewTab = localStorage.getItem('openAppsInNewTab') !== 'false';

    folder.apps.forEach(appId => {
      const app = appMap[appId];
      if (!app) return;

      const displayName = app.nameKey && window.i18n ? window.i18n.t(app.nameKey) : (app.name || app.nameKey || '');
      const iconUrl = app.cachedIcon || app.icon || '';

      const a = document.createElement('a');
      a.href = app.url || '#';
      a.className = 'app-icon ' + (app.className || 'custom-app');
      a.id = 'popup-' + app.id;
      a.draggable = true;
      a.title = displayName;

      if (openInNewTab && app.url && app.url !== '#') {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }

      const safeIconUrl = window.validateIconUrl ? window.validateIconUrl(iconUrl) : iconUrl;
      a.innerHTML = `<div class="icon"><img src="${escapeHtml(safeIconUrl || '')}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/edent/SuperTinyIcons/images/svg/globe.svg';"></div><span class="app-name">${escapeHtml(displayName)}</span>`;

      grid.appendChild(a);
    });
  }

  function promptRenameFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;

    const newName = prompt(window.i18n ? window.i18n.t('renameFolderPrompt') : 'Enter new folder name:', folder.name);
    if (newName && newName.trim()) {
      AppGridState.renameFolder(folderId, newName.trim());
      refreshFolderUI();
    }
  }

  function promptCreateFolder() {
    const name = prompt(window.i18n ? window.i18n.t('createFolderPrompt') : 'Enter folder name:', window.i18n ? window.i18n.t('newFolder') : 'New Folder');
    if (!name || !name.trim()) return;

    const folder = AppGridState.createFolder(name.trim(), []);
    if (folder) {
      if (typeof window.renderAllApps === 'function') {
        window.renderAllApps();
      }
    }
  }

  function promptDeleteFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;

    const msg = window.i18n ? window.i18n.t('deleteFolderConfirm', { name: folder.name }) : 'Delete folder "' + folder.name + '"? Apps inside will be moved back to the grid.';
    if (confirm(msg)) {
      if (currentFolderId === folderId) closeFolderPopup();
      AppGridState.deleteFolder(folderId);
      if (typeof window.renderAllApps === 'function') {
        window.renderAllApps();
      }
    }
  }

  function showMoveToFolderSelector(appId) {
    const folders = getFolders();
    if (folders.length === 0) {
      const create = confirm(window.i18n ? window.i18n.t('noFoldersCreate') : 'No folders yet. Create one now?');
      if (create) {
        promptCreateFolder();
      }
      return;
    }

    moveToFolderAppId = appId;
    const selector = document.getElementById('move-to-folder-selector');
    const list = document.getElementById('move-to-folder-list');
    if (!selector || !list) return;

    list.innerHTML = '';
    folders.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'move-to-folder-option';
      btn.textContent = f.name;
      btn.addEventListener('click', function () {
        if (moveToFolderAppId) {
          AppGridState.moveAppToFolder(f.id, moveToFolderAppId);
          if (typeof window.renderAllApps === 'function') {
            window.renderAllApps();
          }
        }
        hideMoveToFolderSelector();
      });
      list.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'move-to-folder-option cancel';
    cancelBtn.textContent = window.i18n ? window.i18n.t('cancel') : 'Cancel';
    cancelBtn.addEventListener('click', hideMoveToFolderSelector);
    list.appendChild(cancelBtn);

    selector.style.display = 'flex';
  }

  function hideMoveToFolderSelector() {
    const selector = document.getElementById('move-to-folder-selector');
    if (selector) selector.style.display = 'none';
    moveToFolderAppId = null;
  }

  function refreshFolderUI() {
    const title = document.getElementById('folder-popup-title');
    if (title && currentFolderId) {
      const folder = getFolder(currentFolderId);
      if (folder) title.textContent = folder.name;
    }
    if (typeof window.renderAllApps === 'function') {
      window.renderAllApps();
    }
  }

  function setupFolderPopupListeners() {
    const closeBtn = document.getElementById('folder-popup-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeFolderPopup);
    }

    const renameBtn = document.getElementById('folder-popup-rename-btn');
    if (renameBtn) {
      renameBtn.addEventListener('click', function () {
        if (currentFolderId) promptRenameFolder(currentFolderId);
      });
    }

    const popup = document.getElementById('folder-popup');
    if (popup) {
      popup.addEventListener('click', function (e) {
        if (e.target === popup) closeFolderPopup();
      });
    }

    // Backdrop click on move-to-folder selector
    const selector = document.getElementById('move-to-folder-selector');
    if (selector) {
      selector.addEventListener('click', function (e) {
        if (e.target === selector && selector.style.display === 'flex') {
          hideMoveToFolderSelector();
        }
      });
    }

    // Drag-drop reordering within the folder popup
    const popupApps = document.getElementById('folder-popup-apps');
    if (popupApps) {
      let dragSrcId = null;
      let dragSrcElement = null;

      popupApps.addEventListener('dragstart', function (e) {
        const icon = e.target.closest('.app-icon');
        if (!icon) return;
        dragSrcId = icon.id.replace(/^popup-/, '');
        dragSrcElement = icon;
        icon.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcId);
      });

      popupApps.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const icon = e.target.closest('.app-icon');
        if (icon) {
          icon.classList.add('drag-over');
        }
      });

      popupApps.addEventListener('dragleave', function (e) {
        const icon = e.target.closest('.app-icon');
        if (icon) {
          icon.classList.remove('drag-over');
        }
      });

      popupApps.addEventListener('drop', function (e) {
        e.preventDefault();
        const targetIcon = e.target.closest('.app-icon');
        if (!targetIcon || !dragSrcId || !currentFolderId) return;

        const targetId = targetIcon.id.replace(/^popup-/, '');
        const folder = getFolder(currentFolderId);
        if (!folder) return;

        const toIdx = folder.apps.indexOf(targetId);
        if (toIdx === -1) return;

        AppGridState.reorderFolderApps(currentFolderId, dragSrcId, toIdx);
        renderFolderAppsInPopup();
      });

      popupApps.addEventListener('dragend', function () {
        if (dragSrcElement) {
          dragSrcElement.classList.remove('dragging');
        }
        popupApps.querySelectorAll('.app-icon').forEach(el => el.classList.remove('drag-over'));
        dragSrcId = null;
        dragSrcElement = null;
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const selector = document.getElementById('move-to-folder-selector');
        if (selector && selector.style.display === 'flex') {
          hideMoveToFolderSelector();
          return;
        }
        const folderPopup = document.getElementById('folder-popup');
        if (folderPopup && folderPopup.style.display === 'flex') {
          closeFolderPopup();
        }
      }
    });
  }

  function init() {
    setupFolderPopupListeners();
    if (typeof window.renderAllApps === 'function') {
      window.renderAllApps();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AppFolders = {
    createFolderIconElement,
    openFolderPopup,
    closeFolderPopup,
    promptCreateFolder,
    promptRenameFolder,
    promptDeleteFolder,
    showMoveToFolderSelector,
    refreshFolderUI,
    renderFolderAppsInPopup,
    get currentFolderId() { return currentFolderId; },
    getFolders,
    getFolder,
    getFolderAppData,
    buildStackedPreviewHtml
  };

})();
