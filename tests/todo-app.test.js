import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Issue #1066: the todo widget plus its settings live in the Todo app modal.
// todo-app.js relocates the existing .todo-section node while the modal is
// open instead of duplicating todo rendering, and owns the settings handlers
// that used to live in settings.js.

let pageParent;

beforeAll(() => {
  // DOM stubs setup.js does not pre-create.
  const modal = document.createElement('div');
  modal.id = 'todo-app-modal';
  document.body.appendChild(modal);

  // The host lives inside the modal, mirroring New-Tab.html, so the
  // closest('#todo-app-modal') check in applyTodoEnabled sees the embed.
  const host = document.createElement('div');
  host.id = 'todo-app-widget-host';
  modal.appendChild(host);

  const leadTimeOption = document.createElement('div');
  leadTimeOption.id = 'todo-reminder-lead-time-option';
  document.body.appendChild(leadTimeOption);

  // Options must exist before todo-app.js applies lead-time values.
  const leadTimeSelect = document.getElementById('todo-reminder-lead-time');
  [0, 5, 15, 30, 60, 1440].forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    leadTimeSelect.appendChild(option);
  });

  pageParent = document.createElement('div');
  pageParent.id = 'todo-page-slot';
  const section = document.createElement('div');
  section.className = 'todo-section';
  pageParent.appendChild(section);
  document.body.appendChild(pageParent);

  injectScript('src/features/todo-app.js');
});

beforeEach(() => {
  ['todoEnabled', 'todoReminderEnabled', 'todoReminderLeadTime', 'todoStatsEnabled']
    .forEach((key) => localStorage.removeItem(key));

  const modal = document.getElementById('todo-app-modal');
  modal.classList.remove('modal-open');

  // Return the widget to its page slot in case a previous test left it open.
  const section = document.querySelector('.todo-section');
  if (section && section.closest('#todo-app-modal')) {
    pageParent.appendChild(section);
  }
  document.querySelector('.todo-section').style.display = '';

  document.getElementById('todo-enabled-setting').checked = false;
  document.getElementById('todo-reminder-enabled-setting').checked = false;
  document.getElementById('todo-stats-enabled-setting').checked = false;
  document.getElementById('todo-reminder-lead-time-option').style.display = '';
});

describe('Todo app modal', () => {
  it('exposes the shared launcher surface', () => {
    expect(typeof window.TodoApp.open).toBe('function');
    expect(typeof window.TodoApp.close).toBe('function');
    expect(typeof window.applyTodoAppSettings).toBe('function');
    expect(typeof window.applyTodoEnabled).toBe('function');
    expect(typeof window.loadTodoEnabled).toBe('function');
  });

  it('open() shows the modal and embeds the on-page todo section', () => {
    window.TodoApp.open();

    const modal = document.getElementById('todo-app-modal');
    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(document.querySelector('.todo-section').parentNode.id).toBe('todo-app-widget-host');
  });

  it('close() hides the modal and restores the section to its page slot', () => {
    window.TodoApp.open();
    window.TodoApp.close();

    const modal = document.getElementById('todo-app-modal');
    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(document.querySelector('.todo-section').parentNode.id).toBe('todo-page-slot');
  });

  it('keeps the widget visible inside the modal even when the on-page toggle is off', () => {
    localStorage.setItem('todoEnabled', 'false');

    window.TodoApp.open();
    const section = document.querySelector('.todo-section');
    expect(section.style.display).toBe('');

    window.TodoApp.close();
    expect(document.querySelector('.todo-section').style.display).toBe('none');
  });

  it('applies a saved todoEnabled=true without touching the embedded section', () => {
    localStorage.setItem('todoEnabled', 'false');
    window.TodoApp.open();

    window.applyTodoEnabled();
    expect(document.querySelector('.todo-section').style.display).toBe('');
    expect(document.getElementById('todo-enabled-setting').checked).toBe(false);
  });

  it('closes when the overlay backdrop is clicked', () => {
    window.TodoApp.open();
    const modal = document.getElementById('todo-app-modal');
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(document.querySelector('.todo-section').parentNode.id).toBe('todo-page-slot');
  });

  it('closes on Escape while open and ignores it while closed', () => {
    window.TodoApp.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('todo-app-modal').classList.contains('modal-open')).toBe(false);

    // Closed: Escape must not re-open or throw.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('todo-app-modal').classList.contains('modal-open')).toBe(false);
  });
});

describe('Todo app settings handlers (migrated from settings.js)', () => {
  it('todo-enabled checkbox persists via the bridge and re-applies the section', () => {
    // The real persistFeatureToggle writes through; the spy must too so the
    // subsequent loadTodoEnabled() reads reflect the handler's write path.
    const persistSpy = vi.fn((key, value) => localStorage.setItem(key, String(value)) !== false);
    window.persistFeatureToggle = persistSpy;

    try {
      const checkbox = document.getElementById('todo-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(persistSpy).toHaveBeenCalledWith('todoEnabled', true);
      expect(localStorage.getItem('todoEnabled')).toBe('true');
      expect(window.loadTodoEnabled()).toBe(true);
    } finally {
      delete window.persistFeatureToggle;
    }
  });

  it('todo-enabled checkbox reports an error and keeps the old value when the write fails', () => {
    window.showFeatureToggleSaveError = vi.fn();
    window.persistFeatureToggle = vi.fn(() => false);

    try {
      const checkbox = document.getElementById('todo-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(window.showFeatureToggleSaveError).toHaveBeenCalled();
      // Rolled-back storage: the section is re-applied from the persisted value.
      expect(window.loadTodoEnabled()).toBe(true);
      expect(document.querySelector('.todo-section').style.display).toBe('');
    } finally {
      delete window.persistFeatureToggle;
      delete window.showFeatureToggleSaveError;
    }
  });

  it('reminder-enabled checkbox persists, toggles the lead-time option, and reschedules', () => {
    window.scheduleTodoReminderCheck = vi.fn();

    try {
      const checkbox = document.getElementById('todo-reminder-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(localStorage.getItem('todoReminderEnabled')).toBe('true');
      expect(document.getElementById('todo-reminder-lead-time-option').style.display).toBe('');
      // Fresh enable passes the re-enabled flag.
      expect(window.scheduleTodoReminderCheck).toHaveBeenCalledWith(null, true);

      window.scheduleTodoReminderCheck.mockClear();
      checkbox.dispatchEvent(new Event('change'));
      expect(window.scheduleTodoReminderCheck).toHaveBeenCalledWith(null, false);
    } finally {
      delete window.scheduleTodoReminderCheck;
    }
  });

  it('lead-time select persists and reschedules the reminder check', () => {
    window.scheduleTodoReminderCheck = vi.fn();

    try {
      const select = document.getElementById('todo-reminder-lead-time');
      select.value = '15';
      select.dispatchEvent(new Event('change'));

      expect(localStorage.getItem('todoReminderLeadTime')).toBe('15');
      expect(window.scheduleTodoReminderCheck).toHaveBeenCalled();
    } finally {
      delete window.scheduleTodoReminderCheck;
    }
  });

  it('stats checkbox persists and refreshes the stats visibility', () => {
    window.applyTodoStatsVisibility = vi.fn();

    try {
      const checkbox = document.getElementById('todo-stats-enabled-setting');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(localStorage.getItem('todoStatsEnabled')).toBe('true');
      expect(window.applyTodoStatsVisibility).toHaveBeenCalled();
    } finally {
      delete window.applyTodoStatsVisibility;
    }
  });

  it('applyTodoAppSettings syncs every migrated control from storage', () => {
    localStorage.setItem('todoReminderEnabled', 'true');
    localStorage.setItem('todoReminderLeadTime', '60');
    localStorage.setItem('todoStatsEnabled', 'true');
    window.applyTodoStatsVisibility = vi.fn();

    try {
      window.applyTodoAppSettings();

      expect(document.getElementById('todo-enabled-setting').checked).toBe(true);
      expect(document.getElementById('todo-reminder-enabled-setting').checked).toBe(true);
      expect(document.getElementById('todo-reminder-lead-time').value).toBe('60');
      expect(document.getElementById('todo-reminder-lead-time-option').style.display).toBe('');
      expect(document.getElementById('todo-stats-enabled-setting').checked).toBe(true);
    } finally {
      delete window.applyTodoStatsVisibility;
    }
  });
});
