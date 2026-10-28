// jsdom has no PointerEvent constructor, so pointer gestures are dispatched
// as MouseEvent with pointer event types (listeners match on type only).
// MouseEvent lacks the pointerType/pointerId fields, so those are defined
// directly on the event when a test needs them (e.g. primary-mouse-button
// steering specs, #1024).
export function pointer(type, x, y, extra) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    ...extra
  });
  if (extra && extra.pointerType !== undefined) {
    Object.defineProperty(e, 'pointerType', { value: extra.pointerType });
  }
  if (extra && extra.pointerId !== undefined) {
    Object.defineProperty(e, 'pointerId', { value: extra.pointerId });
  }
  return e;
}
