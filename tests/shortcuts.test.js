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

describe('Shortcuts - cancel while rebinding (#905)', () => {
  let container;

  beforeEach(() => {
    container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }
    Shortcuts.renderShortcutsSection();
  });

  afterEach(() => {
    return Shortcuts.reset();
  });

  it('cancel() restores the combo button and disarms the capture handler', () => {
    const btn = container.querySelector('[data-action="focusSearch"]');
    btn.click();
    expect(btn.textContent).toBe('Press a key...');

    Shortcuts.cancel();

    expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('/');

    const event = new KeyboardEvent('keydown', {
      key: 'Z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(Shortcuts.load().focusSearch).toBe('/');
  });

  it('cancel() is a no-op when no rebind is pending', () => {
    expect(() => Shortcuts.cancel()).not.toThrow();
    expect(Shortcuts.load().focusSearch).toBe('/');

    const event = new KeyboardEvent('keydown', {
      key: 'Z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(Shortcuts.load().focusSearch).toBe('/');
  });

  it('Escape still cancels a pending rebind without closing the modal', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    const btn = container.querySelector('[data-action="focusSearch"]');
    btn.click();
    expect(btn.textContent).toBe('Press a key...');

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(escapeEvent);

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('/');

    modal.classList.remove('modal-open');
  });
});

describe('Shortcuts - consecutive combo button clicks', () => {
  let container;

  beforeEach(() => {
    container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }
    Shortcuts.renderShortcutsSection();
  });

  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    Shortcuts.reset();
  });

  it('applies the rebind prompt to the live second button when a rebind is already active', () => {
    container.querySelector('[data-action="focusSearch"]').click();

    container.querySelector('[data-action="openSettings"]').click();

    const liveSecondBtn = container.querySelector('[data-action="openSettings"]');
    expect(liveSecondBtn.textContent).toBe('Press a key...');
    expect(liveSecondBtn.classList.contains('rebinding')).toBe(true);

    const rebindingButtons = document.querySelectorAll('.shortcut-combo-btn.rebinding');
    expect(rebindingButtons).toHaveLength(1);
    expect(rebindingButtons[0]).toBe(liveSecondBtn);
  });

  it('Escape cancels only the rebind and keeps the settings modal open', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    container.querySelector('[data-action="focusSearch"]').click();
    container.querySelector('[data-action="openSettings"]').click();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));

    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(container.querySelector('[data-action="openSettings"]').textContent).toBe('Ctrl+,');
    expect(document.querySelector('.shortcut-combo-btn.rebinding')).toBeNull();
  });

  it('a key press after switching rebinds the newly selected action', () => {
    container.querySelector('[data-action="focusSearch"]').click();
    container.querySelector('[data-action="toggleTodo"]').click();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'L',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));

    expect(Shortcuts.load().toggleTodo).toBe('Ctrl+L');
    expect(Shortcuts.load().focusSearch).toBe('/');
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

describe('Shortcuts - save failure handling', () => {
  const SAVE_ERROR_MESSAGE = 'Failed to save shortcut changes. Your last action was not saved.';
  let container;
  let originalShowToast;
  let showToast;

  beforeEach(() => {
    container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }
    Shortcuts.renderShortcutsSection();
    originalShowToast = window.showToast;
    showToast = vi.fn();
    window.showToast = showToast;
  });

  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.showToast = originalShowToast;
    Shortcuts.reset();
  });

  it('save reports success and failure', () => {
    expect(Shortcuts.save({ focusSearch: 'Ctrl+K' })).toBe(true);

    const falseSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => false);
    try {
      expect(Shortcuts.save({ focusSearch: 'Ctrl+K' })).toBe(false);
    } finally {
      falseSpy.mockRestore();
    }

    const throwSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(Shortcuts.save({ focusSearch: 'Ctrl+K' })).toBe(false);
    } finally {
      throwSpy.mockRestore();
    }
  });

  it('reverts the swap and reports an error when the save fails', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => false);

    try {
      const btn = container.querySelector('[data-action="focusSearch"]');
      btn.click();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: ',',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));

      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');

      expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('/');
      expect(container.querySelector('[data-action="openSettings"]').textContent).toBe('Ctrl+,');

      const saved = Shortcuts.load();
      expect(saved.focusSearch).toBe('/');
      expect(saved.openSettings).toBe('Ctrl+,');

      const modal = document.getElementById('settings-modal');
      modal.classList.remove('modal-open');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: ',',
        ctrlKey: true,
        bubbles: true
      }));
      expect(modal.classList.contains('modal-open')).toBe(true);
      modal.classList.remove('modal-open');
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('re-syncs the previous binding after an asynchronous bridge write failure', async () => {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      chrome.runtime.lastError = { message: 'quota exceeded' };
      callback();
      chrome.runtime.lastError = null;
      return Promise.resolve();
    };

    try {
      const btn = container.querySelector('[data-action="openSettings"]');
      btn.click();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Q',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));

      expect(container.querySelector('[data-action="openSettings"]').textContent).toBe('Ctrl+Q');
      expect(showToast).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(container.querySelector('[data-action="openSettings"]').textContent).toBe('Ctrl+,');
      expect(Shortcuts.load().openSettings).toBe('Ctrl+,');
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');

      const modal = document.getElementById('settings-modal');
      modal.classList.remove('modal-open');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Q',
        ctrlKey: true,
        bubbles: true
      }));
      expect(modal.classList.contains('modal-open')).toBe(false);
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: ',',
        ctrlKey: true,
        bubbles: true
      }));
      expect(modal.classList.contains('modal-open')).toBe(true);
      modal.classList.remove('modal-open');
    } finally {
      chrome.storage.local.set = originalSet;
    }
  });

  it('reports an error and keeps the saved binding when the chrome.storage remove fails', async () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'X' }));
    Shortcuts.renderShortcutsSection();

    const originalRemove = chrome.storage.local.remove;
    chrome.storage.local.remove = (keys, callback) => {
      chrome.runtime.lastError = { message: 'quota exceeded' };
      if (callback) callback();
      chrome.runtime.lastError = null;
      return Promise.resolve();
    };

    try {
      const result = await Shortcuts.reset();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result).toBe(false);
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
      expect(Shortcuts.load().focusSearch).toBe('X');
      expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('X');
    } finally {
      chrome.storage.local.remove = originalRemove;
    }
  });

  it('resets to defaults without an error when the remove succeeds', async () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'X' }));
    Shortcuts.renderShortcutsSection();

    const result = await Shortcuts.reset();

    expect(result).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem('customShortcuts')).toBeNull();
    expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('/');
  });

  it('still toasts once when the remove fails and the rollback render throws', async () => {
    const originalRemove = chrome.storage.local.remove;
    chrome.storage.local.remove = (keys, callback) => {
      chrome.runtime.lastError = { message: 'quota exceeded' };
      if (callback) callback();
      chrome.runtime.lastError = null;
      return Promise.resolve();
    };
    const renderSpy = vi.spyOn(document, 'getElementById').mockImplementation(() => {
      throw new Error('render exploded');
    });

    try {
      const result = await Shortcuts.reset();
      renderSpy.mockRestore();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result).toBe(false);
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      renderSpy.mockRestore();
      chrome.storage.local.remove = originalRemove;
    }
  });

  it('resolves true without a toast when the reset is saved but the render throws', async () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'X' }));
    const renderSpy = vi.spyOn(document, 'getElementById').mockImplementation(() => {
      throw new Error('render exploded');
    });

    try {
      const result = await Shortcuts.reset();

      expect(result).toBe(true);
      expect(showToast).not.toHaveBeenCalled();
      expect(localStorage.getItem('customShortcuts')).toBeNull();
    } finally {
      renderSpy.mockRestore();
    }
  });

  it('rolls back and toasts once when the localStorage fallback in removeItemAsync fails', async () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'X' }));
    Shortcuts.renderShortcutsSection();

    const originalLocal = chrome.storage.local;
    chrome.storage.local = undefined;
    // The bridge mirrors to the native Storage when chrome.storage.local is absent.
    const nativeSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('native quota exceeded');
    });
    const nativeRemoveItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('native storage unavailable');
    });

    try {
      const result = await Shortcuts.reset();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(nativeSetItem.mock.calls.length + nativeRemoveItem.mock.calls.length).toBeGreaterThan(0);
      expect(result).toBe(false);
      expect(localStorage.getItem('customShortcuts')).toBe(JSON.stringify({ focusSearch: 'X' }));
      expect(Shortcuts.load().focusSearch).toBe('X');
      expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('X');
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
    } finally {
      nativeSetItem.mockRestore();
      nativeRemoveItem.mockRestore();
      chrome.storage.local = originalLocal;
    }
  });

  it('treats a key that survives a sync removeItem as a failed reset', async () => {
    localStorage.setItem('customShortcuts', JSON.stringify({ focusSearch: 'X' }));
    Shortcuts.renderShortcutsSection();

    const originalRemoveItemAsync = localStorage.removeItemAsync;
    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItemAsync = undefined;
    // Mirrors the bridge: removeItem returns undefined, and here the value is not removed.
    localStorage.removeItem = vi.fn(() => undefined);

    try {
      const result = await Shortcuts.reset();

      expect(result).toBe(false);
      expect(showToast).toHaveBeenCalledWith(SAVE_ERROR_MESSAGE, 'error');
      expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('X');
    } finally {
      localStorage.removeItemAsync = originalRemoveItemAsync;
      localStorage.removeItem = originalRemoveItem;
    }
  });
});

describe('Shortcuts - languageChanged re-render', () => {
  let container;

  beforeEach(() => {
    container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }
    Shortcuts.renderShortcutsSection();
  });

  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    Shortcuts.reset();
  });

  function getFocusSearchLabel() {
    return container.querySelector('[data-action="focusSearch"]')
      .closest('.setting-content')
      .querySelector('label');
  }

  it('re-renders shortcut labels in the new language on languageChanged', () => {
    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'shortcutFocusSearch' ? 'Búsqueda enfocada' : originalT(key));

    try {
      window.dispatchEvent(new CustomEvent('languageChanged'));
      expect(getFocusSearchLabel().textContent).toBe('Búsqueda enfocada');
    } finally {
      window.i18n.t = originalT;
    }
  });

  it('rebinds prompt is rendered in the new language when rebinding starts after a language change', () => {
    const originalT = window.i18n.t;
    window.i18n.t = (key) => (key === 'shortcutPressAKey' ? 'Presiona una tecla...' : originalT(key));

    try {
      window.dispatchEvent(new CustomEvent('languageChanged'));
      container.querySelector('[data-action="focusSearch"]').click();
      expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('Presiona una tecla...');
    } finally {
      window.i18n.t = originalT;
    }
  });

  it('cancels an in-progress rebind on languageChanged', () => {
    const btn = container.querySelector('[data-action="focusSearch"]');
    btn.click();
    expect(btn.textContent).toBe('Press a key...');

    window.dispatchEvent(new CustomEvent('languageChanged'));

    // The re-render restores the combo text instead of the stale prompt.
    expect(container.querySelector('[data-action="focusSearch"]').textContent).toBe('/');

    // The keydown handler must be detached: a key press no longer rebinds.
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));

    expect(Shortcuts.load().focusSearch).toBe('/');
  });

  it('does not register duplicate languageChanged listeners on repeated init', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    try {
      Shortcuts.init();
      Shortcuts.init();
      const languageChangedRegistrations = addSpy.mock.calls
        .filter(([eventName]) => eventName === 'languageChanged');
      expect(languageChangedRegistrations).toHaveLength(0);
    } finally {
      addSpy.mockRestore();
    }
  });
});
