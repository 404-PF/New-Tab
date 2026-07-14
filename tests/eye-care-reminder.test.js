import { injectScript } from './helpers/inject-script.js';

describe('eye-care reminder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem('eyeCareReminder');
    document.querySelector('.eye-care-reminder')?.remove();
    window.refreshEyeCareReminder = undefined;
    window.initEyeCareReminder = undefined;
    injectScript('src/core/motion.js');
    injectScript('src/ui/settings.js');
    injectScript('src/features/eye-care-reminder.js');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows a reminder once the saved interval elapses', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner).not.toBeNull();
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('20 seconds');
  });

  it('uses the saved reminder timestamp when visible progress is unavailable', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 0,
      lastVisibleAt: null,
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('20 seconds');
  });

  it('counts down and swaps Skip for Done at the end', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();
    vi.advanceTimersByTime(20_000);

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.textContent).toContain('Break complete');
    expect(Array.from(banner.querySelectorAll('button')).some(btn => btn.textContent === 'Done' && !btn.hidden)).toBe(true);
  });

  it('creates a browser notification when enabled', async () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: true,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();
    await Promise.resolve();

    expect(chrome.notifications._notifications['eye-care-reminder']).toMatchObject({
      title: 'Eye-care break',
      iconUrl: 'icons/icon128.png'
    });
  });

  it('marks the banner as a polite status region and wires static labels for i18n', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.querySelector('.eye-care-reminder-title')?.getAttribute('data-i18n')).toBe('eyeCareReminderTitle');
    expect(banner.querySelector('.eye-care-reminder-btn-secondary')?.getAttribute('data-i18n')).toBe('eyeCareReminderSkip');
    expect(banner.querySelector('.eye-care-reminder-btn-primary')?.getAttribute('data-i18n')).toBe('eyeCareReminderDone');
  });

  it('restarts the timer when the reminder is re-enabled', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: false,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: (19 * 60 * 1000) + 30_000,
      lastVisibleAt: Date.now() - 30_000,
      activeReminderAt: Date.now() - 5_000
    }));

    const enabledToggle = document.getElementById('eye-care-enabled-setting');
    enabledToggle.checked = true;
    enabledToggle.dispatchEvent(new Event('change'));

    const banner = document.querySelector('.eye-care-reminder');
    const state = JSON.parse(localStorage.getItem('eyeCareReminder'));

    expect(banner.hidden).toBe(true);
    expect(Date.now() - state.lastReminder).toBeLessThan(1000);
    expect(state.elapsedVisibleMs).toBe(0);
    expect(state.activeReminderAt).toBeNull();
  });

  it('recovers from an expired active reminder left behind by a previous page', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (25 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: null,
      activeReminderAt: Date.now() - 25_000
    }));

    window.refreshEyeCareReminder();

    const state = JSON.parse(localStorage.getItem('eyeCareReminder'));
    expect(state.activeReminderAt).toBeNull();
    expect(state.elapsedVisibleMs).toBe(0);
    expect(Date.now() - state.lastReminder).toBeLessThan(1000);

    vi.advanceTimersByTime(1000);
    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(true);
  });

  it('re-renders the finished status when the language changes', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();
    vi.advanceTimersByTime(20_000);

    const originalT = window.i18n.t;
    window.i18n.t = (key) => {
      if (key === 'eyeCareReminderFinished') return 'Pause translated.';
      return originalT(key);
    };

    window.dispatchEvent(new Event('languageChanged'));

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.textContent).toContain('Pause translated.');

    window.i18n.t = originalT;
  });

  it('persists completion when the countdown finishes so refresh does not re-open it immediately', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();
    vi.advanceTimersByTime(20_000);

    const finishedAt = JSON.parse(localStorage.getItem('eyeCareReminder')).lastReminder;
    expect(Date.now() - finishedAt).toBeLessThan(1000);

    document.querySelector('.eye-care-reminder')?.remove();
    window.refreshEyeCareReminder = undefined;
    window.initEyeCareReminder = undefined;
    injectScript('src/features/eye-care-reminder.js');

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(true);
  });

  it('restores the in-progress reminder when another page already marked one active', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now(),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: Date.now()
    }));

    window.refreshEyeCareReminder();

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('20 seconds');
  });

  it('restores an active reminder after the page reloads', () => {
    const activeReminderAt = Date.now() - 5_000;
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: activeReminderAt,
      elapsedVisibleMs: 0,
      lastVisibleAt: null,
      activeReminderAt
    }));

    window.refreshEyeCareReminder();

    document.querySelector('.eye-care-reminder')?.remove();
    window.refreshEyeCareReminder = undefined;
    window.initEyeCareReminder = undefined;
    injectScript('src/features/eye-care-reminder.js');

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('(15s)');

    vi.advanceTimersByTime(15_000);
    expect(banner.textContent).toContain('Break complete');
  });

  it('hides the banner when the reminder is disabled while active', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(false);

    const enabledToggle = document.getElementById('eye-care-enabled-setting');
    enabledToggle.checked = false;
    enabledToggle.dispatchEvent(new Event('change'));

    expect(banner.hidden).toBe(true);
  });

  it('pauses the active countdown while the page is hidden', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000),
      elapsedVisibleMs: 20 * 60 * 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null
    }));

    window.refreshEyeCareReminder();
    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.textContent).toContain('(20s)');

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10_000);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('(20s)');
    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).activeElapsedVisibleMs).toBe(0);
  });

  it('restores an active reminder when a previously loaded page becomes visible', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now(),
      elapsedVisibleMs: 0,
      lastVisibleAt: null,
      activeReminderAt: Date.now(),
      activeElapsedVisibleMs: 0,
      activeLastVisibleAt: null,
      visibilityPaused: false
    }));

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('(20s)');
  });

  it('does not count hidden time toward the visible reminder interval', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now(),
      elapsedVisibleMs: (20 * 60 * 1000) - 1000,
      lastVisibleAt: Date.now(),
      activeReminderAt: null,
      visibilityPaused: false
    }));

    window.refreshEyeCareReminder();

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.querySelector('.eye-care-reminder').hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem('eyeCareReminder')).elapsedVisibleMs)
      .toBe((20 * 60 * 1000) - 1000);

    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.eye-care-reminder').hidden).toBe(false);
  });
});
