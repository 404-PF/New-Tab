import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';
import { DEFAULT_APPS } from './helpers/default-apps.js';

function buildGrid(iconSpecs) {
  const grid = document.createElement('div');
  grid.id = 'app-grid';
  Object.defineProperty(grid, 'offsetWidth', { configurable: true, value: 600 });
  grid.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 600, height: 200, right: 600, bottom: 200
  });
  document.body.appendChild(grid);

  const icons = {};
  iconSpecs.forEach(({ id, className }) => {
    const el = document.createElement('a');
    el.id = id;
    el.className = className;
    el.draggable = true;
    Object.defineProperty(el, 'offsetWidth', { configurable: true, value: 60 });
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: 60 });
    Object.defineProperty(el, 'offsetTop', { configurable: true, value: 0 });
    grid.appendChild(el);
    icons[id] = el;
  });
  return { grid, icons };
}

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
    // order. It must land after both folders. The icons run in the same
    // order as appOrder; folder icons share the app-icon class but are
    // excluded from drag index math, which is the mismatch that triggered
    // the bug.
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

    const { grid, icons } = buildGrid([
      { id: 'A', className: 'app-icon custom-app' },
      { id: 'B', className: 'app-icon custom-app' },
      { id: 'C', className: 'app-icon custom-app' },
      { id: 'F1', className: 'app-icon folder-icon' },
      { id: 'F2', className: 'app-icon folder-icon' }
    ]);
    const appA = icons.A;

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

      // Drag to the bottom-right of the grid. calculateDropIndex derives the
      // cell from measured geometry (padding, gap, item width) and clamps the
      // result to the end of the app-only list, so pointing past the last slot
      // always lands after both trailing folders — without the coordinates
      // depending on getGridLayout's fallback constants in drag-drop.js.
      const gridRect = grid.getBoundingClientRect();
      const dragOver = new Event('dragover', { bubbles: true });
      Object.defineProperties(dragOver, {
        dataTransfer: { value: dataTransfer },
        clientX: { value: gridRect.right - 1 },
        clientY: { value: gridRect.bottom - 1 }
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

describe('App grid drag-and-drop of built-in apps into folders (#1010)', () => {
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: () => {},
    setDragImage: () => {}
  };

  beforeAll(() => {
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/app-grid-state.js');
    window.defaultApps = Object.freeze(DEFAULT_APPS.map((app) => ({ ...app })));
  });

  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('#app-grid').forEach((el) => el.remove());
    vi.useFakeTimers();
    window.AppFolders = { refreshFolderUI: vi.fn() };
    window.removeAppIcon = vi.fn();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete window.AppFolders;
    delete window.removeAppIcon;
  });

  function dispatchDragEvent(element, type, { clientX = 100, clientY = 50 } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: clientX },
      clientY: { value: clientY }
    });
    element.dispatchEvent(event);
    return event;
  }

  function finishDrag(grid) {
    grid.dispatchEvent(new Event('dragend', { bubbles: true }));
    grid.remove();
    vi.unstubAllGlobals();
  }

  function startFolderDropScenario(order) {
    AppGridStorage.saveOrder(order);
    AppGridStorage.saveFolders([{ id: 'F1', name: 'Tools', apps: [] }]);

    // Run rAF callbacks synchronously so no frame callback is left pending
    // to fire against the removed grid after the test tears down.
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });

    const iconSpecs = order.map((id) => ({
      id,
      className: id === 'F1' ? 'app-icon folder-icon' : 'app-icon default-app'
    }));
    return buildGrid(iconSpecs);
  }

  function dragIconToFolder(sourceIcon, folderIcon) {
    dispatchDragEvent(sourceIcon, 'dragstart');
    return dispatchDragEvent(folderIcon, 'dragover');
  }

  it('highlights and drops a hideable built-in onto a folder', () => {
    const { grid, icons } = startFolderDropScenario(['ai-app', 'weather-app', 'F1']);

    try {
      injectScript('src/features/drag-drop.js');

      const overFolder = dragIconToFolder(icons['weather-app'], icons.F1);
      expect(overFolder.defaultPrevented).toBe(true);
      expect(icons.F1.classList.contains('drag-over-folder')).toBe(true);
      expect(icons.F1.classList.contains('drag-over-folder-rejected')).toBe(false);

      dispatchDragEvent(icons.F1, 'drop');

      expect(AppGridState.getFolders()[0].apps).toEqual(['weather-app']);
      expect(AppGridState.getOrder()).toEqual(['ai-app', 'F1']);
      // A folder move must not hide the built-in; restore stays a
      // folder-membership concern, not a hiddenDefaultApps one.
      expect(AppGridStorage.loadHiddenDefaultApps()).toEqual([]);
      expect(window.removeAppIcon).toHaveBeenCalledExactlyOnceWith('weather-app');
      expect(window.AppFolders.refreshFolderUI).toHaveBeenCalledExactlyOnceWith('F1');
    } finally {
      finishDrag(grid);
    }
  });

  it('rejects dragging Settings onto a folder', () => {
    const { grid, icons } = startFolderDropScenario(['settings-app', 'weather-app', 'F1']);

    try {
      injectScript('src/features/drag-drop.js');

      dragIconToFolder(icons['settings-app'], icons.F1);
      expect(icons.F1.classList.contains('drag-over-folder-rejected')).toBe(true);
      expect(icons.F1.classList.contains('drag-over-folder')).toBe(false);

      dispatchDragEvent(icons.F1, 'drop');

      expect(AppGridState.getFolders()[0].apps).toEqual([]);
      expect(AppGridState.getOrder()).toEqual(['settings-app', 'weather-app', 'F1']);
      expect(window.removeAppIcon).not.toHaveBeenCalled();
    } finally {
      finishDrag(grid);
    }
  });
});

describe('App grid drag-and-drop first-icon offsetTop (issue #1092)', () => {
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: () => {},
    setDragImage: () => {}
  };

  beforeAll(() => {
    injectScript('src/core/app-grid-storage.js');
    injectScript('src/core/app-grid-state.js');
  });

  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('#app-grid').forEach((el) => el.remove());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('honors a first icon flush at offsetTop 0 instead of substituting the 30px fallback', () => {
    // buildGrid stubs every icon with offsetTop 0, which the old
    // `offsetTop || 30` treated as missing and replaced with a phantom 30 px,
    // shifting drop-index math one row upward near the top of the grid.
    AppGridStorage.saveOrder(['A', 'B', 'C', 'D', 'E']);
    AppGridStorage.saveCustomApps([
      { id: 'A', url: 'https://a.example', name: 'A' },
      { id: 'B', url: 'https://b.example', name: 'B' },
      { id: 'C', url: 'https://c.example', name: 'C' },
      { id: 'D', url: 'https://d.example', name: 'D' },
      { id: 'E', url: 'https://e.example', name: 'E' }
    ]);

    const { grid, icons } = buildGrid([
      { id: 'A', className: 'app-icon custom-app' },
      { id: 'B', className: 'app-icon custom-app' },
      { id: 'C', className: 'app-icon custom-app' },
      { id: 'D', className: 'app-icon custom-app' },
      { id: 'E', className: 'app-icon custom-app' }
    ]);

    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });

    try {
      injectScript('src/features/drag-drop.js');

      const dragStart = new Event('dragstart', { bubbles: true });
      Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
      icons.B.dispatchEvent(dragStart);

      // With the getGridLayout fallbacks (gap 50, padding 70) and 60px icons,
      // row 1 starts at y=110 when the first icon's offsetTop of 0 is honored.
      // The phantom-30 offset used to push this point into row 0, dropping B
      // to the front instead of after the remaining icons.
      const dragOver = new Event('dragover', { bubbles: true });
      Object.defineProperties(dragOver, {
        dataTransfer: { value: dataTransfer },
        clientX: { value: 75 },
        clientY: { value: 115 }
      });
      document.body.dispatchEvent(dragOver);

      const drop = new Event('drop', { bubbles: true });
      Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
      grid.dispatchEvent(drop);

      expect(AppGridState.getOrder()).toEqual(['A', 'C', 'D', 'E', 'B']);
    } finally {
      grid.dispatchEvent(new Event('dragend', { bubbles: true }));
      grid.remove();
      vi.unstubAllGlobals();
    }
  });
});
