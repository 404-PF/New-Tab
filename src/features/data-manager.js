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
    'updateCheckEnabled'
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
    } catch (_e) {
      return fallback;
    }
  }

  function readStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      // Detect JSON-encoded values (arrays, objects, booleans stored as JSON)
      if (typeof raw === 'string' && (raw.charAt(0) === '[' || raw.charAt(0) === '{')) {
        return parseJsonSafe(raw, raw);
      }
      return raw;
    } catch (_e) {
      return null;
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
    EXPORT_KEYS.forEach(function (key) {
      const val = readStorage(key);
      if (val !== null) {
        data[key] = val;
      }
    });

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

  function validateImportData(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: t('dataImportInvalidFile', 'Invalid file format.') };
    if (!data.data || typeof data.data !== 'object') return { valid: false, error: t('dataImportInvalidStructure', 'Missing data section.') };
    if (data.version !== 1) return { valid: false, error: t('dataImportUnsupportedVersion', 'Unsupported backup version.') };
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
      } catch (_err) {
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

      keys.forEach(function (key) {
        if (key.charAt(0) === '_') return; // Skip metadata keys
        if (mode === 'merge') {
          // For arrays, merge by ID where possible; for objects, shallow merge
          const current = readStorage(key);
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
                  addedFolders++;
                }
              });
              if (addedFolders > 0) {
                writeStorage(key, currentFolders);
                count++;
              }
            } else if (key === 'customShortcuts') {
              // Merge shortcuts by key
              const currentShortcuts = (typeof current === 'object' && current !== null) ? Object.assign({}, current) : {};
              const mergedShortcuts = Object.assign({}, currentShortcuts, incoming);
              writeStorage(key, mergedShortcuts);
              count++;
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
      });

      // Update todo reminders after import
      if (typeof window.scheduleTodoReminderCheck === 'function') {
        window.scheduleTodoReminderCheck();
      }

      // Refresh the UI
      if (typeof window.initSettings === 'function') {
        window.initSettings();
      }

      const msg = mode === 'merge'
        ? t('dataImportMergeSuccess', 'Merged {count} settings successfully.').replace('{count}', count)
        : t('dataImportReplaceSuccess', 'Replaced all settings with imported data.');
      showToast(msg, 'success');
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
    initDataManager: initDataManager
  };

})();
