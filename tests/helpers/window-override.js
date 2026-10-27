// Temporarily replace a window property for the duration of `run`, then
// restore the previous value (deleting the property when it did not exist).
export function withWindowOverride(name, value, run) {
  const original = window[name];
  window[name] = value;
  try {
    return run();
  } finally {
    if (original === undefined) {
      delete window[name];
    } else {
      window[name] = original;
    }
  }
}
