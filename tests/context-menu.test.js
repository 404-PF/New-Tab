import { beforeAll, describe, expect, it, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const createElement = (tag, id) => {
  const element = document.createElement(tag);
  element.id = id;
  document.body.appendChild(element);
  return element;
};

describe('context menu previews', () => {
  beforeAll(() => {
    injectScript('src/core/dom-ready.js');

    window.AppGridState = {
      getCustomApps: () => [{
        id: 'app-1',
        name: 'Example App',
        icon: 'https://example.com/icon.png"><svg data-test="evil"></svg>'
      }],
      renameApp: vi.fn(),
      updateThumbnail: vi.fn(),
      deleteApp: vi.fn()
    };

    createElement('div', 'rename-app-modal');
    createElement('input', 'rename-app-input');
    createElement('button', 'rename-app-cancel');
    createElement('button', 'rename-app-confirm');

    createElement('div', 'thumbnail-app-modal');
    createElement('input', 'thumbnail-app-input');
    createElement('button', 'thumbnail-app-cancel');
    createElement('button', 'thumbnail-app-confirm');
    createElement('div', 'thumbnail-preview-icon');
    createElement('span', 'thumbnail-preview-name');

    createElement('div', 'delete-app-modal');
    createElement('button', 'delete-app-cancel');
    createElement('button', 'delete-app-confirm');
    createElement('div', 'delete-preview-icon');
    createElement('span', 'delete-preview-name');

    const appIcon = createElement('a', 'app-1');
    appIcon.className = 'app-icon custom-app';

    injectScript('src/features/context-menu.js');
  });

  it('renders preview icons without parsing raw HTML', () => {
    const appIcon = document.getElementById('app-1');
    appIcon.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      pageX: 32,
      pageY: 32
    }));

    document.getElementById('change-thumbnail').click();

    const thumbnailPreview = document.getElementById('thumbnail-preview-icon');
    expect(thumbnailPreview.querySelector('img')).not.toBeNull();
    expect(thumbnailPreview.querySelector('svg')).toBeNull();
    expect(thumbnailPreview.querySelector('[data-test="evil"]')).toBeNull();

    document.getElementById('delete-app').click();

    const deletePreview = document.getElementById('delete-preview-icon');
    expect(deletePreview.querySelector('img')).not.toBeNull();
    expect(deletePreview.querySelector('svg')).toBeNull();
    expect(deletePreview.querySelector('[data-test="evil"]')).toBeNull();
  });

  it('skips delayed focus when modal inputs disappear', () => {
    const appIcon = document.getElementById('app-1');
    const openContextMenu = () => {
      appIcon.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        pageX: 32,
        pageY: 32
      }));
    };
    const errors = [];
    const onError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    vi.useFakeTimers();

    try {
      window.renameAppId = null;
      openContextMenu();
      document.getElementById('rename-app').click();
      document.getElementById('rename-app-input').remove();
      vi.advanceTimersByTime(100);
      createElement('input', 'rename-app-input');

      window.thumbnailAppId = null;
      openContextMenu();
      document.getElementById('change-thumbnail').click();
      document.getElementById('thumbnail-app-input').remove();
      vi.advanceTimersByTime(100);
      createElement('input', 'thumbnail-app-input');

      expect(errors).toEqual([]);
    } finally {
      vi.useRealTimers();
      window.removeEventListener('error', onError);
    }
  });

  it('handles missing modal and preview elements without errors', () => {
    const appIcon = document.getElementById('app-1');
    const openContextMenu = () => {
      appIcon.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        pageX: 32,
        pageY: 32
      }));
    };
    const errors = [];
    const onError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.addEventListener('error', onError);

    try {
      window.renameAppId = null;
      document.getElementById('rename-app-input').remove();
      document.getElementById('rename-app-modal').remove();
      openContextMenu();
      document.getElementById('rename-app').click();
      expect(window.renameAppId).toBeNull();

      document.getElementById('thumbnail-preview-icon').remove();
      document.getElementById('thumbnail-preview-name').remove();
      openContextMenu();
      document.getElementById('change-thumbnail').click();
      expect(window.thumbnailAppId).toBe('app-1');
      expect(document.getElementById('thumbnail-app-modal').classList).toContain('modal-open');

      window.thumbnailAppId = null;
      document.getElementById('thumbnail-app-input').remove();
      document.getElementById('thumbnail-app-modal').remove();
      openContextMenu();
      document.getElementById('change-thumbnail').click();
      expect(window.thumbnailAppId).toBeNull();

      document.getElementById('delete-preview-icon').remove();
      document.getElementById('delete-preview-name').remove();
      openContextMenu();
      document.getElementById('delete-app').click();
      expect(window.deleteAppId).toBe('app-1');
      expect(document.getElementById('delete-app-modal').classList).toContain('modal-open');

      window.deleteAppId = null;
      document.getElementById('delete-app-modal').remove();
      openContextMenu();
      document.getElementById('delete-app').click();
      expect(window.deleteAppId).toBeNull();

      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
      warnSpy.mockRestore();
    }
  });
});
