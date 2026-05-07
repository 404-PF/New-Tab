import { describe, it, expect, beforeAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  injectScript('src/ui/settings.js');
});

describe('Background settings', () => {
  it('loadBg returns default', () => {
    expect(loadBg()).toBe('Water Beside Forest');
  });

  it('loadBg reads localStorage', () => {
    localStorage.setItem('homepageBg', 'My Background');
    expect(loadBg()).toBe('My Background');
  });
});

describe('Clock style settings', () => {
  it('loadClockStyle returns defaults', () => {
    const style = loadClockStyle();
    expect(style.color).toBe('#ffffff');
    expect(style.font).toBe("'Times New Roman', serif");
    expect(style.size).toBe(80);
  });

  it('loadClockStyle reads custom values', () => {
    localStorage.setItem('clockColor', '#ff0000');
    localStorage.setItem('clockFont', 'Arial');
    localStorage.setItem('clockSize', '100');
    const style = loadClockStyle();
    expect(style.color).toBe('#ff0000');
    expect(style.font).toBe('Arial');
    expect(style.size).toBe(100);
  });

  it('loadClockStyle normalizes invalid size to closest option', () => {
    localStorage.setItem('clockSize', '85');
    const style = loadClockStyle();
    expect([60, 80, 100]).toContain(style.size);
  });
});

describe('Date style settings', () => {
  it('loadDateStyle returns defaults', () => {
    const style = loadDateStyle();
    expect(style.color).toBe('#ffffff');
    expect(style.font).toBe("'Times New Roman', serif");
    expect(style.size).toBe(24);
  });

  it('loadDateStyle reads custom values', () => {
    localStorage.setItem('dateColor', '#00ff00');
    localStorage.setItem('dateFont', 'Verdana');
    localStorage.setItem('dateSize', '30');
    const style = loadDateStyle();
    expect(style.color).toBe('#00ff00');
    expect(style.font).toBe('Verdana');
    expect(style.size).toBe(30);
  });
});

describe('Theme settings', () => {
  it('loadTheme returns dark by default', () => {
    expect(loadTheme()).toBe('dark');
  });

  it('loadTheme reads localStorage', () => {
    localStorage.setItem('theme', 'light');
    expect(loadTheme()).toBe('light');
  });
});

describe('Todo enabled settings', () => {
  it('loadTodoEnabled returns true by default', () => {
    expect(loadTodoEnabled()).toBe(true);
  });

  it('loadTodoEnabled reads localStorage', () => {
    localStorage.setItem('todoEnabled', 'false');
    expect(loadTodoEnabled()).toBe(false);
  });
});

describe('Clock format settings', () => {
  it('loadClockFormatSetting returns auto by default', () => {
    expect(loadClockFormatSetting()).toBe('auto');
  });

  it('loadClockFormatSetting sanitizes invalid values', () => {
    localStorage.setItem('clockFormat', 'invalid');
    expect(loadClockFormatSetting()).toBe('auto');
  });

  it('loadClockFormatSetting preserves valid values', () => {
    localStorage.setItem('clockFormat', '24h');
    expect(loadClockFormatSetting()).toBe('24h');
  });
});

describe('Date format settings', () => {
  it('loadDateFormatSetting returns auto by default', () => {
    expect(loadDateFormatSetting()).toBe('auto');
  });

  it('loadDateFormatSetting sanitizes invalid values', () => {
    localStorage.setItem('dateFormat', 'bogus');
    expect(loadDateFormatSetting()).toBe('auto');
  });

  it('loadDateFormatSetting preserves valid values', () => {
    localStorage.setItem('dateFormat', 'compact');
    expect(loadDateFormatSetting()).toBe('compact');
  });
});

describe('Utility functions', () => {
  it('getClosestSize picks nearest option', () => {
    expect(getClosestSize(85, [60, 80, 100])).toBe(80);
    expect(getClosestSize(95, [60, 80, 100])).toBe(100);
    expect(getClosestSize(50, [60, 80, 100])).toBe(60);
  });
});

describe('Language settings', () => {
  it('loadLanguageSetting returns en by default', () => {
    expect(loadLanguageSetting()).toBe('en');
  });

  it('loadLanguageSetting reads localStorage', () => {
    localStorage.setItem('language', 'zh');
    expect(loadLanguageSetting()).toBe('zh');
  });
});
