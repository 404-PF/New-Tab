import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ui/color-picker.js');
});

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
});
