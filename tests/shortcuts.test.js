// tests/shortcuts.test.js

import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/shortcuts.js');
});

beforeEach(() => {
  localStorage.removeItem('customShortcuts');
  // Reset settings-modal to default state (created by setup.js)
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal) {
    settingsModal.className = '';
  }
});

describe('Shortcuts - defaults', () => {
  it('load returns default shortcuts when nothing saved', () => {
    const shortcuts = Shortcuts.load();
    expect(shortcuts.focusSearch).toBe('/');
    expect(shortcuts.openSettings).toBe('Ctrl+,');
    expect(shortcuts.toggleFocusMode).toBe('Ctrl+Shift+F');
    expect(shortcuts.toggleSimpleMode).toBe('Ctrl+Shift+S');
    expect(shortcuts.toggleTodo).toBe('Ctrl+Shift+T');
    expect(shortcuts.toggleNotes).toBe('Ctrl+Shift+N');
    expect(shortcuts.closeModal).toBe('Escape');
  });

  it('load merges with defaults when partial saved', () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'Ctrl+K' }));
    const shortcuts = Shortcuts.load();
    expect(shortcuts.focusSearch).toBe('Ctrl+K');
    expect(shortcuts.openSettings).toBe('Ctrl+,');
    expect(shortcuts.toggleFocusMode).toBe('Ctrl+Shift+F');
    expect(shortcuts.toggleSimpleMode).toBe('Ctrl+Shift+S');
  });

  it('load returns defaults on invalid JSON', () => {
    localStorage.setItem('customShortcuts', 'not-json{{{');
    const shortcuts = Shortcuts.load();
    expect(shortcuts.focusSearch).toBe('/');
  });
});

describe('Shortcuts - save and reset', () => {
  it('save persists to localStorage', () => {
    const shortcuts = Shortcuts.load();
    shortcuts.focusSearch = 'Ctrl+K';
    Shortcuts.save(shortcuts);
    const saved = JSON.parse(localStorage.getItem('customShortcuts'));
    expect(saved.focusSearch).toBe('Ctrl+K');
  });

  it('reset clears custom shortcuts and returns defaults', () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'X' }));
    Shortcuts.reset();
    const shortcuts = Shortcuts.load();
    expect(shortcuts.focusSearch).toBe('/');
    expect(localStorage.getItem('customShortcuts')).toBeNull();
  });

  it('load preserves duplicate combos in storage', () => {
    const shortcuts = { focusSearch: 'Ctrl+K', openSettings: 'Ctrl+K', toggleSimpleMode: '/' };
    Shortcuts.save(shortcuts);
    const loaded = Shortcuts.load();
    expect(loaded.focusSearch).toBe('Ctrl+K');
    expect(loaded.openSettings).toBe('Ctrl+K');
  });

  it('load filters out unknown keys from storage', () => {
    const shortcuts = { focusSearch: 'Ctrl+K', unknownAction: 'Ctrl+Z', anotherFake: 'X' };
    Shortcuts.save(shortcuts);
    const loaded = Shortcuts.load();
    expect(loaded.focusSearch).toBe('Ctrl+K');
    expect(loaded.unknownAction).toBeUndefined();
    expect(loaded.anotherFake).toBeUndefined();
    expect(loaded.openSettings).toBe('Ctrl+,');
  });

  it('load filters out non-string values from storage', () => {
    const shortcuts = { focusSearch: 123, openSettings: null, toggleSimpleMode: '' };
    Shortcuts.save(shortcuts);
    const loaded = Shortcuts.load();
    expect(loaded.focusSearch).toBe('/');
    expect(loaded.openSettings).toBe('Ctrl+,');
  });
});

describe('Shortcuts - duplicate combo swap', () => {
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    Shortcuts.reset();
  });

  it('rebinding swaps bindings when combo is already used', () => {
    let container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }

    Shortcuts.renderShortcutsSection();

    const btn = container.querySelector('[data-action="focusSearch"]');
    btn.click();

    const swapEvent = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(swapEvent);

    const updated = Shortcuts.load();
    expect(updated.focusSearch).toBe('Ctrl+,');
    expect(updated.openSettings).toBe('/');
  });
});

describe('Shortcuts - modifier-only rejection', () => {
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  it('rebinding ignores modifier-only key presses', () => {
    let container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }

    Shortcuts.renderShortcutsSection();

    const btn = container.querySelector('[data-action="focusSearch"]');
    btn.click();

    const modifierEvent = new KeyboardEvent('keydown', {
      key: 'Shift',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(modifierEvent);

    const afterBtn = container.querySelector('[data-action="focusSearch"]');
    expect(afterBtn.textContent).toBe('Press a key...');
  });
});

describe('Shortcuts - formatCombo', () => {
  it('formats simple key', () => {
    const combo = Shortcuts.formatCombo({ key: '/', ctrlKey: false, shiftKey: false, altKey: false });
    expect(combo).toBe('/');
  });

  it('formats Ctrl+key', () => {
    const combo = Shortcuts.formatCombo({ key: 'k', ctrlKey: true, shiftKey: false, altKey: false });
    expect(combo).toBe('Ctrl+K');
  });

  it('formats Ctrl+Shift+key', () => {
    const combo = Shortcuts.formatCombo({ key: 'S', ctrlKey: true, shiftKey: true, altKey: false });
    expect(combo).toBe('Ctrl+Shift+S');
  });

  it('formats space key', () => {
    const combo = Shortcuts.formatCombo({ key: ' ', ctrlKey: false, shiftKey: false, altKey: false });
    expect(combo).toBe('Space');
  });

  it('formats comma key', () => {
    const combo = Shortcuts.formatCombo({ key: ',', ctrlKey: true, shiftKey: false, altKey: false });
    expect(combo).toBe('Ctrl+,');
  });

  it('does not add modifier-only key to parts', () => {
    const combo = Shortcuts.formatCombo({ key: 'Shift', ctrlKey: false, shiftKey: true, altKey: false });
    expect(combo).toBe('Shift');
  });

  it('formatCombo with modifier-only Ctrl returns Ctrl', () => {
    const combo = Shortcuts.formatCombo({ key: 'Control', ctrlKey: true, shiftKey: false, altKey: false });
    expect(combo).toBe('Ctrl');
  });

  it('formatCombo with modifier-only Alt returns Alt', () => {
    const combo = Shortcuts.formatCombo({ key: 'Alt', ctrlKey: false, shiftKey: false, altKey: true });
    expect(combo).toBe('Alt');
  });
});

describe('Shortcuts - isTextInputFocused', () => {
  it('returns false when no active element', () => {
    expect(Shortcuts.isTextInputFocused()).toBe(false);
  });

  it('returns true for input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(Shortcuts.isTextInputFocused()).toBe(true);
    input.remove();
  });

  it('returns true for textarea', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    expect(Shortcuts.isTextInputFocused()).toBe(true);
    ta.remove();
  });

  it('returns true for contenteditable', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();
    expect(Shortcuts.isTextInputFocused()).toBe(true);
    div.remove();
  });

  it('returns true for select', () => {
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    sel.focus();
    expect(Shortcuts.isTextInputFocused()).toBe(true);
    sel.remove();
  });
});

describe('Shortcuts - executeAction', () => {
  it('focusSearch focuses the search input', () => {
    // Remove any leftover search-bar elements to ensure clean state
    document.querySelectorAll('.search-bar').forEach(el => el.remove());

    const container = document.createElement('div');
    container.classList.add('search-bar');
    const searchInput = document.createElement('input');
    container.appendChild(searchInput);
    document.body.appendChild(container);

    Shortcuts.executeAction('focusSearch');
    expect(document.activeElement).toBe(searchInput);

    container.remove();
  });

  it('openSettings adds modal-open to settings modal', () => {
    const modal = document.getElementById('settings-modal');
    Shortcuts.executeAction('openSettings');
    expect(modal.classList.contains('modal-open')).toBe(true);
  });

  it('closeModal closes the first open modal', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    Shortcuts.executeAction('closeModal');
    expect(modal.classList.contains('modal-open')).toBe(false);
  });

  it('closeModal does nothing when no modal is open', () => {
    expect(() => Shortcuts.executeAction('closeModal')).not.toThrow();
  });

  it('toggleSimpleMode toggles checkbox and calls applySimpleMode', () => {
    let checkbox = document.getElementById('simple-mode-checkbox');
    if (!checkbox) {
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'simple-mode-checkbox';
      document.body.appendChild(checkbox);
    }
    checkbox.checked = false;

    let applyCalled = false;
    window.applySimpleMode = () => { applyCalled = true; };

    Shortcuts.executeAction('toggleSimpleMode');
    expect(checkbox.checked).toBe(true);
    expect(applyCalled).toBe(true);
    expect(localStorage.getItem('simpleMode')).toBe('true');

    delete window.applySimpleMode;
  });

  it('toggleFocusMode toggles localStorage and calls applyFocusMode', () => {
    let applyCalled = false;
    window.applyFocusMode = () => { applyCalled = true; };
    localStorage.setItem('focusMode', 'false');

    Shortcuts.executeAction('toggleFocusMode');
    expect(localStorage.getItem('focusMode')).toBe('true');
    expect(applyCalled).toBe(true);

    delete window.applyFocusMode;
  });

  it('toggleTodo toggles localStorage and calls applyTodoEnabled', () => {
    let applyCalled = false;
    window.applyTodoEnabled = () => { applyCalled = true; };
    localStorage.setItem('todoEnabled', 'true');

    Shortcuts.executeAction('toggleTodo');
    expect(localStorage.getItem('todoEnabled')).toBe('false');
    expect(applyCalled).toBe(true);

    delete window.applyTodoEnabled;
  });

  it('toggleNotes toggles localStorage and calls applyNotesEnabled', () => {
    let applyCalled = false;
    window.applyNotesEnabled = () => { applyCalled = true; };
    localStorage.setItem('notesEnabled', 'true');

    Shortcuts.executeAction('toggleNotes');
    expect(localStorage.getItem('notesEnabled')).toBe('false');
    expect(applyCalled).toBe(true);

    delete window.applyNotesEnabled;
  });
});

describe('Shortcuts - handleKeydown', () => {
  it('Escape triggers closeModal action', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);

    expect(modal.classList.contains('modal-open')).toBe(false);
  });

  it('shortcuts are suppressed in text inputs', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const modal = document.getElementById('settings-modal');

    // Ctrl+, should open settings normally
    const event = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);

    // Should NOT have opened settings because input is focused
    expect(modal.classList.contains('modal-open')).toBe(false);

    input.remove();
  });

  it('matching shortcut triggers its action', () => {
    const modal = document.getElementById('settings-modal');

    // Default shortcut for openSettings is Ctrl+,
    const event = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);

    expect(modal.classList.contains('modal-open')).toBe(true);
  });

  it('toggleFocusMode still works when the search input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    localStorage.setItem('focusMode', 'false');

    const event = new KeyboardEvent('keydown', {
      key: 'F',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);

    expect(localStorage.getItem('focusMode')).toBe('true');

    input.remove();
  });
});

describe('Shortcuts - modal closing priority', () => {
  it('closes #clear-completed-dialog before settings-modal', () => {
    const aiConfirm = document.getElementById('clear-completed-dialog');
    aiConfirm.classList.add('ai-confirm-open');

    const settingsModal = document.getElementById('settings-modal');
    settingsModal.classList.add('modal-open');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);

    expect(aiConfirm.classList.contains('ai-confirm-open')).toBe(false);
    expect(settingsModal.classList.contains('modal-open')).toBe(true);
  });

  it('closes settings-modal when it is the only open modal', () => {
    const settingsModal = document.getElementById('settings-modal');
    settingsModal.classList.add('modal-open');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);

    expect(settingsModal.classList.contains('modal-open')).toBe(false);
  });
});
