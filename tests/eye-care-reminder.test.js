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
      lastReminder: Date.now() - (20 * 60 * 1000)
    }));

    window.refreshEyeCareReminder();

    const banner = document.querySelector('.eye-care-reminder');
    expect(banner).not.toBeNull();
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('20 seconds');
  });

  it('counts down and swaps Skip for Done at the end', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000)
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
      lastReminder: Date.now() - (20 * 60 * 1000)
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
      lastReminder: Date.now() - (20 * 60 * 1000)
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
      lastReminder: Date.now() - (20 * 60 * 1000)
    }));

    const enabledToggle = document.getElementById('eye-care-enabled-setting');
    enabledToggle.checked = true;
    enabledToggle.dispatchEvent(new Event('change'));

    const banner = document.querySelector('.eye-care-reminder');
    const state = JSON.parse(localStorage.getItem('eyeCareReminder'));

    expect(banner.hidden).toBe(true);
    expect(Date.now() - state.lastReminder).toBeLessThan(1000);
  });

  it('persists completion when the countdown finishes so refresh does not re-open it immediately', () => {
    localStorage.setItem('eyeCareReminder', JSON.stringify({
      enabled: true,
      intervalMinutes: 20,
      browserNotification: false,
      lastReminder: Date.now() - (20 * 60 * 1000)
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
});
