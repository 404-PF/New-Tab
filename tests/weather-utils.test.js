import { describe, it, expect, beforeAll } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// The weather lookup/conversion helpers are defined once in
// src/features/weather-utils.js and consumed by both weather.js and
// weather-app.js. These tests cover that shared implementation so the two
// surfaces cannot silently diverge.
beforeAll(() => {
  injectScript('src/features/weather-utils.js');
});

describe('WeatherUtils', () => {
  it('exposes the shared helpers on window', () => {
    expect(window.WeatherUtils).toBeDefined();
    expect(typeof window.WeatherUtils.getWeatherInfo).toBe('function');
    expect(typeof window.WeatherUtils.getWeatherLabel).toBe('function');
    expect(typeof window.WeatherUtils.getWeatherIcon).toBe('function');
    expect(typeof window.WeatherUtils.getTemp).toBe('function');
    expect(typeof window.WeatherUtils.getTempUnit).toBe('function');
    expect(typeof window.WeatherUtils.getWindSpeed).toBe('function');
    expect(typeof window.WeatherUtils.getWindUnit).toBe('function');
    expect(typeof window.WeatherUtils.getLang).toBe('function');
    expect(typeof window.WeatherUtils.normalizeLang).toBe('function');
  });

  describe('getTemp', () => {
    it('rounds Celsius temperatures', () => {
      expect(window.WeatherUtils.getTemp(22.4, 'celsius')).toBe(22);
      expect(window.WeatherUtils.getTemp(22.5, 'celsius')).toBe(23);
    });

    it('converts Celsius to Fahrenheit and rounds', () => {
      // 20°C → 68°F
      expect(window.WeatherUtils.getTemp(20, 'fahrenheit')).toBe(68);
      // 22.5°C → 72.5°F → 73°F
      expect(window.WeatherUtils.getTemp(22.5, 'fahrenheit')).toBe(73);
    });
  });

  describe('getTempUnit', () => {
    it('returns the degree symbol for each unit', () => {
      expect(window.WeatherUtils.getTempUnit('celsius')).toBe('°C');
      expect(window.WeatherUtils.getTempUnit('fahrenheit')).toBe('°F');
    });
  });

  describe('getWindUnit', () => {
    it('returns km/h for Celsius and mph for Fahrenheit', () => {
      expect(window.WeatherUtils.getWindUnit('celsius')).toBe('km/h');
      expect(window.WeatherUtils.getWindUnit('fahrenheit')).toBe('mph');
    });

    it('prefers the localized i18n suffix when available', () => {
      const originalT = window.i18n.t;
      window.i18n.t = (key) => (key === 'weatherWindKmh' ? 'км/ч' : originalT(key));
      try {
        expect(window.WeatherUtils.getWindUnit('celsius')).toBe('км/ч');
      } finally {
        window.i18n.t = originalT;
      }
    });

    it('falls back to the ASCII symbol when i18n is unavailable', () => {
      const originalI18n = window.i18n;
      window.i18n = undefined;
      try {
        expect(window.WeatherUtils.getWindUnit('celsius')).toBe('km/h');
        expect(window.WeatherUtils.getWindUnit('fahrenheit')).toBe('mph');
      } finally {
        window.i18n = originalI18n;
      }
    });
  });

  describe('getWindSpeed', () => {
    it('keeps km/h values for the Celsius unit', () => {
      expect(window.WeatherUtils.getWindSpeed(12.4, 'celsius')).toBe('12 km/h');
      expect(window.WeatherUtils.getWindSpeed(12.5, 'celsius')).toBe('13 km/h');
    });

    it('converts km/h to mph for the Fahrenheit unit', () => {
      // 8 km/h ÷ 1.609344 ≈ 4.97 → 5 mph
      expect(window.WeatherUtils.getWindSpeed(8, 'fahrenheit')).toBe('5 mph');
      // 16.09344 km/h = 10 mph exactly
      expect(window.WeatherUtils.getWindSpeed(16.09344, 'fahrenheit')).toBe('10 mph');
    });
  });

  describe('getWeatherInfo', () => {
    it('maps a known WMO code to its condition info', () => {
      const info = window.WeatherUtils.getWeatherInfo(0);
      expect(info.type).toBe('clear');
      expect(info.labelEn).toBe('Clear sky');
    });

    it('returns a safe fallback for unmapped codes', () => {
      const info = window.WeatherUtils.getWeatherInfo(9999);
      expect(info.type).toBe('clear');
      expect(info.labelEn).toBe('Unknown');
    });
  });

  describe('getWeatherLabel', () => {
    it('returns the label for the current language', () => {
      const originalCurrentLanguage = window.i18n.currentLanguage;
      window.i18n.currentLanguage = () => 'zh';
      try {
        const info = window.WeatherUtils.getWeatherInfo(0);
        expect(window.WeatherUtils.getWeatherLabel(info)).toBe('晴朗');
      } finally {
        window.i18n.currentLanguage = originalCurrentLanguage;
      }
    });

    it('falls back to English for unsupported languages', () => {
      const originalCurrentLanguage = window.i18n.currentLanguage;
      window.i18n.currentLanguage = () => 'xx';
      try {
        const info = window.WeatherUtils.getWeatherInfo(0);
        expect(window.WeatherUtils.getWeatherLabel(info)).toBe('Clear sky');
      } finally {
        window.i18n.currentLanguage = originalCurrentLanguage;
      }
    });

    it('falls back to English when i18n is unavailable', () => {
      const originalI18n = window.i18n;
      window.i18n = undefined;
      try {
        const info = window.WeatherUtils.getWeatherInfo(0);
        expect(window.WeatherUtils.getWeatherLabel(info)).toBe('Clear sky');
      } finally {
        window.i18n = originalI18n;
      }
    });
  });

  describe('getWeatherIcon', () => {
    it('returns SVG markup for a known condition type', () => {
      const icon = window.WeatherUtils.getWeatherIcon('rain');
      expect(icon).toContain('<svg');
      expect(icon).toContain('viewBox');
    });

    it('falls back to the clear icon for unknown types', () => {
      expect(window.WeatherUtils.getWeatherIcon('bogus')).toBe(
        window.WeatherUtils.getWeatherIcon('clear')
      );
    });
  });

  describe('getLang', () => {
    it('reads the current language from window.i18n', () => {
      const originalCurrentLanguage = window.i18n.currentLanguage;
      window.i18n.currentLanguage = () => 'ja';
      try {
        expect(window.WeatherUtils.getLang()).toBe('ja');
      } finally {
        window.i18n.currentLanguage = originalCurrentLanguage;
      }
    });

    it('defaults to English when i18n is unavailable', () => {
      const originalI18n = window.i18n;
      window.i18n = undefined;
      try {
        expect(window.WeatherUtils.getLang()).toBe('en');
      } finally {
        window.i18n = originalI18n;
      }
    });
  });

  describe('normalizeLang', () => {
    it('extracts the base language from locale variants', () => {
      expect(window.WeatherUtils.normalizeLang('zh_CN')).toBe('zh');
      expect(window.WeatherUtils.normalizeLang('pt-BR')).toBe('pt');
      expect(window.WeatherUtils.normalizeLang('EN')).toBe('en');
    });

    it('defaults to English for missing input', () => {
      expect(window.WeatherUtils.normalizeLang()).toBe('en');
    });
  });
});
