import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/core/utils.js');
  injectScript('src/features/pomodoro.js');
});

beforeEach(() => {
  localStorage.clear();
  if (typeof PomodoroTimer !== 'undefined' && PomodoroTimer.reset) {
    PomodoroTimer.reset();
  }
});

describe('PomodoroTimer', () => {
  describe('loadSettings', () => {
    it('returns default settings when nothing stored', () => {
      const settings = PomodoroTimer.loadSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.work).toBe(25);
      expect(settings.shortBreak).toBe(5);
      expect(settings.longBreak).toBe(15);
      expect(settings.sessionsBeforeLong).toBe(4);
    });

    it('loads stored settings', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({
        enabled: true,
        work: 30,
        shortBreak: 10,
        longBreak: 20,
        sessionsBeforeLong: 3
      }));
      const settings = PomodoroTimer.loadSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.work).toBe(30);
      expect(settings.shortBreak).toBe(10);
      expect(settings.longBreak).toBe(20);
      expect(settings.sessionsBeforeLong).toBe(3);
    });

    it('handles corrupted data gracefully', () => {
      localStorage.setItem('pomodoroSettings', 'not-json');
      const settings = PomodoroTimer.loadSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.work).toBe(25);
    });
  });

  describe('saveSettings', () => {
    it('persists settings to localStorage', () => {
      PomodoroTimer.saveSettings();
      const raw = localStorage.getItem('pomodoroSettings');
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw);
      expect(stored).toEqual({
        enabled: false,
        work: 25,
        shortBreak: 5,
        longBreak: 15,
        sessionsBeforeLong: 4
      });
    });
  });

  describe('formatTime', () => {
    it('formats zero seconds', () => {
      expect(PomodoroTimer.formatTime(0)).toBe('00:00');
    });

    it('formats seconds only', () => {
      expect(PomodoroTimer.formatTime(45)).toBe('00:45');
    });

    it('formats minutes and seconds', () => {
      expect(PomodoroTimer.formatTime(1500)).toBe('25:00');
    });

    it('formats minutes and seconds with padding', () => {
      expect(PomodoroTimer.formatTime(605)).toBe('10:05');
    });
  });

  describe('loadSession', () => {
    it('returns null when no session stored', () => {
      expect(PomodoroTimer.loadSession()).toBeNull();
    });

    it('returns null for inactive session', () => {
      localStorage.setItem('pomodoroSession', JSON.stringify({ active: false }));
      expect(PomodoroTimer.loadSession()).toBeNull();
    });

    it('loads active session', () => {
      localStorage.setItem('pomodoroSession', JSON.stringify({
        active: true,
        todoId: 'abc',
        phase: 'work',
        remaining: 1500,
        sessionsCompleted: 2,
        paused: false
      }));
      const session = PomodoroTimer.loadSession();
      expect(session).not.toBeNull();
      expect(session.active).toBe(true);
      expect(session.todoId).toBe('abc');
      expect(session.phase).toBe('work');
      expect(session.remaining).toBe(1500);
      expect(session.sessionsCompleted).toBe(2);
    });
  });

  describe('startFocus', () => {
    it('does nothing when pomodoro is disabled', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: false }));
      PomodoroTimer.startFocus('todo1');
      expect(PomodoroTimer.session).toBeNull();
    });

    it('starts a work session when enabled', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({
        enabled: true,
        work: 25,
        shortBreak: 5,
        longBreak: 15,
        sessionsBeforeLong: 4
      }));
      PomodoroTimer.startFocus('todo1');
      expect(PomodoroTimer.session).not.toBeNull();
      expect(PomodoroTimer.session.active).toBe(true);
      expect(PomodoroTimer.session.phase).toBe('work');
      expect(PomodoroTimer.session.todoId).toBe('todo1');
      expect(PomodoroTimer.session.remaining).toBe(25 * 60);
      expect(PomodoroTimer.session.sessionsCompleted).toBe(0);
    });

    it('shows the widget when starting focus', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      const widget = document.getElementById('pomodoro-widget');
      widget.style.display = 'none';
      PomodoroTimer.startFocus('todo1');
      expect(PomodoroTimer.session).not.toBeNull();
      expect(widget.style.display).not.toBe('none');
    });
  });

  describe('pause and resume', () => {
    beforeEach(() => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
    });

    it('pauses an active session', () => {
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.pause();
      expect(PomodoroTimer.session.paused).toBe(true);
    });

    it('resumes a paused session', () => {
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.pause();
      PomodoroTimer.resume();
      expect(PomodoroTimer.session.paused).toBe(false);
    });

    it('togglePause toggles between pause and resume', () => {
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.togglePause();
      expect(PomodoroTimer.session.paused).toBe(true);
      PomodoroTimer.togglePause();
      expect(PomodoroTimer.session.paused).toBe(false);
    });

    it('does nothing when no active session', () => {
      PomodoroTimer.pause();
      expect(PomodoroTimer.session).toBeNull();
      PomodoroTimer.resume();
      expect(PomodoroTimer.session).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears session and hides widget', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      PomodoroTimer.startFocus('todo1');
      expect(PomodoroTimer.session).not.toBeNull();
      PomodoroTimer.reset();
      expect(PomodoroTimer.session).toBeNull();
      const widget = document.getElementById('pomodoro-widget');
      expect(widget.style.display).toBe('none');
    });
  });

  describe('session persistence', () => {
    it('persists session to localStorage', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      PomodoroTimer.startFocus('todo1');
      const stored = JSON.parse(localStorage.getItem('pomodoroSession'));
      expect(stored).not.toBeNull();
      expect(stored.active).toBe(true);
    });

    it('removes session from localStorage on reset', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.reset();
      expect(localStorage.getItem('pomodoroSession')).toBeNull();
    });
  });

  describe('renderWidget', () => {
    it('renders timer display when session is active', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.renderWidget();
      const container = document.getElementById('pomodoro-widget');
      expect(container.querySelector('.pomodoro-time')).not.toBeNull();
      expect(container.querySelector('.pomodoro-phase-label')).not.toBeNull();
      expect(container.querySelector('.pomodoro-controls')).not.toBeNull();
    });

    it('displays correct time format', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.renderWidget();
      const timeEl = document.querySelector('.pomodoro-time');
      expect(timeEl.textContent).toBe('25:00');
    });

    it('displays correct phase label', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true, work: 25 }));
      PomodoroTimer.startFocus('todo1');
      PomodoroTimer.renderWidget();
      const phaseEl = document.querySelector('.pomodoro-phase-label');
      expect(phaseEl.textContent).toBe('Focus');
    });
  });

  describe('applyPomodoroSettings', () => {
    it('syncs DOM to stored settings', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({
        enabled: true,
        work: 30,
        shortBreak: 10,
        longBreak: 20,
        sessionsBeforeLong: 3
      }));
      PomodoroTimer.applyPomodoroSettings();
      expect(document.getElementById('pomodoro-enabled').checked).toBe(true);
      expect(document.getElementById('pomodoro-work-duration').value).toBe('30');
      expect(document.getElementById('pomodoro-short-duration').value).toBe('10');
      expect(document.getElementById('pomodoro-long-duration').value).toBe('20');
      expect(document.getElementById('pomodoro-sessions-before-long').value).toBe('3');
    });
  });

  describe('loadPomodoroEnabled', () => {
    it('returns false by default', () => {
      expect(PomodoroTimer.loadPomodoroEnabled()).toBe(false);
    });

    it('returns true when enabled', () => {
      localStorage.setItem('pomodoroSettings', JSON.stringify({ enabled: true }));
      expect(PomodoroTimer.loadPomodoroEnabled()).toBe(true);
    });
  });
});
