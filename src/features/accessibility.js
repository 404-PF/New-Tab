// src/features/accessibility.js - Keyboard and screen-reader accessibility enhancements
(function () {
  'use strict';

  const MODAL_DEFINITIONS = [
    { id: 'ai-confirm-dialog', openClass: 'ai-confirm-open' },
    { id: 'todo-edit-modal', openClass: 'modal-open', close: () => window.closeEditModal?.() },
    { id: 'add-app-modal', openClass: 'modal-open', close: () => window.closeAddAppModal?.() },
    { id: 'rename-app-modal', openClass: 'modal-open' },
    { id: 'thumbnail-app-modal', openClass: 'modal-open' },
    { id: 'delete-app-modal', openClass: 'modal-open' },
    { id: 'clear-completed-dialog', openClass: 'ai-confirm-open' },
    { id: 'import-todos-dialog', openClass: 'ai-confirm-open' },
    { id: 'data-import-dialog', openClass: 'ai-confirm-open' },
    { id: 'ai-chat-modal', openClass: 'ai-modal-open', close: () => window.AIService?.close?.() },
    { id: 'settings-modal', openClass: 'modal-open', labelKey: 'settings', fallbackOpener: '#settings-app' },
    { id: 'weather-app-modal', openClass: 'modal-open', close: () => window.WeatherApp?.close?.() },
    { id: 'games-app-modal', nativeDialog: true, close: () => window.GamesApp?.close?.() },
    { id: 'folder-popup', bodyClass: 'folder-popup-open', display: 'flex', close: () => window.AppFolders?.closeFolderPopup?.() },
    { id: 'move-to-folder-selector', display: 'flex' }
  ];

  const modalState = new Map();
  const backgroundState = new Map();
  let modalStack = [];
  let lastFocusedElement = null;
  let pendingModalOpener = null;
  let contextMenuOpener = null;
  let keyboardContextMenuOpen = false;
  let contextMenuWasOpen = false;
  let observer = null;
  let liveRegion = null;
  let listAnnouncementTimer = null;
  let lastFilterAnnouncementAt = 0;
  let initialized = false;
  const MODAL_MENU_ACTIONS = new Set(['rename-app', 'move-to-folder', 'change-thumbnail', 'delete-app']);

  function translate(key, fallback, replacements) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      const translated = window.i18n.t(key, replacements);
      if (translated && translated !== key) return translated;
    }

    let message = fallback;
    if (replacements && typeof replacements === 'object') {
      Object.entries(replacements).forEach(([placeholder, value]) => {
        message = message.replaceAll('{' + placeholder + '}', value);
      });
    }
    return message;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;

    let current = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      current = current.parentElement;
    }

    return true;
  }

  function isModalOpen(def, element) {
    if (!element) return false;
    if (def.nativeDialog) return element.open === true;
    if (def.openClass) return element.classList.contains(def.openClass);
    if (def.bodyClass) return document.body.classList.contains(def.bodyClass);
    if (def.display) return element.style.display === def.display && isVisible(element);
    return false;
  }

  function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
      'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), iframe, object, embed, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
    )).filter(element => {
      if (element.hasAttribute('hidden')) return false;
      if (!isVisible(element)) return false;
      return !element.closest('[inert]');
    });
  }

  function getModalLabelElement(modal, def) {
    if (def?.labelKey) {
      let label = modal.querySelector('[data-accessibility-modal-label]');
      if (!label) {
        label = document.createElement('span');
        label.className = 'sr-only';
        label.setAttribute('data-accessibility-modal-label', '');
        modal.prepend(label);
      }
      label.textContent = translate(def.labelKey, def.labelKey);
      if (!label.id) label.id = modal.id + '-accessibility-label';
      return label;
    }

    const heading = modal.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      if (!heading.id) heading.id = modal.id + '-accessibility-title';
      return heading;
    }

    let label = modal.querySelector('[data-accessibility-modal-label]');
    if (!label) {
      label = document.createElement('span');
      label.className = 'sr-only';
      label.setAttribute('data-accessibility-modal-label', '');
      modal.prepend(label);
    }
    label.textContent = modal.title || modal.id.replace(/-/g, ' ');
    if (!label.id) label.id = modal.id + '-accessibility-label';
    return label;
  }

  function ensureModalSemantics(modal, def) {
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const label = getModalLabelElement(modal, def);
    if (label) modal.setAttribute('aria-labelledby', label.id);
  }

  function setBackgroundInert(activeModal) {
    if (!activeModal) return;

    Array.from(document.body.children).forEach(child => {
      const containsActiveModal = child === activeModal || child.contains(activeModal);
      const isLiveRegion = child.id === 'accessibility-live-region';
      if (containsActiveModal || isLiveRegion) {
        backgroundState.delete(child);
        child.inert = false;
        child.removeAttribute('inert');
        return;
      }

      if (!backgroundState.has(child)) {
        backgroundState.set(child, {
          inert: !!child.inert,
          hadAttribute: child.hasAttribute('inert')
        });
      }
      child.inert = true;
      child.setAttribute('inert', '');
    });
  }

  function restoreBackgroundInert() {
    backgroundState.forEach((state, element) => {
      if (!element.isConnected) return;
      element.inert = state.inert;
      if (state.hadAttribute || state.inert) {
        element.setAttribute('inert', '');
      } else {
        element.removeAttribute('inert');
      }
    });
    backgroundState.clear();
  }

  function getModalOpener(modal, def) {
    const previous = modalState.get(modal.id);
    const fallback = def.fallbackOpener ? document.querySelector(def.fallbackOpener) : null;
    if (previous?.opener?.isConnected) return previous.opener;
    if (pendingModalOpener?.isConnected) return pendingModalOpener;
    if (fallback && document.activeElement === fallback) return fallback;
    if (document.activeElement && document.activeElement !== document.body && !modal.contains(document.activeElement)) {
      return document.activeElement;
    }
    if (fallback) return fallback;
    return lastFocusedElement?.isConnected ? lastFocusedElement : null;
  }

  function focusModal(modal) {
    const focusable = getFocusableElements(modal);
    const target = focusable[0] || modal;
    if (target === modal && !modal.hasAttribute('tabindex')) {
      modal.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
  }

  function openModal(modal, def) {
    ensureModalSemantics(modal, def);
    const opener = getModalOpener(modal, def);
    modalState.set(modal.id, {
      opener,
      def,
      open: true
    });

    modalStack = modalStack.filter(id => id !== modal.id);
    modalStack.push(modal.id);
    setBackgroundInert(modal);

    requestAnimationFrame(() => {
      if (isModalOpen(def, modal)) focusModal(modal);
    });
    pendingModalOpener = null;
  }

  function closeModalElement(modal, def) {
    if (!modal) return;

    if (typeof def.close === 'function') {
      def.close();
    } else {
      const cancelButtonIds = {
        'rename-app-modal': 'rename-app-cancel',
        'thumbnail-app-modal': 'thumbnail-app-cancel',
        'delete-app-modal': 'delete-app-cancel'
      };
      const cancelButton = cancelButtonIds[def.id]
        ? modal.querySelector('#' + cancelButtonIds[def.id])
        : modal.querySelector('.ai-confirm-cancel');

      if (cancelButton && typeof cancelButton.click === 'function') {
        cancelButton.click();
      }
    }

    if (def.nativeDialog && modal.open && typeof modal.close === 'function') {
      modal.close();
    }

    if (def.openClass) modal.classList.remove(def.openClass);
    if (def.bodyClass) document.body.classList.remove(def.bodyClass);
    if (def.display && modal.style.display === def.display) modal.style.display = 'none';
  }

  function getTopOpenModal() {
    for (let i = modalStack.length - 1; i >= 0; i -= 1) {
      const id = modalStack[i];
      const def = MODAL_DEFINITIONS.find(item => item.id === id);
      const modal = document.getElementById(id);
      if (def && modal && isModalOpen(def, modal)) return { modal, def };
    }

    for (let i = MODAL_DEFINITIONS.length - 1; i >= 0; i -= 1) {
      const def = MODAL_DEFINITIONS[i];
      const modal = document.getElementById(def.id);
      if (modal && isModalOpen(def, modal)) return { modal, def };
    }
    return null;
  }

  function syncModals() {
    const currentlyOpen = [];
    const closedOpeners = [];

    MODAL_DEFINITIONS.forEach(def => {
      const modal = document.getElementById(def.id);
      if (!modal) return;

      const open = isModalOpen(def, modal);
      const previous = modalState.get(def.id);

      ensureModalSemantics(modal, def);

      if (open && !previous?.open) {
        openModal(modal, def);
      } else if (!open && previous?.open) {
        modalState.delete(def.id);
        modalStack = modalStack.filter(id => id !== def.id);
        closedOpeners.push(previous.opener);
      }

      if (open) currentlyOpen.push(def.id);
    });

    modalState.forEach((state, id) => {
      if (currentlyOpen.includes(id)) return;
      if (document.getElementById(id)) return;
      modalState.delete(id);
      modalStack = modalStack.filter(stackId => stackId !== id);
      closedOpeners.push(state.opener);
    });

    const top = getTopOpenModal();
    if (top) {
      setBackgroundInert(top.modal);
    } else {
      restoreBackgroundInert();
    }

    modalStack = modalStack.filter(id => currentlyOpen.includes(id));

    const opener = closedOpeners.reverse().find(element =>
      element?.isConnected &&
      !element.closest('[inert]') &&
      isVisible(element)
    );

    if (opener) {
      requestAnimationFrame(() => {
        if (!opener.closest('[inert]') && isVisible(opener)) {
          opener.focus({ preventScroll: true });
        }
      });
    }
  }

  function handleModalKeydown(event) {
    const top = getTopOpenModal();
    if (!top) return;

    const modal = top.modal;
    if (!modal.contains(event.target)) {
      return;
    }

    if (event.key === 'Escape') {
      const rebindingButton = document.querySelector('.shortcut-combo-btn.rebinding');
      if (rebindingButton) return;

      event.preventDefault();
      event.stopPropagation();
      closeModalElement(modal, top.def);
      syncModals();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(modal);
    if (focusable.length === 0) {
      event.preventDefault();
      modal.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function announce(message) {
    if (!liveRegion || !message) return;
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      if (liveRegion) liveRegion.textContent = message;
    });
  }

  function ensureLiveRegion() {
    liveRegion = document.getElementById('accessibility-live-region');
    if (liveRegion) return;

    liveRegion = document.createElement('div');
    liveRegion.id = 'accessibility-live-region';
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
  }

  function getGridCells(container) {
    if (!container) return [];
    return Array.from(container.children).filter(child =>
      child.classList?.contains('app-icon') &&
      child.id !== 'new-app' &&
      child.id !== 'add-app'
    );
  }

  function getGridColumns(container, cells) {
    if (cells.length > 1) {
      const firstTop = cells[0].getBoundingClientRect().top;
      const columns = cells.findIndex(cell => Math.abs(cell.getBoundingClientRect().top - firstTop) > 2);
      if (columns > 0) return columns;
    }

    const template = window.getComputedStyle(container).gridTemplateColumns || '';
    const repeatMatch = template.match(/repeat\(\s*(\d+)\s*,/);
    if (repeatMatch) return Number(repeatMatch[1]);

    const explicitColumns = template.trim().split(/\s+/).filter(Boolean).length;
    if (explicitColumns > 1) return explicitColumns;

    return 0;
  }

  function getCellLabel(cell) {
    const label = cell.querySelector('.app-name')?.textContent?.trim();
    return label || cell.getAttribute('title') || cell.id || translate('accessibilityApp', 'App');
  }

  function setGridSemantics(container) {
    if (!container) return;
    container.setAttribute('role', 'grid');
    container.setAttribute('aria-label', translate('apps', 'Apps'));

    const cells = getGridCells(container);
    if (cells.length === 0) return;

    let activeId = cells.find(cell => cell === document.activeElement)?.id;
    if (!activeId) {
      activeId = cells.find(cell => cell.tabIndex === 0)?.id;
    }
    if (!activeId) activeId = cells[0].id;

    const size = cells.length;
    cells.forEach((cell, index) => {
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', getCellLabel(cell));
      cell.setAttribute('aria-setsize', String(size));
      cell.setAttribute('aria-posinset', String(index + 1));
      if (cell.id === activeId) {
        cell.tabIndex = 0;
      } else {
        cell.tabIndex = -1;
      }
      if (!cell.hasAttribute('aria-grabbed')) cell.setAttribute('aria-grabbed', 'false');
    });
  }

  function moveGridFocus(container, current, delta, absoluteIndex = null) {
    const cells = getGridCells(container);
    if (!cells.length) return;

    const currentIndex = cells.indexOf(current);
    if (currentIndex === -1) return;

    const columns = getGridColumns(container, cells);
    let targetIndex = absoluteIndex === null ? currentIndex + delta : absoluteIndex;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= cells.length) targetIndex = cells.length - 1;

    if (delta === columns) {
      targetIndex = Math.min(cells.length - 1, currentIndex + columns);
    } else if (delta === -columns) {
      targetIndex = Math.max(0, currentIndex - columns);
    }

    const target = cells[targetIndex];
    if (!target) return;

    cells.forEach(cell => {
      cell.tabIndex = cell === target ? 0 : -1;
    });
    target.focus({ preventScroll: true });
  }

  function clearKeyboardPick(container, restoreSource = true) {
    const picked = container?.querySelector('.app-icon.keyboard-picked-up');
    if (!picked) return null;

    picked.classList.remove('keyboard-picked-up');
    picked.setAttribute('aria-grabbed', 'false');
    getGridCells(container).forEach(cell => cell.removeAttribute('aria-dropeffect'));

    const sourceId = picked.id;
    if (restoreSource) {
      const source = getGridCells(container).find(cell => cell.id === sourceId);
      if (source) source.focus({ preventScroll: true });
    }
    return sourceId;
  }

  function reorderInAppGrid(sourceId, targetId) {
    if (!window.AppGridState) return false;
    if (sourceId === targetId) return true;

    const order = window.AppGridState.getOrder();
    if (!Array.isArray(order)) return false;
    const targetIndex = order.indexOf(targetId);
    if (targetIndex === -1) return false;

    return window.AppGridState.reorder(sourceId, targetIndex);
  }

  function reorderInFolder(folderId, sourceId, targetId) {
    const folders = window.AppGridState?.getFolders?.() || [];
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return false;

    const targetIndex = folder.apps.indexOf(targetId);
    if (targetIndex === -1) return false;
    return !!window.AppGridState.reorderFolderApps(folderId, sourceId, targetIndex);
  }

  function announceMove(name, action) {
    const messages = {
      'picked up': ['accessibilityPickedUp', '{name} picked up.'],
      moved: ['accessibilityMoved', '{name} moved.'],
      'not moved': ['accessibilityNotMoved', '{name} was not moved.']
    };
    const entry = messages[action] || messages['not moved'];
    announce(translate(entry[0], entry[1], { name: name }));
  }

  function handleGridKeydown(event) {
    const cell = event.target.closest?.('.app-icon');
    if (!cell) return;
    const container = cell.parentElement;
    if (!container || (container.id !== 'app-grid' && container.id !== 'folder-popup-apps')) return;

    const hasContextMenu = cell.classList.contains('custom-app') || cell.classList.contains('folder-icon');
    if ((event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') && hasContextMenu) {
      event.preventDefault();
      contextMenuOpener = cell;
      keyboardContextMenuOpen = true;
      const rect = cell.getBoundingClientRect();
      const contextEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + Math.min(rect.width / 2, 8),
        clientY: rect.top + Math.min(rect.height / 2, 8)
      });
      cell.dispatchEvent(contextEvent);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveGridFocus(container, cell, -1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveGridFocus(container, cell, 1);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const columns = getGridColumns(container, getGridCells(container));
      if (!columns) return;
      event.preventDefault();
      moveGridFocus(container, cell, event.key === 'ArrowUp' ? -columns : columns);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveGridFocus(container, cell, 0, 0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveGridFocus(container, cell, 0, getGridCells(container).length - 1);
      return;
    }

    const picked = container.querySelector('.app-icon.keyboard-picked-up');
    if (event.key === ' ' || event.key === 'Enter') {
      if (!picked) {
        if (event.key === ' ') {
          event.preventDefault();
          cell.classList.add('keyboard-picked-up');
          cell.setAttribute('aria-grabbed', 'true');
          getGridCells(container).forEach(item => item.setAttribute('aria-dropeffect', 'move'));
          announceMove(getCellLabel(cell), 'picked up');
        }
        return;
      }

      event.preventDefault();
      const sourceId = picked.id;
      const targetId = cell.id;

      let moved = false;
      if (container.id === 'folder-popup-apps') {
        const folderId = window.AppFolders?.currentFolderId;
        if (folderId) moved = reorderInFolder(folderId, sourceId.replace(/^popup-/, ''), targetId.replace(/^popup-/, ''));
      } else if (cell.classList.contains('folder-icon')) {
        if (picked.classList.contains('custom-app')) {
          moved = !!window.AppGridState?.moveAppToFolder?.(targetId, sourceId);
        } else if (picked.classList.contains('folder-icon')) {
          moved = reorderInAppGrid(sourceId, targetId);
        }
      } else {
        moved = reorderInAppGrid(sourceId, targetId);
      }

      const sourceLabel = getCellLabel(picked);
      const focusId = moved && container.id === 'app-grid' && cell.classList.contains('folder-icon')
        ? targetId
        : sourceId;
      picked.classList.remove('keyboard-picked-up');
      picked.setAttribute('aria-grabbed', 'false');
      getGridCells(container).forEach(item => item.removeAttribute('aria-dropeffect'));

      if (moved && typeof window.renderAllApps === 'function') {
        const shouldRestoreFolderPopup = container.id === 'folder-popup-apps';
        if (shouldRestoreFolderPopup) {
          window.AppFolders?.renderFolderAppsInPopup?.();
        } else {
          window.renderAllApps();
        }
      }

      requestAnimationFrame(() => {
        let movedElement = document.getElementById(focusId);
        if (container.id === 'folder-popup-apps') {
          movedElement = document.getElementById('popup-' + focusId.replace(/^popup-/, ''));
        }
        if (movedElement) movedElement.focus({ preventScroll: true });
      });

      announceMove(sourceLabel, moved ? 'moved' : 'not moved');
    }

    if (event.key === 'Escape' && picked) {
      event.preventDefault();
      clearKeyboardPick(container);
      announce(translate('accessibilityMoveCancelled', 'Move cancelled.'));
    }
  }

  function handleGridFocus(event) {
    const cell = event.target.closest?.('.app-icon');
    if (!cell) return;

    const container = cell.parentElement;
    if (!container || (container.id !== 'app-grid' && container.id !== 'folder-popup-apps')) return;

    const cells = getGridCells(container);
    if (!cells.includes(cell)) return;

    cells.forEach(item => {
      item.tabIndex = item === cell ? 0 : -1;
    });
  }

  function refreshGrid() {
    setGridSemantics(document.getElementById('app-grid'));
    setGridSemantics(document.getElementById('folder-popup-apps'));
  }

  function refreshFilterPills() {
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.setAttribute('aria-pressed', pill.classList.contains('active') ? 'true' : 'false');
    });
  }

  function announceFilterChange(pill) {
    if (!pill) return;
    const label = pill.querySelector('.filter-label')?.textContent?.trim() || pill.textContent.trim();
    lastFilterAnnouncementAt = Date.now();
    announce(translate('accessibilityFilter', 'Filter: {label}.', { label: label }));
  }

  function refreshCalendarContainer(container) {
    if (!container) return;
    container.setAttribute('role', 'grid');
    container.setAttribute('aria-label', translate('accessibilityCalendar', 'Calendar'));

    const days = Array.from(container.querySelectorAll('.calendar-day'));
    const enabledDays = days.filter(day => !day.classList.contains('other-month'));
    const selectedDay = days.find(day => day.classList.contains('selected')) || enabledDays[0];

    days.forEach(day => {
      const isSelected = day.classList.contains('selected');
      const isDisabled = day.classList.contains('other-month');
      day.setAttribute('role', 'gridcell');
      day.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      day.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');

      const date = day.dataset.date;
      let label = date || day.textContent.trim();
      if (date) {
        const parsed = new Date(date + 'T00:00:00');
        if (!Number.isNaN(parsed.getTime())) {
          label = parsed.toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }
      }
      if (day.classList.contains('today')) label += ', ' + translate('today', 'today');
      if (isSelected) label += ', ' + translate('accessibilitySelected', 'selected');
      day.setAttribute('aria-label', label);
      day.tabIndex = day === selectedDay && !isDisabled ? 0 : -1;
    });
  }

  function refreshCalendars() {
    document.querySelectorAll('#calendar-days, .inline-calendar-days').forEach(refreshCalendarContainer);
  }

  function handleCalendarKeydown(event) {
    const day = event.target.closest?.('.calendar-day');
    if (!day) return;
    const container = day.parentElement;
    if (!container || !container.matches('#calendar-days, .inline-calendar-days')) return;

    const days = Array.from(container.querySelectorAll('.calendar-day'));
    const enabled = days.filter(item => !item.classList.contains('other-month'));
    if (!enabled.length) return;

    if (event.key === 'Enter' || event.key === ' ') {
      if (day.classList.contains('other-month')) return;
      event.preventDefault();
      day.click();
      requestAnimationFrame(refreshCalendars);
      return;
    }

    const index = days.indexOf(day);
    let targetIndex;
    if (event.key === 'ArrowLeft') targetIndex = index - 1;
    else if (event.key === 'ArrowRight') targetIndex = index + 1;
    else if (event.key === 'ArrowUp') targetIndex = index - 7;
    else if (event.key === 'ArrowDown') targetIndex = index + 7;
    else if (event.key === 'Home') targetIndex = days.findIndex(item => !item.classList.contains('other-month'));
    else if (event.key === 'End') {
      targetIndex = days.reduce((lastIndex, item, itemIndex) =>
        item.classList.contains('other-month') ? lastIndex : itemIndex
      , -1);
    }
    else return;

    event.preventDefault();

    let target = days[targetIndex];
    const direction = targetIndex < index ? -1 : 1;
    while (target && target.classList.contains('other-month')) {
      targetIndex += direction;
      target = days[targetIndex];
    }

    if (!target || target.classList.contains('other-month')) return;
    days.forEach(item => { item.tabIndex = item === target ? 0 : -1; });
    target.focus({ preventScroll: true });
  }

  function refreshContextMenu() {
    const menu = document.getElementById('app-context-menu');
    if (!menu) return;

    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', translate('accessibilityAppActions', 'App actions'));

    const items = Array.from(menu.querySelectorAll('.context-menu-item'));
    items.forEach(item => {
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
    });

    const visibleItems = items.filter(isVisible);
    const isOpen = menu.style.display !== 'none' &&
      (menu.classList.contains('visible') || document.body.classList.contains('context-menu-open'));
    menu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    if (!isOpen) {
      contextMenuWasOpen = false;
      return;
    }

    if (!contextMenuWasOpen && visibleItems.length) {
      contextMenuWasOpen = true;
      requestAnimationFrame(() => {
        const currentMenu = document.getElementById('app-context-menu');
        if (!currentMenu || currentMenu.style.display === 'none' || !document.body.classList.contains('context-menu-open')) {
          return;
        }
        const firstItem = Array.from(currentMenu.querySelectorAll('.context-menu-item')).filter(isVisible)[0];
        firstItem?.focus({ preventScroll: true });
      });
    }
  }

  function closeContextMenu(restoreFocus = true) {
    const menu = document.getElementById('app-context-menu');
    if (!menu) return;
    menu.style.display = 'none';
    document.body.classList.remove('context-menu-open');

    if (restoreFocus && keyboardContextMenuOpen && contextMenuOpener?.isConnected && isVisible(contextMenuOpener)) {
      requestAnimationFrame(() => contextMenuOpener.focus({ preventScroll: true }));
    }

    keyboardContextMenuOpen = false;
    contextMenuWasOpen = false;
  }

  function handleContextMenuKeydown(event) {
    const menu = event.target.closest?.('#app-context-menu');
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(isVisible);
    if (!items.length) return;

    const index = items.indexOf(event.target.closest('[role="menuitem"]'));

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = items[(index + 1 + items.length) % items.length];
      next.focus();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = items[(index - 1 + items.length) % items.length];
      prev.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.target.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeContextMenu(true);
    } else if (event.key === 'Tab') {
      closeContextMenu(false);
    }
  }

  function handleDocumentFocus(event) {
    const target = event.target;
    if (target instanceof HTMLElement && !target.closest('[inert]')) {
      lastFocusedElement = target;
    }
  }

  function handleDocumentClickCapture(event) {
    const menuItem = event.target.closest?.('#app-context-menu .context-menu-item');
    if (menuItem && MODAL_MENU_ACTIONS.has(menuItem.id)) {
      pendingModalOpener = contextMenuOpener?.isConnected ? contextMenuOpener : lastFocusedElement;
      const opener = pendingModalOpener;
      setTimeout(() => {
        if (pendingModalOpener === opener) pendingModalOpener = null;
      }, 0);
    }

    const pill = event.target.closest?.('.filter-pill');
    if (pill) {
      announceFilterChange(pill);
    }

    const menu = document.getElementById('app-context-menu');
    if (menu && keyboardContextMenuOpen && !menu.contains(event.target)) {
      closeContextMenu(false);
    }
  }

  function handleContextMenuCapture(event) {
    const cell = event.target.closest?.('#app-grid .app-icon, #folder-popup-apps .app-icon');
    if (cell && document.activeElement === cell) {
      contextMenuOpener = cell;
    }
  }

  function announceTodoListMutation() {
    if (Date.now() - lastFilterAnnouncementAt < 250) return;
    const list = document.getElementById('todo-list');
    if (!list) return;
    const count = list.querySelectorAll('.todo-item').length;
    const key = count === 1 ? 'accessibilityTodoListUpdatedOne' : 'accessibilityTodoListUpdated';
    const fallback = count === 1
      ? 'Todo list updated. {count} item shown.'
      : 'Todo list updated. {count} items shown.';
    announce(translate(key, fallback, { count: count }));
  }

  function nodeMatchesOrContains(node, selector) {
    if (!(node instanceof Element)) return false;
    return node.matches(selector) || Boolean(node.querySelector(selector));
  }

  function recordTouchesSelector(record, selector) {
    if (record.target instanceof Element) {
      if (record.target.matches(selector) || record.target.closest(selector)) return true;
    }
    if (record.type !== 'childList') return false;

    return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
      nodeMatchesOrContains(node, selector)
    );
  }

  function recordTouchesModal(record) {
    const modalSelector = MODAL_DEFINITIONS.map(def => '#' + def.id).join(', ');
    if (record.target instanceof Element) {
      if (record.target.matches(modalSelector) || record.target.closest(modalSelector)) return true;
    }
    if (record.type === 'attributes' && record.target === document.body && record.attributeName === 'class') {
      return true;
    }
    if (record.type !== 'childList') return false;

    return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(node =>
      nodeMatchesOrContains(node, modalSelector)
    );
  }

  function observeDom() {
    observer = new MutationObserver(records => {
      let shouldSyncModals = false;
      let shouldRefreshGrid = false;
      let shouldRefreshFilters = false;
      let shouldRefreshCalendars = false;
      let shouldRefreshContextMenu = false;
      let shouldAnnounceTodoList = false;

      records.forEach(record => {
        if (record.type === 'attributes') {
          if (recordTouchesModal(record)) shouldSyncModals = true;
          if (recordTouchesSelector(record, '#app-grid, #folder-popup-apps')) shouldRefreshGrid = true;
          if (recordTouchesSelector(record, '.filter-pill')) shouldRefreshFilters = true;
          if (recordTouchesSelector(record, '#calendar-days, .inline-calendar-days')) shouldRefreshCalendars = true;
          if (recordTouchesSelector(record, '#app-context-menu') ||
              (record.target === document.body && record.attributeName === 'class')) {
            shouldRefreshContextMenu = true;
          }
          if (recordTouchesSelector(record, '#todo-list')) shouldAnnounceTodoList = true;
        } else if (record.type === 'childList') {
          if (recordTouchesModal(record)) shouldSyncModals = true;
          if (recordTouchesSelector(record, '#app-grid, #folder-popup-apps')) shouldRefreshGrid = true;
          if (recordTouchesSelector(record, '.filter-pill')) shouldRefreshFilters = true;
          if (recordTouchesSelector(record, '#calendar-days, .inline-calendar-days')) shouldRefreshCalendars = true;
          if (recordTouchesSelector(record, '#app-context-menu')) shouldRefreshContextMenu = true;
          if (recordTouchesSelector(record, '#todo-list')) shouldAnnounceTodoList = true;
        }
      });

      if (shouldSyncModals) syncModals();
      if (shouldRefreshGrid) refreshGrid();
      if (shouldRefreshFilters) refreshFilterPills();
      if (shouldRefreshCalendars) refreshCalendars();
      if (shouldRefreshContextMenu) refreshContextMenu();

      if (shouldAnnounceTodoList) {
        clearTimeout(listAnnouncementTimer);
        listAnnouncementTimer = setTimeout(announceTodoListMutation, 100);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open']
    });
  }

  function init() {
    if (initialized) {
      refresh();
      return;
    }

    initialized = true;
    ensureLiveRegion();

    document.addEventListener('keydown', handleModalKeydown, true);
    document.addEventListener('keydown', handleGridKeydown, true);
    document.addEventListener('keydown', handleCalendarKeydown, true);
    document.addEventListener('keydown', handleContextMenuKeydown, true);
    document.addEventListener('focusin', handleDocumentFocus, true);
    document.addEventListener('focusin', handleGridFocus, true);
    document.addEventListener('click', handleDocumentClickCapture, true);
    document.addEventListener('contextmenu', handleContextMenuCapture, true);

    refresh();
    observeDom();
  }

  function refresh() {
    syncModals();
    refreshGrid();
    refreshFilterPills();
    refreshCalendars();
    refreshContextMenu();
  }

  window.Accessibility = {
    init,
    refresh,
    refreshGrid,
    refreshFilterPills,
    refreshCalendars,
    refreshContextMenu,
    announce
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
