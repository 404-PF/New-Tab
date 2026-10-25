// src/ai/ai-store.js - AI conversation state and persistence

const AIStore = (function() {
  function getTranslation(key) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key);
    }
    return key;
  }

  const STORAGE_KEYS = {
    conversations: 'ai_conversations',
    currentId: 'ai_current_conversation_id'
  };

  const MAX_CONVERSATIONS = 50;

  // Per-conversation message cap, applied on write (addMessageToConversation)
  // and during save-time normalization so loaded history cannot grow without
  // bound either (#947).
  const MAX_MESSAGES_PER_CONVERSATION = 200;

  // Serialized ai_conversations bound in UTF-8 bytes. chrome.storage.local is
  // capped at 10 MB, so keep AI history well below it; exceeding the bound
  // evicts the oldest messages instead of failing the save (#947).
  const MAX_SERIALIZED_BYTES = 4 * 1024 * 1024;

  // The active conversation keeps at least this many of its newest messages
  // when the size bound evicts from it, so the message the user just sent
  // always survives trimming (#947).
  const ACTIVE_MESSAGE_FLOOR = 10;

  // Payloads below this never justify a trimmed re-save after a rejected
  // write: halving them frees too little space to matter (#947).
  const MIN_QUOTA_RETRY_BYTES = 256 * 1024;

  // A rejected conversation payload is copied under one of these keys before
  // `ai_conversations` is rewritten, so fail-soft repair never destroys the
  // only copy of the data (#949). The retained copies are capped so storage
  // cannot grow without bound.
  const QUARANTINE_KEY_PREFIX = STORAGE_KEYS.conversations + '.corrupt-';
  const MAX_QUARANTINE_KEYS = 3;

  const state = {
    currentConversationId: null,
    conversations: [],
    // The conversation a request in flight writes into. switchConversation
    // can move the active id while that request is still open, and eviction
    // must not treat the request's own messages as disposable (#947).
    inFlightConversationId: null,
    isLoading: false,
    isOfflineMode: false,
    abortController: null,
    isStreaming: false,
    isUserScrolledUp: false,
    scrollThreshold: 100,
    confirmDialogCallback: null,
    searchQuery: '',
    keyboardSelectedIndex: -1,
    isCtrlPressed: false,
    hoveredDeleteBtn: null,
    hoveredDeleteTooltip: null
  };

  function generateId() {
    const randomValues = new Uint32Array(2);
    crypto.getRandomValues(randomValues);
    const randomSuffix = Array.from(randomValues, value => value.toString(36)).join('');
    return 'conv_' + Date.now() + '_' + randomSuffix;
  }

  function createNewConversation() {
    return {
      id: generateId(),
      title: getTranslation('aiNewConversation'),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /** Delegates persisted conversation validation to the shared validator. */
  function isValidConversation(conversation) {
    const validator = window.isValidConversation;
    if (typeof validator !== 'function') return false;
    return validator(conversation);
  }

  /** Applies the fresh in-memory conversation immediately so the UI can render,
   *  but holds the storage write back until the rejected payload is backed up:
   *  a rejected quarantine write must never be followed by an overwrite of
   *  `ai_conversations` (#949). Returns the settlement so callers can await it. */
  function recoverConversations(stored) {
    const previousState = createSaveSnapshot();
    const newConversation = createNewConversation();
    state.conversations = [newConversation];
    state.currentConversationId = newConversation.id;

    return settlePersistence(
      reportRejectedPayload(stored),
      backedUp => {
        if (backedUp === false) {
          console.warn('Conversation recovery was not persisted: the quarantine backup was rejected');
          return false;
        }
        return persistRecovery(previousState);
      }
    );
  }

  // Fire-and-forget save, but reported as a settlement so an awaited load also
  // waits for the recovery write to reach storage.
  function persistRecovery(previousState) {
    try {
      return settlePersistence(
        saveConversations(previousState),
        success => success !== false,
        error => {
          console.error('Unexpected conversation save rejection:', error);
          return false;
        }
      );
    } catch (error) {
      console.error('Unexpected conversation save failure:', error);
      return false;
    }
  }

  // Drop the oldest quarantine copies beyond MAX_QUARANTINE_KEYS so repeated
  // recovery cannot grow storage without bound (#949).
  function pruneQuarantineKeys() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(QUARANTINE_KEY_PREFIX)) {
          keys.push(key);
        }
      }
      if (keys.length <= MAX_QUARANTINE_KEYS) return;

      // Quarantine keys end in a millisecond timestamp, so comparing the keys
      // orders equal-length timestamps chronologically.
      keys.sort((a, b) => a.localeCompare(b));
      keys.slice(0, keys.length - MAX_QUARANTINE_KEYS).forEach(oldest => {
        const removal = typeof localStorage.removeItemAsync === 'function'
          ? localStorage.removeItemAsync(oldest)
          : localStorage.removeItem(oldest);
        settlePersistence(removal, () => {}, error => {
          console.warn('Failed to remove quarantined conversations:', error);
        });
      });
    } catch (error) {
      console.warn('Failed to prune quarantined conversations:', error);
    }
  }

  // Copy the rejected payload to a timestamped quarantine key before
  // `ai_conversations` may be rewritten (#949). Returns the write outcome —
  // true when the copy is stored (or there is nothing to store), false when
  // the backup write was rejected — as a boolean for native storage and as a
  // promise for the async storage bridge.
  function quarantineRejectedPayload(raw) {
    if (typeof raw !== 'string' || !raw) return true;

    try {
      const result = persistStorageValue(QUARANTINE_KEY_PREFIX + Date.now(), raw);
      return settlePersistence(
        result,
        success => {
          if (success === false) {
            console.warn('Failed to quarantine rejected conversations: the backup write was rejected');
            return false;
          }
          pruneQuarantineKeys();
          return true;
        },
        error => {
          console.warn('Failed to quarantine rejected conversations:', error);
          return false;
        }
      );
    } catch (error) {
      console.warn('Failed to quarantine rejected conversations:', error);
      return false;
    }
  }

  function showRecoveryToast() {
    const message = getTranslation('aiConversationLoadError');
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
    } else {
      console.warn(message);
    }
  }

  // Quarantine first so the rejected payload is never lost, then tell the
  // user instead of failing silently (#949). Returns the quarantine outcome so
  // callers can hold back every write to `ai_conversations` until the backup
  // is stored; the notice claims a backup was kept, so it is only shown when
  // one really was.
  function reportRejectedPayload(stored) {
    return settlePersistence(
      quarantineRejectedPayload(stored),
      backedUp => {
        if (backedUp !== false) showRecoveryToast();
        return backedUp !== false;
      }
    );
  }

  // A request in flight owns its assistant message's isStreaming flag, and
  // loadConversations() also runs mid-request (openModal reloads), so only
  // flags no live request can still settle are stale (#865).
  function clearUnownedStreamingFlags() {
    if (state.isStreaming || state.isLoading || state.abortController !== null) {
      return false;
    }

    let cleared = false;
    state.conversations.forEach(conversation => {
      if (!Array.isArray(conversation.messages)) return;
      conversation.messages.forEach(message => {
        if (message.isStreaming) {
          message.isStreaming = false;
          cleared = true;
        }
      });
    });
    return cleared;
  }

  // Persist the cleared flags. A failed save rolls runtime state back to the
  // persisted snapshot that still carries them, so re-apply the cleanup after
  // any failure: the live UI must never show a stuck streaming bubble (#865).
  function healStoredStreamingFlags() {
    const result = saveConversations();
    const keepFlagsCleared = success => {
      if (success === false) {
        clearUnownedStreamingFlags();
      }
      return success;
    };

    if (isPromiseLike(result)) {
      return result.then(keepFlagsCleared, error => {
        console.error('Unexpected conversation save rejection:', error);
        clearUnownedStreamingFlags();
        return false;
      });
    }
    return keepFlagsCleared(result);
  }

  /** Loads persisted conversations without recovering when the validator is unavailable.
   *  Fail-soft (#949): every valid conversation survives a partially corrupt
   *  payload; full recovery only runs when nothing valid remains. Runtime state
   *  is applied synchronously so the UI can render, while every write to
   *  `ai_conversations` waits for the quarantine backup of the rejected payload
   *  — a rejected backup write therefore never destroys the last copy of the
   *  data. Returns that settlement (or the healing write for stale streaming
   *  flags) so callers can await it. */
  function loadConversations() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEYS.conversations);
      const conversations = stored ? JSON.parse(stored) : [];

      if (typeof window.isValidConversation !== 'function') {
        console.warn('AI conversation validator is unavailable; preserving stored conversations');
        return;
      }

      if (!Array.isArray(conversations)) {
        return recoverConversations(stored);
      }

      const valid = conversations.filter(isValidConversation);
      const rejectedCount = conversations.length - valid.length;

      if (rejectedCount > 0 && valid.length === 0) {
        return recoverConversations(stored);
      }

      state.conversations = valid;

      // Ensure every message has a stable id so the renderer can update
      // individual messages in place instead of rebuilding the whole list.
      state.conversations.forEach(conversation => {
        if (Array.isArray(conversation.messages)) {
          conversation.messages.forEach(message => {
            if (!message.id) {
              message.id = generateId();
            }
          });
        }
      });

      // A request interrupted mid-stream persists isStreaming: true and no
      // live request owns it after a restart, so clear that transient flag
      // instead of letting the renderer show a stuck streaming bubble (#865).
      const clearedStreamingFlag = clearUnownedStreamingFlags();

      const currentId = localStorage.getItem(STORAGE_KEYS.currentId);

      if (currentId && state.conversations.find(conversation => conversation.id === currentId)) {
        state.currentConversationId = currentId;
      } else if (state.conversations.length > 0) {
        state.currentConversationId = state.conversations[0].id;
      } else {
        const previousState = createSaveSnapshot();
        const newConversation = createNewConversation();
        state.conversations.push(newConversation);
        state.currentConversationId = newConversation.id;
        saveConversationsSafely(previousState);
      }

      // Heal storage too, so the stale flag cannot resurface in exports or
      // save rollbacks (#865); a cleared flag implies at least one message,
      // so the empty-state branch above cannot have fired in this pass.
      // A fail-soft repair is only persisted once the rejected payload is
      // backed up, so the repair cannot re-trigger the recovery notice — and
      // cannot overwrite the only copy of the data — on the next load (#949).
      if (rejectedCount > 0) {
        return settlePersistence(
          reportRejectedPayload(stored),
          backedUp => {
            if (backedUp === false) {
              console.warn('Conversation repair was not persisted: the quarantine backup was rejected');
              return false;
            }
            return healStoredStreamingFlags();
          }
        );
      }

      if (clearedStreamingFlag) {
        return healStoredStreamingFlags();
      }
    } catch (error) {
      console.warn('Failed to load conversations:', error);
      return recoverConversations(stored);
    }
  }

  function cloneSaveSnapshot(snapshot) {
    return createSaveSnapshot(snapshot.conversations, snapshot.currentConversationId);
  }

  function createSaveSnapshot(
    conversations = state.conversations,
    currentConversationId = state.currentConversationId
  ) {
    return {
      conversations: conversations.map(conversation => ({
        ...conversation,
        messages: conversation.messages.map(message => ({ ...message }))
      })),
      currentConversationId
    };
  }

  // Serialization is best-effort: a conversation holding an unserializable
  // value yields null so callers can fall through to the guarded write path.
  function trySerialize(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  // Storage limits are byte based, while String#length counts UTF-16 code
  // units: a CJK-heavy history is up to three times its code-unit count in
  // UTF-8, so the size cap, the retry floor and the eviction budget all
  // measure bytes (#947).
  const UTF8_ENCODER = new TextEncoder();

  function byteLength(payload) {
    return UTF8_ENCODER.encode(payload).length;
  }

  function showSaveErrorToast(storageFull) {
    const message = getTranslation(storageFull ? 'aiStorageFullError' : 'aiSaveError');
    if (typeof window.showToast === 'function') {
      window.showToast(message, 'error');
    } else {
      console.warn(message);
    }
  }

  function persistStorageValue(key, value) {
    if (typeof localStorage.setItemAsync === 'function') {
      return localStorage.setItemAsync(key, value);
    }

    try {
      return localStorage.setItem(key, value) !== false; // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
    } catch (error) {
      console.warn('Failed to persist conversation storage value:', error);
      return false;
    }
  }

  function restoreStorageValue(key, value) {
    if (value === null || typeof value === 'undefined') {
      if (typeof localStorage.removeItemAsync === 'function') {
        return localStorage.removeItemAsync(key);
      }

      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.warn('Failed to restore conversation storage value:', error);
        return false;
      }
    }

    return persistStorageValue(key, value);
  }

  function isPromiseLike(value) {
    return value && typeof value.then === 'function';
  }

  function settlePersistence(result, onSuccess, onFailure) {
    if (isPromiseLike(result)) {
      return result.then(onSuccess, onFailure);
    }

    return onSuccess(result);
  }

  function getPersistedStateSnapshot(conversationsValue, currentConversationId, fallbackState) {
    try {
      const conversations = conversationsValue ? JSON.parse(conversationsValue) : [];
      if (Array.isArray(conversations) && conversations.every(isValidConversation)) {
        return {
          conversations,
          currentConversationId
        };
      }
    } catch (error) {
      console.warn('Failed to parse persisted conversations for rollback:', error);
    }

    return fallbackState;
  }

  function reportSaveFailure(error, rollbackState, saveGeneration, storageFull) {
    const isLatestSave = saveGeneration === saveSequence;
    if (isLatestSave && rollbackState) {
      const restoredState = cloneSaveSnapshot(rollbackState);
      state.conversations = restoredState.conversations;
      state.currentConversationId = restoredState.currentConversationId;
    }
    console.error('Failed to save conversations:', error);
    if (isLatestSave) {
      showSaveErrorToast(storageFull);
    }
    return false;
  }

  // Restore one key to its pre-save value. Resolves (or returns) true when the
  // rollback was accepted; never throws.
  function rollbackStorageValue(key, value) {
    let result;
    try {
      result = restoreStorageValue(key, value);
    } catch (error) {
      console.error('Failed to roll back ' + key + ' after save failure:', error);
      return false;
    }
    return settlePersistence(
      result,
      restored => {
        if (restored === false) {
          console.error('Failed to roll back ' + key + ' after save failure');
        }
        return restored !== false;
      },
      error => {
        console.error('Failed to roll back ' + key + ' after save failure:', error);
        return false;
      }
    );
  }

  // Roll back every key in `written` to its persisted value, then report.
  // `storageFull` steers the toast toward actionable guidance when a
  // trimmed re-save was already attempted (#947).
  function handleSaveFailure(error, written, persistedValues, rollbackState, saveGeneration, storageFull) {
    const reportFailure = () => reportSaveFailure(error, rollbackState, saveGeneration, storageFull);
    const rollbacks = written.map(key => rollbackStorageValue(key, persistedValues[key]));
    if (rollbacks.some(isPromiseLike)) {
      return Promise.all(rollbacks).then(reportFailure, reportFailure);
    }
    return reportFailure();
  }

  // Persist one key and describe the outcome as { ok, error } (synchronously
  // for native storage, as a promise for the async storage bridge).
  function writeOutcome(key, value) {
    let result;
    try {
      result = persistStorageValue(key, value);
    } catch (error) {
      return { ok: false, error };
    }
    return settlePersistence(
      result,
      success => ({ ok: success !== false }),
      error => ({ ok: false, error })
    );
  }

  function saveConversationsTransaction(
    nextConversations,
    nextCurrentConversationId,
    previousState,
    saveGeneration,
    precomputedPayload
  ) {
    const persistedValues = {};

    try {
      persistedValues[STORAGE_KEYS.conversations] = localStorage.getItem(STORAGE_KEYS.conversations);
      persistedValues[STORAGE_KEYS.currentId] = localStorage.getItem(STORAGE_KEYS.currentId);
    } catch (error) {
      return reportSaveFailure(error, previousState, saveGeneration, false);
    }

    const rollbackState = getPersistedStateSnapshot(
      persistedValues[STORAGE_KEYS.conversations],
      persistedValues[STORAGE_KEYS.currentId],
      previousState
    );

    let serializedConversations = typeof precomputedPayload === 'string'
      ? precomputedPayload
      : null;
    if (serializedConversations === null) {
      try {
        serializedConversations = JSON.stringify(nextConversations);
      } catch (error) {
        return handleSaveFailure(error, [], persistedValues, rollbackState, saveGeneration, false);
      }
    }

    // A rejected conversations write on a large payload gets exactly one
    // trimmed re-save (#947): halving the history before rolling back keeps
    // the message the user just sent instead of discarding it. The trim is
    // applied to this transaction's captured payload, never to the live
    // state, so a conversation switch during the pending write cannot pair
    // newer conversations with this save's current id (#947).
    let recoveryAttempted = false;
    const retryConversationsWrite = () => {
      const payloadBytes = byteLength(serializedConversations);
      if (payloadBytes < MIN_QUOTA_RETRY_BYTES) return null;
      const trimmed = trimConversationsToLimit(
        nextConversations,
        nextCurrentConversationId,
        Math.floor(payloadBytes / 2)
      );
      if (!trimmed) return null;
      const trimmedPayload = trySerialize(nextConversations);
      if (trimmedPayload === null) return null;
      recoveryAttempted = true;
      return writeOutcome(STORAGE_KEYS.conversations, trimmedPayload);
    };

    const finish = (conversations, currentId) => {
      if (conversations.ok && currentId.ok) return true;
      const error = conversations.ok
        ? currentId.error || new Error('Current conversation storage write was rejected')
        : conversations.error || new Error('Conversation storage write was rejected');
      const written = [];
      if (conversations.ok) written.push(STORAGE_KEYS.conversations);
      if (currentId.ok) written.push(STORAGE_KEYS.currentId);
      return handleSaveFailure(error, written, persistedValues, rollbackState, saveGeneration, recoveryAttempted);
    };

    // Used after a successful trimmed re-save, where the conversations write
    // already happened but the current id has not been issued yet.
    const writeCurrentIdAndFinish = (conversationsOutcome) => {
      const currentIdOutcome = writeOutcome(STORAGE_KEYS.currentId, nextCurrentConversationId);
      return settlePersistence(
        currentIdOutcome,
        currentId => finish(conversationsOutcome, currentId),
        error => handleSaveFailure(
          error,
          conversationsOutcome.ok ? [STORAGE_KEYS.conversations] : [],
          persistedValues,
          rollbackState,
          saveGeneration,
          recoveryAttempted
        )
      );
    };

    const conversationsOutcome = writeOutcome(STORAGE_KEYS.conversations, serializedConversations);
    if (!isPromiseLike(conversationsOutcome) && !conversationsOutcome.ok) {
      const retryOutcome = retryConversationsWrite();
      if (retryOutcome === null) {
        return handleSaveFailure(
          conversationsOutcome.error || new Error('Conversation storage write was rejected'),
          [],
          persistedValues,
          rollbackState,
          saveGeneration,
          false
        );
      }
      return settlePersistence(
        retryOutcome,
        retried => (retried.ok
          ? writeCurrentIdAndFinish(retried)
          : handleSaveFailure(
            retried.error || new Error('Conversation storage write was rejected'),
            [],
            persistedValues,
            rollbackState,
            saveGeneration,
            true
          )),
        error => handleSaveFailure(error, [], persistedValues, rollbackState, saveGeneration, true)
      );
    }

    // Write the current id in the same turn as the conversations (#458), so
    // the storage bridge never holds new conversations with a stale id. If
    // either write fails, roll back the one that succeeded (#716).
    const currentIdOutcome = writeOutcome(STORAGE_KEYS.currentId, nextCurrentConversationId);

    if (isPromiseLike(conversationsOutcome) || isPromiseLike(currentIdOutcome)) {
      return Promise.all([conversationsOutcome, currentIdOutcome])
        .then(([conversations, currentId]) => {
          if (conversations.ok) return finish(conversations, currentId);
          const retryOutcome = retryConversationsWrite();
          if (retryOutcome === null) return finish(conversations, currentId);
          return settlePersistence(
            retryOutcome,
            retried => finish(retried, currentId),
            error => finish({ ok: false, error }, currentId)
          );
        });
    }
    return finish(conversationsOutcome, currentIdOutcome);
  }

  let saveSequence = 0;
  let saveQueue = null;

  function enqueueSave(saveTransaction) {
    const run = () => {
      try {
        return Promise.resolve(saveTransaction());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    // Start the first transaction immediately so fire-and-forget recovery saves
    // update the storage bridge in the same turn. Later saves remain serialized.
    const queuedSave = saveQueue ? saveQueue.then(run, run) : run();
    saveQueue = queuedSave;
    queuedSave.then(
      () => {
        if (saveQueue === queuedSave) saveQueue = null;
      },
      () => {
        if (saveQueue === queuedSave) saveQueue = null;
      }
    );
    return queuedSave;
  }

  function enforceMessageCap(conversation) {
    if (!Array.isArray(conversation.messages)) return;
    const overflow = conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION;
    if (overflow > 0) {
      conversation.messages.splice(0, overflow);
    }
  }

  // Evict the oldest messages until at least `targetBytes` of serialized
  // payload is gone. Conversations are walked oldest-first (newest
  // conversations sit at the front of the array); the active conversation and
  // the conversation an in-flight request writes into are never touched, so
  // the message the user just sent survives trimming (#947).
  function evictOldestMessages(conversations, activeConversationId, targetBytes) {
    let freed = 0;
    const inFlightConversationId = state.inFlightConversationId;

    const evictFrom = (conversation, keepRecent) => {
      const evictable = Math.max(0, conversation.messages.length - keepRecent);
      let index = 0;
      while (index < evictable && freed < targetBytes) {
        freed += byteLength(JSON.stringify(conversation.messages[index])) + 1;
        index += 1;
      }
      if (index > 0) {
        conversation.messages.splice(0, index);
      }
    };

    for (let index = conversations.length - 1; index >= 0; index -= 1) {
      if (freed >= targetBytes) break;
      const conversation = conversations[index];
      if (!Array.isArray(conversation.messages) || conversation.messages.length === 0) continue;
      if (conversation.id === activeConversationId) continue;
      if (conversation.id === inFlightConversationId) continue;
      evictFrom(conversation, 0);
    }

    if (freed < targetBytes) {
      const active = conversations.find(conversation => conversation.id === activeConversationId);
      if (active && Array.isArray(active.messages)) {
        evictFrom(active, Math.min(ACTIVE_MESSAGE_FLOOR, active.messages.length));
      }
    }

    return freed;
  }

  // Trim conversations in place until the serialized payload fits
  // `limitBytes`. Returns whether anything was evicted; returns false when
  // the payload already fits or nothing may be evicted any further.
  function trimConversationsToLimit(conversations, activeConversationId, limitBytes) {
    const initial = trySerialize(conversations);
    if (initial === null) return false;

    let size = byteLength(initial);
    if (size <= limitBytes) return false;

    let changed = false;
    while (size > limitBytes) {
      const freed = evictOldestMessages(conversations, activeConversationId, size - limitBytes);
      if (freed <= 0) break;
      changed = true;
      const next = trySerialize(conversations);
      if (next === null) break;
      size = byteLength(next);
    }
    return changed;
  }

  function saveConversations(previousState = createSaveSnapshot()) {
    const saveGeneration = ++saveSequence;

    // Apply state normalization synchronously so callers observe the same
    // state that will be persisted, while retaining the existing conversation
    // object identities for in-flight requests and UI references.
    if (state.conversations.length > MAX_CONVERSATIONS) {
      const kept = state.conversations.slice(0, MAX_CONVERSATIONS);
      const active = state.conversations.find(
        conversation => conversation.id === state.currentConversationId
      );
      if (active && !kept.some(conversation => conversation.id === active.id)) {
        kept[kept.length - 1] = active;
      }
      state.conversations.splice(0, state.conversations.length, ...kept);
    }

    if (!state.conversations.some(
      conversation => conversation.id === state.currentConversationId
    )) {
      state.currentConversationId = state.conversations[0]
        ? state.conversations[0].id
        : null;
    }

    // Size bounds applied on write, not only after a failed save (#947): a
    // per-conversation message cap plus a serialized-size cap that evicts the
    // oldest messages instead of letting the store run into its quota.
    state.conversations.forEach(enforceMessageCap);

    let nextState = createSaveSnapshot();
    let serializedConversations = trySerialize(nextState.conversations);

    if (
      serializedConversations !== null &&
      byteLength(serializedConversations) > MAX_SERIALIZED_BYTES &&
      trimConversationsToLimit(state.conversations, state.currentConversationId, MAX_SERIALIZED_BYTES)
    ) {
      nextState = createSaveSnapshot();
      serializedConversations = trySerialize(nextState.conversations);
    }

    const saveTransaction = () => saveConversationsTransaction(
      nextState.conversations,
      nextState.currentConversationId,
      previousState,
      saveGeneration,
      serializedConversations
    );

    if (typeof localStorage.setItemAsync === 'function') {
      return enqueueSave(saveTransaction);
    }

    return saveTransaction();
  }

  function saveConversationsSafely(previousState = createSaveSnapshot()) {
    const result = saveConversations(previousState);
    if (isPromiseLike(result)) {
      void result.catch(error => {
        console.error('Unexpected conversation save rejection:', error);
      });
    }
  }

  function getCurrentConversation() {
    return state.conversations.find(conversation => conversation.id === state.currentConversationId) || state.conversations[0];
  }

  function getCurrentMessages() {
    const conversation = getCurrentConversation();
    return conversation ? conversation.messages : [];
  }

  function getFilteredConversations() {
    let filtered = [...state.conversations];

    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(conversation =>
        conversation.title.toLowerCase().includes(query) ||
        conversation.messages.some(message => message.content && message.content.toLowerCase().includes(query))
      );
    }

    return filtered;
  }

  function addMessageToConversation(message) {
    const conversation = getCurrentConversation();
    if (!conversation) return;

    const previousState = createSaveSnapshot();

    if (!message.id) {
      message.id = generateId();
    }

    conversation.messages.push(message);
    enforceMessageCap(conversation);
    conversation.updatedAt = Date.now();

    if (conversation.messages.length === 1 && message.role === 'user') {
      conversation.title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
    }

    saveConversationsSafely(previousState);
  }

  function createNewChat() {
    const previousState = createSaveSnapshot();
    const conversation = createNewConversation();
    state.conversations.unshift(conversation);
    state.currentConversationId = conversation.id;
    saveConversationsSafely(previousState);
    return conversation;
  }

  function switchConversation(conversationId) {
    if (state.currentConversationId === conversationId) {
      return false;
    }

    const previousState = createSaveSnapshot();
    state.currentConversationId = conversationId;
    saveConversationsSafely(previousState);
    return true;
  }

  function deleteConversation(conversationId) {
    const index = state.conversations.findIndex(conversation => conversation.id === conversationId);
    if (index === -1) return false;

    const previousState = createSaveSnapshot();
    state.conversations.splice(index, 1);

    if (state.currentConversationId === conversationId) {
      if (state.conversations.length > 0) {
        state.currentConversationId = state.conversations[0].id;
      } else {
        const newConversation = createNewConversation();
        state.conversations.push(newConversation);
        state.currentConversationId = newConversation.id;
      }
    }

    saveConversationsSafely(previousState);
    return true;
  }

  function setSearchQuery(query) {
    state.searchQuery = query;
    state.keyboardSelectedIndex = -1;
  }

  function sanitizeFilenameTitle(title) {
    let cleaned = String(title || '')
      // Strip characters that are illegal in filenames on common platforms
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
      .trim();
    // Drop trailing extension dots (e.g. "..." titles) without a quantified
    // overlap regex, which SonarCloud S8786 flags as super-linear.
    while (cleaned.endsWith('.')) {
      cleaned = cleaned.slice(0, -1).trimEnd();
    }
    return cleaned.slice(0, 80).trim() || 'conversation';
  }

  function formatExportTime(timestamp) {
    return typeof timestamp === 'number' ? new Date(timestamp).toLocaleString() : '';
  }

  // Same local-date shape as the todo/settings export filenames.
  function formatExportDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // Role labels stay untranslated so exported files read consistently when shared.
  function serializeConversationToMarkdown(conversation) {
    // Auto-generated titles can contain newlines (they preview the first
    // message); flatten them so the heading stays on a single line. Splitting
    // instead of a whitespace regex keeps the matcher free of quantifier
    // adjacency (SonarCloud S8786).
    const title = String(conversation.title || '')
      .split(/[\r\n]+/)
      .map(part => part.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    const lines = ['# ' + title, ''];
    (conversation.messages || []).forEach(message => {
      const label = message.role === 'user' ? 'You' : 'Assistant';
      const time = formatExportTime(message.timestamp);
      lines.push(
        (time ? '**' + label + '** _(' + time + ')_' : '**' + label + '**'),
        '',
        message.content || '',
        ''
      );
    });
    return lines.join('\n');
  }

  function exportConversation(conversationId) {
    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) return null;

    return {
      filename: sanitizeFilenameTitle(conversation.title) + '-' + formatExportDate(new Date()) + '.md',
      content: serializeConversationToMarkdown(conversation)
    };
  }

  function exportAllConversations() {
    if (!state.conversations.length) return null;

    return {
      filename: 'ai-conversations-' + formatExportDate(new Date()) + '.md',
      content: state.conversations.map(serializeConversationToMarkdown).join('\n---\n\n')
    };
  }

  function setKeyboardSelectedIndex(index) {
    state.keyboardSelectedIndex = index;
  }

  function setLoading(value) {
    state.isLoading = value;
  }

  function setStreaming(value) {
    state.isStreaming = value;
  }

  // Records which conversation an in-flight request writes into, so size
  // trimming never evicts the messages that request just produced after the
  // user switched chats (#947).
  function setInFlightConversation(conversationId) {
    state.inFlightConversationId = conversationId || null;
  }

  function setOfflineMode(value) {
    state.isOfflineMode = value;
  }

  function setAbortController(controller) {
    state.abortController = controller;
  }

  function setUserScrolledUp(value) {
    state.isUserScrolledUp = value;
  }

  function setConfirmDialogCallback(callback) {
    state.confirmDialogCallback = callback;
  }

  function clearConfirmDialogCallback() {
    state.confirmDialogCallback = null;
  }

  function setCtrlPressed(value) {
    state.isCtrlPressed = value;
  }

  function setHoveredDeleteTarget(button, tooltip) {
    state.hoveredDeleteBtn = button;
    state.hoveredDeleteTooltip = tooltip;
  }

  function clearHoveredDeleteTarget(button) {
    if (!button || state.hoveredDeleteBtn === button) {
      state.hoveredDeleteBtn = null;
      state.hoveredDeleteTooltip = null;
    }
  }

  return {
    state,
    STORAGE_KEYS,
    QUARANTINE_KEY_PREFIX,
    MAX_QUARANTINE_KEYS,
    createSaveSnapshot,
    MAX_CONVERSATIONS,
    MAX_MESSAGES_PER_CONVERSATION,
    MAX_SERIALIZED_BYTES,
    ACTIVE_MESSAGE_FLOOR,
    MIN_QUOTA_RETRY_BYTES,
    generateId,
    createNewConversation,
    loadConversations,
    saveConversations,
    getCurrentConversation,
    getCurrentMessages,
    getFilteredConversations,
    addMessageToConversation,
    createNewChat,
    switchConversation,
    deleteConversation,
    setSearchQuery,
    serializeConversationToMarkdown,
    exportConversation,
    exportAllConversations,
    setKeyboardSelectedIndex,
    setLoading,
    setStreaming,
    setInFlightConversation,
    setOfflineMode,
    setAbortController,
    setUserScrolledUp,
    setConfirmDialogCallback,
    clearConfirmDialogCallback,
    setCtrlPressed,
    setHoveredDeleteTarget,
    clearHoveredDeleteTarget
  };
})();

window.AIStore = AIStore;