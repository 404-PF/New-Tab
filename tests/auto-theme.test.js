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

  it('refreshAutoTheme re-syncs the toggle, times, and scheduler after a settings import', () => {
    // The previous test already injected auto-theme.js and left its DOM stubs
    // in place; setup.js clears localStorage between tests, so the module's
    // persisted keys start fresh here.
    expect(typeof window.refreshAutoTheme).toBe('function');

    localStorage.setItem('autoTheme', 'true');
    localStorage.setItem('autoThemeLightTime', '08:30');
    localStorage.setItem('autoThemeDarkTime', '20:15');
    window.refreshAutoTheme();

    const toggle = document.getElementById('auto-theme-toggle');
    expect(toggle.checked).toBe(true);
    expect(document.getElementById('auto-theme-light-time').value).toBe('08:30');
    expect(document.getElementById('auto-theme-dark-time').value).toBe('20:15');
    expect(document.getElementById('auto-theme-times').style.display).toBe('block');

    // A replace-mode import that cleared autoTheme must disable the schedule live.
    localStorage.setItem('autoTheme', 'false');
    window.refreshAutoTheme();

    expect(toggle.checked).toBe(false);
    expect(document.getElementById('auto-theme-times').style.display).toBe('none');
  });

  it('keeps a stored system theme through a scheduled boundary (issue #1011)', () => {
    vi.useFakeTimers();
    try {
      // Night: the schedule wants dark while the stored choice stays 'system'.
      vi.setSystemTime(new Date('2026-01-01T22:00:00'));
      localStorage.setItem('autoTheme', 'true');
      localStorage.setItem('autoThemeLightTime', '07:00');
      localStorage.setItem('autoThemeDarkTime', '19:00');
      localStorage.setItem('theme', 'system');
      window.loadTheme = () => localStorage.getItem('theme');
      window.applyTheme = vi.fn();
      document.body.insertAdjacentHTML('beforeend', '<input type="radio" name="theme" value="system">');

      // The toggle is off at this point (the refresh test above left it
      // disabled): switching it on resets lastScheduledTheme, forcing
      // checkAndApply across a boundary where the guard must hold.
      const toggle = document.getElementById('auto-theme-toggle');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(localStorage.getItem('theme')).toBe('system');
      expect(window.applyTheme).not.toHaveBeenCalled();
      expect(document.querySelector('input[name="theme"][value="system"]').checked).toBe(true);
      expect(document.querySelector('input[name="theme"][value="dark"]').checked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
