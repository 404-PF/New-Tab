import { injectScript } from './helpers/inject-script.js';
import { expectSharedDocumentListeners } from './helpers/shared-picker-listeners.js';

beforeAll(() => {
  injectScript('src/ui/font-picker.js');
});

function createFontSelect(id) {
  const select = document.createElement('select');
  select.id = id;
  const option = document.createElement('option');
  option.value = '\'Arial\', sans-serif';
  select.appendChild(option);
  select.value = option.value;
  document.body.appendChild(select);
  return select;
}

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

    picker.show();
    picker.selectFont('\'Arial\', sans-serif');

    expect(picker.pickerElement.querySelectorAll('.font-option')).toHaveLength(picker.fonts.length);
    expect(select.value).toBe('\'Arial\', sans-serif');
    expect(picker.swatch.textContent).toContain('Arial');
    expect(changeHandler).toHaveBeenCalledOnce();
    expect(onFontSelect).toHaveBeenCalledWith('\'Arial\', sans-serif');
    picker.destroy();
    select.remove();
  });

  it('builds the popup lazily on first show() and only once', () => {
    const select = createFontSelect('font-picker-lazy');
    const picker = new window.ModernFontPicker({ element: select });

    expect(picker.pickerElement).toBeNull();
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(0);

    picker.show();
    const popup = picker.pickerElement;
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(1);
    expect(popup.querySelectorAll('.font-option')).toHaveLength(picker.fonts.length);

    picker.hide();
    picker.show();

    expect(picker.pickerElement).toBe(popup);
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(1);

    picker.destroy();
    select.remove();
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(0);
  });

  it('binds one shared pair of document listeners, and only while a popup is open', () => {
    const selects = ['a', 'b'].map(name => createFontSelect(`font-picker-shared-${name}`));

    expectSharedDocumentListeners({
      createPickers: () => selects.map(select => new window.ModernFontPicker({ element: select })),
      cleanup: () => selects.forEach(select => select.remove())
    });
  });

  it('leaves no popup behind after init and stays clean across re-runs', () => {
    const select = createFontSelect('font-picker-init');
    const expectedSwatches = document.querySelectorAll('select[id*="font-picker"]').length;

    window.initModernFontPickers();
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(0);
    expect(document.querySelectorAll('.font-swatch')).toHaveLength(expectedSwatches);

    window.initModernFontPickers();
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(0);
    expect(document.querySelectorAll('.font-swatch')).toHaveLength(expectedSwatches);

    select.remove();
    window.initModernFontPickers();
    expect(document.querySelectorAll('.font-swatch')).toHaveLength(expectedSwatches - 1);
    expect(document.querySelectorAll('.font-picker-popup')).toHaveLength(0);
  });
});
