import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/features/focus-mode.js');
});

beforeEach(() => {
  localStorage.removeItem('focusMode');

  let checkbox = document.getElementById('focus-mode-setting');
  if (!checkbox) {
    checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'focus-mode-setting';
    document.body.appendChild(checkbox);
  }

  let indicator = document.getElementById('focus-mode-indicator');
  if (!indicator) {
    indicator = document.createElement('button');
    indicator.id = 'focus-mode-indicator';
    const label = document.createElement('span');
    indicator.appendChild(label);
    document.body.appendChild(indicator);
  } else if (!indicator.querySelector('span')) {
    const label = document.createElement('span');
    indicator.appendChild(label);
  }

  indicator.hidden = true;
  indicator.removeAttribute('title');
  indicator.removeAttribute('aria-label');
  indicator.removeAttribute('aria-pressed');

  document.body.classList.remove('focus-mode');
  document.body.removeAttribute('data-focus-mode');
});

describe('focus-mode', () => {
  it('loadFocusMode reads localStorage', () => {
    expect(loadFocusMode()).toBe(false);
    localStorage.setItem('focusMode', 'true');
    expect(loadFocusMode()).toBe(true);
  });

  it('applyFocusMode updates body state and checkbox', () => {
    const checkbox = document.getElementById('focus-mode-setting');

    localStorage.setItem('focusMode', 'true');
    applyFocusMode();

    expect(document.body.classList.contains('focus-mode')).toBe(true);
    expect(document.body.getAttribute('data-focus-mode')).toBe('true');
    expect(checkbox.checked).toBe(true);

    localStorage.setItem('focusMode', 'false');
    applyFocusMode();

    expect(document.body.classList.contains('focus-mode')).toBe(false);
    expect(document.body.getAttribute('data-focus-mode')).toBe('false');
    expect(checkbox.checked).toBe(false);
  });

  it('applyFocusMode shows and labels the active indicator', () => {
    const indicator = document.getElementById('focus-mode-indicator');

    localStorage.setItem('focusMode', 'true');
    applyFocusMode();

    expect(indicator.hidden).toBe(false);
    expect(indicator.getAttribute('aria-pressed')).toBe('true');
    expect(indicator.title).toBe('Exit Focus Mode');
    expect(indicator.querySelector('span').textContent).toBe('Focus');

    localStorage.setItem('focusMode', 'false');
    applyFocusMode();

    expect(indicator.hidden).toBe(true);
    expect(indicator.getAttribute('aria-pressed')).toBe('false');
  });

  it('setFocusMode persists state', () => {
    setFocusMode(true);
    expect(localStorage.getItem('focusMode')).toBe('true');

    setFocusMode(false);
    expect(localStorage.getItem('focusMode')).toBe('false');
  });

  it('toggleFocusMode flips the stored state', () => {
    toggleFocusMode();
    expect(localStorage.getItem('focusMode')).toBe('true');

    toggleFocusMode();
    expect(localStorage.getItem('focusMode')).toBe('false');
  });

  it('applyFocusMode emits focusModeChanged event', () => {
    const spy = vi.fn();
    window.addEventListener('focusModeChanged', spy);

    localStorage.setItem('focusMode', 'true');
    applyFocusMode();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].detail).toEqual({ enabled: true });

    window.removeEventListener('focusModeChanged', spy);
  });
});
