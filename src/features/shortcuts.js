// src/features/shortcuts.js - Keyboard shortcuts for common actions

(function () {
  'use strict';

  const STORAGE_KEY = 'customShortcuts';

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    } catch (e) {
      console.warn('Failed to save shortcuts:', STORAGE_KEY, e);
    }
  }

  function resetShortcuts() {
    if (rebindingAction) cancelRebinding();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to reset shortcuts:', STORAGE_KEY, e);
    }
    activeShortcuts = loadShortcuts();
    renderShortcutsSection();
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

  function focusSearchBar() {
    const input = document.querySelector('.search-bar input');
    if (input) input.focus();
  }

  function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('modal-open');
  }

  function toggleSimpleMode() {
    const checkbox = document.getElementById('simple-mode-checkbox');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      try {
        localStorage.setItem('simpleMode', checkbox.checked);
      } catch (e) {
        console.warn('Failed to save simpleMode:', e);
      }
      if (typeof window.applySimpleMode === 'function') {
        window.applySimpleMode();
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
    try {
      localStorage.setItem('focusMode', current ? 'false' : 'true');
    } catch (e) {
      console.warn('Failed to save focusMode:', e);
    }

    if (typeof window.applyFocusMode === 'function') {
      window.applyFocusMode();
    }
  }

  function toggleTodo() {
    let current = true;
    try {
      current = localStorage.getItem('todoEnabled') !== 'false';
    } catch (e) {
      console.warn('Failed to read todoEnabled:', e);
    }
    try {
      localStorage.setItem('todoEnabled', current ? 'false' : 'true');
    } catch (e) {
      console.warn('Failed to save todoEnabled:', e);
    }
    if (typeof window.applyTodoEnabled === 'function') {
      window.applyTodoEnabled();
    }
  }

  function toggleNotes() {
    let current = true;
    try {
      current = localStorage.getItem('notesEnabled') !== 'false';
    } catch (e) {
      console.warn('Failed to read notesEnabled:', e);
    }
    try {
      localStorage.setItem('notesEnabled', current ? 'false' : 'true');
    } catch (e) {
      console.warn('Failed to save notesEnabled:', e);
    }
    if (typeof window.applyNotesEnabled === 'function') {
      window.applyNotesEnabled();
    }
  }

  function closeModal() {
    for (let i = 0; i < MODAL_SELECTORS.length; i++) {
      const def = MODAL_SELECTORS[i];
      const el = document.querySelector(def.selector);
      if (!el) continue;

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

    const combo = formatCombo(e);

    if (isTextInputFocused() && combo !== activeShortcuts.toggleFocusMode) return;

    for (const action in activeShortcuts) {
      if (activeShortcuts[action] === combo) {
        e.preventDefault();
        executeAction(action);
        return;
      }
    }
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
  }

  function startRebinding(action, btn) {
    if (rebindingAction) {
      cancelRebinding();
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

      // If another action already uses this combo, swap bindings
      for (const otherAction in activeShortcuts) {
        if (otherAction !== action && activeShortcuts[otherAction] === combo) {
          activeShortcuts[otherAction] = activeShortcuts[action];
          break;
        }
      }

      activeShortcuts[action] = combo;
      saveShortcuts(activeShortcuts);
      renderShortcutsSection();

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

  function initShortcuts() {
    if (initialized) return;
    initialized = true;
    activeShortcuts = loadShortcuts();
    document.addEventListener('keydown', handleKeydown);

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
    formatCombo: formatCombo,
    isTextInputFocused: isTextInputFocused,
    executeAction: executeAction,
    handleKeydown: handleKeydown,
    renderShortcutsSection: renderShortcutsSection
  };
})();
