import { injectScript } from './helpers/inject-script.js';

// Installs an in-memory IndexedDB mock seeded with `records` and loads
// src/data/custom-backgrounds.js fresh. Returns { records, restore }.
function loadWithIndexedDB(records) {
  const mockDB = {
    // Each transaction wires its requests so firing onsuccess also fires
    // tx.oncomplete, mirroring real IndexedDB event ordering (the module
    // resolves promises from tx.oncomplete).
    transaction() {
      const tx = {
        oncomplete: null,
        onabort: null,
        onerror: null
      };
      function settle(req, result) {
        setTimeout(() => {
          req.result = result;
          if (req.onsuccess) req.onsuccess();
          if (tx.oncomplete) tx.oncomplete();
        }, 0);
        return req;
      }
      tx.objectStore = () => ({
        getAll() {
          return settle({}, records.slice());
        },
        get(id) {
          return settle({}, records.find((bg) => bg.id === id) || null);
        },
        put(bg) {
          const existing = records.findIndex((r) => r.id === bg.id);
          if (existing !== -1) records[existing] = bg; else records.push(bg);
          return settle({}, bg.id);
        },
        delete(id) {
          const idx = records.findIndex((r) => r.id === id);
          if (idx !== -1) records.splice(idx, 1);
          return settle({}, undefined);
        }
      });
      return tx;
    },
    objectStoreNames: { contains: () => true }
  };
  const originalIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const req = { onupgradeneeded: null, onerror: null };
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: { result: mockDB } }); }, 0);
      return req;
    }
  };

  injectScript('src/data/custom-backgrounds.js');

  return {
    records,
    restore() {
      globalThis.indexedDB = originalIndexedDB;
    }
  };
}

describe('custom backgrounds', () => {
  loadWithIndexedDB([]);

  it('exposes management helpers and recognizes only custom IDs', () => {
    expect(window._customBackgrounds.isCustom('custom_123')).toBe(true);
    expect(window._customBackgrounds.isCustom('Beach - Australia')).toBe(false);
    expect(window._customBackgrounds.getAll).toBeTypeOf('function');
    expect(window._customBackgrounds.revokeAll).toBeTypeOf('function');
  });
});

describe('custom backgrounds metadata cache', () => {
  const imageRecord = {
    id: 'custom_image_1',
    title: 'Sunset photo',
    type: 'image',
    data: new Blob(['fake'], { type: 'image/jpeg' }),
    thumb: 'data:image/jpeg;base64,thumb1'
  };
  const videoRecord = {
    id: 'custom_video_1',
    title: 'Ocean waves',
    type: 'video',
    data: new Blob(['fake'], { type: 'video/mp4' }),
    thumb: 'data:image/jpeg;base64,thumb2'
  };

  it('getCachedList starts empty and refresh() loads lightweight metadata without blobs', async () => {
    const harness = loadWithIndexedDB([imageRecord, videoRecord]);

    try {
      expect(window._customBackgrounds.getCachedList()).toEqual([]);

      await window._customBackgrounds.refresh();

      expect(window._customBackgrounds.getCachedList()).toEqual([
        { id: 'custom_image_1', title: 'Sunset photo', type: 'image', thumb: 'data:image/jpeg;base64,thumb1' },
        { id: 'custom_video_1', title: 'Ocean waves', type: 'video', thumb: 'data:image/jpeg;base64,thumb2' }
      ]);
    } finally {
      harness.restore();
    }
  });

  it('refresh dispatches custombackgroundschanged after loading', async () => {
    const harness = loadWithIndexedDB([imageRecord]);
    let changeEvents = 0;
    document.addEventListener('custombackgroundschanged', onEvent);

    function onEvent() { changeEvents += 1; }

    try {
      await window._customBackgrounds.refresh();
      expect(changeEvents).toBe(1);
    } finally {
      document.removeEventListener('custombackgroundschanged', onEvent);
      harness.restore();
    }
  });

  it('render keeps the cache in sync after uploads and deletions', async () => {
    const harness = loadWithIndexedDB([]);

    try {
      // Simulate the upload path: put + render (as handleUpload's caller does).
      harness.records.push(imageRecord);
      await window._customBackgrounds.render();

      let ids = window._customBackgrounds.getCachedList().map((bg) => bg.id);
      expect(ids).toEqual(['custom_image_1']);

      // Simulate the delete path: remove + render.
      harness.records.splice(0, 1);
      await window._customBackgrounds.render();

      ids = window._customBackgrounds.getCachedList().map((bg) => bg.id);
      expect(ids).toEqual([]);
    } finally {
      harness.restore();
    }
  });

  it('concurrent refreshes share one IndexedDB read and resolve identically', async () => {
    const harness = loadWithIndexedDB([imageRecord]);

    try {
      const first = window._customBackgrounds.refresh();
      const second = window._customBackgrounds.refresh();

      expect(second).toBe(first); // same in-flight promise shared

      const [list] = await Promise.all([first, second]);
      expect(list.length).toBe(1);
      expect(window._customBackgrounds.getCachedList().length).toBe(1);
    } finally {
      harness.restore();
    }
  });
});
