import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  vi.useFakeTimers();
  window.VisibilityInterval = class {
    constructor() {}
    destroy() {}
  };
  injectScript('src/core/main.js');
});

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
  refreshClockSettings();
});

function setSetting(key, value) {
  localStorage.setItem(key, value);
  refreshClockSettings();
}

describe('Clock formatting', () => {
  it('formatClockTime returns time string', () => {
    const now = new Date(2025, 0, 1, 14, 30, 0);
    const result = formatClockTime(now, 'en-US');
    expect(typeof result).toBe('string');
    expect(result).toContain('30');
  });

  it('supports 24-hour format', () => {
    setSetting('clockFormat', '24h');
    const now = new Date(2025, 0, 1, 9, 5, 0);
    const result = formatClockTime(now, 'en-US');
    expect(result).toMatch(/09/);
    expect(result).toMatch(/05/);
  });

  it('supports 12-hour format', () => {
    setSetting('clockFormat', '12h');
    const now = new Date(2025, 0, 1, 14, 0, 0);
    const result = formatClockTime(now, 'en-US');
    expect(result.toLowerCase()).toContain('2');
    expect(result.toLowerCase()).toContain('pm');
  });

  it('auto format falls back to locale default', () => {
    setSetting('clockFormat', 'auto');
    const now = new Date(2025, 0, 1, 14, 0, 0);
    const result = formatClockTime(now, 'en-US');
    expect(result).toBeTruthy();
  });

  it('getClockFormat returns default auto', () => {
    expect(getClockFormat()).toBe('auto');
  });

  it('getClockFormat picks up localStorage after a settings refresh', () => {
    setSetting('clockFormat', '12h');
    expect(getClockFormat()).toBe('12h');
  });
});

describe('Date formatting', () => {
  it('formatDateDisplay returns a string', () => {
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('supports long format', () => {
    setSetting('dateFormat', 'long');
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(result.toLowerCase()).toContain('wednesday');
    expect(result.toLowerCase()).toContain('january');
  });

  it('supports compact format', () => {
    setSetting('dateFormat', 'compact');
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(result.toLowerCase()).toContain('jan');
  });

  it('supports numeric format', () => {
    setSetting('dateFormat', 'numeric');
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(result).toMatch(/01/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2025/);
  });

  it('getDateFormat returns default auto', () => {
    expect(getDateFormat()).toBe('auto');
  });

  it('getDateFormat picks up localStorage after a settings refresh', () => {
    setSetting('dateFormat', 'long');
    expect(getDateFormat()).toBe('long');
  });
});

describe('Locale helpers', () => {
  it('getDisplayLocale returns en-US by default', () => {
    expect(getDisplayLocale()).toBe('en-US');
  });

  it('getDisplayLocale maps supported languages and falls back to en-US', () => {
    const originalCurrentLanguage = window.i18n.currentLanguage;
    const cases = [
      ['en', 'en-US'],
      ['zh', 'zh-CN'],
      ['ja', 'ja-JP'],
      ['ko', 'ko-KR'],
      ['es', 'es-ES'],
      ['fr', 'fr-FR'],
      ['de', 'de-DE'],
      ['pt', 'pt-BR'],
      ['ru', 'ru-RU']
    ];

    try {
      cases.forEach(([language, expectedLocale]) => {
        window.i18n.currentLanguage = () => language;
        refreshClockSettings();
        expect(getDisplayLocale()).toBe(expectedLocale);
      });

      window.i18n.currentLanguage = () => 'xx';
      refreshClockSettings();
      expect(getDisplayLocale()).toBe('en-US');
    } finally {
      window.i18n.currentLanguage = originalCurrentLanguage;
      refreshClockSettings();
    }
  });
});

describe('Clock refresh cadence', () => {
  function installCaptureInterval() {
    const intervals = [];
    class CaptureVisibilityInterval {
      constructor(callback, interval) {
        this.callback = callback;
        this.interval = interval;
        intervals.push(this);
      }
      destroy() {}
    }
    const original = window.VisibilityInterval;
    window.VisibilityInterval = CaptureVisibilityInterval;
    return {
      intervals,
      restore() {
        window.VisibilityInterval = original;
      }
    };
  }

  it('re-arms on minute boundaries instead of a 1 Hz loop', () => {
    const capture = installCaptureInterval();
    try {
      vi.setSystemTime(new Date(2025, 0, 6, 9, 30, 20));
      initClock();
      const first = capture.intervals[capture.intervals.length - 1];
      expect(first.interval).toBe(40000);

      vi.setSystemTime(new Date(2025, 0, 6, 9, 31, 0));
      first.callback();
      const second = capture.intervals[capture.intervals.length - 1];
      expect(second.interval).toBe(60000);
      expect(second.interval).toBeGreaterThanOrEqual(60000);

      vi.setSystemTime(new Date(2025, 0, 6, 9, 32, 0));
      second.callback();
      expect(capture.intervals[capture.intervals.length - 1].interval).toBe(60000);

      expect(capture.intervals.map((entry) => entry.interval)).not.toContain(1000);
    } finally {
      capture.restore();
    }
  });

  it('does not read storage on refresh ticks', () => {
    const spy = vi.spyOn(localStorage, 'getItem');
    try {
      window.updateTime();
      window.updateTime();
      expect(spy).not.toHaveBeenCalled();

      refreshClockSettings();
      expect(spy).toHaveBeenCalledWith('clockFormat');
      expect(spy).toHaveBeenCalledWith('dateFormat');
    } finally {
      spy.mockRestore();
    }
  });

  it('skips textContent writes when the formatted output is unchanged', () => {
    const clockElement = document.getElementById('clock-time');
    const dateElement = document.getElementById('date');
    let clockWrites = 0;
    let dateWrites = 0;

    Object.defineProperty(clockElement, 'textContent', {
      configurable: true,
      get() {
        return this.__clockText;
      },
      set(value) {
        clockWrites += 1;
        this.__clockText = value;
      }
    });
    Object.defineProperty(dateElement, 'textContent', {
      configurable: true,
      get() {
        return this.__dateText;
      },
      set(value) {
        dateWrites += 1;
        this.__dateText = value;
      }
    });

    try {
      clockElement.__clockText = 'prime';
      dateElement.__dateText = 'prime';

      window.updateTime();
      expect(clockWrites).toBe(1);
      expect(dateWrites).toBe(1);

      clockWrites = 0;
      dateWrites = 0;
      window.updateTime();
      expect(clockWrites).toBe(0);
      expect(dateWrites).toBe(0);
    } finally {
      delete clockElement.textContent;
      delete dateElement.textContent;
    }
  });

  it('refreshes the cached display settings when the language changes', () => {
    const originalCurrentLanguage = window.i18n.currentLanguage;
    try {
      window.i18n.currentLanguage = () => 'zh';
      expect(getDisplayLocale()).toBe('en-US');

      window.dispatchEvent(new Event('languageChanged'));
      expect(getDisplayLocale()).toBe('zh-CN');
    } finally {
      window.i18n.currentLanguage = originalCurrentLanguage;
      refreshClockSettings();
    }
  });
});

describe('Search engine utilities', () => {
  it('runSearch is globally available', () => {
    expect(typeof runSearch).toBe('function');
  });

  it('runDefaultSearch is globally available', () => {
    expect(typeof runDefaultSearch).toBe('function');
  });
});
