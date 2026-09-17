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

  function clone(value) {
    if (value === missing) return missing;
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

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

  function parseJson(raw) {
    if (typeof raw !== 'string') return missing;
    try {
      return JSON.parse(raw);
    } catch {
      return missing;
    }
  }

  function getId(value) {
    return value && typeof value === 'object' && typeof value.id === 'string' && value.id
      ? value.id
      : null;
  }

  function getIdMap(values) {
    const map = new Map();
    for (const value of values) {
      const id = getId(value);
      if (!id || map.has(id)) return null;
      map.set(id, value);
    }
    return map;
  }

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

  function mergeIdentifiedArray(base, current, candidate) {
    const baseMap = getIdMap(base);
    const currentMap = getIdMap(current);
    const candidateMap = getIdMap(candidate);
    if (!baseMap || !currentMap || !candidateMap) return clone(candidate);

    const result = new Map();
    const allIds = new Set([...baseMap.keys(), ...currentMap.keys(), ...candidateMap.keys()]);

    allIds.forEach(id => {
      const baseHas = baseMap.has(id);
      const currentHas = currentMap.has(id);
      const candidateHas = candidateMap.has(id);
      const baseValue = baseHas ? baseMap.get(id) : missing;
      const currentValue = currentHas ? currentMap.get(id) : missing;
      const candidateValue = candidateHas ? candidateMap.get(id) : missing;

      if (!candidateHas) {
        if (!baseHas) {
          if (currentHas) result.set(id, clone(currentValue));
        } else if (!currentHas) {
          return;
        } else if (!deepEqual(currentValue, baseValue)) {
          result.set(id, clone(currentValue));
        }
        return;
      }

      if (!baseHas) {
        result.set(id, clone(candidateValue));
        return;
      }

      if (!currentHas) {
        if (!deepEqual(candidateValue, baseValue)) {
          result.set(id, clone(candidateValue));
        }
        return;
      }

      result.set(id, mergeJsonValue(baseValue, currentValue, candidateValue));
    });

    const baseIds = base.map(value => getId(value));
    const currentIds = current.map(value => getId(value));
    const candidateIds = candidate.map(value => getId(value));
    const localOrderChanged = !deepEqual(candidateIds, baseIds);
    const currentOrderChanged = !deepEqual(currentIds, baseIds);
    const primaryOrder = localOrderChanged ? candidateIds : (currentOrderChanged ? currentIds : candidateIds);
    const secondaryOrder = localOrderChanged ? currentIds : candidateIds;
    const orderedIds = [];

    [...primaryOrder, ...secondaryOrder, ...allIds].forEach(id => {
      if (id && result.has(id) && !orderedIds.includes(id)) {
        orderedIds.push(id);
      }
    });

    return orderedIds.map(id => result.get(id));
  }

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

  function wrappedGetItem(key) {
    const value = nativeGetItem(key);
    if (TARGET_KEYS.has(key) && !lastLocalValues.has(key)) {
      lastLocalValues.set(key, value);
    }
    return value;
  }

  function wrappedSetItem(key, value) {
    if (!TARGET_KEYS.has(key)) {
      return nativeSetItem(key, value);
    }

    const candidateRaw = String(value);
    const currentRaw = nativeGetItem(key);
    const baseRaw = lastLocalValues.has(key) ? lastLocalValues.get(key) : currentRaw;
    const mergedRaw = mergeStoredValue(baseRaw, currentRaw, candidateRaw);
    const result = nativeSetItem(key, mergedRaw);

    // A false return is the bridge's synchronous failure signal. Native
    // localStorage returns undefined on success, so every non-false result is
    // treated as an accepted local write.
    if (result !== false) {
      lastLocalValues.set(key, mergedRaw);
    }

    return result;
  }

  storage.getItem = wrappedGetItem;
  storage.setItem = wrappedSetItem;
})();
