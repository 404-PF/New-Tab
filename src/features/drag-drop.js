// src/features/drag-drop.js - Drag and drop functionality for app grid

(function() {
  'use strict';

  // Drag state (using closure instead of global)
  let dragState = {
    sourceId: null,
    sourceElement: null,
    sourceOrderIndex: -1,
    placeholder: null,
    placeholderIndex: -1,
    dropIndex: -1
  };

  // Get container element
  function getAppGrid() {
    return document.getElementById('app-grid');
  }

  // Get all draggable app icons (excluding add-app button)
  function getDraggableIcons(options = {}) {
    const { includeSource = false } = options;
    const grid = getAppGrid();
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('.app-icon')).filter(
      icon =>
        icon.id !== 'new-app' &&
        icon.id !== 'add-app' &&
        (includeSource || icon.id !== dragState.sourceId)
    );
  }

  // Get the grid's layout info for calculating positions
  function getGridLayout() {
    const grid = getAppGrid();
    if (!grid) return null;
    
    const style = window.getComputedStyle(grid);
    const fallbackGap = parseFloat(style.gap) || 50;
    const columnGap = parseFloat(style.columnGap) || fallbackGap;
    const rowGap = parseFloat(style.rowGap) || fallbackGap;
    const paddingLeft = parseInt(style.paddingLeft) || 70;
    const paddingRight = parseInt(style.paddingRight) || 70;
    
    return {
      columnGap,
      rowGap,
      paddingLeft,
      paddingRight,
      gridWidth: grid.offsetWidth - paddingLeft - paddingRight
    };
  }

  // Calculate the drop index based on mouse position
  function calculateDropIndex(e) {
    const grid = getAppGrid();
    const layout = getGridLayout();
    if (!grid || !layout) return -1;
    
    const icons = getDraggableIcons();
    if (icons.length === 0) return 0;
    
    // Get the first icon to calculate item dimensions
    const firstIcon = icons[0];
    const itemWidth = firstIcon.offsetWidth + layout.columnGap;
    const itemsPerRow = Math.floor((layout.gridWidth + layout.columnGap) / itemWidth) || 1;
    
    // Get grid bounding rect
    const gridRect = grid.getBoundingClientRect();
    
    // Calculate position relative to grid
    const relativeX = e.clientX - gridRect.left - layout.paddingLeft;
    // NOTE: the || operator had lower precedence, causing a constant 30 when
    // the subtraction evaluated to 0 or NaN.  Parentheses fix the order.
    const relativeY = e.clientY - gridRect.top -
      (grid.querySelector('.app-icon')?.offsetTop || 30);
    
    // Calculate row and column
    const col = Math.max(0, Math.floor(relativeX / itemWidth));
    const row = Math.max(0, Math.floor(relativeY / (firstIcon.offsetHeight + layout.rowGap)));
    
    // Calculate index
    let index = row * itemsPerRow + col;
    
    // Allow index to reach icons.length so we can drop after the last icon
    // Clamp index to [0, icons.length]
    if (index < 0) index = 0;
    if (index > icons.length) index = icons.length;
    
    return index;
  }

  function getOrderIndexFromPlaceholderIndex(placeholderIndex) {
    if (placeholderIndex < 0) return -1;
    if (dragState.sourceOrderIndex < 0) return placeholderIndex;

    return placeholderIndex >= dragState.sourceOrderIndex
      ? placeholderIndex + 1
      : placeholderIndex;
  }

  // Create placeholder element
  function createPlaceholder(sourceElement) {
    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.width = sourceElement.offsetWidth + 'px';
    placeholder.style.height = sourceElement.offsetHeight + 'px';
    return placeholder;
  }

  // Insert placeholder at the calculated position
  function insertPlaceholder(index, sourceElement = dragState.sourceElement) {
    const grid = getAppGrid();
    const icons = getDraggableIcons();
    const addAppBtn = document.getElementById('new-app');
    
    // Remove existing placeholder
    removePlaceholder();
    
    // Create new placeholder if needed
    if (!dragState.placeholder) {
      if (!sourceElement) return;
      dragState.placeholder = createPlaceholder(sourceElement);
    }
    
    // Ensure we never place placeholder after the add app button
    // Clamp index to valid range (0 through icons.length inclusive)
    let insertIndex = index;
    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > icons.length) insertIndex = icons.length;
    
    // Insert at the appropriate position
    if (icons.length === 0) {
      // No icons yet, insert before add app button
      if (addAppBtn) {
        grid.insertBefore(dragState.placeholder, addAppBtn);
      } else {
        grid.appendChild(dragState.placeholder);
      }
    } else if (insertIndex === 0) {
      grid.insertBefore(dragState.placeholder, icons[0]);
    } else if (insertIndex === icons.length) {
      // Place after the last icon (before add-app button if present)
      if (addAppBtn) {
        grid.insertBefore(dragState.placeholder, addAppBtn);
      } else {
        grid.appendChild(dragState.placeholder);
      }
    } else {
      // Find the icon at the target index
      const targetIcon = icons[insertIndex];
      grid.insertBefore(dragState.placeholder, targetIcon);
    }
    
    // Animate other icons to dodge
    animateDodging(insertIndex);
    
    dragState.placeholderIndex = insertIndex;
    dragState.dropIndex = getOrderIndexFromPlaceholderIndex(insertIndex);
  }

  // Animate icons to dodge around the placeholder
  function animateDodging(placeholderIndex) {
    const icons = getDraggableIcons();
    const placeholder = dragState.placeholder;
    
    icons.forEach((icon, idx) => {
      // Skip the source element - don't change its opacity
      if (icon.id === dragState.sourceId) {
        return;
      }
      
      icon.style.opacity = '1';
    });
  }

  // Remove placeholder
  function removePlaceholder() {
    if (dragState.placeholder && dragState.placeholder.parentNode) {
      dragState.placeholder.parentNode.removeChild(dragState.placeholder);
    }
    dragState.placeholderIndex = -1;
    dragState.dropIndex = -1;
  }

  function cleanupDragSession() {
    const sourceElement = dragState.sourceElement;

    if (sourceElement) {
      sourceElement.classList.remove('dragging');
    }

    getDraggableIcons().forEach(icon => {
      icon.classList.remove('drag-over');
    });

    removePlaceholder();
    document.removeEventListener('dragover', handleGlobalDragOver);
    window.removeEventListener('blur', handleDragAbort);
    window.removeEventListener('pagehide', handleDragAbort);
    document.removeEventListener('visibilitychange', handleDragAbort);

    dragState.sourceId = null;
    dragState.sourceElement = null;
    dragState.sourceOrderIndex = -1;
    dragState.placeholder = null;
    dragState.placeholderIndex = -1;
    dragState.dropIndex = -1;
  }

  function handleDragAbort(e) {
    if (!dragState.sourceId) return;

    if (e && e.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
      return;
    }

    cleanupDragSession();
  }

  // Handle drag events using event delegation.  We want drop events
  // even when the pointer isn't over another icon, so `handleDrop` may be
  // invoked with `target===null`.
  function handleDragEvent(e) {
    const type = e.type;
    const target = e.target.closest('.app-icon');

    // Helper to ignore the "new/app" button for dragstart only
    const isControl = target && (target.id === 'new-app' || target.id === 'add-app');

    if (type === 'dragstart') {
      if (!target || isControl) return;
      handleDragStart(e, target);
      return;
    }

    if (type === 'dragend') {
      // even if target is null, we need to clean up state
      handleDragEnd(e, target);
      return;
    }

    // For the remaining events we allow target to be null
    switch (type) {
      case 'dragover':
        handleDragOver(e, target);
        break;
      case 'dragleave':
        handleDragLeave(e, target);
        break;
      case 'drop':
        handleDrop(e, target);
        break;
    }
  }

  // Drag start handler
  function handleDragStart(e, target) {
    dragState.sourceId = target.id;
    dragState.sourceElement = target;
    dragState.sourceOrderIndex = getDraggableIcons({ includeSource: true }).indexOf(target);
    dragState.placeholderIndex = dragState.sourceOrderIndex;
    dragState.dropIndex = getOrderIndexFromPlaceholderIndex(dragState.placeholderIndex);

    // Use requestAnimationFrame so the browser captures the drag image
    // before we replace the source slot with a placeholder.
    requestAnimationFrame(() => {
      insertPlaceholder(dragState.placeholderIndex, target);
      target.classList.add('dragging');
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', target.id);
    
    // Set drag image at the position where the user clicked inside the element
    const rect = target.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    e.dataTransfer.setDragImage(target, offsetX, offsetY);
    
    // Add global drag over listener for calculating drop position
    document.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('blur', handleDragAbort);
    window.addEventListener('pagehide', handleDragAbort);
    document.addEventListener('visibilitychange', handleDragAbort);
  }

  // Handle global drag over for placeholder positioning
  function handleGlobalDragOver(e) {
    e.preventDefault();
    const newIndex = calculateDropIndex(e);
    
    if (newIndex !== dragState.placeholderIndex && newIndex >= 0) {
      insertPlaceholder(newIndex);
    }
  }

  // Drag end handler
  function handleDragEnd(e, target) {
    cleanupDragSession();
  }

  // Drag over handler (fires when cursor is over an icon).  It is
  // possible for `target` to be null if the user is hovering empty grid
  // space; the global dragover listener already handles placeholder
  // positioning in that case.
  function handleDragOver(e, target) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (target) {
      // Only add class if not dragging the same element
      if (target.id !== dragState.sourceId) {
        target.classList.add('drag-over');
      }

      // Update placeholder position based on target
      const icons = getDraggableIcons();
      const targetIndex = icons.indexOf(target);
      if (targetIndex !== -1 && targetIndex !== dragState.placeholderIndex) {
        insertPlaceholder(targetIndex);
      }
    }
  }

  // Drag leave handler
  function handleDragLeave(e, target) {
    target.classList.remove('drag-over');
  }

  // Drop handler
  function handleDrop(e, target) {
    e.preventDefault();
    e.stopPropagation();

    if (target) {
      target.classList.remove('drag-over');
    }

    const sourceId = dragState.sourceId;
    if (!sourceId) return;

    // Compute where we want to move the source; prefer the placeholder index
    let toIdx = dragState.dropIndex;

    if (toIdx === -1 && target) {
      // fallback when we dropped directly on another icon
      const order = AppGridState.getOrder();
      if (order) toIdx = order.indexOf(target.id);
    }

    // Reorder via the shared state helper and refresh
    if (!AppGridState.reorder(sourceId, toIdx)) {
      return;
    }
    if (typeof window.renderAllApps === 'function') {
      window.renderAllApps();
    }

    // Apply bounce landing animation to the moved icon
    requestAnimationFrame(() => {
      const movedEl = document.getElementById(sourceId);
      if (movedEl) {
        movedEl.classList.add('drag-drop-landed');
        movedEl.addEventListener('animationend', () => {
          movedEl.classList.remove('drag-drop-landed');
        }, { once: true });
      }
    });

    // Clear placeholder & state (dragend will also run, but be safe)
    removePlaceholder();
    dragState.dropIndex = -1;
  }

  // Attach event listeners to the container (event delegation)
  function attachDnDEvents() {
    const grid = getAppGrid();
    if (!grid) {
      console.warn('App grid not found');
      return;
    }
    
    // Use event delegation - attach single listener to container
    const events = ['dragstart', 'dragend', 'dragover', 'dragleave', 'drop'];
    
    events.forEach(eventType => {
      grid.addEventListener(eventType, handleDragEvent, false);
    });
  }

  // Initialize drag and drop
  function init() {
    attachDnDEvents();
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for external use if needed
  window.DnD = {
    refresh: attachDnDEvents
  };

})();
