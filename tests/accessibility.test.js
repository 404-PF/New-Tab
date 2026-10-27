import { injectScript } from './helpers/inject-script.js';
import { withWindowOverride } from './helpers/window-override.js';

beforeAll(() => {
  injectScript('src/features/accessibility.js');
});

beforeEach(() => {
  document.body.className = '';
  document.querySelectorAll('#a11y-test-app-grid, #a11y-test-modal, #a11y-opener, #a11y-inert-sibling, .onboarding-overlay, .toast-notification, #bg-confirm-dialog')
    .forEach(el => el.remove());
  document.getElementById('folder-popup-apps')?.remove();

  let grid = document.getElementById('app-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'app-grid';
    document.body.appendChild(grid);
  }

  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal) {
    settingsModal.className = '';
    settingsModal.innerHTML = '<div><button type="button" id="settings-first">First</button><button type="button" id="settings-last">Last</button></div>';
  }

  window.AppGridState = {
    getOrder: vi.fn(() => ['app-1', 'app-2', 'app-3']),
    reorder: vi.fn(() => true),
    getFolders: vi.fn(() => []),
    reorderFolderApps: vi.fn(() => true),
    moveAppToFolder: vi.fn(() => true)
  };
  window.renderAllApps = vi.fn();
});

afterEach(() => {
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal) settingsModal.className = '';
  window.Accessibility.refresh();

  const grid = document.getElementById('app-grid');
  if (grid) grid.remove();
});

describe('Accessibility - modal semantics and focus management', () => {
  it('adds dialog semantics, traps Tab, inerts background, and restores focus', async () => {
    const opener = document.createElement('button');
    opener.id = 'a11y-opener';
    opener.textContent = 'Open settings';
    document.body.appendChild(opener);
    opener.focus();

    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    window.Accessibility.refresh();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-labelledby')).toBe('settings-modal-accessibility-label');
    expect(opener.hasAttribute('inert')).toBe(true);

    const first = document.getElementById('settings-first');
    const last = document.getElementById('settings-last');

    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(last);

    first.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(opener.hasAttribute('inert')).toBe(false);
    // Focus is restored in requestAnimationFrame. jsdom flushes that on a
    // timer, so wait for the opener instead of sleeping a fixed interval.
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('adds dialog semantics, traps Tab, and restores focus for the bg confirm dialog (#968)', async () => {
    const opener = document.createElement('button');
    opener.id = 'a11y-opener';
    opener.textContent = 'Delete background';
    document.body.appendChild(opener);
    opener.focus();

    const dialog = document.createElement('div');
    dialog.id = 'bg-confirm-dialog';
    dialog.className = 'bg-confirm-dialog screen-overlay bg-confirm-open';
    dialog.innerHTML =
      '<div class="bg-confirm-overlay"></div>' +
      '<div class="bg-confirm-content">' +
        '<h3 class="bg-confirm-title">Delete Background</h3>' +
        '<div class="bg-confirm-message">This custom background will be permanently removed.</div>' +
        '<div class="bg-confirm-actions">' +
          '<button type="button" class="bg-confirm-cancel">Cancel</button>' +
          '<button type="button" class="bg-confirm-delete">Delete</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    window.Accessibility.refresh();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('bg-confirm-dialog-accessibility-title');
    expect(document.getElementById('bg-confirm-dialog-accessibility-title')).toBe(dialog.querySelector('.bg-confirm-title'));
    expect(opener.hasAttribute('inert')).toBe(true);

    const cancel = dialog.querySelector('.bg-confirm-cancel');
    const del = dialog.querySelector('.bg-confirm-delete');

    del.focus();
    del.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(del);

    cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(dialog.classList.contains('bg-confirm-open')).toBe(false);
    expect(opener.hasAttribute('inert')).toBe(false);
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));

    dialog.remove();
  });

  it('does not mutate a modal label that is already correct', async () => {
    const observeStableLabel = async (modal, expectedText) => {
      window.Accessibility.refresh();
      await new Promise(resolve => setTimeout(resolve, 0));
      const label = modal.querySelector('[data-accessibility-modal-label]');
      expect(label).not.toBeNull();
      expect(label.textContent).toBe(expectedText);

      const mutations = [];
      const observer = new MutationObserver(records => mutations.push(...records));
      observer.observe(label, { childList: true });
      window.Accessibility.refresh();
      await new Promise(resolve => setTimeout(resolve, 0));
      observer.disconnect();
      expect(mutations).toHaveLength(0);
      expect(label.textContent).toBe(expectedText);
    };

    await observeStableLabel(document.getElementById('settings-modal'), 'settings');

    const fallbackModal = document.createElement('div');
    fallbackModal.id = 'add-app-modal';
    document.body.appendChild(fallbackModal);
    try {
      await observeStableLabel(fallbackModal, 'add app modal');
    } finally {
      fallbackModal.remove();
    }
  });
});

describe('Accessibility - app grid keyboard interaction', () => {
  it('refreshes the translated grid label', () => {
    const grid = document.getElementById('app-grid');
    const app = document.createElement('a');
    app.id = 'app-1';
    app.href = '#';
    app.className = 'app-icon custom-app';
    app.innerHTML = '<span class="app-name">App 1</span>';
    grid.appendChild(app);

    const originalT = window.i18n.t;
    try {
      window.i18n.t = (key, replacements) => {
        if (key === 'apps') return 'Applications';
        return originalT.call(window.i18n, key, replacements);
      };
      window.Accessibility.refreshGrid();
      expect(grid.getAttribute('aria-label')).toBe('Applications');

      window.i18n.t = (key, replacements) => {
        if (key === 'apps') return 'Anwendungen';
        return originalT.call(window.i18n, key, replacements);
      };
      window.Accessibility.refreshGrid();
      expect(grid.getAttribute('aria-label')).toBe('Anwendungen');
    } finally {
      window.i18n.t = originalT;
    }
  });

  it('keeps the live region accessible while a modal is open', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    window.Accessibility.refresh();

    const liveRegion = document.getElementById('accessibility-live-region');
    expect(liveRegion).toBeTruthy();
    expect(liveRegion.inert).toBe(false);
    expect(liveRegion.hasAttribute('inert')).toBe(false);
  });

  it('keeps the onboarding overlay and toasts non-inert while a modal is open (#898)', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    document.body.appendChild(overlay);

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);

    const sibling = document.createElement('div');
    sibling.id = 'a11y-inert-sibling';
    document.body.appendChild(sibling);

    window.Accessibility.refresh();

    expect(overlay.inert).toBe(false);
    expect(overlay.hasAttribute('inert')).toBe(false);
    expect(toast.inert).toBe(false);
    expect(toast.hasAttribute('inert')).toBe(false);
    expect(sibling.inert).toBe(true);
    expect(sibling.hasAttribute('inert')).toBe(true);

    overlay.remove();
    toast.remove();
    sibling.remove();
    modal.classList.remove('modal-open');
    window.Accessibility.refresh();
  });

  it('keeps the onboarding tour controls in the Tab cycle while a modal is open (#898)', async () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML =
      '<button type="button" id="tour-close">Close</button>' +
      '<button type="button" id="tour-next">Next</button>';
    document.body.appendChild(overlay);

    window.Accessibility.refresh();
    await new Promise(resolve => setTimeout(resolve, 0));

    const first = document.getElementById('settings-first');
    const last = document.getElementById('settings-last');
    const next = document.getElementById('tour-next');

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(next);

    next.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(first);

    last.focus();
    const forwardTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });
    last.dispatchEvent(forwardTab);
    expect(forwardTab.defaultPrevented).toBe(false);

    overlay.remove();
    modal.classList.remove('modal-open');
    window.Accessibility.refresh();
  });

  it('adds grid semantics, roving tabindex, arrow navigation, and keyboard reorder', async () => {
    const grid = document.getElementById('app-grid');
    grid.innerHTML = '';

    ['app-1', 'app-2', 'app-3'].forEach((id, index) => {
      const cell = document.createElement('a');
      cell.id = id;
      cell.href = '#';
      cell.className = 'app-icon custom-app';
      cell.innerHTML = '<span class="app-name">App ' + (index + 1) + '</span>';
      grid.appendChild(cell);
    });

    const addApp = document.createElement('a');
    addApp.id = 'new-app';
    addApp.href = '#';
    addApp.className = 'app-icon default-app';
    addApp.textContent = 'Add app';
    grid.appendChild(addApp);

    window.Accessibility.refreshGrid();
    expect(addApp.getAttribute('role')).toBeNull();

    expect(grid.getAttribute('role')).toBe('grid');
    const cells = [...grid.querySelectorAll('.app-icon')].filter(cell => cell.id !== 'new-app');
    expect(cells.every(cell => cell.getAttribute('role') === 'gridcell')).toBe(true);
    expect(cells.filter(cell => cell.tabIndex === 0)).toHaveLength(1);

    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(cells[1]);

    cells[1].dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true
    }));
    expect(cells[1].getAttribute('aria-grabbed')).toBe('true');

    cells[1].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(cells[2]);

    cells[2].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.AppGridState.reorder).toHaveBeenCalledWith('app-2', 2);
    expect(cells[1].getAttribute('aria-grabbed')).toBe('false');
  });

  function buildCells(container, count) {
    const cells = [];
    for (let i = 0; i < count; i++) {
      const cell = document.createElement('a');
      cell.id = 'a11y-cell-' + (i + 1);
      cell.href = '#';
      cell.className = 'app-icon custom-app';
      cell.innerHTML = '<span class="app-name">App ' + (i + 1) + '</span>';
      container.appendChild(cell);
      cells.push(cell);
    }
    return cells;
  }

  function pressKey(cell, key) {
    const event = new KeyboardEvent('keydown', {
      key: key,
      bubbles: true,
      cancelable: true
    });
    cell.dispatchEvent(event);
    return event;
  }

  it('moves focus with Home and End on a single-row app grid (#867)', () => {
    const grid = document.getElementById('app-grid');
    grid.innerHTML = '';
    const cells = buildCells(grid, 5);
    window.Accessibility.refreshGrid();

    cells[2].focus();
    const homeEvent = pressKey(cells[2], 'Home');
    expect(homeEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cells[0]);

    cells[2].focus();
    const endEvent = pressKey(cells[2], 'End');
    expect(endEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cells[4]);
  });

  it('moves focus with Home and End on a single-row folder popup (#867)', () => {
    const popup = document.createElement('div');
    popup.id = 'folder-popup-apps';
    document.body.appendChild(popup);
    const cells = buildCells(popup, 4);
    window.Accessibility.refreshGrid();

    cells[1].focus();
    const homeEvent = pressKey(cells[1], 'Home');
    expect(homeEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cells[0]);

    cells[1].focus();
    const endEvent = pressKey(cells[1], 'End');
    expect(endEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cells[3]);
  });

  const createAppTile = (grid, id, name, className) => {
    const tile = document.createElement('a');
    tile.id = id;
    tile.href = '#';
    tile.className = className;
    tile.innerHTML = '<span class="app-name">' + name + '</span>';
    grid.appendChild(tile);
    return tile;
  };

  const setupBuiltInGrid = (order) => {
    const grid = document.getElementById('app-grid');
    grid.innerHTML = '';
    window.AppGridState.getOrder = vi.fn(() => order);
    window.AppGridState.canHideDefaultApp = (id) => id !== 'settings-app';
    return grid;
  };

  it('moves a hideable built-in into a folder with the keyboard (#1010)', () => {
    const grid = setupBuiltInGrid(['ai-app', 'folder-1']);
    const removeAppIcon = vi.fn();

    const ai = createAppTile(grid, 'ai-app', 'AI', 'app-icon default-app');
    const folder = createAppTile(grid, 'folder-1', 'Tools', 'app-icon folder-icon');

    window.Accessibility.refreshGrid();

    withWindowOverride('removeAppIcon', removeAppIcon, () => {
      ai.focus();
      pressKey(ai, ' ');
      expect(ai.getAttribute('aria-grabbed')).toBe('true');

      pressKey(folder, ' ');

      expect(window.AppGridState.moveAppToFolder).toHaveBeenCalledWith('folder-1', 'ai-app');
      expect(removeAppIcon).toHaveBeenCalledExactlyOnceWith('ai-app');
      expect(ai.getAttribute('aria-grabbed')).toBe('false');
    });
  });

  it('keeps Settings out of the keyboard folder-move path (#1010)', () => {
    const grid = setupBuiltInGrid(['settings-app', 'folder-1']);

    const settings = createAppTile(grid, 'settings-app', 'Settings', 'app-icon default-app');
    const folder = createAppTile(grid, 'folder-1', 'Tools', 'app-icon folder-icon');

    window.Accessibility.refreshGrid();

    settings.focus();
    pressKey(settings, ' ');
    expect(settings.getAttribute('aria-grabbed')).toBe('true');

    pressKey(folder, ' ');

    expect(window.AppGridState.moveAppToFolder).not.toHaveBeenCalled();
    expect(settings.getAttribute('aria-grabbed')).toBe('false');
  });

  it('arms the keyboard context menu for hideable built-ins but not Settings (#1010)', () => {
    const grid = setupBuiltInGrid(['ai-app', 'settings-app']);

    const ai = createAppTile(grid, 'ai-app', 'AI', 'app-icon default-app');
    const settings = createAppTile(grid, 'settings-app', 'Settings', 'app-icon default-app');

    window.Accessibility.refreshGrid();

    ai.focus();
    const aiEvent = pressKey(ai, 'F10');
    expect(aiEvent.defaultPrevented).toBe(false);
    // Shift+F10 is the conventional context-menu chord.
    ai.focus();
    const shiftF10 = new KeyboardEvent('keydown', {
      key: 'F10',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    ai.dispatchEvent(shiftF10);
    expect(shiftF10.defaultPrevented).toBe(true);

    settings.focus();
    const settingsEvent = new KeyboardEvent('keydown', {
      key: 'ContextMenu',
      bubbles: true,
      cancelable: true
    });
    settings.dispatchEvent(settingsEvent);
    expect(settingsEvent.defaultPrevented).toBe(false);
  });

  it('keeps multi-row arrow navigation and Home/End intact (#867)', () => {
    const grid = document.getElementById('app-grid');
    grid.innerHTML = '';
    const cells = buildCells(grid, 6);
    cells.forEach((cell, index) => {
      const top = index < 3 ? 0 : 100;
      cell.getBoundingClientRect = () => ({
        top: top,
        bottom: top + 80,
        left: (index % 3) * 100,
        right: (index % 3) * 100 + 80,
        width: 80,
        height: 80,
        x: (index % 3) * 100,
        y: top
      });
    });
    window.Accessibility.refreshGrid();

    cells[4].focus();
    pressKey(cells[4], 'ArrowUp');
    expect(document.activeElement).toBe(cells[1]);

    cells[1].focus();
    pressKey(cells[1], 'ArrowDown');
    expect(document.activeElement).toBe(cells[4]);

    cells[4].focus();
    pressKey(cells[4], 'Home');
    expect(document.activeElement).toBe(cells[0]);

    cells[0].focus();
    pressKey(cells[0], 'End');
    expect(document.activeElement).toBe(cells[5]);
  });
});

describe('Accessibility - filters and calendars', () => {
  it('reflects pressed state on todo filter pills', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<button type="button" class="filter-pill active" data-filter="all"><span class="filter-label">All</span></button>' +
      '<button type="button" class="filter-pill" data-filter="pending"><span class="filter-label">Pending</span></button>';
    document.body.appendChild(wrapper);

    window.Accessibility.refreshFilterPills();

    const pills = wrapper.querySelectorAll('.filter-pill');
    expect(pills[0].getAttribute('aria-pressed')).toBe('true');
    expect(pills[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('adds selected and disabled state to calendar days', () => {
    const calendar = document.getElementById('calendar-days');
    calendar.innerHTML =
      '<div class="calendar-day other-month" data-date="2026-08-31">31</div>' +
      '<div class="calendar-day selected" data-date="2026-09-22">22</div>';
    
    window.Accessibility.refreshCalendars();

    const days = calendar.querySelectorAll('.calendar-day');
    expect(calendar.getAttribute('role')).toBe('grid');
    expect(days[0].getAttribute('aria-selected')).toBe('false');
    expect(days[0].getAttribute('aria-disabled')).toBe('true');
    expect(days[0].tabIndex).toBe(-1);
    expect(days[1].getAttribute('aria-selected')).toBe('true');
    expect(days[1].getAttribute('aria-disabled')).toBe('false');
    expect(days[1].getAttribute('aria-label')).toContain('selected');
    expect(days[1].tabIndex).toBe(0);
  });
});
