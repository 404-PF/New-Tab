// src/features/data-manager.js - Full settings import/export

(function () {

  // Keys included in export. Excludes transient/derived keys:
  //   iconCache_* (dynamic, derived from apps)
  //   todoReminderNotified (service-worker only, transient)
  //   searchHistory (transient)
  //   weatherCache (API cache, expires)
  //   lastUpdateCheck (transient)
  const EXPORT_KEYS = [
    'theme',
    'language',
    'simpleMode',
    'homepageBg',
    'clockColor',
    'clockFont',
    'clockSize',
    'clockFormat',
    'dateColor',
    'dateFont',
    'dateSize',
    'dateFormat',
    'videoAutoplay',
    'videoMuted',
    'videoPauseHidden',
    'bgRotationEnabled',
    'bgRotationInterval',
    'bgRotationSelection',
    'todos',
    'todoEnabled',
    'todoReminderEnabled',
    'todoReminderLeadTime',
    'notes',
    'notesEnabled',
    'appOrder',
    'customApps',
    'appFolders',
    'openAppsInNewTab',
    'iconSize',
    'appsButtonCurvature',
    'customShortcuts',
    'onboardingCompleted',
    'onboardingStep',
    'weatherEnabled',
    'weatherUnit',
    'weatherLocationMode',
    'weatherManualCity',
    'ai_conversations',
    'ai_current_conversation_id',
    'updateCheckEnabled',
    'searchProvider',
    'customSearchProviders'
  ];

  function t(key, fallback) {
    return window.i18n ? window.i18n.t(key) : (fallback || key);
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function showToast(message, type) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    if (type) toast.classList.add('toast-' + type);
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2000);
  }

  function parseJsonSafe(str, fallback) {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.warn('[data-manager] JSON parse error:', e);
      return fallback;
    }
  }

  const READ_ERROR = Object.freeze({ __readError: true });

  function readStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      // Detect JSON-encoded values (arrays, objects, booleans stored as JSON)
      if (typeof raw === 'string' && raw.charAt(0) === '[') {
        return parseJsonSafe(raw, []);
      }
      if (typeof raw === 'string' && raw.charAt(0) === '{') {
        return parseJsonSafe(raw, {});
      }

      // Check if this key should remain a string based on EXPECTED_SHAPES
      const validator = EXPECTED_SHAPES[key];
      const shouldBeString = validator && validator('') === true;

      // Only apply scalar parsing to non-string types
      if (!shouldBeString) {
        // Handle JSON scalar values (booleans, null, numbers)
        if (raw === 'true') {
          return parseJsonSafe(raw, true);
        }
        if (raw === 'false') {
          return parseJsonSafe(raw, false);
        }
        if (raw === 'null') {
          return parseJsonSafe(raw, null);
        }
        // Check if it's a numeric value
        if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw)) {
          return parseJsonSafe(raw, raw);
        }
      }
      return raw;
    } catch (err) {
      console.warn('[data-manager] Failed to read key "' + key + '":', err);
      return READ_ERROR;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else if (typeof value === 'string') {
        localStorage.setItem(key, value);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (err) {
      console.warn('[data-manager] Failed to write key "' + key + '":', err);
      throw err;
    }
  }

  // --- Custom background metadata from IndexedDB ---

  function getCustomBackgroundsMetadata() {
    if (!window._customBackgrounds || typeof window._customBackgrounds.getAll !== 'function') {
      return Promise.resolve([]);
    }
    return window._customBackgrounds.getAll().then(function (bgs) {
      if (!Array.isArray(bgs)) return [];
      return bgs.map(function (bg) {
        return {
          id: bg.id,
          title: bg.title,
          type: bg.type,
          timestamp: bg.timestamp
          // Thumbnail included for reference; actual media data is not exportable
          // thumb: bg.thumb
        };
      });
    }).catch(function () {
      return [];
    });
  }

  // --- Export ---

  function exportAllData() {
    const data = {};
    let hasReadError = false;
    EXPORT_KEYS.forEach(function (key) {
      const val = readStorage(key);
      if (val === READ_ERROR) {
        hasReadError = true;
        return;
      }
      if (val !== null) {
        data[key] = val;
      }
    });

    if (hasReadError) {
      showToast(t('dataExportReadError'), 'error');
      return;
    }

    // Mark custom backgrounds metadata (actual media in IndexedDB, not in JSON)
    getCustomBackgroundsMetadata().then(function (customBgs) {
      if (customBgs.length > 0) {
        data._customBackgroundsMetadata = customBgs;
      }

      const exportObj = {
        version: 1,
        exportedAt: new Date().toISOString(),
        keyCount: Object.keys(data).length,
        data: data
      };

      const json = JSON.stringify(exportObj, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = formatDateISO(new Date());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'new-tab-backup-' + dateStr + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);

      showToast(t('dataExportSuccess', 'Data exported successfully.'), 'success');
    });
  }

  // --- Validation ---

  const EXPECTED_SHAPES = {
    theme: function (v) { return typeof v === 'string'; },
    language: function (v) { return typeof v === 'string'; },
    simpleMode: function (v) { return typeof v === 'boolean'; },
    homepageBg: function (v) { return typeof v === 'string'; },
    clockColor: function (v) { return typeof v === 'string'; },
    clockFont: function (v) { return typeof v === 'string'; },
    clockSize: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    clockFormat: function (v) { return typeof v === 'string'; },
    dateColor: function (v) { return typeof v === 'string'; },
    dateFont: function (v) { return typeof v === 'string'; },
    dateSize: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    dateFormat: function (v) { return typeof v === 'string'; },
    videoAutoplay: function (v) { return typeof v === 'boolean'; },
    videoMuted: function (v) { return typeof v === 'boolean'; },
    videoPauseHidden: function (v) { return typeof v === 'boolean'; },
    bgRotationEnabled: function (v) { return typeof v === 'boolean'; },
    bgRotationInterval: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    bgRotationSelection: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'string'; }); },
    todos: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    todoEnabled: function (v) { return typeof v === 'boolean'; },
    todoReminderEnabled: function (v) { return typeof v === 'boolean'; },
    todoReminderLeadTime: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    notes: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    notesEnabled: function (v) { return typeof v === 'boolean'; },
    appOrder: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'string'; }); },
    customApps: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    appFolders: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    openAppsInNewTab: function (v) { return typeof v === 'boolean'; },
    iconSize: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    appsButtonCurvature: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    customShortcuts: function (v) { return typeof v === 'object' && v !== null && !Array.isArray(v); },
    onboardingCompleted: function (v) { return typeof v === 'boolean'; },
    onboardingStep: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    weatherEnabled: function (v) { return typeof v === 'boolean'; },
    weatherUnit: function (v) { return typeof v === 'string'; },
    weatherLocationMode: function (v) { return typeof v === 'string'; },
    weatherManualCity: function (v) { return typeof v === 'string'; },
    ai_conversations: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    ai_current_conversation_id: function (v) { return typeof v === 'string'; },
    updateCheckEnabled: function (v) { return typeof v === 'boolean'; },
    searchProvider: function (v) { return typeof v === 'string'; },
    customSearchProviders: function (v) { return Array.isArray(v) && v.every(function (item) {
      if (typeof item !== 'object' || item === null) return false;
      if (typeof item.id !== 'string' || !item.id.trim()) return false;
      if (typeof item.name !== 'string' || !item.name.trim()) return false;
      if (typeof item.url !== 'string' || !item.url.includes('{query}')) return false;
      try {
        const parsed = new URL(item.url);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
      } catch {
        return false;
      }
    }); }
  };

  function validateImportData(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: t('dataImportInvalidFile', 'Invalid file format.') };
    if (!data.data || typeof data.data !== 'object' || data.data === null || Array.isArray(data.data)) {
      return { valid: false, error: t('dataImportInvalidStructure', 'Missing data section.') };
    }
    if (data.version !== 1) return { valid: false, error: t('dataImportUnsupportedVersion', 'Unsupported backup version.') };
    // Verify every key in data.data is present in EXPORT_KEYS allowlist
    const importKeys = Object.keys(data.data);
    const disallowedKeys = importKeys.filter(function (key) {
      return key.charAt(0) !== '_' && EXPORT_KEYS.indexOf(key) === -1;
    });
    if (disallowedKeys.length > 0) {
      return { valid: false, error: t('dataImportInvalidKeys', 'Disallowed keys found.') + ' ' + disallowedKeys.join(', ') };
    }
    // Per-key shape validation
    const invalidKeys = [];
    importKeys.forEach(function (key) {
      if (key.charAt(0) === '_') return;
      const validator = EXPECTED_SHAPES[key];
      if (validator && !validator(data.data[key])) {
        invalidKeys.push(key);
      }
    });
    if (invalidKeys.length > 0) {
      return { valid: false, error: t('dataImportInvalidShape', 'Invalid data structure for key(s).') + ' ' + invalidKeys.join(', ') };
    }
    return { valid: true };
  }

  // --- Import ---

  function triggerImport() {
    const fileInput = document.getElementById('data-import-file');
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.click();
  }

  function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = function () {
      showToast(t('dataImportReadError', 'Failed to read file.'), 'error');
    };
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        const validation = validateImportData(parsed);
        if (!validation.valid) {
          showToast(validation.error, 'error');
          return;
        }
        showImportDialog(parsed.data);
      } catch (err) {
        console.warn('[data-manager] JSON parse error during import:', err);
        showToast(t('dataImportParseError', 'Invalid JSON file.'), 'error');
      }
    };
    reader.readAsText(file);
  }

  function showImportDialog(importedData) {
    let dialog = document.getElementById('data-import-dialog');
    if (!dialog) return;

    // Clone to clear old listeners
    const newDialog = dialog.cloneNode(true);
    dialog.parentNode.replaceChild(newDialog, dialog);
    dialog = document.getElementById('data-import-dialog');

    const overlay = dialog.querySelector('.ai-confirm-overlay');
    const cancelBtn = dialog.querySelector('.ai-confirm-cancel');
    const mergeBtn = document.getElementById('data-import-merge-btn');
    const replaceBtn = document.getElementById('data-import-replace-btn');

    dialog.classList.add('ai-confirm-open');

    requestAnimationFrame(function () {
      const firstBtn = dialog.querySelector('button');
      if (firstBtn) firstBtn.focus();
    });

    const cleanup = function () {
      mergeBtn.removeEventListener('click', handleMerge);
      replaceBtn.removeEventListener('click', handleReplace);
      cancelBtn.removeEventListener('click', handleCancel);
      overlay.removeEventListener('click', handleCancel);
      dialog.removeEventListener('keydown', handleKeydown);
    };

    const hideDialog = function () {
      dialog.classList.remove('ai-confirm-open');
      cleanup();
    };

    const handleKeydown = function (e) {
      if (e.key === 'Escape') handleCancel();
    };

    const applyData = function (mode) {
      const keys = Object.keys(importedData);
      let count = 0;

      // In replace mode, clear any EXPORT_KEYS not present in importedData
      let hasWriteErrors = false;
      if (mode === 'replace') {
        const keysToRemove = EXPORT_KEYS.filter(function (k) { return !(k in importedData); });
        keysToRemove.forEach(function (key) {
          try {
            writeStorage(key, null);
          } catch (err) {
            hasWriteErrors = true;
            console.warn('[data-manager] Failed to remove key "' + key + '" during replace:', err);
          }
        });
      }

      keys.forEach(function (key) {
        if (key.charAt(0) === '_') return; // Skip metadata keys
        try {
          if (mode === 'merge') {
            // For arrays, merge by ID where possible; for objects, shallow merge
            const current = readStorage(key);
            if (current === READ_ERROR) {
              hasWriteErrors = true;
              console.warn('[data-manager] Skipping merge for key "' + key + '": read failed');
              return;
            }
            const incoming = importedData[key];
            if (Array.isArray(incoming)) {
              if (key === 'todos' || key === 'notes') {
                // Merge by id
                const existing = Array.isArray(current) ? current.slice() : [];
                const existingIds = {};
                existing.forEach(function (item) {
                  if (item && item.id) existingIds[item.id] = true;
                });
                let added = 0;
                incoming.forEach(function (item) {
                  if (item && item.id && !existingIds[item.id]) {
                    existing.push(item);
                    existingIds[item.id] = true;
                    added++;
                  }
                });
                if (added > 0) {
                  writeStorage(key, existing);
                  count++;
                }
              } else if (key === 'appOrder') {
                // Merge appOrder: add new items not already present
                const currentOrder = Array.isArray(current) ? current.slice() : [];
                const orderSet = {};
                currentOrder.forEach(function (id) { orderSet[id] = true; });
                let addedOrder = 0;
                incoming.forEach(function (id) {
                  if (!orderSet[id]) {
                    currentOrder.push(id);
                    orderSet[id] = true;
                    addedOrder++;
                  }
                });
                if (addedOrder > 0) {
                  writeStorage(key, currentOrder);
                  count++;
                }
              } else if (key === 'customApps') {
                // Merge customApps by id
                const currentApps = Array.isArray(current) ? current.slice() : [];
                const appIds = {};
                currentApps.forEach(function (app) {
                  if (app && app.id) appIds[app.id] = true;
                });
                let addedApps = 0;
                incoming.forEach(function (app) {
                  if (app && app.id && !appIds[app.id]) {
                    currentApps.push(app);
                    appIds[app.id] = true;
                    addedApps++;
                  }
                });
                if (addedApps > 0) {
                  writeStorage(key, currentApps);
                  count++;
                }
              } else if (key === 'appFolders') {
                // Merge folders by id
                const currentFolders = Array.isArray(current) ? current.slice() : [];
                const folderIds = {};
                currentFolders.forEach(function (f) {
                  if (f && f.id) folderIds[f.id] = true;
                });
                let addedFolders = 0;
                incoming.forEach(function (f) {
                  if (f && f.id && !folderIds[f.id]) {
                    currentFolders.push(f);
                    folderIds[f.id] = true;
                    addedFolders++;
                  }
                });
                if (addedFolders > 0) {
                  writeStorage(key, currentFolders);
                  count++;
                }
              } else if (key === 'ai_conversations') {
                // Merge conversations by id
                const currentConvs = Array.isArray(current) ? current.slice() : [];
                const convIds = {};
                currentConvs.forEach(function (c) {
                  if (c && c.id) convIds[c.id] = true;
                });
                let addedConvs = 0;
                incoming.forEach(function (c) {
                  if (c && c.id && !convIds[c.id]) {
                    currentConvs.push(c);
                    convIds[c.id] = true;
                    addedConvs++;
                  }
                });
                if (addedConvs > 0) {
                  writeStorage(key, currentConvs);
                  count++;
                }
              } else {
                // Generic array merge (concatenate unique)
                const existingArr = Array.isArray(current) ? current.slice() : [];
                const seen = {};
                existingArr.forEach(function (item) {
                  const id = item && item.id ? item.id : JSON.stringify(item);
                  seen[id] = true;
                });
                const merged = existingArr.slice();
                incoming.forEach(function (item) {
                  const id = item && item.id ? item.id : JSON.stringify(item);
                  if (!seen[id]) {
                    merged.push(item);
                    seen[id] = true;
                  }
                });
                writeStorage(key, merged);
                count++;
              }
            } else if (typeof incoming === 'object' && incoming !== null && !Array.isArray(incoming)) {
              // Object: shallow merge
              const currentObj = (typeof current === 'object' && current !== null && !Array.isArray(current)) ? Object.assign({}, current) : {};
              writeStorage(key, Object.assign(currentObj, incoming));
              count++;
            } else {
              // Scalar: overwrite
              writeStorage(key, incoming);
              count++;
            }
          } else {
            // Replace: overwrite directly
            writeStorage(key, importedData[key]);
            count++;
          }
        } catch (err) {
          hasWriteErrors = true;
          console.warn('[data-manager] Failed to apply key "' + key + '":', err);
        }
      });

      // Update todo reminders after import
      if (typeof window.scheduleTodoReminderCheck === 'function') {
        window.scheduleTodoReminderCheck();
      }

      // Refresh the UI
      if (typeof window.initSettings === 'function') {
        window.initSettings();
      }

      if (hasWriteErrors) {
        showToast(t('dataImportPartialSuccess', 'Import completed with some errors.'), 'warning');
      } else {
        const msg = mode === 'merge'
          ? t('dataImportMergeSuccess', 'Merged {count} settings successfully.').replace('{count}', count)
          : t('dataImportReplaceSuccess', 'Replaced all settings with imported data.');
        showToast(msg, 'success');
      }
    };

    const handleMerge = function () {
      applyData('merge');
      hideDialog();
    };

    const handleReplace = function () {
      applyData('replace');
      hideDialog();
    };

    const handleCancel = function () {
      hideDialog();
    };

    mergeBtn.addEventListener('click', handleMerge);
    replaceBtn.addEventListener('click', handleReplace);
    cancelBtn.addEventListener('click', handleCancel);
    overlay.addEventListener('click', handleCancel);
    dialog.addEventListener('keydown', handleKeydown);
  }

  // --- Init ---

  function initDataManager() {
    const exportBtn = document.getElementById('data-export-btn');
    const importBtn = document.getElementById('data-import-btn');
    const importFileInput = document.getElementById('data-import-file');

    if (exportBtn) exportBtn.addEventListener('click', exportAllData);
    if (importBtn) importBtn.addEventListener('click', triggerImport);
    if (importFileInput) importFileInput.addEventListener('change', handleImportFile);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDataManager);
  } else {
    initDataManager();
  }

  window.DataManager = {
    exportAllData: exportAllData,
    triggerImport: triggerImport,
    initDataManager: initDataManager,
    EXPORT_KEYS: EXPORT_KEYS,
    EXPECTED_SHAPES: EXPECTED_SHAPES,
    validateImportData: validateImportData
  };

})();
