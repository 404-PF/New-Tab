import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

beforeAll(() => {
  vi.useFakeTimers();
  injectScript('src/core/main.js');
});

afterAll(() => {
  vi.useRealTimers();
});

describe('Clock formatting', () => {
  it('formatClockTime returns time string', () => {
    const now = new Date(2025, 0, 1, 14, 30, 0);
    const result = formatClockTime(now, 'en-US');
    expect(typeof result).toBe('string');
    expect(result).toContain('30');
  });

  it('supports 24-hour format', () => {
    localStorage.setItem('clockFormat', '24h');
    const now = new Date(2025, 0, 1, 9, 5, 0);
    const result = formatClockTime(now, 'en-US');
    expect(result).toMatch(/09/);
    expect(result).toMatch(/05/);
  });

  it('supports 12-hour format', () => {
    localStorage.setItem('clockFormat', '12h');
    const now = new Date(2025, 0, 1, 14, 0, 0);
    const result = formatClockTime(now, 'en-US');
    expect(result.toLowerCase()).toContain('2');
    expect(result.toLowerCase()).toContain('pm');
  });

  it('auto format falls back to locale default', () => {
    localStorage.setItem('clockFormat', 'auto');
    const now = new Date(2025, 0, 1, 14, 0, 0);
    const result = formatClockTime(now, 'en-US');
    expect(result).toBeTruthy();
  });

  it('getClockFormat returns default auto', () => {
    expect(getClockFormat()).toBe('auto');
  });

  it('getClockFormat reads localStorage', () => {
    localStorage.setItem('clockFormat', '12h');
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
    localStorage.setItem('dateFormat', 'long');
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(result.toLowerCase()).toContain('wednesday');
    expect(result.toLowerCase()).toContain('january');
  });

  it('supports compact format', () => {
    localStorage.setItem('dateFormat', 'compact');
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(result.toLowerCase()).toContain('jan');
  });

  it('supports numeric format', () => {
    localStorage.setItem('dateFormat', 'numeric');
    const now = new Date(2025, 0, 15);
    const result = formatDateDisplay(now, 'en-US');
    expect(result).toMatch(/01/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2025/);
  });

  it('getDateFormat returns default auto', () => {
    expect(getDateFormat()).toBe('auto');
  });

  it('getDateFormat reads localStorage', () => {
    localStorage.setItem('dateFormat', 'long');
    expect(getDateFormat()).toBe('long');
  });
});

describe('Locale helpers', () => {
  it('getDisplayLocale returns en-US by default', () => {
    expect(getDisplayLocale()).toBe('en-US');
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
