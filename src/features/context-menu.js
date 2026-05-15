// src/features/context-menu.js - Right-click context menu for custom apps


let currentAppId = null;
let contextMenuInitialized = false;
const runContextMenuOnDomReady = window.onDomReady;

function createFallbackIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "3");
  rect.setAttribute("y", "3");
  rect.setAttribute("width", "18");
  rect.setAttribute("height", "18");
  rect.setAttribute("rx", "2");
  rect.setAttribute("ry", "2");

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "8.5");
  circle.setAttribute("cy", "8.5");
  circle.setAttribute("r", "1.5");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", "21,15 16,10 5,21");

  svg.appendChild(rect);
  svg.appendChild(circle);
  svg.appendChild(polyline);
  return svg;
}

function setPreviewIcon(previewIcon, iconUrl) {
  if (!previewIcon) return;

  previewIcon.textContent = "";

  const normalizedIconUrl = typeof iconUrl === "string" ? iconUrl.trim() : "";
  if (!normalizedIconUrl) {
    previewIcon.appendChild(createFallbackIconSvg());
    return;
  }

  const img = document.createElement("img");
  img.alt = "Icon";
  img.src = normalizedIconUrl;
  img.addEventListener("error", () => {
    previewIcon.textContent = "";
    previewIcon.appendChild(createFallbackIconSvg());
  }, { once: true });

  previewIcon.appendChild(img);
}

// Create context menu element
const contextMenu = document.createElement("div");
contextMenu.id = "app-context-menu";
contextMenu.className = "app-context-menu";

// Menu items
const renameItem = document.createElement("div");
renameItem.id = "rename-app";
renameItem.className = "context-menu-item";
renameItem.setAttribute('data-i18n', 'renameApp');
renameItem.textContent = "Rename";

const changeThumbnailItem = document.createElement("div");
changeThumbnailItem.id = "change-thumbnail";
changeThumbnailItem.className = "context-menu-item";
changeThumbnailItem.setAttribute('data-i18n', 'changeThumbnail');
changeThumbnailItem.textContent = "Change Thumbnail";

const deleteItem = document.createElement("div");
deleteItem.id = "delete-app";
deleteItem.className = "context-menu-item delete-item";
deleteItem.setAttribute('data-i18n', 'deleteApp');
deleteItem.textContent = "Delete";

// Add hover effects
[renameItem, changeThumbnailItem, deleteItem].forEach((item) => {
  item.addEventListener("mouseenter", () => item.classList.add("hover"));
  item.addEventListener("mouseleave", () => item.classList.remove("hover"));
});

contextMenu.appendChild(renameItem);
contextMenu.appendChild(changeThumbnailItem);
contextMenu.appendChild(deleteItem);
document.body.appendChild(contextMenu);

// Right-click to show context menu
document.addEventListener("contextmenu", function (e) {
  const appIcon = e.target.closest(".app-icon.custom-app");
  if (appIcon) {
    e.preventDefault();

    // Store the id of the right-clicked custom app
    currentAppId = appIcon.id;

    // Position and show context menu
    let left = e.pageX;
    let top = e.pageY;

    if (left + 160 > window.innerWidth) {
      left = window.innerWidth - 160 - 10;
    }

    if (top + 100 > window.innerHeight) {
      top = window.innerHeight - 100 - 10;
    }

    contextMenu.style.left = left + "px";
    contextMenu.style.top = top + "px";
    contextMenu.style.display = "block";
    document.body.classList.add("context-menu-open");
  }
});

// Hide context menu when clicking elsewhere
document.addEventListener("click", function (e) {
  if (!contextMenu.contains(e.target) && e.button !== 2) {
    contextMenu.style.display = "none";
    document.body.classList.remove("context-menu-open");
  }
});

// Rename functionality
document.getElementById("rename-app").addEventListener("click", function () {
  if (!currentAppId) return;
  const apps = AppGridState.getCustomApps();
  const currentApp = apps.find(app => app.id === currentAppId);
  if (!currentApp) return;
  
  // Store the app id for the modal handler
  window.renameAppId = currentAppId;
  
  // Set the current name in the input
  document.getElementById('rename-app-input').value = currentApp.name;
  
  // Show the rename modal
  document.getElementById('rename-app-modal').style.display = 'flex';
  
  // Focus the input
  setTimeout(() => {
    document.getElementById('rename-app-input').focus();
    document.getElementById('rename-app-input').select();
  }, 100);
  
  contextMenu.style.display = "none";
  document.body.classList.remove("context-menu-open");
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
    renameModal.style.display = 'none';
    window.renameAppId = null;
  });
  
  // Close modal on confirm
  renameConfirm.addEventListener('click', function() {
    const newName = renameInput.value.trim();
    if (newName && window.renameAppId) {
      AppGridState.renameApp(window.renameAppId, newName);
      if (window.renderCustomApps) window.renderCustomApps();
    }
    renameModal.style.display = 'none';
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
      renameModal.style.display = 'none';
      window.renameAppId = null;
    }
  });

  return true;
}

// Change thumbnail functionality
document.getElementById("change-thumbnail").addEventListener("click", function () {
  if (!currentAppId) return;
  // Find by persistent id
  const apps = AppGridState.getCustomApps();
  const currentApp = apps.find(app => app.id === currentAppId);
  if (!currentApp) return;
  
  // Store the app id for the modal handler
  window.thumbnailAppId = currentAppId;
  
  // Set the current icon URL in the input
  document.getElementById('thumbnail-app-input').value = currentApp.icon || '';
  
  // Update the preview
  const previewIcon = document.getElementById('thumbnail-preview-icon');
  const previewName = document.getElementById('thumbnail-preview-name');
  setPreviewIcon(previewIcon, currentApp.icon);
  previewName.textContent = currentApp.name;
  
  // Show the thumbnail modal
  document.getElementById('thumbnail-app-modal').style.display = 'flex';
  
  // Focus the input
  setTimeout(() => {
    document.getElementById('thumbnail-app-input').focus();
  }, 100);
  
  contextMenu.style.display = "none";
  document.body.classList.remove("context-menu-open");
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
    thumbnailModal.style.display = 'none';
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
        AppGridState.updateThumbnail(window.thumbnailAppId, newIcon);
        if (window.renderCustomApps) window.renderCustomApps();
      } catch (e) {
        console.error("Failed to update custom app thumbnail:", e);
      }
    }
    thumbnailModal.style.display = 'none';
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
      thumbnailModal.style.display = 'none';
      window.thumbnailAppId = null;
    }
  });

  return true;
}

// Delete functionality
document.getElementById("delete-app").addEventListener("click", function () {
  if (!currentAppId) return;
  // Find by persistent id
  const apps = AppGridState.getCustomApps();
  const currentApp = apps.find(app => app.id === currentAppId);
  if (!currentApp) return;
  
  // Store the app id for the modal handler
  window.deleteAppId = currentAppId;
  
  // Update the delete preview
  const previewIcon = document.getElementById('delete-preview-icon');
  const previewName = document.getElementById('delete-preview-name');
  setPreviewIcon(previewIcon, currentApp.icon);
  previewName.textContent = currentApp.name;
  
  // Show the delete modal
  document.getElementById('delete-app-modal').style.display = 'flex';
  
  contextMenu.style.display = "none";
  document.body.classList.remove("context-menu-open");
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
    deleteModal.style.display = 'none';
    window.deleteAppId = null;
  });
  
  // Delete on confirm
  deleteConfirm.addEventListener('click', function() {
    if (window.deleteAppId) {
      AppGridState.deleteApp(window.deleteAppId);
      if (window.renderCustomApps) window.renderCustomApps();
    }
    deleteModal.style.display = 'none';
    window.deleteAppId = null;
  });
  
  // Close modal on backdrop click
  deleteModal.addEventListener('click', function(e) {
    if (e.target === deleteModal) {
      deleteModal.style.display = 'none';
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

// Prevent default context menu on default apps
document.addEventListener("contextmenu", function (e) {
  const appIcon = e.target.closest(".app-icon.default-app");
  if (appIcon) {
    e.preventDefault();
  }
});

runContextMenuOnDomReady(() => {
  if (contextMenuInitialized) {
    return;
  }

  initContextMenu();
});
