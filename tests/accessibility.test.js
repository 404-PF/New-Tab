import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/accessibility.js');
});

beforeEach(() => {
  document.body.className = '';
  document.querySelectorAll('#a11y-test-app-grid, #a11y-test-modal, #a11y-opener').forEach(el => el.remove());

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
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(opener.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
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
