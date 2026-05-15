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
});
