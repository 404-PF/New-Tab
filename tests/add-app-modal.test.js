/* global renderDefaultAppsList closeAddAppModal */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

let originalDefaultAppsList = [];

async function flushMicrotasks() {
  // addDefaultApp resolves on the next microtask when icon caching is synchronous.
  await Promise.resolve();
}

beforeAll(() => {
  injectScript('src/core/app-grid-storage.js');
  injectScript('src/core/app-grid-state.js');
  injectScript('src/core/utils.js');
  injectScript('src/ui/add-app-modal.js');

  originalDefaultAppsList = Array.isArray(window.defaultAppsList)
    ? window.defaultAppsList.map((app) => ({ ...app }))
    : [];
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `
    <button id="new-app"></button>
    <div id="add-app-modal" style="display: none;">
      <div class="add-app-modal-content">
        <div id="add-app-preview"></div>
        <div class="add-app-section">
          <h4>Quick Add</h4>
          <p>Popular apps to get you started</p>
          <div id="default-apps-list"></div>
        </div>
        <input id="add-app-url" />
        <button id="add-app-cancel"></button>
        <button id="add-app-confirm"></button>
        <div class="add-app-url-validation"></div>
        <div class="add-app-validation-message"></div>
        <div id="preview-icon"></div>
        <div id="preview-name"></div>
        <div id="preview-url"></div>
      </div>
    </div>
  `;

  if (typeof window.resetAddAppModalState === 'function') {
    window.resetAddAppModalState();
  }
  window.defaultAppsList = originalDefaultAppsList.map((app) => ({ ...app }));
  window.iconCache = null;
  window.renderCustomApps = vi.fn();
});

describe('Add app modal quick add', () => {
  it('renders the built-in quick-add suggestions', () => {
    renderDefaultAppsList();

    const section = document.querySelector('.add-app-section');
    const buttons = document.querySelectorAll('.quick-add-btn');

    expect(section?.hidden).toBe(false);
    expect(buttons).toHaveLength(originalDefaultAppsList.length);
    expect(buttons[0].textContent).toContain('Google');
  });

  it('adds the selected quick-add app', async () => {
    renderDefaultAppsList();

    const buttons = document.querySelectorAll('.quick-add-btn');
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await flushMicrotasks();

    expect(AppGridState.getCustomApps()).toHaveLength(1);
    expect(AppGridState.getCustomApps()[0]).toMatchObject({
      name: 'Google',
      url: 'https://www.google.com'
    });
    expect(window.renderCustomApps).toHaveBeenCalled();
  });

  it('hides the section when no quick-add apps exist', () => {
    window.defaultAppsList = [];

    renderDefaultAppsList();

    const section = document.querySelector('.add-app-section');
    const buttons = document.querySelectorAll('.quick-add-btn');

    expect(section?.hidden).toBe(true);
    expect(buttons).toHaveLength(0);
  });

  it('hides quick-add suggestions that already exist in the grid', () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `
        <div class="app-grid">
          <div class="app-icon"><span class="app-name">Google</span></div>
          <div class="app-icon"><span class="app-name">YouTube</span></div>
          <div class="app-icon"><span class="app-name">Gmail</span></div>
          <div class="app-icon"><span class="app-name">GitHub</span></div>
        </div>
      `
    );

    renderDefaultAppsList();

    const section = document.querySelector('.add-app-section');
    const buttons = document.querySelectorAll('.quick-add-btn');

    expect(section?.hidden).toBe(true);
    expect(buttons).toHaveLength(0);
  });

  it('ignores matching app names outside the app grid', () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `
        <div class="app-icon"><span class="app-name">Google</span></div>
        <div class="app-grid">
          <div class="app-icon"><span class="app-name">YouTube</span></div>
        </div>
      `
    );

    renderDefaultAppsList();

    const buttons = Array.from(document.querySelectorAll('.quick-add-btn'));

    expect(buttons.some((button) => button.textContent?.includes('Google'))).toBe(true);
    expect(buttons.some((button) => button.textContent?.includes('YouTube'))).toBe(false);
  });

  it('keeps the section visible when only some quick-add apps already exist', () => {
    AppGridState.addApp({
      id: 'custom-app-google',
      name: 'Google',
      url: 'https://www.google.com',
      icon: 'https://www.google.com/s2/favicons?domain=google.com&sz=64'
    });

    renderDefaultAppsList();

    const section = document.querySelector('.add-app-section');
    const buttons = Array.from(document.querySelectorAll('.quick-add-btn'));

    expect(section?.hidden).toBe(false);
    expect(buttons).toHaveLength(originalDefaultAppsList.length - 1);
    expect(buttons[0].textContent).toContain('YouTube');
    expect(buttons.some((button) => button.textContent?.includes('Google'))).toBe(false);
  });

  it('resetAddAppModalState clears state and allows re-initialization', () => {
    const newAppBtn = document.getElementById('new-app');
    const modal = document.getElementById('add-app-modal');

    window.bindAddAppModal();
    newAppBtn.click();
    expect(modal.style.display).toBe('flex');

    closeAddAppModal();
    expect(modal.style.display).toBe('none');

    window.resetAddAppModalState();
    expect(() => window.bindAddAppModal()).not.toThrow();

    newAppBtn.click();
    expect(modal.style.display).toBe('flex');
  });
});
