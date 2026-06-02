// src/features/context-menu.js - Right-click context menu for custom apps

(function () {
  'use strict';

let contextTargetId = null;
let contextTargetFolderId = null;
let contextMenuInitialized = false;
const runContextMenuOnDomReady = window.onDomReady;

function createFallbackIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '3');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '18');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '8.5');
  circle.setAttribute('cy', '8.5');
  circle.setAttribute('r', '1.5');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '21,15 16,10 5,21');

  svg.appendChild(rect);
  svg.appendChild(circle);
  svg.appendChild(polyline);
  return svg;
}

function setPreviewIcon(previewIcon, iconUrl) {
  if (!previewIcon) return;

  previewIcon.textContent = '';

  const normalizedIconUrl = typeof iconUrl === 'string' ? iconUrl.trim() : '';
  if (!normalizedIconUrl) {
    previewIcon.appendChild(createFallbackIconSvg());
    return;
  }

  const img = document.createElement('img');
  img.alt = 'Icon';
  img.src = normalizedIconUrl;
  img.addEventListener('error', () => {
    previewIcon.textContent = '';
    previewIcon.appendChild(createFallbackIconSvg());
  }, { once: true });

  previewIcon.appendChild(img);
}

// Create context menu element
const contextMenu = document.createElement('div');
contextMenu.id = 'app-context-menu';
contextMenu.className = 'app-context-menu';

// Common helper to add hover
function addHover(el) {
  el.addEventListener('mouseenter', () => el.classList.add('hover'));
  el.addEventListener('mouseleave', () => el.classList.remove('hover'));
}

// App items (for custom-app)
const renameItem = document.createElement('div');
renameItem.id = 'rename-app';
renameItem.className = 'context-menu-item context-menu-app-item';
renameItem.setAttribute('data-i18n', 'renameApp');
renameItem.textContent = 'Rename';
addHover(renameItem);

const moveToFolderItem = document.createElement('div');
moveToFolderItem.id = 'move-to-folder';
moveToFolderItem.className = 'context-menu-item context-menu-app-item';
moveToFolderItem.setAttribute('data-i18n', 'moveToFolder');
moveToFolderItem.textContent = 'Move to Folder';
addHover(moveToFolderItem);

const removeFromFolderItem = document.createElement('div');
removeFromFolderItem.id = 'remove-from-folder';
removeFromFolderItem.className = 'context-menu-item context-menu-folder-app-item';
removeFromFolderItem.setAttribute('data-i18n', 'removeFromFolder');
removeFromFolderItem.textContent = 'Remove from Folder';
addHover(removeFromFolderItem);

const changeThumbnailItem = document.createElement('div');
changeThumbnailItem.id = 'change-thumbnail';
changeThumbnailItem.className = 'context-menu-item context-menu-app-item';
changeThumbnailItem.setAttribute('data-i18n', 'changeThumbnail');
changeThumbnailItem.textContent = 'Change Thumbnail';
addHover(changeThumbnailItem);

const deleteItem = document.createElement('div');
deleteItem.id = 'delete-app';
deleteItem.className = 'context-menu-item delete-item context-menu-app-item';
deleteItem.setAttribute('data-i18n', 'deleteApp');
deleteItem.textContent = 'Delete';
addHover(deleteItem);

// Folder items (for folder-icon)
const renameFolderItem = document.createElement('div');
renameFolderItem.id = 'rename-folder';
renameFolderItem.className = 'context-menu-item context-menu-folder-item';
renameFolderItem.setAttribute('data-i18n', 'renameFolder');
renameFolderItem.textContent = 'Rename Folder';
addHover(renameFolderItem);

const deleteFolderItem = document.createElement('div');
deleteFolderItem.id = 'delete-folder';
deleteFolderItem.className = 'context-menu-item delete-item context-menu-folder-item';
deleteFolderItem.setAttribute('data-i18n', 'deleteFolder');
deleteFolderItem.textContent = 'Delete Folder';
addHover(deleteFolderItem);

// Grid items (for empty grid space)
const createFolderItem = document.createElement('div');
createFolderItem.id = 'create-folder';
createFolderItem.className = 'context-menu-item context-menu-grid-item';
createFolderItem.setAttribute('data-i18n', 'createFolder');
createFolderItem.textContent = 'Create Folder';
addHover(createFolderItem);

contextMenu.appendChild(renameItem);
contextMenu.appendChild(moveToFolderItem);
contextMenu.appendChild(removeFromFolderItem);
contextMenu.appendChild(changeThumbnailItem);
contextMenu.appendChild(deleteItem);
contextMenu.appendChild(renameFolderItem);
contextMenu.appendChild(deleteFolderItem);
contextMenu.appendChild(createFolderItem);
document.body.appendChild(contextMenu);

// Track which context triggered the menu
let contextMenuTrigger = null; // 'custom-app', 'folder-icon', 'grid'

// Helper to show/hide context menu sections
function setContextMenuItems(trigger) {
  contextMenuTrigger = trigger;
  const appItems = contextMenu.querySelectorAll('.context-menu-app-item');
  const folderAppItems = contextMenu.querySelectorAll('.context-menu-folder-app-item');
  const folderItems = contextMenu.querySelectorAll('.context-menu-folder-item');
  const gridItems = contextMenu.querySelectorAll('.context-menu-grid-item');

  appItems.forEach(el => el.style.display = 'none');
  folderAppItems.forEach(el => el.style.display = 'none');
  folderItems.forEach(el => el.style.display = 'none');
  gridItems.forEach(el => el.style.display = 'none');

  if (trigger === 'custom-app') {
    appItems.forEach(el => el.style.display = 'block');
  } else if (trigger === 'folder-app') {
    folderAppItems.forEach(el => el.style.display = 'block');
  } else if (trigger === 'folder-icon') {
    folderItems.forEach(el => el.style.display = 'block');
  } else if (trigger === 'grid') {
    gridItems.forEach(el => el.style.display = 'block');
  }
}

function positionContextMenu(e) {
  let left = e.pageX;
  let top = e.pageY;

  contextMenu.style.display = 'block';
  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;

  if (left + menuWidth > window.innerWidth) {
    left = window.innerWidth - menuWidth - 10;
  }

  if (top + menuHeight > window.innerHeight) {
    top = window.innerHeight - menuHeight - 10;
  }

  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
  document.body.classList.add('context-menu-open');
}

// Right-click to show context menu
document.addEventListener('contextmenu', function (e) {
  const customAppIcon = e.target.closest('.app-icon.custom-app');
  const folderIcon = e.target.closest('.app-icon.folder-icon');
  const appGrid = e.target.closest('#app-grid');
  const folderPopup = e.target.closest('#folder-popup-apps');

  // Right-click on custom app inside the folder popup
  if (folderPopup && customAppIcon) {
    e.preventDefault();
    const realAppId = customAppIcon.id.replace(/^popup-/, '');
    contextTargetId = realAppId;
    contextTargetFolderId = window.AppFolders ? window.AppFolders.currentFolderId : null;
    setContextMenuItems('folder-app');
    positionContextMenu(e);
    return;
  }

  if (customAppIcon) {
    e.preventDefault();
    contextTargetId = customAppIcon.id;
    setContextMenuItems('custom-app');
    positionContextMenu(e);
    return;
  }

  if (folderIcon) {
    e.preventDefault();
    contextTargetId = folderIcon.id;
    setContextMenuItems('folder-icon');
    positionContextMenu(e);
    return;
  }

  if (appGrid && !e.target.closest('.app-icon')) {
    e.preventDefault();
    contextTargetId = null;
    setContextMenuItems('grid');
    positionContextMenu(e);
    return;
  }
});

// Hide context menu when clicking elsewhere
document.addEventListener('click', function (e) {
  if (!contextMenu.contains(e.target) && e.button !== 2) {
    contextMenu.style.display = 'none';
    document.body.classList.remove('context-menu-open');
    contextTargetId = null;
    contextTargetFolderId = null;
  }
});

// Rename functionality
document.getElementById('rename-app').addEventListener('click', function () {
  if (contextMenuTrigger !== 'custom-app') return;
  if (!contextTargetId) return;
  const apps = window.AppGridState.getCustomApps();
  const currentApp = apps.find(app => app.id === contextTargetId);
  if (!currentApp) return;

  // Store the app id for the modal handler
  window.renameAppId = contextTargetId;
  
  // Set the current name in the input
  document.getElementById('rename-app-input').value = currentApp.name;
  
  // Show the rename modal
  document.getElementById('rename-app-modal').classList.add('modal-open');
  
  // Focus the input
  setTimeout(() => {
    document.getElementById('rename-app-input').focus();
    document.getElementById('rename-app-input').select();
  }, 100);
  
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

// Remove from Folder
document.getElementById('remove-from-folder').addEventListener('click', function () {
  if (contextMenuTrigger !== 'folder-app') return;
  if (!contextTargetId) return;
  const folderId = contextTargetFolderId;
  if (folderId) {
    window.AppGridState.removeAppFromFolder(folderId, contextTargetId);
    if (window.AppFolders) window.AppFolders.renderFolderAppsInPopup();
    if (typeof window.renderAllApps === 'function') window.renderAllApps();
  }
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

// Move to Folder
document.getElementById('move-to-folder').addEventListener('click', function () {
  if (contextMenuTrigger !== 'custom-app') return;
  if (!contextTargetId) return;
  if (window.AppFolders) {
    window.AppFolders.showMoveToFolderSelector(contextTargetId);
  }
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

// Rename Folder
document.getElementById('rename-folder').addEventListener('click', function () {
  if (contextMenuTrigger !== 'folder-icon') return;
  if (!contextTargetId) return;
  if (window.AppFolders) {
    window.AppFolders.promptRenameFolder(contextTargetId);
  }
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

// Delete Folder
document.getElementById('delete-folder').addEventListener('click', function () {
  if (contextMenuTrigger !== 'folder-icon') return;
  if (!contextTargetId) return;
  if (window.AppFolders) {
    window.AppFolders.promptDeleteFolder(contextTargetId);
  }
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

// Create Folder
document.getElementById('create-folder').addEventListener('click', function () {
  if (contextMenuTrigger !== 'grid') return;
  if (window.AppFolders) {
    window.AppFolders.promptCreateFolder();
  }
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

function initRenameModalHandlers() {
  const renameModal = document.getElementById('rename-app-modal');
  const renameInput = document.getElementById('rename-app-input');
  const renameCancel = document.getElementById('rename-app-cancel');
  const renameConfirm = document.getElementById('rename-app-confirm');
  const missingElements = getMissingElementIds({
    'rename-app-modal': renameModal,
    'rename-app-input': renameInput,
    'rename-app-cancel': renameCancel,
    'rename-app-confirm': renameConfirm
  });

  if (missingElements) {
    console.warn('Context menu rename modal elements were not found:', missingElements.join(', '));
    return false;
  }

  // Close modal on cancel button
  renameCancel.addEventListener('click', function() {
    renameModal.classList.remove('modal-open');
    window.renameAppId = null;
  });
  
  // Close modal on confirm
  renameConfirm.addEventListener('click', function() {
    const newName = renameInput.value.trim();
    if (newName && window.renameAppId) {
      window.AppGridState.renameApp(window.renameAppId, newName);
      if (window.renderCustomApps) window.renderCustomApps();
    }
    renameModal.classList.remove('modal-open');
    window.renameAppId = null;
  });
  
  // Close modal on Enter key in input
  renameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      renameConfirm.click();
    }
  });
  
  // Close modal on backdrop click
  renameModal.addEventListener('click', function(e) {
    if (e.target === renameModal) {
      renameModal.classList.remove('modal-open');
      window.renameAppId = null;
    }
  });

  return true;
}

// Change thumbnail functionality
document.getElementById('change-thumbnail').addEventListener('click', function () {
  if (contextMenuTrigger !== 'custom-app') return;
  if (!contextTargetId) return;
  // Find by persistent id
  const apps = window.AppGridState.getCustomApps();
  const currentApp = apps.find(app => app.id === contextTargetId);
  if (!currentApp) return;

  // Store the app id for the modal handler
  window.thumbnailAppId = contextTargetId;
  
  // Set the current icon URL in the input
  document.getElementById('thumbnail-app-input').value = currentApp.icon || '';
  
  // Update the preview
  const previewIcon = document.getElementById('thumbnail-preview-icon');
  const previewName = document.getElementById('thumbnail-preview-name');
  setPreviewIcon(previewIcon, currentApp.icon);
  previewName.textContent = currentApp.name;
  
  // Show the thumbnail modal
  document.getElementById('thumbnail-app-modal').classList.add('modal-open');
  
  // Focus the input
  setTimeout(() => {
    document.getElementById('thumbnail-app-input').focus();
  }, 100);
  
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

function initThumbnailModalHandlers() {
  const thumbnailModal = document.getElementById('thumbnail-app-modal');
  const thumbnailInput = document.getElementById('thumbnail-app-input');
  const thumbnailCancel = document.getElementById('thumbnail-app-cancel');
  const thumbnailConfirm = document.getElementById('thumbnail-app-confirm');
  const missingElements = getMissingElementIds({
    'thumbnail-app-modal': thumbnailModal,
    'thumbnail-app-input': thumbnailInput,
    'thumbnail-app-cancel': thumbnailCancel,
    'thumbnail-app-confirm': thumbnailConfirm
  });

  if (missingElements) {
    console.warn('Context menu thumbnail modal elements were not found:', missingElements.join(', '));
    return false;
  }

  // Close modal on cancel button
  thumbnailCancel.addEventListener('click', function() {
    thumbnailModal.classList.remove('modal-open');
    window.thumbnailAppId = null;
  });
  
  // Update preview when input changes
  thumbnailInput.addEventListener('input', function() {
    const iconUrl = this.value.trim();
    const previewIcon = document.getElementById('thumbnail-preview-icon');
    setPreviewIcon(previewIcon, iconUrl);
  });
  
  // Close modal on confirm
  thumbnailConfirm.addEventListener('click', function() {
    const newIcon = thumbnailInput.value.trim();
    if (newIcon && window.thumbnailAppId) {
      try {
        window.AppGridState.updateThumbnail(window.thumbnailAppId, newIcon);
        if (window.renderCustomApps) window.renderCustomApps();
      } catch (e) {
        console.error('Failed to update custom app thumbnail:', e);
      }
    }
    thumbnailModal.classList.remove('modal-open');
    window.thumbnailAppId = null;
  });
  
  // Close modal on Enter key in input
  thumbnailInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      thumbnailConfirm.click();
    }
  });
  
  // Close modal on backdrop click
  thumbnailModal.addEventListener('click', function(e) {
    if (e.target === thumbnailModal) {
      thumbnailModal.classList.remove('modal-open');
      window.thumbnailAppId = null;
    }
  });

  return true;
}

// Delete functionality
document.getElementById('delete-app').addEventListener('click', function () {
  if (contextMenuTrigger !== 'custom-app') return;
  if (!contextTargetId) return;
  // Find by persistent id
  const apps = window.AppGridState.getCustomApps();
  const currentApp = apps.find(app => app.id === contextTargetId);
  if (!currentApp) return;

  // Store the app id for the modal handler
  window.deleteAppId = contextTargetId;
  
  // Update the delete preview
  const previewIcon = document.getElementById('delete-preview-icon');
  const previewName = document.getElementById('delete-preview-name');
  setPreviewIcon(previewIcon, currentApp.icon);
  previewName.textContent = currentApp.name;
  
  // Show the delete modal
  document.getElementById('delete-app-modal').classList.add('modal-open');
  
  contextMenu.style.display = 'none';
  document.body.classList.remove('context-menu-open');
});

function initDeleteModalHandlers() {
  const deleteModal = document.getElementById('delete-app-modal');
  const deleteCancel = document.getElementById('delete-app-cancel');
  const deleteConfirm = document.getElementById('delete-app-confirm');
  const missingElements = getMissingElementIds({
    'delete-app-modal': deleteModal,
    'delete-app-cancel': deleteCancel,
    'delete-app-confirm': deleteConfirm
  });

  if (missingElements) {
    console.warn('Context menu delete modal elements were not found:', missingElements.join(', '));
    return false;
  }

  // Close modal on cancel button
  deleteCancel.addEventListener('click', function() {
    deleteModal.classList.remove('modal-open');
    window.deleteAppId = null;
  });
  
  // Delete on confirm
  deleteConfirm.addEventListener('click', function() {
    if (window.deleteAppId) {
      window.AppGridState.deleteApp(window.deleteAppId);
      if (window.renderCustomApps) window.renderCustomApps();
    }
    deleteModal.classList.remove('modal-open');
    window.deleteAppId = null;
  });
  
  // Close modal on backdrop click
  deleteModal.addEventListener('click', function(e) {
    if (e.target === deleteModal) {
      deleteModal.classList.remove('modal-open');
      window.deleteAppId = null;
    }
  });

  return true;
}

function initContextMenu() {
  const renameReady = initRenameModalHandlers();
  const thumbnailReady = initThumbnailModalHandlers();
  const deleteReady = initDeleteModalHandlers();

  if (renameReady && thumbnailReady && deleteReady) {
    contextMenuInitialized = true;
    return true;
  }

  return false;
}

const getMissingElementIds = (elementsById) => {
  const missing = Object.keys(elementsById).filter((id) => !elementsById[id]);
  return missing.length > 0 ? missing : null;
};

// Initialize modal ids
window.renameAppId = null;
window.thumbnailAppId = null;
window.deleteAppId = null;
window.clearContextMenuFolderState = function () {
  contextTargetFolderId = null;
};

// Prevent default context menu on default apps (not custom-app or folder-icon)
document.addEventListener('contextmenu', function (e) {
  const defaultIcon = e.target.closest('.app-icon.default-app');
  if (defaultIcon && !e.target.closest('.app-icon.custom-app, .app-icon.folder-icon')) {
    e.preventDefault();
  }
});

runContextMenuOnDomReady(() => {
  if (contextMenuInitialized) {
    return;
  }

  initContextMenu();
});

})();
