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
      title: 'Eye-care break'
    });
  });
});
