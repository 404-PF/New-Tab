import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/accessibility.js');
});

beforeEach(() => {
  document.body.className = '';
  document.querySelectorAll('#a11y-test-app-grid, #a11y-test-modal, #a11y-opener').forEach(el => el.remove());

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
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(last);

    document.dispatchEvent(new KeyboardEvent('keydown', {
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

    window.Accessibility.refreshGrid();

    expect(grid.getAttribute('role')).toBe('grid');
    const cells = [...grid.querySelectorAll('.app-icon')];
    expect(cells.every(cell => cell.getAttribute('role') === 'gridcell')).toBe(true);
    expect(cells.filter(cell => cell.tabIndex === 0)).toHaveLength(1);

    cells[0].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(cells[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true
    }));
    expect(cells[1].getAttribute('aria-grabbed')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.AppGridState.reorder).toHaveBeenCalledWith('app-2', 1);
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
    const calendar = document.createElement('div');
    calendar.id = 'a11y-test-calendar';
    calendar.innerHTML =
      '<div class="calendar-day other-month" data-date="2026-08-31">31</div>' +
      '<div class="calendar-day today selected" data-date="2026-09-22">22</div>';
    document.body.appendChild(calendar);

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
