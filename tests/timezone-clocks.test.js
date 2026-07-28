import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/timezone-clocks.js');
});

describe('timezone clocks', () => {
  it('re-renders generated controls when the language changes', () => {
    const clock = document.createElement('div');
    clock.id = 'clock';
    document.body.appendChild(clock);
    localStorage.setItem('extraTimeZones', JSON.stringify(['America/New_York']));

    const originalI18n = window.i18n;
    window.i18n = {
      t(key, replacements) {
        if (key === 'removeTimezone') return 'Remove';
        return 'Remove ' + replacements.city;
      }
    };
    window.initTimezoneClocks();

    window.i18n = {
      t(key, replacements) {
        if (key === 'removeTimezone') return 'Eliminar';
        return 'Eliminar ' + replacements.city;
      }
    };
    window.dispatchEvent(new Event('languageChanged'));

    const removeBtn = document.querySelector('.timezone-remove');
    expect(removeBtn.title).toBe('Eliminar');
    expect(removeBtn.getAttribute('aria-label')).toBe('Eliminar New York');

    window.i18n = originalI18n;
    clock.remove();
  });
});
