// src/core/storage-rmw.js - Conflict-aware localStorage read-modify-write support

(function () {
  'use strict';

  const TARGET_KEYS = new Set([
    'todos',
    'notes',
    'ai_conversations'
  ]);
  const missing = Symbol('missing');
  const storage = globalThis.localStorage;

  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return;
  }

  const nativeGetItem = storage.getItem.bind(storage);
  const nativeSetItem = storage.setItem.bind(storage);
  const lastLocalValues = new Map();

  /** Clone a merge value without sharing mutable object references. */
  function clone(value) {
    if (value === missing) return missing;
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  /** Return whether a value is a plain object suitable for recursive merging. */
  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  /** Compare two JSON-compatible values for structural equality. */
  function deepEqual(left, right) {
    if (left === right) return true;
    if (left === missing || right === missing) return false;
    if (typeof left !== typeof right || left === null || right === null) return false;

    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false;
      return left.every((value, index) => deepEqual(value, right[index]));
    }

    if (isPlainObject(left) && isPlainObject(right)) {
      const leftKeys = Object.keys(left);
      const rightKeys = Object.keys(right);
      if (leftKeys.length !== rightKeys.length) return false;
      return leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
    }

    return false;
  }

  /** Parse persisted JSON, returning the missing sentinel for invalid input. */
  function parseJson(raw) {
    if (typeof raw !== 'string') return missing;
    try {
      return JSON.parse(raw);
    } catch {
      return missing;
    }
  }

  /** Read a non-empty string identifier from an object when one exists. */
  function getId(value) {
    return value && typeof value === 'object' && typeof value.id === 'string' && value.id
      ? value.id
      : null;
  }

  /** Build a stable fallback identity for legacy objects without IDs. */
  function getDeterministicIdentity(value) {
    if (!isPlainObject(value)) return null;

    if (typeof value.role === 'string' && Number.isFinite(value.timestamp)) {
      return 'message:' + value.role + ':' + value.timestamp;
    }

    const normalized = {};
    Object.keys(value).sort().forEach(key => {
      if (key !== 'id') {
        normalized[key] = value[key];
      }
    });

    try {
      return 'value:' + JSON.stringify(normalized);
    } catch {
      return null;
    }
  }

  /** Index array entries by stable IDs or deterministic legacy identities. */
  function createArrayMap(values, baseKeys = null) {
    const map = new Map();
    const order = [];

    for (const value of values) {
      const id = getId(value);
      const idKey = id ? 'id:' + id : null;
      const deterministicIdentity = getDeterministicIdentity(value);
      const legacyKey = deterministicIdentity ? 'legacy:' + deterministicIdentity : null;
      const key = idKey && (!baseKeys || baseKeys.has(idKey))
        ? idKey
        : (legacyKey && baseKeys && baseKeys.has(legacyKey)
          ? legacyKey
          : idKey || legacyKey);

      if (!key || map.has(key)) return null;
      map.set(key, value);
      order.push(key);
    }

    return { map, order };
  }

  /** Three-way merge object properties while preserving independent edits. */
  function mergeObject(base, current, candidate) {
    const merged = {};
    const keys = new Set([
      ...Object.keys(base),
      ...Object.keys(current),
      ...Object.keys(candidate)
    ]);

    keys.forEach(key => {
      const baseHas = Object.prototype.hasOwnProperty.call(base, key);
      const currentHas = Object.prototype.hasOwnProperty.call(current, key);
      const candidateHas = Object.prototype.hasOwnProperty.call(candidate, key);
      const baseValue = baseHas ? base[key] : missing;
      const currentValue = currentHas ? current[key] : missing;
      const candidateValue = candidateHas ? candidate[key] : missing;

      if (!candidateHas) {
        if (!baseHas) {
          if (currentHas) merged[key] = clone(currentValue);
        } else if (!currentHas) {
          // Both sides removed the property, or the external side removed it
          // while the local side did not change it.
        } else if (!deepEqual(currentValue, baseValue)) {
          // Preserve an external change when the local mutation deleted the
          // same property from an older snapshot.
          merged[key] = clone(currentValue);
        }
        return;
      }

      if (!baseHas) {
        merged[key] = clone(candidateValue);
        return;
      }

      if (!currentHas) {
        merged[key] = deepEqual(candidateValue, baseValue)
          ? undefined
          : clone(candidateValue);
        if (merged[key] === undefined) delete merged[key];
        return;
      }

      merged[key] = mergeJsonValue(baseValue, currentValue, candidateValue);
    });

    return merged;
  }

  /** Three-way merge arrays of identified or deterministically identifiable objects. */
  function mergeIdentifiedArray(base, current, candidate) {
    const baseArray = createArrayMap(base);
    if (!baseArray) return clone(candidate);

    const baseKeys = new Set(baseArray.map.keys());
    const currentArray = createArrayMap(current, baseKeys);
    const candidateArray = createArrayMap(candidate, baseKeys);
    if (!currentArray || !candidateArray) return clone(candidate);

    const result = new Map();
    const allKeys = new Set([
      ...baseArray.map.keys(),
      ...currentArray.map.keys(),
      ...candidateArray.map.keys()
    ]);

    allKeys.forEach(key => {
      const baseHas = baseArray.map.has(key);
      const currentHas = currentArray.map.has(key);
      const candidateHas = candidateArray.map.has(key);
      const baseValue = baseHas ? baseArray.map.get(key) : missing;
      const currentValue = currentHas ? currentArray.map.get(key) : missing;
      const candidateValue = candidateHas ? candidateArray.map.get(key) : missing;

      if (!candidateHas) {
        if (!baseHas) {
          if (currentHas) result.set(key, clone(currentValue));
        } else if (!currentHas) {
          return;
        } else if (!deepEqual(currentValue, baseValue)) {
          result.set(key, clone(currentValue));
        }
        return;
      }

      if (!baseHas) {
        result.set(key, clone(candidateValue));
        return;
      }

      if (!currentHas) {
        if (!deepEqual(candidateValue, baseValue)) {
          result.set(key, clone(candidateValue));
        }
        return;
      }

      result.set(key, mergeJsonValue(baseValue, currentValue, candidateValue));
    });

    const orderedKeys = [];
    [
      ...candidateArray.order,
      ...currentArray.order,
      ...baseArray.order,
      ...allKeys
    ].forEach(key => {
      if (!orderedKeys.includes(key) && result.has(key)) {
        orderedKeys.push(key);
      }
    });

    return orderedKeys.map(key => result.get(key));
  }

  /** Recursively merge JSON values with local conflict precedence. */
  function mergeJsonValue(base, current, candidate) {
    if (deepEqual(candidate, base)) return clone(current);
    if (deepEqual(current, base)) return clone(candidate);

    if (Array.isArray(base) && Array.isArray(current) && Array.isArray(candidate)) {
      return mergeIdentifiedArray(base, current, candidate);
    }

    if (isPlainObject(base) && isPlainObject(current) && isPlainObject(candidate)) {
      return mergeObject(base, current, candidate);
    }

    // An overlapping scalar edit is a genuine conflict. The write currently
    // being applied wins, while independent array/object changes are merged.
    return clone(candidate);
  }

  /** Merge serialized storage snapshots, falling back safely on invalid data. */
  function mergeStoredValue(baseRaw, currentRaw, candidateRaw) {
    if (baseRaw === null || baseRaw === missing) return candidateRaw;

    const base = parseJson(baseRaw);
    const current = parseJson(currentRaw);
    const candidate = parseJson(candidateRaw);

    if (base === missing || current === missing || candidate === missing) {
      return candidateRaw;
    }

    if (!Array.isArray(base) || !Array.isArray(current) || !Array.isArray(candidate)) {
      return candidateRaw;
    }

    try {
      return JSON.stringify(mergeIdentifiedArray(base, current, candidate));
    } catch (error) {
      console.warn('Failed to merge concurrent storage update; using latest local value:', error);
      return candidateRaw;
    }
  }

  /** Wrap Storage#getItem and capture the first local base for target keys. */
  function wrappedGetItem(key) {
    const value = nativeGetItem(key);
    if (TARGET_KEYS.has(key) && !lastLocalValues.has(key)) {
      lastLocalValues.set(key, value);
    }
    return value;
  }

  /** Wrap Storage#setItem and reconcile stale writes against current storage. */
  function wrappedSetItem(key, value) {
    if (!TARGET_KEYS.has(key)) {
      return nativeSetItem(key, value);
    }

    const candidateRaw = String(value);
    const currentRaw = nativeGetItem(key);
    const baseRaw = lastLocalValues.has(key) ? lastLocalValues.get(key) : currentRaw;
    const mergedRaw = mergeStoredValue(baseRaw, currentRaw, candidateRaw);
    const result = nativeSetItem(key, mergedRaw);

    // A successful write establishes the caller's snapshot as the new base.
    // This preserves later external changes while allowing subsequent local
    // writes from the same in-memory snapshot to reconcile against them.
    if (result !== false) { // NOSONAR - the storage bridge may return false while native Storage#setItem returns void.
      lastLocalValues.set(key, candidateRaw);
    }
  }

  storage.getItem = wrappedGetItem;
  storage.setItem = wrappedSetItem;
})();
