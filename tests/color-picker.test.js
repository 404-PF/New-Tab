import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ui/color-picker.js');
});

function createColorInput(id) {
  const input = document.createElement('input');
  input.type = 'color';
  input.id = id;
  input.value = '#ffffff';
  document.body.appendChild(input);
  return input;
}

function countCalls(spy, type) {
  return spy.mock.calls.filter(([eventType]) => eventType === type).length;
}

describe('ModernColorPicker', () => {
  it('creates a palette and synchronizes selection with the original input', () => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#ffffff';
    document.body.appendChild(input);
    const onColorSelect = vi.fn();
    const picker = new window.ModernColorPicker({ element: input, onColorSelect });
    const inputHandler = vi.fn();
    input.addEventListener('input', inputHandler);

    picker.show();
    picker.selectColor('#f03e3e');

    expect(picker.pickerElement.querySelectorAll('.color-chip')).not.toHaveLength(0);
    expect(input.value).toBe('#f03e3e');
    expect(inputHandler).toHaveBeenCalledOnce();
    expect(onColorSelect).toHaveBeenCalledWith('#f03e3e');
    expect(picker.pickerElement.querySelector('[data-color="#f03e3e"]').dataset.selected).toBe('true');
    picker.destroy();
    input.remove();
  });

  it('builds the popup lazily on first show() and only once', () => {
    const input = createColorInput('color-picker-lazy');
    const picker = new window.ModernColorPicker({ element: input });

    expect(picker.pickerElement).toBeNull();
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(0);

    picker.show();
    const popup = picker.pickerElement;
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(1);

    picker.hide();
    picker.show();

    expect(picker.pickerElement).toBe(popup);
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(1);

    picker.destroy();
    input.remove();
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(0);
  });

  it('binds one shared pair of document listeners, and only while a popup is open', () => {
    const inputs = ['a', 'b', 'c'].map(name => createColorInput(`color-picker-shared-${name}`));
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');

    const pickers = inputs.map(input => new window.ModernColorPicker({ element: input }));

    expect(countCalls(addListener, 'click')).toBe(0);
    expect(countCalls(addListener, 'keydown')).toBe(0);

    pickers[0].show();

    expect(countCalls(addListener, 'click')).toBe(1);
    expect(countCalls(addListener, 'keydown')).toBe(1);

    pickers.forEach(picker => picker.destroy());

    expect(countCalls(removeListener, 'click')).toBe(1);
    expect(countCalls(removeListener, 'keydown')).toBe(1);

    addListener.mockRestore();
    removeListener.mockRestore();
    inputs.forEach(input => input.remove());
  });

  it('closes the active popup via the shared outside-click and Escape handlers', () => {
    const first = createColorInput('color-picker-close-a');
    const second = createColorInput('color-picker-close-b');
    const a = new window.ModernColorPicker({ element: first });
    const b = new window.ModernColorPicker({ element: second });

    a.show();
    expect(a.isOpen).toBe(true);

    // Opening a second picker closes the previously active one.
    b.show();
    expect(a.isOpen).toBe(false);
    expect(b.isOpen).toBe(true);

    document.body.click();
    expect(b.isOpen).toBe(false);

    b.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(b.isOpen).toBe(false);

    a.destroy();
    b.destroy();
    first.remove();
    second.remove();
  });

  it('leaves no popup behind after init and stays clean across re-runs', () => {
    const input = createColorInput('color-picker-init');
    const expectedSwatches = document.querySelectorAll('input[type="color"][id*="color-picker"]').length;

    window.initModernColorPickers();
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(0);
    expect(document.querySelectorAll('.color-swatch')).toHaveLength(expectedSwatches);

    window.initModernColorPickers();
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(0);
    expect(document.querySelectorAll('.color-swatch')).toHaveLength(expectedSwatches);

    input.remove();
    window.initModernColorPickers();
    expect(document.querySelectorAll('.color-swatch')).toHaveLength(0);
    expect(document.querySelectorAll('.color-picker-popup')).toHaveLength(0);
  });
});
