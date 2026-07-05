(function () {
  'use strict';

  const STORAGE_KEY = 'bookmarks';
  const ENABLED_KEY = 'bookmarksBarEnabled';
  const EMPTY_DATA = Object.freeze({ items: [], folders: [] });
  const MAX_BOOKMARKS = 20;
  const GOOGLE_FAVICON_PREFIX = 'https://www.google.com/s2/favicons?domain=';

  const modalState = {
    editingId: null
  };

  let folderMenuState = null;
  let contextMenuState = null;
  let contextMenuEl = null;

  function cloneData(data) {
    return {
      items: Array.isArray(data.items) ? data.items.map(item => ({ ...item })) : [],
      folders: Array.isArray(data.folders) ? data.folders.map(folder => ({ ...folder })) : []
    };
  }

  function generateId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function safeTrim(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function loadBookmarksData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneData(EMPTY_DATA);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return cloneData(EMPTY_DATA);
      }
      return {
        items: Array.isArray(parsed.items) ? parsed.items.filter(isBookmarkRecord) : [],
        folders: Array.isArray(parsed.folders) ? parsed.folders.filter(isFolderRecord) : []
      };
    } catch (error) {
      console.warn('Failed to parse bookmarks from localStorage, resetting to empty data:', error);
      return cloneData(EMPTY_DATA);
    }
  }

  function saveBookmarksData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save bookmarks to localStorage:', error);
    }
  }

  function isBookmarkRecord(item) {
    return item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string';
  }

  function isFolderRecord(folder) {
    return folder && typeof folder === 'object' && typeof folder.id === 'string' && typeof folder.name === 'string';
  }

  function loadBookmarksBarEnabled() {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  }

  function faviconForBookmark(bookmark) {
    const explicit = safeTrim(bookmark.faviconUrl);
    if (explicit) return explicit;
    try {
      const parsed = new URL(bookmark.url);
      return GOOGLE_FAVICON_PREFIX + encodeURIComponent(parsed.hostname) + '&sz=16';
    } catch {
      return '';
    }
  }

  function getRootItems(data) {
    return data.items.filter(item => !item.folderId);
  }

  function getFolderItems(data, folderId) {
    return data.items.filter(item => item.folderId === folderId);
  }

  function getVisibleFolderRecords(data) {
    return data.folders.filter(folder => getFolderItems(data, folder.id).length > 0);
  }

  function openInNewTab() {
    return localStorage.getItem('openAppsInNewTab') !== 'false';
  }

  function createBookmarkAnchor(bookmark) {
    const anchor = document.createElement('a');
    anchor.className = 'bookmark-pill';
    anchor.href = bookmark.url;
    anchor.dataset.bookmarkId = bookmark.id;
    anchor.textContent = bookmark.name;
    const favicon = faviconForBookmark(bookmark);
    if (favicon) {
      const img = document.createElement('img');
      img.className = 'bookmark-pill-icon';
      img.src = favicon;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () {
        img.remove();
      }, { once: true });
      anchor.prepend(img);
    }
    applyAnchorTarget(anchor);
    return anchor;
  }

  function applyAnchorTarget(anchor) {
    if (openInNewTab()) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    } else {
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
    }
  }

  function renderBookmarksBar() {
    const bar = document.getElementById('bookmarks-bar');
    const content = document.getElementById('bookmarks-bar-content');
    const emptyState = document.getElementById('bookmarks-empty-state');
    if (!bar || !content || !emptyState) return;

    const enabled = loadBookmarksBarEnabled();
    bar.hidden = !enabled;
    if (!enabled) {
      hideFolderMenu();
      hideContextMenu();
      return;
    }

    const data = loadBookmarksData();
    const rootItems = getRootItems(data);
    const folders = getVisibleFolderRecords(data);
    content.textContent = '';

    rootItems.forEach(bookmark => {
      content.appendChild(createBookmarkAnchor(bookmark));
    });

    folders.forEach(folder => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bookmark-folder-pill';
      button.dataset.folderId = folder.id;
      button.textContent = folder.name;
      button.addEventListener('click', function () {
        toggleFolderMenu(folder.id, button);
      });
      content.appendChild(button);
    });

    const isEmpty = data.items.length === 0;
    emptyState.hidden = !isEmpty;
    content.hidden = isEmpty;
  }

  function renderFolderMenu(folderId, anchorEl) {
    const menu = document.getElementById('bookmarks-folder-menu');
    if (!menu || !anchorEl) return;

    const data = loadBookmarksData();
    const items = getFolderItems(data, folderId);
    if (!items.length) {
      hideFolderMenu();
      return;
    }

    menu.textContent = '';
    items.forEach(item => {
      menu.appendChild(createBookmarkAnchor(item));
    });

    const rect = anchorEl.getBoundingClientRect();
    menu.hidden = false;
    menu.style.left = rect.left + window.scrollX + 'px';
    menu.style.top = rect.bottom + window.scrollY + 8 + 'px';
    folderMenuState = { folderId };
  }

  function hideFolderMenu() {
    const menu = document.getElementById('bookmarks-folder-menu');
    if (!menu) return;
    menu.hidden = true;
    menu.textContent = '';
    folderMenuState = null;
  }

  function toggleFolderMenu(folderId, anchorEl) {
    if (folderMenuState && folderMenuState.folderId === folderId) {
      hideFolderMenu();
      return;
    }
    renderFolderMenu(folderId, anchorEl);
  }

  function ensureContextMenu() {
    if (contextMenuEl) return contextMenuEl;
    contextMenuEl = document.createElement('div');
    contextMenuEl.id = 'bookmarks-context-menu';
    contextMenuEl.className = 'app-context-menu bookmarks-context-menu';
    const actions = [
      ['edit', 'Edit'],
      ['delete', 'Delete'],
      ['move-up', 'Move Up'],
      ['move-down', 'Move Down']
    ];
    actions.forEach(([action, label]) => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      if (action === 'delete') item.classList.add('delete-item');
      item.dataset.action = action;
      item.textContent = label;
      item.addEventListener('click', onContextMenuAction);
      contextMenuEl.appendChild(item);
    });
    document.body.appendChild(contextMenuEl);
    return contextMenuEl;
  }

  function hideContextMenu() {
    if (!contextMenuEl) return;
    contextMenuEl.style.display = 'none';
    contextMenuState = null;
  }

  function showContextMenu(event, bookmarkId) {
    const menu = ensureContextMenu();
    contextMenuState = { bookmarkId };
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
  }

  function onContextMenuAction(event) {
    if (!contextMenuState) return;
    const action = event.currentTarget.dataset.action;
    const bookmarkId = contextMenuState.bookmarkId;
    if (action === 'edit') {
      openBookmarkModal(bookmarkId);
    } else if (action === 'delete') {
      deleteBookmark(bookmarkId);
    } else if (action === 'move-up') {
      moveBookmark(bookmarkId, -1);
    } else if (action === 'move-down') {
      moveBookmark(bookmarkId, 1);
    }
    hideContextMenu();
  }

  function onBookmarksContextMenu(event) {
    const bookmark = event.target.closest('.bookmark-pill');
    if (!bookmark) return;
    event.preventDefault();
    showContextMenu(event, bookmark.dataset.bookmarkId);
  }

  function normalizeUrl(value) {
    const raw = safeTrim(value);
    if (!raw) return '';
    const candidate = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    try {
      return new URL(candidate).toString();
    } catch {
      return '';
    }
  }

  function upsertFolder(data, folderName) {
    const trimmed = safeTrim(folderName);
    if (!trimmed) return null;
    const existing = data.folders.find(folder => folder.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const folder = { id: generateId('bookmark-folder'), name: trimmed };
    data.folders.push(folder);
    return folder.id;
  }

  function cleanupFolders(data) {
    const usedFolderIds = new Set(data.items.map(item => item.folderId).filter(Boolean));
    data.folders = data.folders.filter(folder => usedFolderIds.has(folder.id));
  }

  function openBookmarkModal(bookmarkId) {
    const modal = document.getElementById('bookmark-modal');
    const title = document.getElementById('bookmark-modal-title');
    const nameInput = document.getElementById('bookmark-name-input');
    const urlInput = document.getElementById('bookmark-url-input');
    const faviconInput = document.getElementById('bookmark-favicon-input');
    const folderInput = document.getElementById('bookmark-folder-input');
    const folderList = document.getElementById('bookmark-folder-list');
    if (!modal || !title || !nameInput || !urlInput || !faviconInput || !folderInput || !folderList) return;

    const data = loadBookmarksData();
    const current = bookmarkId ? data.items.find(item => item.id === bookmarkId) : null;
    modalState.editingId = bookmarkId || null;
    title.textContent = current ? 'Edit Bookmark' : 'Add Bookmark';
    nameInput.value = current ? current.name : '';
    urlInput.value = current ? current.url : '';
    faviconInput.value = current ? (current.faviconUrl || '') : '';
    folderInput.value = current && current.folderId
      ? ((data.folders.find(folder => folder.id === current.folderId) || {}).name || '')
      : '';
    folderList.textContent = '';
    data.folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.name;
      folderList.appendChild(option);
    });
    modal.classList.add('modal-open');
    nameInput.focus();
  }

  function closeBookmarkModal() {
    const modal = document.getElementById('bookmark-modal');
    if (!modal) return;
    modal.classList.remove('modal-open');
    modalState.editingId = null;
  }

  function saveBookmarkFromModal() {
    const nameInput = document.getElementById('bookmark-name-input');
    const urlInput = document.getElementById('bookmark-url-input');
    const faviconInput = document.getElementById('bookmark-favicon-input');
    const folderInput = document.getElementById('bookmark-folder-input');
    if (!nameInput || !urlInput || !faviconInput || !folderInput) return;

    const name = safeTrim(nameInput.value);
    const url = normalizeUrl(urlInput.value);
    const faviconUrl = safeTrim(faviconInput.value);
    if (!name || !url) return;

    const data = loadBookmarksData();
    if (!modalState.editingId && data.items.length >= MAX_BOOKMARKS) {
      return;
    }

    const folderId = upsertFolder(data, folderInput.value);
    if (modalState.editingId) {
      const existing = data.items.find(item => item.id === modalState.editingId);
      if (!existing) return;
      existing.name = name;
      existing.url = url;
      existing.faviconUrl = faviconUrl;
      existing.folderId = folderId;
    } else {
      data.items.push({
        id: generateId('bookmark'),
        name,
        url,
        faviconUrl,
        folderId
      });
    }

    cleanupFolders(data);
    saveBookmarksData(data);
    closeBookmarkModal();
    renderBookmarksBar();
  }

  function deleteBookmark(bookmarkId) {
    const data = loadBookmarksData();
    data.items = data.items.filter(item => item.id !== bookmarkId);
    cleanupFolders(data);
    saveBookmarksData(data);
    renderBookmarksBar();
  }

  function moveBookmark(bookmarkId, direction) {
    const data = loadBookmarksData();
    const index = data.items.findIndex(item => item.id === bookmarkId);
    if (index === -1) return;
    const folderId = data.items[index].folderId || '';
    const siblingIndexes = data.items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(entry => (entry.item.folderId || '') === folderId)
      .map(entry => entry.itemIndex);
    const siblingPosition = siblingIndexes.indexOf(index);
    const targetPosition = siblingPosition + direction;
    if (targetPosition < 0 || targetPosition >= siblingIndexes.length) return;
    const swapIndex = siblingIndexes[targetPosition];
    const temp = data.items[index];
    data.items[index] = data.items[swapIndex];
    data.items[swapIndex] = temp;
    saveBookmarksData(data);
    renderBookmarksBar();
  }

  function applyBookmarksBarEnabled() {
    const checkbox = document.getElementById('bookmarks-bar-enabled-setting');
    if (checkbox) checkbox.checked = loadBookmarksBarEnabled();
    renderBookmarksBar();
  }

  function applyBookmarkTargets() {
    document.querySelectorAll('.bookmark-pill').forEach(applyAnchorTarget);
  }

  function initBookmarkEvents() {
    const addButton = document.getElementById('bookmarks-add-button');
    const saveButton = document.getElementById('bookmark-modal-save');
    const cancelButton = document.getElementById('bookmark-modal-cancel');
    const closeButton = document.getElementById('bookmark-modal-close');
    const modal = document.getElementById('bookmark-modal');
    const enableCheckbox = document.getElementById('bookmarks-bar-enabled-setting');
    const bar = document.getElementById('bookmarks-bar');
    const folderMenu = document.getElementById('bookmarks-folder-menu');

    if (addButton) {
      addButton.addEventListener('click', function () {
        openBookmarkModal(null);
      });
    }
    if (saveButton) saveButton.addEventListener('click', saveBookmarkFromModal);
    if (cancelButton) cancelButton.addEventListener('click', closeBookmarkModal);
    if (closeButton) closeButton.addEventListener('click', closeBookmarkModal);
    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeBookmarkModal();
      });
    }
    if (enableCheckbox) {
      enableCheckbox.addEventListener('change', function () {
        localStorage.setItem(ENABLED_KEY, this.checked ? 'true' : 'false');
        applyBookmarksBarEnabled();
      });
    }
    if (bar) {
      bar.addEventListener('contextmenu', onBookmarksContextMenu);
    }
    document.addEventListener('click', function (event) {
      if (contextMenuEl && !contextMenuEl.contains(event.target)) {
        hideContextMenu();
      }
      if (folderMenu && !folderMenu.hidden && !folderMenu.contains(event.target) && !event.target.closest('.bookmark-folder-pill')) {
        hideFolderMenu();
      }
    });
  }

  function initBookmarksBar() {
    initBookmarkEvents();
    applyBookmarksBarEnabled();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookmarksBar);
  } else {
    initBookmarksBar();
  }

  window.BookmarksBar = {
    loadData: loadBookmarksData,
    saveData: saveBookmarksData,
    loadEnabled: loadBookmarksBarEnabled,
    applyEnabled: applyBookmarksBarEnabled,
    render: renderBookmarksBar,
    applyTargets: applyBookmarkTargets,
    openModal: openBookmarkModal,
    closeModal: closeBookmarkModal,
    deleteBookmark,
    moveBookmark
  };
})();
