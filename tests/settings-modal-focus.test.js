import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/dom-ready.js');
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
  injectScript('src/core/utils.js');
  injectScript('src/core/dom-ready.js');
  injectScript('src/features/shortcuts.js');
  injectScript('src/ui/app-manager.js');
});

beforeEach(() => {
  localStorage.clear();
});

describe('Settings modal focus restoration', () => {
  beforeEach(() => {
    // Preserve the settings-modal (which has the click handler attached
    // during app-manager.js load) and re-add settings-app
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('modal-open');
    // Remove stale settings-app if present
    const oldApp = document.getElementById('settings-app');
    if (oldApp) oldApp.remove();
    const app = document.createElement('a');
    app.id = 'settings-app';
    app.className = 'app-icon default-app';
    app.href = '#';
    document.body.appendChild(app);
  });

  it('restores focus to settings-app when closing via backdrop click', () => {
    const modal = document.getElementById('settings-modal');
    const opener = document.getElementById('settings-app');

    modal.classList.add('modal-open');
    expect(modal.classList.contains('modal-open')).toBe(true);

    // Click the backdrop (the modal overlay itself)
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('does not close when clicking inside the modal content', () => {
    const modal = document.getElementById('settings-modal');
    const content = document.createElement('div');
    modal.appendChild(content);

    modal.classList.add('modal-open');

    // Click inside content, not the backdrop
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(modal.classList.contains('modal-open')).toBe(true);
  });
});

describe('Settings backdrop close cancels pending shortcut rebind (#905)', () => {
  beforeEach(() => {
    let container = document.getElementById('shortcuts-options');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcuts-options';
      document.body.appendChild(container);
    }
    localStorage.removeItem('customShortcuts');
    Shortcuts.renderShortcutsSection();
  });

  afterEach(() => {
    Shortcuts.reset();
  });

  it('disarms the rebind handler so the next keypress is not swallowed', () => {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('modal-open');

    const btn = document.querySelector('#shortcuts-options [data-action="focusSearch"]');
    btn.click();
    expect(btn.textContent).toBe('Press a key...');

    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(document.querySelector('#shortcuts-options [data-action="focusSearch"]').textContent).toBe('/');

    const event = new KeyboardEvent('keydown', {
      key: 'G',
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(Shortcuts.load().focusSearch).toBe('/');
  });
});
