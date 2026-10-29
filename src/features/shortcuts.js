// src/features/shortcuts.js - Keyboard shortcuts for common actions

(function () {
  'use strict';

  const STORAGE_KEY = 'customShortcuts';
  const APP_SHORTCUTS_KEY = 'appShortcutsEnabled';
  const APP_SHORTCUT_MAX_SLOT = 9;

  const DEFAULT_SHORTCUTS = {
    focusSearch: '/',
    openSettings: 'Ctrl+,',
    toggleFocusMode: 'Ctrl+Shift+F',
    toggleSimpleMode: 'Ctrl+Shift+S',
    toggleTodo: 'Ctrl+Shift+T',
    toggleNotes: 'Ctrl+Shift+N',
    closeModal: 'Escape'
  };

  const ACTION_LABEL_KEYS = {
    focusSearch: 'shortcutFocusSearch',
    openSettings: 'shortcutOpenSettings',
    toggleFocusMode: 'shortcutToggleFocusMode',
    toggleSimpleMode: 'shortcutToggleSimpleMode',
    toggleTodo: 'shortcutToggleTodo',
    toggleNotes: 'shortcutToggleNotes',
    closeModal: 'shortcutCloseModal'
  };

  function t(key) {
    return window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key;
  }

  const MODAL_SELECTORS = [
    // First so Escape always dismisses the topmost overlay before any modal
    // underneath it (e.g. Settings) that may also be open.
    { selector: '#bg-confirm-dialog', cssClass: 'bg-confirm-open' },
    { selector: '#ai-confirm-dialog', cssClass: 'ai-confirm-open' },
    { selector: '#todo-edit-modal', cssClass: 'modal-open' },
    { selector: '#add-app-modal', cssClass: 'modal-open' },
    { selector: '#rename-app-modal', cssClass: 'modal-open' },
    { selector: '#thumbnail-app-modal', cssClass: 'modal-open' },
    { selector: '#delete-app-modal', cssClass: 'modal-open' },
    { selector: '#clear-completed-dialog', cssClass: 'ai-confirm-open' },
    { selector: '#import-todos-dialog', cssClass: 'ai-confirm-open' },
    { selector: '#ai-chat-modal', cssClass: 'ai-modal-open' },
    { selector: '#settings-modal', cssClass: 'modal-open' },
    { selector: '#weather-app-modal', cssClass: 'modal-open' },
    { selector: '#games-app-modal', cssClass: 'modal-open' },
    { selector: '#folder-popup', cssClass: 'folder-popup-open', bodyClass: true },
    { selector: '#move-to-folder-selector', useDisplay: true },
    { selector: '#app-context-menu', cssClass: 'context-menu-open', bodyClass: true }
  ];

  let activeShortcuts = {};
  let rebindingAction = null;
  let rebindingKeyHandler = null;
  let initialized = false;

  function loadShortcuts() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const sanitized = {};
        for (const action in DEFAULT_SHORTCUTS) {
          if (
            Object.prototype.hasOwnProperty.call(parsed, action) &&
            typeof parsed[action] === 'string' &&
            parsed[action]
          ) {
            sanitized[action] = parsed[action];
          }
        }
        return Object.assign({}, DEFAULT_SHORTCUTS, sanitized);
      }
    } catch (e) {
      console.warn('Failed to load shortcuts:', STORAGE_KEY, e);
    }
    return Object.assign({}, DEFAULT_SHORTCUTS);
  }

  function saveShortcuts(shortcuts) {
    try {
      const result = localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
      return result !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save shortcuts:', STORAGE_KEY, e);
      return false;
    }
  }

  // Pass a per-operation state object to show the toast at most once per operation.
  function showShortcutSaveError(state) {
    if (state) {
      if (state.toastShown) return;
      state.toastShown = true;
    }
    const message = t('shortcutSaveError');
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
    } else {
      console.warn(message);
    }
  }

  // Resolves to whether the reset was persisted. The storage bridge's sync
  // removeItem() returns undefined and restores the value later if
  // chrome.storage fails, so prefer removeItemAsync() and check its result.
  function resetShortcuts() {
    if (rebindingAction) cancelRebinding();
    const toastState = { toastShown: false };

    const reportFailure = () => {
      try {
        showShortcutSaveError(toastState);
      } catch (e) {
        console.warn('Failed to show shortcut save error:', e);
      }
    };

    // A refresh/render error must not change the persistence outcome: when the
    // reset was saved it still resolves true without the "not saved" toast.
    const finish = (persisted) => {
      try {
        // On failure the bridge has already restored the stored value, so reloading rolls back.
        activeShortcuts = loadShortcuts();
        renderShortcutsSection();
      } catch (e) {
        console.warn('Failed to refresh shortcuts after reset:', STORAGE_KEY, e);
      }
      if (!persisted) {
        reportFailure();
      }
      return persisted;
    };

    const fail = (e) => {
      console.warn('Failed to reset shortcuts:', STORAGE_KEY, e);
      return finish(false);
    };

    const settle = (run) => {
      try {
        return run();
      } catch (e) {
        console.warn('Failed to reset shortcuts:', STORAGE_KEY, e);
        reportFailure();
        return false;
      }
    };

    if (typeof localStorage.removeItemAsync === 'function') {
      let pending;
      try {
        pending = localStorage.removeItemAsync(STORAGE_KEY);
      } catch (e) {
        return Promise.resolve(settle(() => fail(e)));
      }
      // finish() and fail() catch their own render/toast errors, so this chain
      // cannot reject and the click handler never sees an unhandled rejection.
      return Promise.resolve(pending).then((result) => finish(result === true), fail);
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      return Promise.resolve(settle(() => fail(e)));
    }
    // A later chrome.storage restore is handled by the storageBridgeWriteError listener.
    return Promise.resolve(settle(() => finish(localStorage.getItem(STORAGE_KEY) === null)));
  }

  function formatCombo(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();

    const modifiers = ['Control', 'Shift', 'Alt', 'Meta'];
    if (!modifiers.includes(e.key)) {
      parts.push(key);
    }
    return parts.join('+');
  }

  function isTextInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  // --- Positional app launch shortcuts (Alt+1..9, issue #1061) ---

  function appLaunchEnabled() {
    try {
      return localStorage.getItem(APP_SHORTCUTS_KEY) !== 'false';
    } catch (e) {
      console.warn('Failed to read ' + APP_SHORTCUTS_KEY + ':', e);
      return true;
    }
  }

  function setAppLaunchEnabled(enabled) {
    try {
      return localStorage.setItem(APP_SHORTCUTS_KEY, enabled ? 'true' : 'false') !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save ' + APP_SHORTCUTS_KEY + ':', e);
      return false;
    }
  }

  // Maps grid slot ids to their Alt+N combo, walking appOrder. Folders occupy
  // a slot (their combo opens the popup); hidden default apps and apps inside
  // folders are skipped and do not consume a slot.
  function getAppShortcutMap() {
    const map = {};
    if (!appLaunchEnabled()) return map;
    const state = window.AppGridState;
    if (!state || typeof state.getOrder !== 'function') return map;
    const order = state.getOrder();
    if (!Array.isArray(order)) return map;

    const folderedIds = new Set();
    if (typeof state.getFolders === 'function') {
      (state.getFolders() || []).forEach((folder) => {
        (Array.isArray(folder.apps) ? folder.apps : []).forEach((appId) => folderedIds.add(appId));
      });
    }
    const hiddenIds = new Set(
      typeof state.getHiddenDefaultApps === 'function' ? state.getHiddenDefaultApps() : []
    );

    let slot = 1;
    for (const id of order) {
      if (slot > APP_SHORTCUT_MAX_SLOT) break;
      if (folderedIds.has(id) || hiddenIds.has(id)) continue;
      map[id] = 'Alt+' + slot;
      slot += 1;
    }
    return map;
  }

  function getAppShortcutForId(id) {
    return getAppShortcutMap()[id] || null;
  }

  // Resolves a positional slot to its grid id, or null when the slot is empty.
  function getAppShortcutSlotId(slot) {
    const combo = 'Alt+' + slot;
    const map = getAppShortcutMap();
    const ids = Object.keys(map);
    for (let i = 0; i < ids.length; i++) {
      if (map[ids[i]] === combo) return ids[i];
    }
    return null;
  }

  function launchAppFromShortcut(id, e) {
    const state = window.AppGridState;
    const folders = state && typeof state.getFolders === 'function' ? state.getFolders() || [] : [];
    const isFolder = folders.some((folder) => folder.id === id);
    if (isFolder) {
      if (window.AppFolders && typeof window.AppFolders.openFolderPopup === 'function') {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        window.AppFolders.openFolderPopup(id);
        return true;
      }
      return false;
    }

    if (typeof window.openInternalApp === 'function' && window.openInternalApp(id, e)) {
      return true;
    }

    const tile = document.getElementById(id);
    if (!tile || !tile.classList || !tile.classList.contains('app-icon')) return false;
    const href = tile.getAttribute('href');
    if (!href || href === '#') return false;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    let openInNewTab = true;
    try {
      openInNewTab = localStorage.getItem('openAppsInNewTab') !== 'false';
    } catch (err) {
      console.warn('Failed to read openAppsInNewTab:', err);
    }
    if (openInNewTab) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = href;
    }
    return true;
  }

  // After the global-action loop: Alt+1..9 launches the matching grid slot.
  // Global shortcuts always win, so a user-bound Alt+digit on a global action
  // can never be shadowed by the positional launcher.
  function handleAppShortcutKeydown(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
    if (e.key.length !== 1 || e.key < '1' || e.key > '9') return false;
    const id = getAppShortcutSlotId(parseInt(e.key, 10));
    if (!id) return false;
    return launchAppFromShortcut(id, e);
  }

  // Syncs on-tile key badges and titles with the current slot map. Full grid
  // renders bake badges in via createAppIconElement; this covers in-place
  // mutations (drag reorder, hide/show, toggle change).
  function refreshAppShortcutBadges() {
    const grid = document.getElementById('app-grid');
    if (!grid) return;
    const map = getAppShortcutMap();
    grid.querySelectorAll('.app-icon').forEach((tile) => {
      const combo = map[tile.id] || null;
      const nameEl = tile.querySelector('.app-name');
      let baseTitle = nameEl ? nameEl.textContent : '';
      if (!baseTitle) {
        baseTitle = tile.title ? tile.title.replace(/ \([^)]*\)$/, '') : '';
      }
      let badge = tile.querySelector('.app-shortcut-badge');
      if (!combo) {
        if (badge) badge.remove();
        tile.title = baseTitle;
        tile.removeAttribute('aria-label');
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'app-shortcut-badge';
        const iconWrap = tile.querySelector('.icon');
        if (iconWrap) iconWrap.appendChild(badge);
      }
      badge.textContent = combo;
      const labeled = baseTitle + ' (' + combo + ')';
      tile.title = labeled;
      tile.setAttribute('aria-label', labeled);
    });
  }

  function focusSearchBar() {
    const input = document.querySelector('.search-bar input');
    if (input) input.focus();
  }

  function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('modal-open');
  }

  // Guard the shared helper: toast.js may fail to load, and an unguarded
  // call would throw before the write (#969 review thread).
  function persistToggleOrFallback(key, value) {
    try {
      return typeof window.persistFeatureToggle === 'function'
        ? window.persistFeatureToggle(key, value)
        : localStorage.setItem(key, value) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (e) {
      console.warn('Failed to save ' + key + ':', e);
      return false;
    }
  }

  function reportToggleSaveError() {
    if (typeof window.showFeatureToggleSaveError === 'function') {
      window.showFeatureToggleSaveError();
    } else {
      console.warn('Failed to save a feature setting. Your last action was not saved.');
    }
  }

  function toggleSimpleMode() {
    const checkbox = document.getElementById('simple-mode-checkbox');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      const persisted = persistToggleOrFallback('simpleMode', checkbox.checked);
      if (typeof window.applySimpleMode === 'function') {
        window.applySimpleMode();
      }
      if (!persisted) {
        reportToggleSaveError();
      }
    }
  }

  function toggleFocusMode() {
    if (typeof window.toggleFocusMode === 'function') {
      window.toggleFocusMode();
      return;
    }

    let current = false;
    try {
      current = localStorage.getItem('focusMode') === 'true';
    } catch (e) {
      console.warn('Failed to read focusMode:', e);
    }
    const persisted = persistToggleOrFallback('focusMode', current ? 'false' : 'true');

    if (typeof window.applyFocusMode === 'function') {
      window.applyFocusMode();
    }
    if (!persisted) {
      reportToggleSaveError();
    }
  }

  function toggleTodo() {
    let current = true;
    try {
      current = localStorage.getItem('todoEnabled') !== 'false';
    } catch (e) {
      console.warn('Failed to read todoEnabled:', e);
    }
    const persisted = persistToggleOrFallback('todoEnabled', current ? 'false' : 'true');
    if (typeof window.applyTodoEnabled === 'function') {
      window.applyTodoEnabled();
    }
    if (!persisted) {
      reportToggleSaveError();
    }
  }

  function toggleNotes() {
    let current = true;
    try {
      current = localStorage.getItem('notesEnabled') !== 'false';
    } catch (e) {
      console.warn('Failed to read notesEnabled:', e);
    }
    const persisted = persistToggleOrFallback('notesEnabled', current ? 'false' : 'true');
    if (typeof window.applyNotesEnabled === 'function') {
      window.applyNotesEnabled();
    }
    if (!persisted) {
      reportToggleSaveError();
    }
  }

  function closeModal() {
    for (let i = 0; i < MODAL_SELECTORS.length; i++) {
      const def = MODAL_SELECTORS[i];
      const el = document.querySelector(def.selector);
      if (!el) continue;

      if (def.selector === '#games-app-modal') {
        if (el.open === true || el.classList.contains(def.cssClass)) {
          if (typeof window.GamesApp === 'object' && typeof window.GamesApp.close === 'function') {
            window.GamesApp.close();
          } else if (typeof el.close === 'function') {
            el.close();
          }
          return true;
        }
      }

      if (def.bodyClass) {
        if (def.cssClass && document.body.classList.contains(def.cssClass)) {
          if (def.selector === '#folder-popup' && typeof window.AppFolders === 'object' && window.AppFolders.closeFolderPopup) {
            window.AppFolders.closeFolderPopup();
          } else {
            el.style.display = 'none';
            document.body.classList.remove(def.cssClass);
          }
          if (def.selector === '#app-context-menu') {
            window.dispatchEvent(new CustomEvent('contextMenuClose'));
          }
          return true;
        }
      } else if (def.useDisplay) {
        if (el.style.display === 'flex' || el.style.display === 'block') {
          el.style.display = 'none';
          return true;
        }
      } else if (def.cssClass && el.classList.contains(def.cssClass)) {
        // Route weather modal closing through WeatherApp.close() when available
        if (def.selector === '#weather-app-modal' && typeof window.WeatherApp === 'object' && typeof window.WeatherApp.close === 'function') {
          window.WeatherApp.close();
          return true;
        }
        // The confirm dialog owns a pending Promise: only stripping the class
        // would strand it (and the node's 200ms removal), so route through
        // the close hook instead.
        if (def.selector === '#bg-confirm-dialog' &&
            window._customBackgrounds &&
            typeof window._customBackgrounds.closeConfirmDialog === 'function') {
          window._customBackgrounds.closeConfirmDialog();
          return true;
        }
        el.classList.remove(def.cssClass);
        return true;
      }
    }
    return false;
  }

  function executeAction(action) {
    switch (action) {
      case 'focusSearch':
        focusSearchBar();
        break;
      case 'openSettings':
        openSettingsModal();
        break;
      case 'toggleSimpleMode':
        toggleSimpleMode();
        break;
      case 'toggleFocusMode':
        toggleFocusMode();
        break;
      case 'toggleTodo':
        toggleTodo();
        break;
      case 'toggleNotes':
        toggleNotes();
        break;
      case 'closeModal':
        closeModal();
        break;
    }
  }

  function handleKeydown(e) {
    if (rebindingAction) return;

    if (e.key === 'Escape') {
      if (closeModal()) {
        e.preventDefault();
      }
      return;
    }

    // Ctrl+K / Cmd+K always focuses search, even inside text inputs
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      focusSearchBar();
      return;
    }

    const combo = formatCombo(e);

    if (isTextInputFocused() && combo !== activeShortcuts.toggleFocusMode) return;

    for (const action in activeShortcuts) {
      if (activeShortcuts[action] === combo) {
        e.preventDefault();
        executeAction(action);
        return;
      }
    }

    // Positional app launch (Alt+1..9). Reached only when no global action
    // matched, and the text-input guard above already blocked typing contexts.
    handleAppShortcutKeydown(e);
  }

  function renderShortcutsSection() {
    const container = document.getElementById('shortcuts-options');
    if (!container) return;

    container.innerHTML = '';

    for (const action in DEFAULT_SHORTCUTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SHORTCUTS, action)) continue;

      const combo = activeShortcuts[action] || DEFAULT_SHORTCUTS[action];
      const label = t(ACTION_LABEL_KEYS[action] || action);

      const option = document.createElement('div');
      option.className = 'general-option';

      const card = document.createElement('div');
      card.className = 'setting-card';

      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'setting-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.innerHTML = '<rect x="2" y="4" width="20" height="16" rx="2"></rect>' +
        '<path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"></path>';

      const content = document.createElement('div');
      content.className = 'setting-content';

      const labelEl = document.createElement('label');
      labelEl.textContent = label;

      const comboBtn = document.createElement('button');
      comboBtn.className = 'shortcut-combo-btn';
      comboBtn.textContent = combo;
      comboBtn.dataset.action = action;
      comboBtn.addEventListener('click', function () {
        startRebinding(action, this);
      });

      content.appendChild(labelEl);
      content.appendChild(comboBtn);
      card.appendChild(icon);
      card.appendChild(content);
      option.appendChild(card);
      container.appendChild(option);
    }

    // Positional app-launch toggle: Alt+1..9 over the grid (issue #1061).
    const toggleOption = document.createElement('div');
    toggleOption.className = 'general-option';

    const toggleCard = document.createElement('div');
    toggleCard.className = 'setting-card';

    const toggleIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    toggleIcon.setAttribute('class', 'setting-icon');
    toggleIcon.setAttribute('viewBox', '0 0 24 24');
    toggleIcon.setAttribute('fill', 'none');
    toggleIcon.setAttribute('stroke', 'currentColor');
    toggleIcon.setAttribute('stroke-width', '2');
    toggleIcon.innerHTML = '<rect x="2" y="4" width="20" height="16" rx="2"></rect>' +
      '<path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 15h8"></path>';

    const toggleContent = document.createElement('div');
    toggleContent.className = 'setting-content';

    const toggleLabel = document.createElement('label');
    toggleLabel.textContent = t('shortcutAppLaunch');

    const toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.checked = appLaunchEnabled();
    toggleCheckbox.addEventListener('change', function () {
      const persisted = setAppLaunchEnabled(this.checked);
      if (!persisted) {
        this.checked = appLaunchEnabled();
        showShortcutSaveError();
        return;
      }
      refreshAppShortcutBadges();
    });

    toggleContent.appendChild(toggleLabel);
    toggleContent.appendChild(toggleCheckbox);
    toggleCard.appendChild(toggleIcon);
    toggleCard.appendChild(toggleContent);
    toggleOption.appendChild(toggleCard);
    container.appendChild(toggleOption);
  }

  function startRebinding(action, btn) {
    if (rebindingAction) {
      cancelRebinding();
      const container = document.getElementById('shortcuts-options');
      const liveBtn = container && container.querySelector('.shortcut-combo-btn[data-action="' + action + '"]');
      if (liveBtn) {
        btn = liveBtn;
      }
    }

    rebindingAction = action;
    btn.textContent = t('shortcutPressAKey');
    btn.classList.add('rebinding');

    rebindingKeyHandler = function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        cancelRebinding();
        return;
      }

      const combo = formatCombo(e);
      const modifiers = ['Control', 'Shift', 'Alt', 'Meta'];
      if (modifiers.includes(e.key)) return;

      const previousShortcuts = { ...activeShortcuts };

      // If another action already uses this combo, swap bindings
      for (const otherAction in activeShortcuts) {
        if (otherAction !== action && activeShortcuts[otherAction] === combo) {
          activeShortcuts[otherAction] = activeShortcuts[action];
          break;
        }
      }

      activeShortcuts[action] = combo;
      const persisted = saveShortcuts(activeShortcuts);
      if (!persisted) {
        activeShortcuts = previousShortcuts;
      }
      renderShortcutsSection();
      if (!persisted) {
        showShortcutSaveError();
      }

      rebindingAction = null;
      document.removeEventListener('keydown', rebindingKeyHandler, true);
      rebindingKeyHandler = null;
    };

    document.addEventListener('keydown', rebindingKeyHandler, true);
  }

  function cancelRebinding() {
    if (!rebindingAction) return;
    rebindingAction = null;
    if (rebindingKeyHandler) {
      document.removeEventListener('keydown', rebindingKeyHandler, true);
      rebindingKeyHandler = null;
    }
    renderShortcutsSection();
  }

  window.addEventListener('storageBridgeWriteError', function (event) {
    if (event?.detail?.key !== STORAGE_KEY) return;

    setTimeout(function () {
      const persisted = loadShortcuts();
      if (JSON.stringify(persisted) === JSON.stringify(activeShortcuts)) return;
      activeShortcuts = persisted;
      renderShortcutsSection();
      showShortcutSaveError();
    });
  });

  function initShortcuts() {
    if (initialized) return;
    initialized = true;
    activeShortcuts = loadShortcuts();
    document.addEventListener('keydown', handleKeydown);

    // Generated row labels use plain textContent (no data-i18n), so re-render
    // on language change. Cancel any in-progress rebind first so its key
    // handler is removed and the prompt is not left dangling in the old language.
    window.addEventListener('languageChanged', function () {
      if (rebindingAction) {
        cancelRebinding();
      } else {
        renderShortcutsSection();
      }
    });

    const resetBtn = document.getElementById('shortcuts-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetShortcuts);
    }

    renderShortcutsSection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShortcuts);
  } else {
    initShortcuts();
  }

  window.Shortcuts = {
    init: initShortcuts,
    load: loadShortcuts,
    save: saveShortcuts,
    reset: resetShortcuts,
    cancel: cancelRebinding,
    formatCombo: formatCombo,
    isTextInputFocused: isTextInputFocused,
    executeAction: executeAction,
    handleKeydown: handleKeydown,
    renderShortcutsSection: renderShortcutsSection,
    appLaunchEnabled: appLaunchEnabled,
    setAppLaunchEnabled: setAppLaunchEnabled,
    getAppShortcutMap: getAppShortcutMap,
    getAppShortcutForId: getAppShortcutForId,
    launchAppFromShortcut: launchAppFromShortcut,
    refreshAppShortcutBadges: refreshAppShortcutBadges
  };
})();
