import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { injectScript } from './helpers/inject-script.js';

// Helper to mock geolocation
let originalGeolocation;

function mockGeolocation({ latitude, longitude }) {
  originalGeolocation = navigator.geolocation;
  navigator.geolocation = {
    getCurrentPosition: (success) => {
      success({
        coords: {
          latitude,
          longitude
        }
      });
    }
  };
}

beforeAll(() => {
  // Create weather widget element
  const widget = document.createElement('div');
  widget.id = 'weather-widget';
  widget.className = 'weather-widget';
  widget.style.display = 'none';
  document.body.appendChild(widget);

  // Inject utils.js first to provide escapeHtml
  injectScript('src/core/utils.js');
  injectScript('src/features/weather.js');
});

beforeEach(() => {
  localStorage.clear();
  const widget = document.getElementById('weather-widget');
  if (widget) {
    widget.innerHTML = '';
    widget.style.display = 'none';
    widget.className = 'weather-widget';
  }
});

afterEach(() => {
  if (originalGeolocation !== undefined) {
    navigator.geolocation = originalGeolocation;
    originalGeolocation = undefined;
  }
});

describe('Weather forecast', () => {
  const mockWeatherData = {
    current: {
      temperature_2m: 22,
      weather_code: 0,
      wind_speed_10m: 10,
      relative_humidity_2m: 50,
      apparent_temperature: 24
    },
    daily: {
      time: ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18', '2025-01-19', '2025-01-20', '2025-01-21'],
      temperature_2m_max: [22, 24, 20, 18, 21, 23, 25],
      temperature_2m_min: [12, 14, 10, 8, 11, 13, 15],
      weather_code: [0, 1, 2, 3, 61, 80, 0]
    }
  };

  it('WeatherWidget exists', () => {
    expect(window.WeatherWidget).toBeDefined();
    expect(typeof window.WeatherWidget.init).toBe('function');
    expect(typeof window.WeatherWidget.refresh).toBe('function');
  });

  it('WeatherStorage has required methods', () => {
    expect(window.WeatherWidget.loadEnabled).toBeDefined();
    expect(window.WeatherWidget.loadUnit).toBeDefined();
    expect(window.WeatherWidget.loadLocationMode).toBeDefined();
    expect(window.WeatherWidget.loadManualCity).toBeDefined();
  });

  it('widget renders forecast cards when data is present', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    const widget = document.getElementById('weather-widget');
    expect(widget).not.toBeNull();

    mockGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'api.open-meteo.com' || urlObj.pathname !== '/v1/forecast') {
        return { ok: false, status: 400, json: async () => ({ error: 'Invalid URL' }) };
      }
      const params = new URLSearchParams(urlObj.search);
      if (params.get('current') !== 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code' ||
          params.get('daily') !== 'temperature_2m_max,temperature_2m_min,weather_code' ||
          params.get('forecast_days') !== '7') {
        return { ok: false, status: 400, json: async () => ({ error: 'Invalid query parameters' }) };
      }
      return { ok: true, json: async () => mockWeatherData };
    };

    try {
      await window.WeatherWidget.refresh(true);
      await new Promise(resolve => setTimeout(resolve, 0));

      const cards = widget.querySelectorAll('.weather-forecast-card');
      expect(cards.length).toBeGreaterThan(0);
      const forecast = widget.querySelector('.weather-forecast');
      expect(forecast).not.toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('forecast degrades gracefully when daily data is missing', async () => {
    localStorage.setItem('weatherEnabled', 'true');
    localStorage.setItem('weatherUnit', 'celsius');
    localStorage.setItem('weatherLocationMode', 'auto');

    const widget = document.getElementById('weather-widget');

    // Mock geolocation
    mockGeolocation({ latitude: 37.7749, longitude: -122.4194 });

    // Stub global fetch to return data without daily field
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 22,
            weather_code: 0,
            wind_speed_10m: 10,
            relative_humidity_2m: 50,
            apparent_temperature: 24
          }
          // No daily field
        })
      };
    };

    try {
      // Call the actual refresh method
      await window.WeatherWidget.refresh(true);

      // Wait for any promises to flush
      await new Promise(resolve => setTimeout(resolve, 0));

      const forecast = widget.querySelector('.weather-forecast');
      expect(forecast).toBeNull();
    } finally {
      // Restore original functions
      global.fetch = originalFetch;
    }
  });
});
