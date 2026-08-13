import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
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

describe('App grid drag-and-drop with folders present', () => {
  beforeAll(() => {
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/app-grid-state.js');
  });

  beforeEach(() => {
    localStorage.clear();
    // Drop any leftover grids so drag-drop.js binds to the fresh test grid.
    document.querySelectorAll('#app-grid').forEach((el) => el.remove());
    // Fake timers so the drop bounce's setTimeout(cleanup, 500) fallback in
    // drag-drop.js (which jsdom never fires via animationend) is a fake timer
    // that afterEach clears, instead of a real one firing 500ms after teardown.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('lands the app where the placeholder was shown when folders are present (#599)', () => {
    // Repro from issue #599: appOrder = [A, B, C, F1, F2]. Dragging app A to
    // the last slot previously produced ['B','C','F1','A','F2'] because the
    // drop index was computed over app icons only but applied to the full
    // order. It must land after both folders.
    AppGridStorage.saveOrder(['A', 'B', 'C', 'F1', 'F2']);
    AppGridStorage.saveCustomApps([
      { id: 'A', url: 'https://a.example', name: 'A' },
      { id: 'B', url: 'https://b.example', name: 'B' },
      { id: 'C', url: 'https://c.example', name: 'C' }
    ]);
    AppGridStorage.saveFolders([
      { id: 'F1', name: 'One', apps: [] },
      { id: 'F2', name: 'Two', apps: [] }
    ]);

    const grid = document.createElement('div');
    grid.id = 'app-grid';
    Object.defineProperty(grid, 'offsetWidth', { configurable: true, value: 600 });
    grid.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 200, right: 600, bottom: 200
    });
    document.body.appendChild(grid);

    // Icons in the same order as appOrder. Folder icons share the app-icon
    // class but are excluded from drag index math, which is the mismatch
    // that triggered the bug.
    const makeIcon = (id, className) => {
      const el = document.createElement('a');
      el.id = id;
      el.className = className;
      el.draggable = true;
      Object.defineProperty(el, 'offsetWidth', { configurable: true, value: 60 });
      Object.defineProperty(el, 'offsetHeight', { configurable: true, value: 60 });
      Object.defineProperty(el, 'offsetTop', { configurable: true, value: 0 });
      grid.appendChild(el);
      return el;
    };
    const appA = makeIcon('A', 'app-icon custom-app');
    makeIcon('B', 'app-icon custom-app');
    makeIcon('C', 'app-icon custom-app');
    makeIcon('F1', 'app-icon folder-icon');
    makeIcon('F2', 'app-icon folder-icon');

    // Run rAF callbacks synchronously so no frame callback is left pending
    // to fire against the removed grid after the test tears down.
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });

    try {
      injectScript('src/features/drag-drop.js');

      const dataTransfer = {
        effectAllowed: '',
        dropEffect: '',
        setData: () => {},
        setDragImage: () => {}
      };

      // Start dragging app A.
      const dragStart = new Event('dragstart', { bubbles: true });
      Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
      appA.dispatchEvent(dragStart);

      // Drag to the last slot. With a 4-per-row grid (itemWidth 110) the
      // pointer over column 2 of row 0 yields app-only index 2 = past B and C,
      // i.e. the very end of the grid including the trailing folders.
      const dragOver = new Event('dragover', { bubbles: true });
      Object.defineProperties(dragOver, {
        dataTransfer: { value: dataTransfer },
        clientX: { value: 320 },
        clientY: { value: 30 }
      });
      document.body.dispatchEvent(dragOver);

      const drop = new Event('drop', { bubbles: true });
      Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
      grid.dispatchEvent(drop);

      expect(AppGridState.getOrder()).toEqual(['B', 'C', 'F1', 'F2', 'A']);
    } finally {
      // Clean up the drag session and remove the grid.
      grid.dispatchEvent(new Event('dragend', { bubbles: true }));
      grid.remove();
      vi.unstubAllGlobals();
    }
  });
});
