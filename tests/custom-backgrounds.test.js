import { vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

const MAIN_STORE = 'customBackgrounds';
const META_STORE = 'customBackgroundsMeta';

// Builds an in-memory IndexedDB mock with the module's two object stores.
// Requests settle asynchronously (setTimeout 0) and fire tx.oncomplete,
// mirroring real event ordering (the module resolves promises from
// tx.oncomplete). Transactions are reference-counted: oncomplete fires only
// once every issued request has settled and none was re-issued from a
// success handler (e.g. cursor.continue), matching how a real transaction
// stays alive while requests keep being queued. Reads snapshot the records
// array at call time, like a readonly transaction pinned at transaction start.
function createStoreMock(mainRecords, metaRecords, state) {
  function makeTx() {
    const tx = { oncomplete: null, onabort: null, onerror: null };
    let active = 0;
    let completed = false;
    function maybeComplete() {
      setTimeout(() => {
        if (!completed && active === 0) {
          completed = true;
          if (tx.oncomplete) tx.oncomplete();
        }
      }, 0);
    }
    tx.__requestIssued = () => { active += 1; };
    tx.__requestSettled = () => {
      active -= 1;
      maybeComplete();
    };
    tx.__maybeComplete = maybeComplete;
    return tx;
  }

  function settle(req, resultOrFn, withCursorEvent) {
    setTimeout(() => {
      req.result = typeof resultOrFn === 'function' ? resultOrFn() : resultOrFn;
      if (req.onsuccess) {
        // Cursor handlers receive an IDBRequest-style event whose target
        // carries the just-assigned cursor (or null at exhaustion).
        req.onsuccess(withCursorEvent ? { target: { result: req.result } } : undefined);
      }
      if (req.tx) req.tx.__requestSettled();
    }, 0);
    return req;
  }

  function storeHandle(name) {
    const target = name === META_STORE ? metaRecords : mainRecords;
    return {
      getAll() {
        return settle({}, target.slice());
      },
      get(id) {
        return settle({}, target.find((bg) => bg.id === id) || null);
      },
      put(record) {
        const idx = target.findIndex((r) => r.id === record.id);
        if (idx !== -1) target[idx] = record; else target.push(record);
        return settle({}, record.id);
      },
      delete(id) {
        const idx = target.findIndex((r) => r.id === id);
        if (idx !== -1) target.splice(idx, 1);
        return settle({}, undefined);
      },
      openCursor() {
        const req = {};
        // Pin the records like a real readonly transaction: mutations made
        // after openCursor() are invisible to this iteration.
        const snapshot = target.slice();
        let i = 0;
        const current = () => (i < snapshot.length
          ? { value: snapshot[i], continue: () => req.continue() }
          : null);
        req.continue = () => {
          if (req.tx) req.tx.__requestIssued();
          i += 1;
          return settle(req, current, true);
        };
        return settle(req, current, true);
      }
    };
  }

  const attachTx = (tx, handle) => {
    const proxied = {};
    Object.keys(handle).forEach((method) => {
      proxied[method] = (...args) => {
        const req = handle[method](...args);
        req.tx = tx;
        tx.__requestIssued();
        return req;
      };
    });
    return proxied;
  };

  const mockDB = {
    objectStoreNames: {
      contains: (name) => name === MAIN_STORE || state.metaCreated
    },
    createObjectStore(name) {
      if (name === META_STORE) state.metaCreated = true;
    },
    transaction() {
      const tx = makeTx();
      tx.objectStore = (name) => attachTx(tx, storeHandle(name));
      return tx;
    }
  };

  return {
    idbFactory: {
      open() {
        const req = { onupgradeneeded: null, onerror: null };
        setTimeout(() => {
          if (!state.metaCreated) {
            const upgradeTx = makeTx();
            upgradeTx.objectStore = (name) => attachTx(upgradeTx, storeHandle(name));
            if (req.onupgradeneeded) {
              req.onupgradeneeded({
                target: { result: mockDB, transaction: upgradeTx }
              });
            }
            state.metaCreated = true;
            // Like real IndexedDB, the success event waits for the upgrade
            // transaction to commit, so seeded data is readable afterwards.
            upgradeTx.oncomplete = () => {
              if (req.onsuccess) req.onsuccess({ target: { result: mockDB } });
            };
            upgradeTx.__maybeComplete(); // covers upgrades issuing no requests
          } else if (req.onsuccess) {
            req.onsuccess({ target: { result: mockDB } });
          }
        }, 0);
        return req;
      }
    },
    mockDB
  };
}

// Installs the mock and loads src/data/custom-backgrounds.js fresh.
// restore() puts back the IndexedDB factory and the prior
// window._customBackgrounds and removes the document listeners this
// injection registered, so injections never leak across suites.
function loadWithIndexedDB(records, options) {
  const opts = options || {};
  const state = { metaCreated: opts.metaCreated !== false };
  // A consistent v2 database maintains the mirror alongside every write.
  // A v1 database (metaCreated: false) starts with an empty meta store;
  // onupgradeneeded seeding must populate it.
  const metaRecords = opts.metaRecords
    || (state.metaCreated ? records.map((bg) => ({
      id: bg.id, title: bg.title, type: bg.type, thumb: bg.thumb
    })) : []);
  const mock = createStoreMock(records, metaRecords, state);

  const previousApi = window._customBackgrounds;
  const previousIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = mock.idbFactory;

  // The module registers document-level click handlers at evaluation time
  // and has no teardown for them. Record every listener added while the
  // script runs so restore() can uninstall this injection's handlers;
  // otherwise stale handlers from earlier harnesses stay installed and the
  // delete tests open multiple dialogs (confirming an older harness's).
  const injectedListeners = [];
  const originalAddEventListener = document.addEventListener;
  document.addEventListener = function (type, listener, options) {
    injectedListeners.push([type, listener, options]);
    return originalAddEventListener.call(document, type, listener, options);
  };
  try {
    injectScript('src/data/custom-backgrounds.js');
  } finally {
    document.addEventListener = originalAddEventListener;
  }

  return {
    records,
    metaRecords,
    mockDB: mock.mockDB,
    restore() {
      injectedListeners.forEach(([type, listener, options]) => {
        document.removeEventListener(type, listener, options);
      });
      globalThis.indexedDB = previousIndexedDB;
      if (previousApi === undefined) {
        delete window._customBackgrounds;
      } else {
        window._customBackgrounds = previousApi;
      }
    }
  };
}

describe('custom backgrounds', () => {
  let harness;

  beforeAll(() => {
    harness = loadWithIndexedDB([]);
  });

  afterAll(() => {
    harness.restore();
  });

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

      const list = await window._customBackgrounds.refresh();

      expect(list).toEqual([
        { id: 'custom_image_1', title: 'Sunset photo', type: 'image', thumb: 'data:image/jpeg;base64,thumb1' },
        { id: 'custom_video_1', title: 'Ocean waves', type: 'video', thumb: 'data:image/jpeg;base64,thumb2' }
      ]);
      expect(window._customBackgrounds.getCachedList()).toBe(list);
    } finally {
      harness.restore();
    }
  });

  it('refresh dispatches custombackgroundschanged after loading', async () => {
    const harness = loadWithIndexedDB([imageRecord]);
    let changeEvents = 0;
    const onEvent = () => { changeEvents += 1; };
    document.addEventListener('custombackgroundschanged', onEvent);

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

    const putBoth = (bg) => {
      harness.records.push(bg);
      harness.metaRecords.push({ id: bg.id, title: bg.title, type: bg.type, thumb: bg.thumb });
    };
    const deleteBoth = (id) => {
      const at = (list) => list.findIndex((r) => r.id === id);
      harness.records.splice(at(harness.records), 1);
      harness.metaRecords.splice(at(harness.metaRecords), 1);
    };

    try {
      // Simulate the upload path: dual write + render (as handleUpload's caller does).
      putBoth(imageRecord);
      await window._customBackgrounds.render();

      let ids = window._customBackgrounds.getCachedList().map((bg) => bg.id);
      expect(ids).toEqual(['custom_image_1']);

      // Simulate the delete path: dual removal + render.
      deleteBoth('custom_image_1');
      await window._customBackgrounds.render();

      ids = window._customBackgrounds.getCachedList().map((bg) => bg.id);
      expect(ids).toEqual([]);
    } finally {
      harness.restore();
    }
  });

  it('concurrent refreshes share one in-flight read', async () => {
    const harness = loadWithIndexedDB([imageRecord]);

    try {
      const first = window._customBackgrounds.refresh();
      const second = window._customBackgrounds.refresh();

      expect(second).toBe(first); // same in-flight promise shared

      await Promise.all([first, second]);
      expect(window._customBackgrounds.getCachedList().length).toBe(1);
    } finally {
      harness.restore();
    }
  });

  it('falls back to a full-record read when the metadata store is unavailable', async () => {
    // metaCreated: false makes objectStoreNames.contains lie only until the
    // upgrade runs, so force the meta store to stay unreadable instead.
    const harness = loadWithIndexedDB([imageRecord], { metaCreated: true });
    const originalTransaction = harness.mockDB.transaction;
    harness.mockDB.transaction = function (storeNames, mode) {
      const tx = originalTransaction.call(harness.mockDB, storeNames, mode);
      if (Array.isArray(storeNames) && storeNames.indexOf(META_STORE) !== -1 && mode === 'readonly') {
        const originalObjectStore = tx.objectStore;
        tx.objectStore = (name) => {
          if (name === META_STORE) {
            throw new Error('Simulated metadata store failure');
          }
          return originalObjectStore(name);
        };
        setTimeout(() => { if (tx.onerror) tx.onerror(); }, 0);
      }
      return tx;
    };

    try {
      const list = await window._customBackgrounds.refresh();
      expect(list.map((bg) => bg.id)).toEqual(['custom_image_1']);
    } finally {
      harness.restore();
    }
  });
});

describe('custom backgrounds database upgrade', () => {
  it('seeds the metadata mirror from existing records during version upgrade', async () => {
    const imageRecord = {
      id: 'custom_image_legacy',
      title: 'Pre-upgrade photo',
      type: 'image',
      data: new Blob(['legacy'], { type: 'image/png' }),
      thumb: 'data:image/jpeg;base64,legacy'
    };

    // metaCreated: false simulates a v1 database: the meta store does not
    // exist and the mirror starts empty, so refresh() only sees the record
    // if onupgradeneeded seeding in custom-backgrounds.js populated it.
    const harness = loadWithIndexedDB([imageRecord], { metaCreated: false });

    try {
      const list = await window._customBackgrounds.refresh();

      expect(list).toEqual([
        { id: 'custom_image_legacy', title: 'Pre-upgrade photo', type: 'image', thumb: 'data:image/jpeg;base64,legacy' }
      ]);
      // The seeding populated the mirror exactly once without touching
      // the main records.
      expect(harness.metaRecords.length).toBe(1);
      expect(harness.records.length).toBe(1);
    } finally {
      harness.restore();
    }
  });
});

describe('custom backgrounds delete confirmation errors', () => {
  const deleteRecord = {
    id: 'custom_delete_1',
    title: 'Photo marked for deletion',
    type: 'image',
    data: new Blob(['fake'], { type: 'image/jpeg' }),
    thumb: 'data:image/jpeg;base64,delete1'
  };

  // Injects the module, seeds one background, stubs window.showToast, and
  // attaches a delete button so the document-level delete handler fires.
  // restore() undoes all of it; each test also restores its own mock first.
  function primeDeleteHarness() {
    const harness = loadWithIndexedDB([deleteRecord]);
    const originalShowToast = window.showToast;
    const showToast = vi.fn();
    window.showToast = showToast;

    const button = document.createElement('button');
    button.className = 'custom-bg-delete-btn';
    button.setAttribute('data-bg-id', deleteRecord.id);
    document.body.appendChild(button);

    return {
      harness,
      showToast,
      button,
      restore() {
        button.remove();
        document.querySelectorAll('.bg-confirm-dialog').forEach((el) => el.remove());
        if (originalShowToast === undefined) {
          delete window.showToast;
        } else {
          window.showToast = originalShowToast;
        }
        harness.restore();
      }
    };
  }

  it('reports the dialog error key when the confirmation dialog fails to open', async () => {
    const ctx = primeDeleteHarness();
    const originalCreateElement = document.createElement;
    // The dialog promise only rejects if building it throws inside the
    // executor, so fail element creation while the click runs.
    document.createElement = () => {
      throw new Error('confirmation dialog failed to open');
    };

    try {
      ctx.button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(ctx.showToast).toHaveBeenCalledWith('customBackgroundDialogError', 'error');
      // The dialog never opened, so deletion must not have started.
      expect(ctx.harness.records.map((bg) => bg.id)).toEqual([deleteRecord.id]);
    } finally {
      document.createElement = originalCreateElement;
      ctx.restore();
    }
  });

  it('reports the delete error key when reading the active background fails after confirmation', async () => {
    const ctx = primeDeleteHarness();
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error('active background read failed');
    };

    try {
      ctx.button.click();

      const confirmButton = document.querySelector('.bg-confirm-delete');
      expect(confirmButton).not.toBeNull();
      confirmButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(ctx.showToast).toHaveBeenCalledWith('customBackgroundDeleteError', 'error');
      // The read failed before deletion began, so the record survives.
      expect(ctx.harness.records.map((bg) => bg.id)).toEqual([deleteRecord.id]);
    } finally {
      localStorage.getItem = originalGetItem;
      ctx.restore();
    }
  });
});

describe('custom backgrounds upload validation (issue #967)', () => {
  // Clicks an upload button, then feeds the file input a wrong-typed file so
  // the validation branch runs. Returns the spies installed around the flow.
  async function primeUploadHarness(uploadType, file) {
    const harness = loadWithIndexedDB([]);
    const originalShowToast = window.showToast;
    const originalAlert = window.alert;
    const showToast = vi.fn();
    const alert = vi.fn();
    window.showToast = showToast;
    window.alert = alert;

    const button = document.createElement('button');
    button.className = 'upload-bg-btn';
    button.setAttribute('data-upload-type', uploadType);
    document.body.appendChild(button);

    try {
      button.click();
      // tests/setup.js pre-creates #data-import-file; the upload flow appends
      // its own un-id'd file input, so exclude the setup stub explicitly.
      const input = document.querySelector('input[type="file"]:not(#data-import-file)');
      expect(input).not.toBeNull();
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
    } finally {
      button.remove();
    }

    return {
      showToast,
      alert,
      restore() {
        if (originalShowToast === undefined) {
          delete window.showToast;
        } else {
          window.showToast = originalShowToast;
        }
        if (originalAlert === undefined) {
          delete window.alert;
        } else {
          window.alert = originalAlert;
        }
        harness.restore();
      }
    };
  }

  it('reports a wrong-typed video upload through the toast, not a blocking alert', async () => {
    const ctx = await primeUploadHarness('video', { name: 'photo.jpg', type: 'image/jpeg' });

    try {
      expect(ctx.showToast).toHaveBeenCalledWith('customBgSelectVideo', 'error');
      expect(ctx.alert).not.toHaveBeenCalled();
    } finally {
      ctx.restore();
    }
  });

  it('reports a wrong-typed image upload through the toast, not a blocking alert', async () => {
    const ctx = await primeUploadHarness('image', { name: 'clip.txt', type: 'text/plain' });

    try {
      expect(ctx.showToast).toHaveBeenCalledWith('customBgSelectImage', 'error');
      expect(ctx.alert).not.toHaveBeenCalled();
    } finally {
      ctx.restore();
    }
  });

  it('reports a thumbnail-generation failure through the localized toast', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    // generateImageThumbnail resolves its blob URL through URL.createObjectURL;
    // forcing it to throw exercises the process-error catch path.
    URL.createObjectURL = () => {
      throw new Error('blob URL creation failed');
    };
    const ctx = await primeUploadHarness('image', { name: 'photo.jpg', type: 'image/jpeg' });

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(ctx.showToast).toHaveBeenCalledWith('customBgProcessError', 'error');
      expect(ctx.alert).not.toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      ctx.restore();
    }
  });
});

describe('custom backgrounds delete button localization (issue #967)', () => {
  const imageRecord = {
    id: 'custom_image_i18n',
    title: 'Localized photo',
    type: 'image',
    data: new Blob(['fake'], { type: 'image/jpeg' }),
    thumb: 'data:image/jpeg;base64,i18n'
  };

  it('labels thumbnail delete buttons from t("delete") with relabel attributes', async () => {
    const harness = loadWithIndexedDB([imageRecord]);
    const staticContainer = document.createElement('div');
    staticContainer.id = 'bg-thumbnails-static';
    const liveContainer = document.createElement('div');
    liveContainer.id = 'bg-thumbnails-live';
    document.body.appendChild(staticContainer);
    document.body.appendChild(liveContainer);

    try {
      await window._customBackgrounds.render();

      const delBtn = staticContainer.querySelector('.custom-bg-delete-btn');
      expect(delBtn).not.toBeNull();
      expect(delBtn.title).toBe(window.i18n.t('delete'));
      expect(delBtn.getAttribute('aria-label')).toBe(window.i18n.t('delete'));
      // The applyLanguage() sweep relabels dynamically created buttons via
      // these attributes on a later language switch.
      expect(delBtn.getAttribute('data-i18n-title')).toBe('delete');
      expect(delBtn.getAttribute('data-i18n-aria-label')).toBe('delete');
    } finally {
      staticContainer.remove();
      liveContainer.remove();
      harness.restore();
    }
  });
});
