/**
 * Regression test: verify that add-app-modal.js and context-menu.js
 * can coexist without global function name collisions.
 *
 * The original bug (#329) occurred because both files defined a global
 * `setPreviewIcon` with different signatures. context-menu.js loaded
 * after add-app-modal.js, silently overwriting the modal's version.
 *
 * After the fix:
 *   - Both files are IIFE-wrapped so their internal functions stay scoped
 *   - Only intentional window.* exports form the public API
 *   - Loading context-menu.js after add-app-modal.js does NOT
 *     overwrite add-app-modal's functions
 *
 * This test verifies that the public APIs of both modules work correctly
 * when loaded together in the same order bootstrap.js uses.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

describe('cross-file global collision prevention', () => {
  beforeAll(() => {
    // Provide the DOM elements that context-menu.js needs on load
    const createEl = (tag, id) => {
      const el = document.createElement(tag);
      if (id) el.id = id;
      document.body.appendChild(el);
      return el;
    };

    // Context-menu modal elements
    createEl('div', 'rename-app-modal');
    createEl('input', 'rename-app-input');
    createEl('button', 'rename-app-cancel');
    createEl('button', 'rename-app-confirm');
    createEl('div', 'thumbnail-app-modal');
    createEl('input', 'thumbnail-app-input');
    createEl('button', 'thumbnail-app-cancel');
    createEl('button', 'thumbnail-app-confirm');
    createEl('div', 'thumbnail-preview-icon');
    createEl('span', 'thumbnail-preview-name');
    createEl('div', 'delete-app-modal');
    createEl('button', 'delete-app-cancel');
    createEl('button', 'delete-app-confirm');
    createEl('div', 'delete-preview-icon');
    createEl('span', 'delete-preview-name');

    // App-grid with a custom app
    const appGrid = createEl('div', 'app-grid');
    appGrid.className = 'app-grid';
    const appIcon = createEl('a', 'regression-test-app');
    appIcon.className = 'app-icon custom-app';
    appGrid.appendChild(appIcon);

    // Add-app modal elements
    createEl('button', 'new-app');
    createEl('div', 'add-app-modal');
    createEl('div', 'preview-icon');
    createEl('span', 'preview-name');
    createEl('span', 'preview-url');
    createEl('div', 'add-app-preview');
    createEl('div', 'add-app-section');
    createEl('div', 'default-apps-list');
    createEl('input', 'add-app-url');
    createEl('button', 'add-app-cancel');
    createEl('button', 'add-app-confirm');
    createEl('div', 'add-app-url-validation');
    createEl('div', 'add-app-validation-message');

    // Load scripts in bootstrap.js order
    injectScript('src/core/dom-ready.js');
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/utils.js');

    window.AppGridState = {
      getCustomApps: () => [],
      getCanonicalUrl: (url) => url,
      hasAppWithUrl: () => false,
      renameApp: () => {},
      updateThumbnail: () => {},
      deleteApp: () => {},
    };
    window.renderCustomApps = vi.fn();

    // Load add-app-modal.js FIRST, then context-menu.js AFTER —
    // this is the exact loading order from bootstrap.js and was the
    // trigger condition for the original collision bug.
    injectScript('src/ui/add-app-modal.js');
    injectScript('src/features/context-menu.js');
  });

  // ------------------------------------------------------------------
  // add-app-modal.js public API tests
  // ------------------------------------------------------------------

  it('exposes all add-app-modal public APIs on window', () => {
    expect(typeof window.initAddAppModal).toBe('function');
    expect(typeof window.renderDefaultAppsList).toBe('function');
    expect(typeof window.closeAddAppModal).toBe('function');
    expect(typeof window.updateAddAppPreview).toBe('function');
    expect(typeof window.openAddAppModal).toBe('function');
    expect(typeof window.resetAddAppModalState).toBe('function');
  });

  it('exposes context-menu.js public API on window', () => {
    expect(typeof window.clearContextMenuFolderState).toBe('function');
  });

  it('renderDefaultAppsList works with context-menu.js loaded', () => {
    // This must not throw — the original bug caused a silent overwrite
    // that would make this throw if the collision were re-introduced.
    expect(() => window.renderDefaultAppsList()).not.toThrow();
    const container = document.getElementById('default-apps-list');
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('openAddAppModal and closeAddAppModal work after context-menu.js loaded', () => {
    const modal = document.getElementById('add-app-modal');
    expect(modal).not.toBeNull();

    window.openAddAppModal();
    expect(modal.classList.contains('modal-open')).toBe(true);

    window.closeAddAppModal();
    expect(modal.classList.contains('modal-open')).toBe(false);
  });

  it('updateAddAppPreview works without throwing', () => {
    const urlInput = document.getElementById('add-app-url');
    urlInput.value = 'https://example.com';
    expect(() => window.updateAddAppPreview()).not.toThrow();
  });

  it('resetAddAppModalState clears state and allows re-init', () => {
    window.initAddAppModal();
    window.resetAddAppModalState();
    // Must not throw when re-initializing
    expect(() => window.initAddAppModal()).not.toThrow();
  });

  // ------------------------------------------------------------------
  // context-menu.js behavior test (verifies it still loads and works)
  // ------------------------------------------------------------------

  it('context menu can open on a custom app (no global overwrite)', () => {
    const appIcon = document.querySelector('.app-icon.custom-app');
    expect(appIcon).not.toBeNull();

    // Right-click should not throw
    expect(() => {
      appIcon.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
      }));
    }).not.toThrow();

    // The context menu should have appeared
    const menu = document.getElementById('app-context-menu');
    expect(menu).not.toBeNull();
  });

  // ------------------------------------------------------------------
  // Collision prevention (the core regression guard)
  // ------------------------------------------------------------------

  it('add-app-modal APIs survive context-menu.js loading second', () => {
    // These functions must remain intact after context-menu.js loads.
    // If a future refactor re-introduces the name collision, one or
    // more of these will be undefined or replaced.
    const apis = [
      'initAddAppModal',
      'renderDefaultAppsList',
      'closeAddAppModal',
      'updateAddAppPreview',
      'openAddAppModal',
      'resetAddAppModalState',
    ];

    apis.forEach((name) => {
      expect(typeof window[name]).toBe('function');
    });
  });
});
