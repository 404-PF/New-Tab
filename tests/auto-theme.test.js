import { injectScript } from './helpers/inject-script.js';

describe('automatic theme switching', () => {
  it('applies the scheduled theme and handles enable/disable changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00'));
    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '07:00');
    localStorage.setItem('autoThemeDarkTime', '19:00');
    window.loadTheme = () => localStorage.getItem('theme');
    window.applyTheme = vi.fn();
    window.VisibilityInterval = class { constructor() {} destroy() {} };
    document.body.insertAdjacentHTML('beforeend', `
      <input id="auto-theme-toggle" type="checkbox"><input id="auto-theme-light-time">
      <input id="auto-theme-dark-time"><div id="auto-theme-times"></div>
      <label class="theme-option"></label><input name="theme" value="light"><input name="theme" value="dark">
    `);

    injectScript('src/features/auto-theme.js');

    expect(localStorage.getItem('theme')).toBe('light');
    expect(window.applyTheme).toHaveBeenCalled();
    const toggle = document.getElementById('auto-theme-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('autoTheme')).toBe('false');
    expect(document.getElementById('auto-theme-times').style.display).toBe('none');
    vi.useRealTimers();
  });
});
