import { describe, expect, it } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

describe('App grid drag-and-drop cleanup', () => {
  it('does not throw when the app grid disappears before dragend', () => {
    const grid = document.createElement('div');
    grid.id = 'app-grid';

    const icon = document.createElement('a');
    icon.id = 'custom-app-1';
    icon.className = 'app-icon custom-app drag-over-folder';
    grid.appendChild(icon);
    document.body.appendChild(grid);

    injectScript('src/features/drag-drop.js');
    grid.remove();

    const errors = [];
    const onError = (event) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);

    try {
      icon.dispatchEvent(new Event('dragend', { bubbles: true }));
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
    }
  });
});
