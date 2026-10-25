// Shared assertions for the lazy document-listener contract implemented by
// both ModernColorPicker and ModernFontPicker: one shared pair of document
// handlers, attached only while a popup is open. The color and font specs
// exercise the exact same spy setup and assertion sequence, so it lives here
// instead of being copied into both files.

function countCalls(spy, type) {
  return spy.mock.calls.filter(([eventType]) => eventType === type).length;
}

export function expectSharedDocumentListeners({ createPickers, cleanup }) {
  const addListener = vi.spyOn(document, 'addEventListener');
  const removeListener = vi.spyOn(document, 'removeEventListener');
  const pickers = [];

  try {
    pickers.push(...createPickers());

    expect(countCalls(addListener, 'click')).toBe(0);
    expect(countCalls(addListener, 'keydown')).toBe(0);

    pickers[0].show();

    expect(countCalls(addListener, 'click')).toBe(1);
    expect(countCalls(addListener, 'keydown')).toBe(1);

    pickers.forEach(picker => picker.destroy());

    expect(countCalls(removeListener, 'click')).toBe(1);
    expect(countCalls(removeListener, 'keydown')).toBe(1);
  } finally {
    pickers.forEach(picker => picker.destroy());
    addListener.mockRestore();
    removeListener.mockRestore();
    cleanup();
  }
}
