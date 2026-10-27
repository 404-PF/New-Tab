// src/features/data-manager.js - Full settings import/export

(function () {

  // Keys included in export. Excludes transient/derived keys:
  //   iconCache_* (dynamic, derived from apps)
  //   todoReminderNotified (service-worker only, transient)
  //   warnedInvalidDueDates (service-worker only, transient)
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
    'extraTimeZones',
    'dateColor',
    'dateFont',
    'dateSize',
    'dateFormat',
    'videoAutoplay',
    'videoMuted',
    'videoPauseHidden',
    'bgOverlayOpacity',
    'bgOverlayBlur',
    'bgTint',
    'bgTintStrength',
    'bgRotationEnabled',
    'bgRotationInterval',
    'bgRotationSelection',
    'todos',
    'todoEnabled',
    'todoReminderEnabled',
    'todoReminderLeadTime',
    'todoStats',
    'todoStatsEnabled',
    'pomodoroStats',
    'pomodoroStatsEnabled',
    'notes',
    'notesEnabled',
    'appOrder',
    'customApps',
    'appFolders',
    'hiddenDefaultApps',
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
    'pomodoro',
    'eyeCareReminder',
    'games_enabled',
    'ai_conversations',
    'ai_current_conversation_id',
    'updateCheckEnabled',
    'searchProvider',
    'searchHistoryEnabled',
    'customSearchProviders',
    'focusMode',
    'autoTheme',
    'autoThemeLightTime',
    'autoThemeDarkTime',
    'aiGroundWithWeb'
  ];

  // Object keys whose storage entries mix persistent settings with transient
  // runtime state. Exports and imports keep only the listed fields so stale
  // timer bookkeeping is never replayed from a backup.
  const PERSISTENT_OBJECT_FIELDS = {
    eyeCareReminder: ['enabled', 'intervalMinutes', 'browserNotification']
  };

  // Returns value unchanged except for keys in PERSISTENT_OBJECT_FIELDS,
  // where only the persistent fields survive; null when nothing survives so
  // callers treat the entry as absent.
  function pickPersistentFields(key, value) {
    const fields = PERSISTENT_OBJECT_FIELDS[key];
    if (!fields || typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }
    const picked = {};
    fields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(value, field)) {
        picked[field] = value[field];
      }
    });
    return Object.keys(picked).length > 0 ? picked : null;
  }

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
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.warn('[data-manager] showToast unavailable; message dropped:', message);
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
      // Check the expected shape before interpreting container-looking strings.
      // Scalar string settings must remain strings even when they begin with '[' or '{'.
      const validator = EXPECTED_SHAPES[key];
      // validator('') is true for free-form strings. bgTint is still a string,
      // but its shape check rejects anything that is not #rrggbb, including ''.
      const shouldBeString = Boolean(validator) && (validator('') === true || key === 'bgTint');
      if (shouldBeString) {
        return raw;
      }

      // Detect JSON-encoded values (arrays, objects stored as JSON)
      if (typeof raw === 'string' && raw.charAt(0) === '[') {
        return parseJsonSafe(raw, []);
      }
      if (typeof raw === 'string' && raw.charAt(0) === '{') {
        return parseJsonSafe(raw, {});
      }

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

  // Bridge setItem returns false on a rejected write; native returns undefined.
  function isWriteAccepted(result) {
    return result !== false;
  }

  // Each import collects the results of its own writes. The storage bridge
  // accepts writes optimistically and can still fail asynchronously
  // (chrome.storage runtime.lastError), so applyData waits for these results
  // before it reports success.
  function trackImportWrite(pendingWrites, key, promise) {
    if (!pendingWrites) return;
    pendingWrites.push(Promise.resolve(promise).then(function (ok) {
      if (!isWriteAccepted(ok)) {
        console.warn('[data-manager] Storage write was not persisted for key "' + key + '"');
      }
      return isWriteAccepted(ok);
    }, function (err) {
      console.warn('[data-manager] Failed to persist key "' + key + '":', err);
      return false;
    }));
  }

  // If a chrome.storage callback never fires, stop waiting after this long
  // and report the import as partial so the UI still refreshes.
  const DEFAULT_IMPORT_WRITE_TIMEOUT_MS = 10000;

  function getImportWriteTimeoutMs() {
    const configured = window.DataManager && window.DataManager.importWriteTimeoutMs;
    return typeof configured === 'number' && configured >= 0 ? configured : DEFAULT_IMPORT_WRITE_TIMEOUT_MS;
  }

  function waitForImportWrites(pendingWrites) {
    if (pendingWrites.length === 0) return Promise.resolve(true);
    let timer = null;
    let timedOut = false;
    const timeout = new Promise(function (resolve) {
      timer = setTimeout(function () {
        timedOut = true;
        console.warn('[data-manager] Timed out waiting for import writes to persist');
        resolve(false);
      }, getImportWriteTimeoutMs());
    });
    const all = Promise.all(pendingWrites).then(function (results) {
      const failed = results.filter(function (ok) { return !ok; }).length;
      if (timedOut && failed > 0) {
        // The import already reported after the timeout; these failures
        // arrived later, so tell the user again instead of only logging.
        console.warn('[data-manager] ' + failed + ' import write(s) failed after the import had already reported');
        showToast(t('dataImportLateWriteFailure', 'Some imported data failed to save after the import finished.'), 'warning');
      }
      return failed === 0;
    });
    return Promise.race([all, timeout]).then(function (allPersisted) {
      clearTimeout(timer);
      return allPersisted;
    });
  }

  function writeStorage(key, value, pendingWrites) {
    try {
      if (value === null || value === undefined) {
        if (typeof localStorage.removeItemAsync === 'function') {
          trackImportWrite(pendingWrites, key, localStorage.removeItemAsync(key));
        } else {
          localStorage.removeItem(key);
        }
        // removeItem reports nothing; confirm the key is really gone.
        if (localStorage.getItem(key) !== null) {
          throw new Error('Storage removal was not accepted for key "' + key + '"');
        }
        return;
      }

      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (typeof localStorage.setItemAsync === 'function') {
        trackImportWrite(pendingWrites, key, localStorage.setItemAsync(key, serialized));
        if (localStorage.getItem(key) !== serialized) {
          throw new Error('Storage write was not accepted for key "' + key + '"');
        }
        return;
      }
      if (!isWriteAccepted(localStorage.setItem(key, serialized))) {
        throw new Error('Storage write was not accepted for key "' + key + '"');
      }
    } catch (err) {
      console.warn('[data-manager] Failed to write key "' + key + '":', err);
      throw err;
    }
  }

  function finishImport(mode, count, hasWriteErrors) {
    // Reload in-memory todo state and re-render the todo list, notes
    // scratchpad, and app grid so imported data appears without a tab
    // reload (issue #824).
    if (typeof window.reloadTodosState === 'function') {
      window.reloadTodosState();
    }
    if (typeof window.initNotes === 'function') {
      window.initNotes();
    }
    if (typeof window.renderAllApps === 'function') {
      window.renderAllApps();
    }

    // Refresh the UI
    if (typeof window.initSettings === 'function') {
      window.initSettings();
    }

    // Re-render the custom background thumbnails and re-apply the homepage
    // background so a restore shows the uploads in Settings → Background and
    // renders the selected one without a tab reload (issue #996).
    if (window._customBackgrounds && typeof window._customBackgrounds.render === 'function') {
      const rendered = window._customBackgrounds.render();
      if (rendered && typeof rendered.catch === 'function') {
        // The real render surfaces its own error toast; keep a stray stub
        // rejection from becoming an unhandled promise rejection here.
        rendered.catch(function () {});
      }
    }
    if (typeof window.applyBg === 'function') {
      window.applyBg();
    }

    // Re-apply simple mode so the imported simpleMode flag toggles the body
    // class and header checkbox without a tab reload (issue #837).
    if (typeof window.applySimpleMode === 'function') {
      window.applySimpleMode();
    }

    // Refresh timezone views after merge/replace
    if (typeof window.renderExtraClocks === 'function') {
      window.renderExtraClocks();
    }
    if (typeof window.renderTimezoneCurrentList === 'function') {
      window.renderTimezoneCurrentList();
    }

    // Re-read the cached clock/date display settings so an import that
    // changed clockFormat, dateFormat, or the language repaints the clock
    // immediately instead of waiting for the next minute tick.
    if (typeof window.refreshClockSettings === 'function') {
      window.refreshClockSettings();
    }
    if (typeof window.updateTime === 'function') {
      window.updateTime();
    }

    // Reinitialize the search provider bar so imported providers/selection take effect live
    if (typeof window.refreshProviderBar === 'function') {
      window.refreshProviderBar();
    }
    if (typeof window.renderCustomSearchProvidersList === 'function') {
      window.renderCustomSearchProvidersList();
    }

    // Re-apply focus mode and re-sync auto-theme so the imported values take
    // effect without a tab reload (issue #838). refreshAutoTheme also stops
    // the scheduler when a replace-mode import cleared the autoTheme key.
    if (typeof window.applyFocusMode === 'function') {
      window.applyFocusMode();
    }
    if (typeof window.refreshAutoTheme === 'function') {
      window.refreshAutoTheme();
    }

    // Re-sync the AI "Ground with web" checkbox so an import that changed
    // aiGroundWithWeb updates the visible toggle without a tab reload
    // (issue #1003).
    if (typeof window.refreshWebGroundingControl === 'function') {
      window.refreshWebGroundingControl();
    }

    // Schedule todo reminders last so the service-worker payload is built
    // from the freshly reloaded todos, not the pre-import in-memory array.
    if (typeof window.scheduleTodoReminderCheck === 'function') {
      window.scheduleTodoReminderCheck();
    }

    if (hasWriteErrors) {
      showToast(t('dataImportPartialSuccess', 'Import completed with some errors.'), 'warning');
    } else {
      const msg = mode === 'merge'
        ? t('dataImportMergeSuccess', 'Merged {count} settings successfully.').replace('{count}', count)
        : t('dataImportReplaceSuccess', 'Replaced all settings with imported data.');
      showToast(msg, 'success');
    }
  }

  // --- Custom background media from IndexedDB ---
  //
  // Exports embed each upload's media as a base64 data URL inside the
  // `_customBackgroundsMetadata` record so a backup can migrate devices
  // (issue #996). The `_` prefix still never reaches localStorage: import
  // validates this record explicitly and writes the blobs back to IndexedDB
  // before any settings key is applied.

  // Raw-byte caps, checked before encoding on export and against the decoded
  // payload on import. base64 adds ~33% on top of these numbers. Tests can
  // override them on window.DataManager.
  const DEFAULT_MAX_MEDIA_BYTES_PER_RECORD = 20 * 1024 * 1024;
  const DEFAULT_MAX_MEDIA_BYTES_TOTAL = 60 * 1024 * 1024;

  function getMaxMediaBytesPerRecord() {
    const configured = window.DataManager && window.DataManager.maxMediaBytesPerRecord;
    return typeof configured === 'number' && configured >= 0
      ? configured
      : DEFAULT_MAX_MEDIA_BYTES_PER_RECORD;
  }

  function getMaxMediaBytesTotal() {
    const configured = window.DataManager && window.DataManager.maxMediaBytesTotal;
    return typeof configured === 'number' && configured >= 0
      ? configured
      : DEFAULT_MAX_MEDIA_BYTES_TOTAL;
  }

  // data:<mime>;base64,<payload> with a non-empty MIME type and a
  // syntactically base64 payload. Anchored, so it doubles as format
  // validation for media payloads read from a backup.
  const MEDIA_DATA_URL_PATTERN = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/;

  function base64ByteLength(base64) {
    const padding = base64.slice(-2) === '=='
      ? 2
      : (base64.slice(-1) === '=' ? 1 : 0);
    return Math.floor(base64.length * 3 / 4) - padding;
  }

  // atob rejects payloads with a bad length or misplaced padding even though
  // MEDIA_DATA_URL_PATTERN accepts them. Decoding here guarantees that
  // dataUrlToBlob will not throw while restoring a backup.
  function isValidBase64Payload(payload) {
    try {
      atob(payload);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Failed to encode media')); };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const match = MEDIA_DATA_URL_PATTERN.exec(dataUrl);
    if (!match) throw new Error('Invalid media data URL');
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: match[1] });
  }

  function getCustomBackgroundsMetadata() {
    if (!window._customBackgrounds || typeof window._customBackgrounds.getAll !== 'function') {
      return Promise.resolve({ entries: [], mediaSkipped: 0 });
    }
    return window._customBackgrounds.getAll().then(function (bgs) {
      if (!Array.isArray(bgs)) return { entries: [], mediaSkipped: 0 };
      let totalBytes = 0;
      let mediaSkipped = 0;
      const maxPerRecord = getMaxMediaBytesPerRecord();
      const maxTotal = getMaxMediaBytesTotal();
      const pending = bgs.map(function (bg) {
        const entry = {
          id: bg.id,
          title: bg.title,
          type: bg.type,
          timestamp: bg.timestamp,
          thumb: bg.thumb
        };
        const data = bg.data;
        const usable = data && typeof data.size === 'number' && typeof data.type === 'string' && data.type !== '';
        // Oversized (per record or total) or unreadable media is skipped with
        // a warning instead of failing the whole export.
        if (!usable || data.size > maxPerRecord || totalBytes + data.size > maxTotal) {
          mediaSkipped++;
          return Promise.resolve(entry);
        }
        totalBytes += data.size;
        return blobToDataUrl(data).then(function (dataUrl) {
          entry.media = dataUrl;
          return entry;
        }).catch(function (error) {
          console.warn('[data-manager] Failed to encode custom background media:', error);
          totalBytes -= data.size;
          mediaSkipped++;
          return entry;
        });
      });
      return Promise.all(pending).then(function (entries) {
        return { entries: entries, mediaSkipped: mediaSkipped };
      });
    }).catch(function (error) {
      console.error('[data-manager] Failed to read custom background metadata:', error);
      throw error;
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
      if (val === null) {
        return;
      }
      // A cleared time input stores ''; skip so the backup stays importable
      // (the import validator rejects empty schedule values).
      if (val === '' && (key === 'autoThemeLightTime' || key === 'autoThemeDarkTime')) {
        return;
      }
      const persistentVal = pickPersistentFields(key, val);
      if (persistentVal !== null) {
        data[key] = sanitizeExportValue(key, persistentVal);
      }
    });

    if (hasReadError) {
      showToast(t('dataExportReadError'), 'error');
      return;
    }

    // Custom backgrounds travel with the backup: metadata plus base64 media
    // for every upload that fits the size caps.
    getCustomBackgroundsMetadata().then(function (result) {
      if (result.entries.length > 0) {
        data._customBackgroundsMetadata = result.entries;
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

      if (result.mediaSkipped > 0) {
        showToast(t('dataExportMediaSkipped', 'Backup created, but some custom background media could not be included.'), 'warning');
      } else {
        showToast(t('dataExportSuccess', 'Data exported successfully.'), 'success');
      }
    }).catch(function (error) {
      console.error('[data-manager] Failed to export data:', error);
      showToast(t('dataExportReadError', 'Export failed: could not read all settings.'), 'error');
    });
  }

  // --- Validation ---

  function integerInRange(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function isValidISODate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const parts = key.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    // Compare calendar components in UTC. A local Date rejects real keys:
    // local midnight shifts to the previous day in positive UTC offsets,
    // Pacific/Apia has no civil 2011-12-30, and years 0000-0099 are mapped
    // to 1900-1999. setUTCFullYear applies the parsed year as-is.
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCFullYear(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return false;
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  }

  function isNonNegativeInteger(n) {
    return Number.isInteger(n) && n >= 0;
  }

  function isValidDayEntry(val) {
    if (typeof val === 'number') return isNonNegativeInteger(val);
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return isNonNegativeInteger(val.sessions) && isNonNegativeInteger(val.minutes);
    }
    return false;
  }

  function isValidByDateTodosMap(map) {
    if (typeof map !== 'object' || map === null || Array.isArray(map)) return false;
    for (const entry of Object.entries(map)) {
      if (typeof entry[0] !== 'string' || entry[0].length === 0) return false;
      if (!isNonNegativeInteger(entry[1])) return false;
    }
    return true;
  }

  function isValidPomodoroByDateTodos(byDateTodos) {
    if (typeof byDateTodos !== 'object' || byDateTodos === null || Array.isArray(byDateTodos)) return false;
    for (const entry of Object.entries(byDateTodos)) {
      if (!isValidISODate(entry[0])) return false;
      if (!isValidByDateTodosMap(entry[1])) return false;
    }
    return true;
  }

  function isValidFolderEntry(folder) {
    if (typeof folder !== 'object' || folder === null || Array.isArray(folder)) return false;
    if (typeof folder.id !== 'string' || folder.id.trim() === '') return false;
    if (typeof folder.name !== 'string' || folder.name.trim() === '') return false;
    if (!Array.isArray(folder.apps)) return false;
    const seenAppIds = new Set();
    return folder.apps.every(function (appId) {
      if (typeof appId !== 'string' || appId.trim() === '' || seenAppIds.has(appId)) return false;
      seenAppIds.add(appId);
      return true;
    });
  }

  /** Validates an AI conversation before accepting it from backup data. */
  function isValidAIConversation(conversation) {
    const validator = window.isValidConversation;
    if (typeof validator !== 'function') return false;
    return validator(conversation);
  }

  function sanitizeExportValue(key, value) {
    if (key === 'appFolders' && Array.isArray(value)) {
      return value.filter(isValidFolderEntry);
    }
    return value;
  }

  const EXPECTED_SHAPES = {
    theme: function (v) { return typeof v === 'string'; },
    language: function (v) { return typeof v === 'string'; },
    simpleMode: function (v) { return typeof v === 'boolean'; },
    homepageBg: function (v) { return typeof v === 'string'; },
    clockColor: function (v) { return typeof v === 'string'; },
    clockFont: function (v) { return typeof v === 'string'; },
    clockSize: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    clockFormat: function (v) { return typeof v === 'string'; },
    extraTimeZones: function (v) {
      if (!Array.isArray(v) || v.length > (window.MAX_TIMEZONES || 5)) return false;
      const supportedZones = window.POPULAR_ZONES || [];
      const seen = {};
      return v.every(function (item) {
        if (typeof item !== 'string' || seen[item]) return false;
        const supported = supportedZones.some(function (zone) { return zone.id === item; });
        if (!supported) return false;
        seen[item] = true;
        return true;
      });
    },
    dateColor: function (v) { return typeof v === 'string'; },
    dateFont: function (v) { return typeof v === 'string'; },
    dateSize: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    dateFormat: function (v) { return typeof v === 'string'; },
    videoAutoplay: function (v) { return typeof v === 'boolean'; },
    videoMuted: function (v) { return typeof v === 'boolean'; },
    videoPauseHidden: function (v) { return typeof v === 'boolean'; },
    bgOverlayOpacity: function (v) { return integerInRange(v, 0, 80); },
    bgOverlayBlur: function (v) { return integerInRange(v, 0, 12); },
    bgTint: function (v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); },
    bgTintStrength: function (v) { return integerInRange(v, 0, 50); },
    bgRotationEnabled: function (v) { return typeof v === 'boolean'; },
    bgRotationInterval: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    bgRotationSelection: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'string'; }); },
    todos: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    todoEnabled: function (v) { return typeof v === 'boolean'; },
    todoReminderEnabled: function (v) { return typeof v === 'boolean'; },
    todoReminderLeadTime: function (v) { return typeof v === 'string' || typeof v === 'number'; },
    todoStats: function (v) { return typeof v === 'object' && v !== null && !Array.isArray(v); },
    todoStatsEnabled: function (v) { return typeof v === 'boolean'; },
    pomodoroStats: function (v) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
      if (typeof v.days !== 'object' || v.days === null || Array.isArray(v.days)) return false;
      for (const entry of Object.entries(v.days)) {
        if (!isValidISODate(entry[0])) return false;
        if (!isValidDayEntry(entry[1])) return false;
      }
      if (v.byDateTodos !== undefined && !isValidPomodoroByDateTodos(v.byDateTodos)) return false;
      return true;
    },
    pomodoroStatsEnabled: function (v) { return typeof v === 'boolean'; },
    notes: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    notesEnabled: function (v) { return typeof v === 'boolean'; },
    appOrder: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'string'; }); },
    customApps: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'object' && item !== null && typeof item.id === 'string'; }); },
    appFolders: function (v) { return Array.isArray(v) && v.every(isValidFolderEntry); },
    hiddenDefaultApps: function (v) { return Array.isArray(v) && v.every(function (item) { return typeof item === 'string'; }); },
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
    pomodoro: function (v) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;

      return typeof v.enabled === 'boolean' &&
        integerInRange(v.workDuration, 1, 120) &&
        integerInRange(v.shortBreakDuration, 1, 30) &&
        integerInRange(v.longBreakDuration, 1, 60) &&
        integerInRange(v.sessionsBeforeLongBreak, 1, 10);
    },
    eyeCareReminder: function (v) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;

      return typeof v.enabled === 'boolean' &&
        [15, 20, 30, 45, 60].indexOf(v.intervalMinutes) !== -1 &&
        typeof v.browserNotification === 'boolean';
    },
    games_enabled: function (v) { return typeof v === 'boolean'; },
    /** Validates the persisted AI conversation collection in a backup. */
    ai_conversations: function (v) {
      return Array.isArray(v) && v.every(isValidAIConversation);
    },
    ai_current_conversation_id: function (v) { return typeof v === 'string'; },
    aiGroundWithWeb: function (v) { return typeof v === 'boolean'; },
    updateCheckEnabled: function (v) { return typeof v === 'boolean'; },
    searchProvider: function (v) { return typeof v === 'string'; },
    searchHistoryEnabled: function (v) { return typeof v === 'boolean'; },
    customSearchProviders: function (v) {
      if (!Array.isArray(v)) return false;
      const builtInIds = window.BUILT_IN_PROVIDERS ? Object.keys(window.BUILT_IN_PROVIDERS) : [];
      const builtInBangCodes = window.SEARCH_BANGS ? Object.keys(window.SEARCH_BANGS) : ['g', 'b', 'd', 'w', 'yt'];
      const getProviderCode = window.getCustomProviderCode;
      const seenIds = {};
      const seenBangCodes = {};
      return v.every(function (item) {
        if (typeof item !== 'object' || item === null) return false;
        if (typeof item.id !== 'string' || !item.id.trim()) return false;
        if (builtInIds.indexOf(item.id) !== -1) return false;
        if (seenIds[item.id]) return false;
        seenIds[item.id] = true;
        if (typeof item.name !== 'string' || !item.name.trim()) return false;
        if (Object.prototype.hasOwnProperty.call(item, 'code')) {
          if (typeof getProviderCode !== 'function') return false;
          const code = getProviderCode(item);
          if (!code || builtInBangCodes.indexOf(code) !== -1 || seenBangCodes[code]) return false;
          seenBangCodes[code] = true;
        }
        if (typeof item.url !== 'string' || !item.url.includes('{query}')) return false;
        try {
          const parsed = new URL(item.url);
          return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
        } catch {
          return false;
        }
      });
    },
    focusMode: function (v) { return typeof v === 'boolean'; },
    autoTheme: function (v) { return typeof v === 'boolean'; },
    // HH:MM as produced by the time inputs (two-digit hour, since
    // type="time" clears a single-digit value like 7:00); rejects '' so an
    // empty schedule never round-trips (the 07:00/19:00 defaults would
    // replace it anyway).
    autoThemeLightTime: function (v) { return typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v); },
    autoThemeDarkTime: function (v) { return typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v); }
  };

  // Shape and media-size validation for the `_customBackgroundsMetadata`
  // record. Entries without `media` are legacy v1 metadata and stay valid so
  // older backups keep importing exactly as before; only `_`-prefixed keys
  // bypass the per-key allowlist/shape sweep above. Ids must carry the
  // `custom_` prefix because that is the only form settings.js recognizes as
  // a custom background; anything else would be stored but never applied.
  function validateCustomBackgroundsMetadata(entries) {
    const invalidShape = {
      valid: false,
      error: t('dataImportInvalidCustomBackgrounds', 'The backup contains invalid custom background data.')
    };
    if (!Array.isArray(entries)) return invalidShape;
    let totalBytes = 0;
    const maxPerRecord = getMaxMediaBytesPerRecord();
    const maxTotal = getMaxMediaBytesTotal();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return invalidShape;
      if (typeof entry.id !== 'string' || !entry.id.startsWith('custom_')) return invalidShape;
      if (typeof entry.type !== 'string' || entry.type.trim() === '') return invalidShape;
      if (entry.title !== undefined && typeof entry.title !== 'string') return invalidShape;
      if (entry.thumb !== undefined && typeof entry.thumb !== 'string') return invalidShape;
      if (entry.timestamp !== undefined && typeof entry.timestamp !== 'number') return invalidShape;
      if (entry.media === undefined) continue;
      const match = typeof entry.media === 'string' ? MEDIA_DATA_URL_PATTERN.exec(entry.media) : null;
      if (!match || (!(base64ByteLength(match[2]) > maxPerRecord
        || totalBytes + base64ByteLength(match[2]) > maxTotal)
        && !isValidBase64Payload(match[2]))) {
        return {
          valid: false,
          error: t('dataImportInvalidMedia', 'A custom background in this backup has invalid media data.')
        };
      }
      const bytes = base64ByteLength(match[2]);
      if (bytes > maxPerRecord || totalBytes + bytes > maxTotal) {
        return {
          valid: false,
          error: t('dataImportMediaTooLarge', 'A custom background in this backup exceeds the size limit.')
        };
      }
      totalBytes += bytes;
    }
    return { valid: true };
  }

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
    if (Object.prototype.hasOwnProperty.call(data.data, '_customBackgroundsMetadata')) {
      const mediaValidation = validateCustomBackgroundsMetadata(data.data._customBackgroundsMetadata);
      if (!mediaValidation.valid) return mediaValidation;
    }
    return { valid: true };
  }

  // --- Import ---

  // Writes the backup's custom background blobs back into the
  // customBackgrounds/customBackgroundsMeta stores. Runs before any settings
  // key is applied so `homepageBg` never points at a `custom_*` id whose
  // media is still missing (issue #996). Entries without `media` (legacy v1
  // backups) are left alone; they restore exactly as they did before.
  function restoreCustomBackgroundMedia(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return Promise.resolve(true);
    const restorable = entries.filter(function (entry) {
      return entry && typeof entry.media === 'string';
    });
    if (restorable.length === 0) return Promise.resolve(true);
    const save = window._customBackgrounds && typeof window._customBackgrounds.save === 'function'
      ? window._customBackgrounds.save
      : null;
    if (!save) {
      console.warn('[data-manager] Custom background media skipped: no IndexedDB write API available');
      return Promise.resolve(false);
    }
    const writes = restorable.map(function (entry) {
      return Promise.resolve().then(function () {
        return save({
          id: entry.id,
          title: entry.title,
          type: entry.type,
          data: dataUrlToBlob(entry.media),
          thumb: entry.thumb,
          timestamp: entry.timestamp
        });
      });
    });
    return Promise.all(writes).then(function () {
      return true;
    }).catch(function (error) {
      console.warn('[data-manager] Failed to restore custom background media:', error);
      return false;
    });
  }

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

    // Writes the settings keys themselves. Runs only after the backup's
    // custom background media has been restored to IndexedDB, so an imported
    // `homepageBg` never references a `custom_*` id whose blob is missing.
    // When that restore failed (`mediaRestored` false) the custom
    // `homepageBg` is skipped so the current value survives instead of
    // pointing at a blob that was never written.
    const applySettingsKeys = function (mode, mediaRestored) {
      const keys = Object.keys(importedData);
      let count = 0;
      const pendingWrites = [];

      // In replace mode, clear any EXPORT_KEYS not present in importedData
      let hasWriteErrors = !mediaRestored;
      if (mode === 'replace') {
        const keysToRemove = EXPORT_KEYS.filter(function (k) { return !(k in importedData); });
        keysToRemove.forEach(function (key) {
          try {
            writeStorage(key, null, pendingWrites);
          } catch (err) {
            hasWriteErrors = true;
            console.warn('[data-manager] Failed to remove key "' + key + '" during replace:', err);
          }
        });
      }

      keys.forEach(function (key) {
        if (key.charAt(0) === '_') return; // Skip metadata keys
        try {
          // Drop transient runtime state mixed into settings objects
          const importedValue = pickPersistentFields(key, importedData[key]);
          if (importedValue === null) return;
          // Media restore failed: a custom homepageBg would dangle, so keep
          // the value currently in storage instead (issue #996).
          if (!mediaRestored && key === 'homepageBg'
            && typeof importedValue === 'string' && importedValue.indexOf('custom_') === 0) {
            return;
          }
          if (mode === 'merge') {
            // For arrays, merge by ID where possible; for objects, shallow merge
            const current = readStorage(key);
            if (current === READ_ERROR) {
              hasWriteErrors = true;
              console.warn('[data-manager] Skipping merge for key "' + key + '": read failed');
              return;
            }
            const incoming = importedValue;
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
                  writeStorage(key, existing, pendingWrites);
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
                  writeStorage(key, currentOrder, pendingWrites);
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
                  writeStorage(key, currentApps, pendingWrites);
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
                  writeStorage(key, currentFolders, pendingWrites);
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
                  writeStorage(key, currentConvs, pendingWrites);
                  count++;
                }
              } else if (key === 'extraTimeZones') {
                // Merge only supported, unique zones and preserve the five-zone limit.
                const maxTimeZones = window.MAX_TIMEZONES || 5;
                const supportedIds = Object.create(null);
                (window.POPULAR_ZONES || []).forEach(function (zone) {
                  supportedIds[zone.id] = true;
                });
                const mergedZones = [];
                const seenZones = Object.create(null);
                const zonesToMerge = (Array.isArray(current) ? current : []).concat(incoming);
                zonesToMerge.forEach(function (zoneId) {
                  if (mergedZones.length >= maxTimeZones || typeof zoneId !== 'string' ||
                      !supportedIds[zoneId] || seenZones[zoneId]) return;
                  seenZones[zoneId] = true;
                  mergedZones.push(zoneId);
                });
                writeStorage(key, mergedZones, pendingWrites);
                count++;
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
                writeStorage(key, merged, pendingWrites);
                count++;
              }
            } else if (typeof incoming === 'object' && incoming !== null && !Array.isArray(incoming)) {
              // Object: shallow merge
              const currentObj = (typeof current === 'object' && current !== null && !Array.isArray(current)) ? Object.assign({}, current) : {};
              if (key === 'todoStats' && currentObj.days && incoming.days) {
                // Deep-merge todoStats.days: take the higher count per date
                const mergedDays = Object.assign({}, currentObj.days);
                Object.keys(incoming.days).forEach(function (date) {
                  const localCount = mergedDays[date] || 0;
                  const incomingCount = incoming.days[date] || 0;
                  mergedDays[date] = Math.max(localCount, incomingCount);
                });
                currentObj.days = mergedDays;
                writeStorage(key, currentObj, pendingWrites);
              } else if (key === 'pomodoroStats') {
                const merged = Object.assign({}, currentObj);
                if (currentObj.days || incoming.days) {
                  const mergedDays = Object.assign({}, currentObj.days || {});
                  const incDays = incoming.days || {};
                  Object.keys(incDays).forEach(function (date) {
                    const curVal = mergedDays[date];
                    const incVal = incDays[date];
                    const curN = typeof curVal === 'number' ? { sessions: curVal, minutes: 0 } : (curVal && typeof curVal === 'object' ? curVal : { sessions: 0, minutes: 0 });
                    const incN = typeof incVal === 'number' ? { sessions: incVal, minutes: 0 } : (incVal && typeof incVal === 'object' ? incVal : { sessions: 0, minutes: 0 });
                    const cs = typeof curN.sessions === 'number' && Number.isFinite(curN.sessions) ? curN.sessions : 0;
                    const cm = typeof curN.minutes === 'number' && Number.isFinite(curN.minutes) ? curN.minutes : 0;
                    const is = typeof incN.sessions === 'number' && Number.isFinite(incN.sessions) ? incN.sessions : 0;
                    const im = typeof incN.minutes === 'number' && Number.isFinite(incN.minutes) ? incN.minutes : 0;
                    mergedDays[date] = { sessions: Math.max(cs, is), minutes: Math.max(cm, im) };
                  });
                  merged.days = mergedDays;
                }
                if (incoming.byDateTodos || currentObj.byDateTodos) {
                  const mergedTodos = Object.assign({}, currentObj.byDateTodos || {});
                  const incTodos = incoming.byDateTodos || {};
                  Object.keys(incTodos).forEach(function (date) {
                    const curMap = mergedTodos[date] && typeof mergedTodos[date] === 'object' && !Array.isArray(mergedTodos[date]) ? Object.assign({}, mergedTodos[date]) : {};
                    const incMap = incTodos[date] && typeof incTodos[date] === 'object' && !Array.isArray(incTodos[date]) ? incTodos[date] : {};
                    Object.keys(incMap).forEach(function (tid) {
                      const cv = curMap[tid];
                      const iv = incMap[tid];
                      const cn = typeof cv === 'number' && Number.isFinite(cv) ? cv : 0;
                      const inn = typeof iv === 'number' && Number.isFinite(iv) ? iv : 0;
                      curMap[tid] = Math.max(cn, inn);
                    });
                    mergedTodos[date] = curMap;
                  });
                  merged.byDateTodos = mergedTodos;
                }
                if (incoming.days === undefined && currentObj.days !== undefined) merged.days = currentObj.days;
                if (incoming.byDateTodos === undefined && currentObj.byDateTodos !== undefined) merged.byDateTodos = currentObj.byDateTodos;
                Object.keys(incoming).forEach(function (k) {
                  if (k !== 'days' && k !== 'byDateTodos') merged[k] = incoming[k];
                });
                writeStorage(key, merged, pendingWrites);
              } else {
                writeStorage(key, Object.assign(currentObj, incoming), pendingWrites);
              }
              count++;
            } else {
              // Scalar: overwrite
              writeStorage(key, incoming, pendingWrites);
              count++;
            }
          } else {
            // Replace: overwrite directly
            writeStorage(key, importedValue, pendingWrites);
            count++;
          }
        } catch (err) {
          hasWriteErrors = true;
          console.warn('[data-manager] Failed to apply key "' + key + '":', err);
        }
      });

      return waitForImportWrites(pendingWrites).then(function (allPersisted) {
        finishImport(mode, count, hasWriteErrors || !allPersisted);
      });
    };

    const applyData = function (mode) {
      // Discard in-flight debounced note saves so a pre-import edit cannot
      // overwrite the notes written by this backup (issue #824).
      if (typeof window.cancelPendingNoteSaves === 'function') {
        window.cancelPendingNoteSaves();
      }

      // Custom background media must land in IndexedDB before any settings
      // key is written (issue #996); `_`-prefixed keys never reach
      // localStorage, so this record is handled here explicitly.
      return restoreCustomBackgroundMedia(importedData._customBackgroundsMetadata).then(function (mediaRestored) {
        return applySettingsKeys(mode, mediaRestored);
      });
    };


    const handleMerge = function () {
      void applyData('merge');
      hideDialog();
    };

    const handleReplace = function () {
      void applyData('replace');
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
