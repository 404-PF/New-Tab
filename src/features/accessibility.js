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
    { id: 'settings-modal', openClass: 'modal-open', label: 'Settings', fallbackOpener: '#settings-app' },
    { id: 'weather-app-modal', openClass: 'modal-open', close: () => window.WeatherApp?.close?.() },
    { id: 'games-app-modal', nativeDialog: true, close: () => window.GamesApp?.close?.() },
    { id: 'folder-popup', bodyClass: 'folder-popup-open', display: 'flex', close: () => window.AppFolders?.closeFolderPopup?.() },
    { id: 'move-to-folder-selector', display: 'flex', label: 'Move to Folder' }
  ];

  const modalState = new Map();
  const backgroundState = new Map();
  let modalStack = [];
  let lastFocusedElement = null;
  let pendingModalOpener = null;
  let contextMenuOpener = null;
  let keyboardContextMenuOpen = false;
  let observer = null;
  let liveRegion = null;
  let listAnnouncementTimer = null;
  let lastFilterAnnouncementAt = 0;
  let initialized = false;

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isModalOpen(def, element) {
    if (!element) return false;
    if (def.nativeDialog) return element.open === true;
    if (def.openClass) return element.classList.contains(def.openClass);
    if (def.bodyClass) return document.body.classList.contains(def.bodyClass);
    if (def.display) return element.style.display === def.display && isVisible(element);
    return false;
  }

  function getModalDefinition(element) {
    return MODAL_DEFINITIONS.find(def => def.id === element?.id) || null;
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
    if (def?.label) {
      let label = modal.querySelector('[data-accessibility-modal-label]');
      if (!label) {
        label = document.createElement('span');
        label.className = 'sr-only';
        label.setAttribute('data-accessibility-modal-label', '');
        modal.prepend(label);
      }
      label.textContent = def.label;
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
    document.body.children && Array.from(document.body.children).forEach(child => {
      if (child === activeModal) {
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
    if (previous?.opener?.isConnected) return previous.opener;
    if (pendingModalOpener?.isConnected) return pendingModalOpener;
    if (document.activeElement && document.activeElement !== document.body && !modal.contains(document.activeElement)) {
      return document.activeElement;
    }
    if (def.fallbackOpener) {
      const fallback = document.querySelector(def.fallbackOpener);
      if (fallback) return fallback;
    }
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

        if (previous.opener?.isConnected && !previous.opener.closest('[inert]') && isVisible(previous.opener)) {
          requestAnimationFrame(() => previous.opener.focus({ preventScroll: true }));
        }
      }

      if (open) currentlyOpen.push(def.id);
    });

    const top = getTopOpenModal();
    if (top) {
      setBackgroundInert(top.modal);
    } else {
      restoreBackgroundInert();
    }

    modalStack = modalStack.filter(id => currentlyOpen.includes(id));
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
      const state = modalState.get(modal.id);
      closeModalElement(modal, top.def);
      if (state?.opener?.isConnected) {
        requestAnimationFrame(() => state.opener.focus({ preventScroll: true }));
      }
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
    return Array.from(container.children).filter(child => child.classList?.contains('app-icon'));
  }

  function getGridColumns(container, cells) {
    const template = window.getComputedStyle(container).gridTemplateColumns || '';
    const explicitColumns = template.trim().split(/\s+/).filter(Boolean).length;
    if (explicitColumns > 1) return explicitColumns;

    if (cells.length > 1) {
      const firstTop = cells[0].getBoundingClientRect().top;
      const columns = cells.findIndex(cell => cell.getBoundingClientRect().top > firstTop);
      if (columns > 0) return columns;
    }

    return container.id === 'app-grid' ? 4 : 4;
  }

  function getCellLabel(cell) {
    const label = cell.querySelector('.app-name')?.textContent?.trim();
    return label || cell.getAttribute('title') || cell.id || 'App';
  }

  function setGridSemantics(container) {
    if (!container) return;
    container.setAttribute('role', 'grid');
    if (!container.getAttribute('aria-label')) {
      container.setAttribute('aria-label', 'Apps');
    }

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
    let targetIndex = absoluteIndex;
    if (targetIndex === null) targetIndex = currentIndex + delta;
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
    announce(name + ' ' + action + '.');
  }

  function handleGridKeydown(event) {
    const cell = event.target.closest?.('.app-icon');
    if (!cell) return;
    const container = cell.parentElement;
    if (!container || (container.id !== 'app-grid' && container.id !== 'folder-popup-apps')) return;

    if (event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') {
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
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveGridFocus(container, cell, -getGridColumns(container, getGridCells(container)));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveGridFocus(container, cell, getGridColumns(container, getGridCells(container)));
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
        }
      } else {
        moved = reorderInAppGrid(sourceId, targetId);
      }

      const sourceLabel = getCellLabel(picked);
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
        let movedElement = document.getElementById(sourceId);
        if (container.id === 'folder-popup-apps') {
          movedElement = document.getElementById('popup-' + sourceId.replace(/^popup-/, ''));
        }
        if (movedElement) movedElement.focus({ preventScroll: true });
      });

      announceMove(sourceLabel, moved ? 'moved' : 'not moved');
    }

    if (event.key === 'Escape' && picked) {
      event.preventDefault();
      clearKeyboardPick(container);
      announce('Move cancelled.');
    }
  }

  function handleGridFocus(event) {
    const cell = event.target.closest?.('.app-icon');
    if (!cell) return;
    const container = cell.parentElement;
    if (!container || (container.id !== 'app-grid' && container.id !== 'folder-popup-apps')) return;
    getGridCells(container).forEach(item => {
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
    announce('Filter: ' + label + '.');
  }

  function refreshCalendarContainer(container) {
    if (!container) return;
    container.setAttribute('role', 'grid');
    container.setAttribute('aria-label', 'Calendar');

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
      if (day.classList.contains('today')) label += ', today';
      if (isSelected) label += ', selected';
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
    let targetIndex = index;

    if (event.key === 'ArrowLeft') targetIndex = index - 1;
    else if (event.key === 'ArrowRight') targetIndex = index + 1;
    else if (event.key === 'ArrowUp') targetIndex = index - 7;
    else if (event.key === 'ArrowDown') targetIndex = index + 7;
    else if (event.key === 'Home') targetIndex = days.findIndex(item => !item.classList.contains('other-month'));
    else if (event.key === 'End') targetIndex = days.length - 1;
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
    menu.setAttribute('aria-label', 'App actions');

    const items = Array.from(menu.querySelectorAll('.context-menu-item'));
    items.forEach(item => {
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
    });

    const visibleItems = items.filter(isVisible);
    const isOpen = menu.style.display !== 'none' && (menu.classList.contains('visible') || document.body.classList.contains('context-menu-open'));
    if (isOpen && visibleItems.length) {
      requestAnimationFrame(() => visibleItems[0].focus({ preventScroll: true }));
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
    if (menuItem) {
      pendingModalOpener = contextMenuOpener?.isConnected ? contextMenuOpener : lastFocusedElement;
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
    announce('Todo list updated. ' + count + (count === 1 ? ' item shown.' : ' items shown.'));
  }

  function observeDom() {
    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        if (record.type === 'childList') return true;
        if (record.type === 'attributes') return ['class', 'style', 'open'].includes(record.attributeName);
        return false;
      });
      if (!relevant) return;

      syncModals();
      refreshGrid();
      refreshFilterPills();
      refreshCalendars();
      refreshContextMenu();

      if (records.some(record => {
        const target = record.target;
        return target instanceof HTMLElement && (
          target.id === 'todo-list' ||
          target.closest?.('#todo-list')
        );
      })) {
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
