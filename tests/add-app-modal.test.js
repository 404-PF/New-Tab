import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

let originalDefaultAppsList = [];

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

  injectScript('src/ui/add-app-modal.js');
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

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

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
});
