/* global renderDefaultAppsList closeAddAppModal */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
        <div id="add-app-section" class="add-app-section">
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
  window.addAppIcon = vi.fn();
});

describe('Add app modal quick add', () => {
  it('renders the built-in quick-add suggestions', () => {
    renderDefaultAppsList();

    const section = document.getElementById('add-app-section');
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

    expect(window.AppGridState.getCustomApps()).toHaveLength(1);
    expect(window.AppGridState.getCustomApps()[0]).toMatchObject({
      name: 'Google',
      url: 'https://www.google.com'
    });
    expect(window.addAppIcon).toHaveBeenCalled();
  });

  it('hides the section when no quick-add apps exist', () => {
    window.defaultAppsList = [];

    renderDefaultAppsList();

    const section = document.getElementById('add-app-section');
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

    const section = document.getElementById('add-app-section');
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
    window.AppGridState.addApp({
      id: 'custom-app-google',
      name: 'Google',
      url: 'https://www.google.com',
      icon: 'https://www.google.com/s2/favicons?domain=google.com&sz=64'
    });

    renderDefaultAppsList();

    const section = document.getElementById('add-app-section');
    const buttons = Array.from(document.querySelectorAll('.quick-add-btn'));

    expect(section?.hidden).toBe(false);
    expect(buttons).toHaveLength(originalDefaultAppsList.length - 1);
    expect(buttons[0].textContent).toContain('YouTube');
    expect(buttons.some((button) => button.textContent?.includes('Google'))).toBe(false);
  });

  it('resetAddAppModalState clears state and allows re-initialization', () => {
    const newAppBtn = document.getElementById('new-app');
    const modal = document.getElementById('add-app-modal');

    window.initAddAppModal();
    newAppBtn.click();
    expect(modal.classList.contains('modal-open')).toBe(true);

    closeAddAppModal();
    expect(modal.classList.contains('modal-open')).toBe(false);

    window.resetAddAppModalState();
    expect(() => window.initAddAppModal()).not.toThrow();

    newAppBtn.click();
    expect(modal.classList.contains('modal-open')).toBe(true);
  });

  it('rebinds without duplicating modal listeners', async () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');

    window.initAddAppModal();
    window.resetAddAppModalState();
    window.initAddAppModal();

    newAppBtn.click();
    addAppUrlInput.value = 'example.com';
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    addAppConfirm.click();

    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(1);
    expect(window.addAppIcon).toHaveBeenCalledTimes(1);
  });

  it('shows a localized save error and keeps the form open when saving fails', async () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppModal = document.getElementById('add-app-modal');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');
    const originalAddApp = window.AppGridState.addApp;
    const originalShowToast = window.showToast;
    const showToast = vi.fn();

    try {
      window.AppGridState.addApp = vi.fn(() => false);
      window.showToast = showToast;

      window.initAddAppModal();
      newAppBtn.click();
      addAppUrlInput.value = 'example.com';
      addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
      expect(addAppConfirm.disabled).toBe(false);

      addAppConfirm.click();
      await flushMicrotasks();

      expect(showToast).toHaveBeenCalledWith(
        'Failed to save app changes. Your last action was not saved.',
        'error'
      );
      expect(addAppModal.classList.contains('modal-open')).toBe(true);
      expect(addAppUrlInput.value).toBe('example.com');
      expect(window.addAppIcon).not.toHaveBeenCalled();
    } finally {
      window.AppGridState.addApp = originalAddApp;
      window.showToast = originalShowToast;
    }
  });

  it('prevents adding the same quick-add app twice on rapid double-click', async () => {
    renderDefaultAppsList();

    const buttons = document.querySelectorAll('.quick-add-btn');

    // Dispatch two clicks on the same button without awaiting between them
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await flushMicrotasks();

    // Only one instance of the app should have been added
    const apps = window.AppGridState.getCustomApps();
    const googleApps = apps.filter((app) => app.name === 'Google');
    expect(googleApps).toHaveLength(1);
  });
});

describe('Add app modal undetectable URLs', () => {
  function pressEnter(input) {
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
  }

  it('enables the confirm button for a non-empty undetectable URL', () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');

    window.initAddAppModal();
    newAppBtn.click();

    addAppUrlInput.value = 'mywiki';
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(addAppConfirm.disabled).toBe(false);
  });

  it('creates the app when pressing Enter with an undetectable URL', async () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');

    window.initAddAppModal();
    newAppBtn.click();

    addAppUrlInput.value = 'mywiki';
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    pressEnter(addAppUrlInput);

    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(1);
    expect(window.AppGridState.getCustomApps()[0]).toMatchObject({
      url: 'https://mywiki',
      name: 'Mywiki'
    });
    expect(window.addAppIcon).toHaveBeenCalled();
  });

  it('creates the app when clicking confirm with an undetectable URL', async () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');

    window.initAddAppModal();
    newAppBtn.click();

    addAppUrlInput.value = 'mywiki';
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    addAppConfirm.click();

    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(1);
    expect(window.AppGridState.getCustomApps()[0]).toMatchObject({
      url: 'https://mywiki'
    });
  });

  it('blocks duplicate undetectable URLs', async () => {
    vi.useFakeTimers();
    try {
      const newAppBtn = document.getElementById('new-app');
      const addAppUrlInput = document.getElementById('add-app-url');
      const addAppConfirm = document.getElementById('add-app-confirm');

      window.AppGridState.addApp({
        id: 'custom-app-mywiki',
        name: 'Mywiki',
        url: 'https://mywiki',
        icon: ''
      });

      window.initAddAppModal();
      newAppBtn.click();

      addAppUrlInput.value = 'mywiki';
      addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

      vi.advanceTimersByTime(150);
      expect(addAppConfirm.disabled).toBe(true);

      pressEnter(addAppUrlInput);
      await flushMicrotasks();

      expect(window.AppGridState.getCustomApps()).toHaveLength(1);
      expect(window.addAppIcon).not.toHaveBeenCalled();
    } finally {
      window.resetAddAppModalState();
      vi.useRealTimers();
    }
  });

  it('keeps the confirm button disabled for malformed URLs', async () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');

    window.initAddAppModal();
    newAppBtn.click();

    addAppUrlInput.value = 'http://';
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(addAppConfirm.disabled).toBe(true);

    pressEnter(addAppUrlInput);
    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(0);
  });

  it.each([
    ['javascript:alert(1)'],
    ['\\\\attacker.example/path']
  ])('keeps the confirm button disabled for unsafe input %s', async (value) => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');

    window.initAddAppModal();
    newAppBtn.click();

    addAppUrlInput.value = value;
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(addAppConfirm.disabled).toBe(true);
    expect(document.getElementById('preview-url')?.textContent || '').not.toMatch(/^https:\/\/\\/);

    pressEnter(addAppUrlInput);
    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(0);
  });

  it('keeps the confirm button disabled for empty input', () => {
    const newAppBtn = document.getElementById('new-app');
    const addAppUrlInput = document.getElementById('add-app-url');
    const addAppConfirm = document.getElementById('add-app-confirm');

    window.initAddAppModal();
    newAppBtn.click();

    addAppUrlInput.value = '';
    addAppUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(addAppConfirm.disabled).toBe(true);
  });
});

describe('Add app preview debounce', () => {
  let scan;
  let input;

  function typeUrl(value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function reopenModal(value) {
    window.initAddAppModal();
    window.openAddAppModal();
    typeUrl(value);
  }

  // A settled preview stays settled after 300 ms, and the next quiet window
  // settles exactly one more preview, last with `expectedUrl`.
  function expectNextQuietWindow(spy, value, expectedUrl) {
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    typeUrl(value);
    vi.advanceTimersByTime(149);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(expectedUrl);
  }

  // Arrange the colliding-duplicate phase both cubic-fix tests share: the
  // conflicting app sits in the grid and the input has gone quiet past the
  // debounce, so submit is blocked as a duplicate.
  function settleCollidingDuplicate() {
    const existing = { id: 'existing-duplicate', name: 'Example', url: 'https://example.com/' };
    expect(window.AppGridState.addApp(existing)).toBe(true);
    typeUrl('example.com');
    const confirm = document.getElementById('add-app-confirm');
    const modal = document.getElementById('add-app-modal');
    const message = document.querySelector('.add-app-validation-message');

    vi.advanceTimersByTime(150);
    expect(confirm.disabled).toBe(true);
    expect(message.classList.contains('duplicate')).toBe(true);
    return { confirm, modal, message, existing };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    window.initAddAppModal();
    window.openAddAppModal();
    input = document.getElementById('add-app-url');
    scan = vi.spyOn(window.AppGridState, 'hasAppWithUrl');
  });

  afterEach(() => {
    window.resetAddAppModalState();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['language refresh', 'trailing whitespace', 'immediate paste'])('keeps duplicate submission blocked during %s', async (change) => {
    const existing = { id: 'existing-duplicate', name: 'Example', url: 'https://example.com/' };
    expect(window.AppGridState.addApp(existing)).toBe(true);
    scan.mockClear();
    typeUrl('example.com');
    const confirm = document.getElementById('add-app-confirm');
    const modal = document.getElementById('add-app-modal');
    const message = document.querySelector('.add-app-validation-message');

    if (change === 'immediate paste') {
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
      await flushMicrotasks();
      expect(scan).toHaveBeenCalledTimes(1);
      expect(scan).toHaveBeenCalledWith('https://example.com/');
    } else {
      vi.advanceTimersByTime(150);
      expect(confirm.disabled).toBe(true);
      expect(message.classList.contains('duplicate')).toBe(true);
      expect(scan).toHaveBeenCalledExactlyOnceWith('https://example.com/');
      if (change === 'language refresh') window.dispatchEvent(new Event('languageChanged'));
      else typeUrl('example.com   ');

      expect(message.classList.contains('duplicate')).toBe(true);
      expect(confirm.disabled).toBe(true);
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
      await flushMicrotasks();
      expect(scan).toHaveBeenCalledTimes(1);
    }

    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(confirm.disabled).toBe(true);
    expect(window.AppGridState.getCustomApps()).toEqual([existing]);
    expect(window.addAppIcon).not.toHaveBeenCalled();
    expect(message.classList.contains('duplicate')).toBe(true);

    vi.advanceTimersByTime(150);
    expect(scan).toHaveBeenCalledTimes(change === 'immediate paste' ? 1 : 2);
    expect(message.classList.contains('duplicate')).toBe(true);
    expect(confirm.disabled).toBe(true);
    expect(modal.classList.contains('modal-open')).toBe(true);

    typeUrl('available.example');
    expect(confirm.disabled).toBe(false);
    vi.advanceTimersByTime(150);
    expect(scan).toHaveBeenLastCalledWith('https://available.example/');
    expect(confirm.disabled).toBe(false);
    expect(window.AppGridState.getCustomApps()).toEqual([existing]);
  });

  it('unblocks submit when the conflicting app is deleted while the modal stays open', async () => {
    const { modal, message } = settleCollidingDuplicate();

    expect(window.AppGridState.deleteApp('existing-duplicate')).toBe(true);
    expect(window.AppGridState.getCustomApps()).toEqual([]);

    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(1);
    expect(window.AppGridState.getCustomApps()[0]).toMatchObject({ url: 'https://example.com' });
    expect(window.addAppIcon).toHaveBeenCalled();
    expect(modal.classList.contains('modal-open')).toBe(false);
    expect(message.classList.contains('duplicate')).toBe(false);
  });

  it('keeps submit blocked while the conflicting app still exists at submit', async () => {
    const { confirm, modal, message, existing } = settleCollidingDuplicate();

    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toEqual([existing]);
    expect(window.addAppIcon).not.toHaveBeenCalled();
    expect(modal.classList.contains('modal-open')).toBe(true);
    expect(confirm.disabled).toBe(true);
    expect(message.classList.contains('duplicate')).toBe(true);
  });

  it('previews exactly once per quiet window with only the final input', () => {
    typeUrl('first.example');
    vi.advanceTimersByTime(100);
    typeUrl('second.example');
    vi.advanceTimersByTime(100);
    typeUrl('final.example');
    vi.advanceTimersByTime(149);
    expect(scan).not.toHaveBeenCalled();
    expect(document.getElementById('preview-url').textContent).toBe('');

    vi.advanceTimersByTime(1);
    expect(scan).toHaveBeenCalledExactlyOnceWith('https://final.example/');
    expect(document.getElementById('preview-url').textContent).toBe('https://final.example/');
    expectNextQuietWindow(scan, 'next.example', 'https://next.example/');
    expect(document.getElementById('preview-url').textContent).toBe('https://next.example/');
  });

  it('debounces malformed preview construction while showing format errors immediately', () => {
    const previewUrl = document.getElementById('preview-url');
    const previewWrite = vi.spyOn(previewUrl, 'textContent', 'set');

    for (const url of ['http://', 'https://', 'https://final.c/']) {
      typeUrl(url);
      expect(document.getElementById('add-app-confirm').disabled).toBe(true);
      expect(document.querySelector('.add-app-validation-message').classList.contains('malformed')).toBe(true);
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(49);
    expect(previewWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(previewWrite).toHaveBeenCalledExactlyOnceWith('https://final.c/');
    expect(document.querySelector('#preview-icon img').src).toContain('domain=final.c&');
    expect(scan).not.toHaveBeenCalled();
    expectNextQuietWindow(previewWrite, 'https://next.c/', 'https://next.c/');
    typeUrl('valid-after-malformed.example');
    vi.advanceTimersByTime(150);
    expect(scan).toHaveBeenCalledExactlyOnceWith('https://valid-after-malformed.example/');
  });

  it.each(['close', 'reset', 'empty'])('cancels malformed preview construction on %s', (action) => {
    const previewWrite = vi.spyOn(document.getElementById('preview-url'), 'textContent', 'set');
    typeUrl('https://cancel.c/');
    expect(previewWrite).not.toHaveBeenCalled();
    if (action === 'close') window.closeAddAppModal();
    else if (action === 'reset') window.resetAddAppModalState();
    else typeUrl('');

    vi.advanceTimersByTime(450);
    expect(previewWrite).not.toHaveBeenCalled();
    reopenModal('https://reopened.c/');
    vi.advanceTimersByTime(150);
    expect(previewWrite).toHaveBeenCalledExactlyOnceWith('https://reopened.c/');
  });

  it('coalesces language refreshes with pending input previews', () => {
    typeUrl('language.example');
    vi.advanceTimersByTime(100);
    window.dispatchEvent(new Event('languageChanged'));
    vi.advanceTimersByTime(149);
    expect(scan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(scan).toHaveBeenCalledExactlyOnceWith('https://language.example/');
    vi.advanceTimersByTime(300);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it.each(['close', 'reset'])('cancels pending preview on %s without later UI or storage writes', (action) => {
    typeUrl('cancel.example');
    expect(scan).not.toHaveBeenCalled();
    if (action === 'close') window.closeAddAppModal();
    else window.resetAddAppModalState();

    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const setItem = vi.spyOn(localStorage, 'setItem');
    const removeItem = vi.spyOn(localStorage, 'removeItem');
    const clear = vi.spyOn(localStorage, 'clear');
    vi.advanceTimersByTime(450);
    expect(observer.takeRecords()).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    observer.disconnect();

    // Reopening proves the scan oracle still observes live work after cancellation.
    reopenModal('reopened.example');
    vi.advanceTimersByTime(150);
    expect(scan).toHaveBeenCalledExactlyOnceWith('https://reopened.example/');
  });

  it('shows cheap format errors immediately while cancelling a valid pending preview', () => {
    typeUrl('valid.example');
    typeUrl('http://');
    expect(document.getElementById('add-app-confirm').disabled).toBe(true);
    expect(document.querySelector('.add-app-validation-message').classList.contains('malformed')).toBe(true);
    expect(scan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(scan).not.toHaveBeenCalled();
    typeUrl('valid-again.example');
    vi.advanceTimersByTime(150);
    expect(scan).toHaveBeenCalledExactlyOnceWith('https://valid-again.example/');
  });
});

describe('Add app modal edit mode (#1082)', () => {
  function seedApp(overrides) {
    const app = {
      id: 'custom-app-edit',
      name: 'Editable',
      url: 'https://editable.example',
      icon: 'https://www.google.com/s2/favicons?domain=editable.example&sz=64',
      ...overrides
    };
    expect(window.AppGridState.addApp(app)).toBe(true);
    return app;
  }

  // The shared beforeEach stub has no modal header or confirm label; edit
  // mode swaps both, so tests that assert them add the real markup first.
  function addModalChrome() {
    document.getElementById('add-app-modal').insertAdjacentHTML('afterbegin', `
      <div class="add-app-header-text">
        <h3 data-i18n="newAppTitle">Add New App</h3>
        <p data-i18n="newAppDescription">Enter a website URL to add it to your apps</p>
      </div>
    `);
    document.getElementById('add-app-confirm').innerHTML = '<span data-i18n="create">Create</span>';
  }

  it('prefills the URL, hides quick-add, and swaps the modal chrome', () => {
    const app = seedApp();
    addModalChrome();

    window.initAddAppModal();
    window.openAddAppModal(app);

    const modal = document.getElementById('add-app-modal');
    expect(document.getElementById('add-app-url').value).toBe('https://editable.example');
    expect(document.getElementById('add-app-section').hidden).toBe(true);
    expect(modal.querySelector('h3').getAttribute('data-i18n')).toBe('editAppTitle');
    expect(modal.querySelector('h3').textContent).toBe('Edit App');
    expect(modal.querySelector('.add-app-header-text p').getAttribute('data-i18n')).toBe('editAppDescription');
    expect(document.querySelector('#add-app-confirm span').getAttribute('data-i18n')).toBe('save');
    expect(document.querySelector('#add-app-confirm span').textContent).toBe('Save');
    // The prefilled URL is its own app's URL, so it must not self-conflict.
    expect(document.getElementById('add-app-confirm').disabled).toBe(false);
  });

  it('saves an unchanged URL without a self-duplicate conflict', async () => {
    seedApp();

    window.initAddAppModal();
    window.openAddAppModal('custom-app-edit');
    expect(document.getElementById('add-app-confirm').disabled).toBe(false);

    document.getElementById('add-app-confirm').click();
    await flushMicrotasks();

    expect(window.AppGridState.getCustomApps()).toHaveLength(1);
    expect(window.AppGridState.getCustomApps()[0]).toMatchObject({
      id: 'custom-app-edit',
      url: 'https://editable.example'
    });
    expect(document.getElementById('add-app-modal').classList.contains('modal-open')).toBe(false);
  });

  it('updates the URL in place and refreshes the tile link and auto-derived icon', async () => {
    seedApp({ cachedIcon: 'data:cached' });
    const updateAppLink = vi.fn();
    const updateAppIcon = vi.fn();

    window.initAddAppModal();
    window.openAddAppModal('custom-app-edit');

    const input = document.getElementById('add-app-url');
    input.value = 'https://renamed.example';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    window.updateAppLink = updateAppLink;
    window.updateAppIcon = updateAppIcon;
    try {
      document.getElementById('add-app-confirm').click();
      await flushMicrotasks();
    } finally {
      delete window.updateAppLink;
      delete window.updateAppIcon;
    }

    const updated = window.AppGridState.getCustomApps()[0];
    expect(updated.id).toBe('custom-app-edit');
    expect(updated.name).toBe('Editable');
    expect(updated.url).toBe('https://renamed.example');
    expect(updated.cachedIcon).toBeUndefined();
    // Auto-derived favicons follow the new host; the tile link follows too.
    expect(updated.icon).toBe('https://www.google.com/s2/favicons?domain=renamed.example&sz=64');
    expect(updateAppLink).toHaveBeenCalledExactlyOnceWith('custom-app-edit', 'https://renamed.example');
    expect(updateAppIcon).toHaveBeenCalledExactlyOnceWith(
      'custom-app-edit',
      'https://www.google.com/s2/favicons?domain=renamed.example&sz=64'
    );
    expect(document.getElementById('add-app-modal').classList.contains('modal-open')).toBe(false);
  });

  it('keeps a custom thumbnail when the URL changes', async () => {
    seedApp({ icon: 'https://cdn.example/custom.png', cachedIcon: 'data:custom' });

    window.initAddAppModal();
    window.openAddAppModal('custom-app-edit');

    const input = document.getElementById('add-app-url');
    input.value = 'https://renamed.example';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('add-app-confirm').click();
    await flushMicrotasks();

    const updated = window.AppGridState.getCustomApps()[0];
    expect(updated.url).toBe('https://renamed.example');
    expect(updated.icon).toBe('https://cdn.example/custom.png');
    expect(updated.cachedIcon).toBeUndefined();
  });

  it('blocks saving a URL that another app already uses', async () => {
    vi.useFakeTimers();
    try {
      seedApp();
      expect(window.AppGridState.addApp({
        id: 'other-user',
        name: 'OtherUser',
        url: 'https://taken.example'
      })).toBe(true);

      window.initAddAppModal();
      window.openAddAppModal('custom-app-edit');

      const input = document.getElementById('add-app-url');
      const confirm = document.getElementById('add-app-confirm');
      input.value = 'https://taken.example';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(150);

      expect(confirm.disabled).toBe(true);
      expect(document.querySelector('.add-app-validation-message').classList.contains('duplicate')).toBe(true);

      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
      await flushMicrotasks();

      expect(window.AppGridState.getCustomApps().find(app => app.id === 'custom-app-edit').url)
        .toBe('https://editable.example');
      expect(document.getElementById('add-app-modal').classList.contains('modal-open')).toBe(true);
    } finally {
      window.resetAddAppModalState();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('falls back to create mode for unknown ids', () => {
    seedApp();

    window.initAddAppModal();
    window.openAddAppModal('does-not-exist');

    expect(document.getElementById('add-app-url').value).toBe('');
    expect(document.getElementById('add-app-section').hidden).toBe(false);
  });

  it('restores create-mode chrome after closing an edit session', () => {
    const app = seedApp();
    addModalChrome();

    window.initAddAppModal();
    window.openAddAppModal(app);
    expect(document.querySelector('#add-app-confirm span').textContent).toBe('Save');

    window.closeAddAppModal();

    const modal = document.getElementById('add-app-modal');
    expect(modal.querySelector('h3').getAttribute('data-i18n')).toBe('newAppTitle');
    expect(modal.querySelector('h3').textContent).toBe('Add New App');
    expect(document.querySelector('#add-app-confirm span').getAttribute('data-i18n')).toBe('create');
    expect(document.querySelector('#add-app-confirm span').textContent).toBe('Create');
    expect(document.getElementById('add-app-section').hidden).toBe(false);
  });

  it('keeps the modal open and shows a save error when the update fails', async () => {
    const app = seedApp();
    const originalUpdateAppUrl = window.AppGridState.updateAppUrl;
    const originalShowToast = window.showToast;
    const showToast = vi.fn();

    try {
      window.AppGridState.updateAppUrl = vi.fn(() => false);
      window.showToast = showToast;

      window.initAddAppModal();
      window.openAddAppModal(app);

      const input = document.getElementById('add-app-url');
      input.value = 'https://renamed.example';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('add-app-confirm').click();
      await flushMicrotasks();

      expect(showToast).toHaveBeenCalledWith(
        'Failed to save app changes. Your last action was not saved.',
        'error'
      );
      expect(document.getElementById('add-app-modal').classList.contains('modal-open')).toBe(true);
      expect(window.AppGridState.getCustomApps().find(a => a.id === 'custom-app-edit').url)
        .toBe('https://editable.example');
    } finally {
      window.AppGridState.updateAppUrl = originalUpdateAppUrl;
      window.showToast = originalShowToast;
    }
  });
});
