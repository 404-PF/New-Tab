import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ui/font-picker.js');
});

describe('ModernFontPicker', () => {
  it('renders choices and updates the select, preview, and callback', () => {
    const select = document.createElement('select');
    const arial = document.createElement('option');
    arial.value = '\'Arial\', sans-serif';
    select.appendChild(arial);
    select.value = arial.value;
    document.body.appendChild(select);
    const onFontSelect = vi.fn();
    const picker = new window.ModernFontPicker({ element: select, onFontSelect });
    const changeHandler = vi.fn();
    select.addEventListener('change', changeHandler);

    picker.selectFont('\'Arial\', sans-serif');

    expect(picker.pickerElement.querySelectorAll('.font-option')).toHaveLength(picker.fonts.length);
    expect(select.value).toBe('\'Arial\', sans-serif');
    expect(picker.swatch.textContent).toContain('Arial');
    expect(changeHandler).toHaveBeenCalledOnce();
    expect(onFontSelect).toHaveBeenCalledWith('\'Arial\', sans-serif');
    picker.destroy();
    select.remove();
  });
});
